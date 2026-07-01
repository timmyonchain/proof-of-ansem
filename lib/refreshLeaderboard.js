// lib/refreshLeaderboard.js
// Maintains a tracked pool of up to 500 accounts on the $ANSEM leaderboard:
//   1. re-scan everyone already tracked (keep scores fresh)
//   2. discover new candidates via a broad advanced_search
//   3. scan up to 50 new candidates
//   4. trim the pool back to the top 500 by score
//
// Standalone / callable — not wired to any schedule yet.

require("dotenv").config();
const { scanUser } = require("./scanUser");
const { saveUserResult } = require("./leaderboard");
const { redis } = require("./redis");

const API_KEY = process.env.TWITTERAPI_IO_KEY;
const BASE = "https://api.twitterapi.io";
// Native fetch (Node 18+/Next runtime); node-fetch fallback.
const fetch = globalThis.fetch ?? require("node-fetch");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RATE_LIMIT_MS = 400; // paid tier — small courtesy delay

const DISCOVERY_QUERY = '($ANSEM OR "black bull") since:2026-06-17';
const DISCOVERY_TWEET_CAP = 300; // max tweets scanned during discovery
const MAX_NEW_CANDIDATES = 50; // max new accounts scanned per run
const MAX_POOL = 500; // hard cap on tracked accounts

// Quality bar for ADDING / KEEPING an account in the pool:
//   totalScore > 50  AND  tweetCount > 0  AND  at least one counted tweet had
//   raw human engagement (likes+RTs+quotes+replies) >= 5.
const MIN_SCORE = 50;
const MIN_ENGAGEMENT = 5;

function evaluateBar(result) {
  const score = Number(result?.totalScore ?? 0);
  const tweetCount = Number(result?.tweetCount ?? 0);
  const maxEng = Number(result?.maxRawEngagement ?? 0);
  if (tweetCount <= 0) return { pass: false, reason: "no tweets" };
  if (score <= MIN_SCORE)
    return { pass: false, reason: `score too low (${Math.round(score)})` };
  if (maxEng < MIN_ENGAGEMENT)
    return { pass: false, reason: `engagement too low (max ${maxEng})` };
  return { pass: true, reason: "ok" };
}

const ANSEM_HANDLE = "blknoiz06";
const BOOST_SINCE = Date.parse("2026-06-17T00:00:00Z");
const BOOST_MAX_PAGES = 5;
const ANSEM_RE = /\$ANSEM\b/i;
const BLACKBULL_RE = /black bull/i;
const isAnsemRelated = (text) =>
  ANSEM_RE.test(text ?? "") || BLACKBULL_RE.test(text ?? "");

async function advancedSearch(cursor) {
  const url = new URL(`${BASE}/twitter/tweet/advanced_search`);
  url.searchParams.set("query", DISCOVERY_QUERY);
  url.searchParams.set("queryType", "Latest");
  if (cursor) url.searchParams.set("cursor", cursor);

  const res = await fetch(url, { headers: { "X-API-Key": API_KEY } });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(
      `advanced_search failed (${res.status}): ${JSON.stringify(body)}`
    );
  }
  return body;
}

// Paginate the broad discovery query up to DISCOVERY_TWEET_CAP tweets and return
// distinct authorUserNames that are NOT already tracked (case-insensitive).
async function discoverCandidates(trackedLower) {
  const found = new Map(); // lowerName -> original casing (first seen)
  let cursor = "";
  let collected = 0;
  let page = 0;

  while (collected < DISCOVERY_TWEET_CAP) {
    if (page > 0) await sleep(RATE_LIMIT_MS);

    const body = await advancedSearch(cursor);
    const tweets = body.tweets ?? [];

    for (const t of tweets) {
      collected++;
      const name = t.author?.userName;
      if (name) {
        const lower = name.toLowerCase();
        if (!trackedLower.has(lower) && !found.has(lower)) {
          found.set(lower, name);
        }
      }
      if (collected >= DISCOVERY_TWEET_CAP) break;
    }

    page += 1;
    console.error(
      `  [discovery page ${page}] +${tweets.length} tweets ` +
        `(scanned ${collected}, ${found.size} new candidates so far)`
    );

    if (!body.has_next_page) break;
    cursor = body.next_cursor ?? "";
    if (!cursor) break;
  }

  return [...found.values()];
}

async function refreshTrackedLeaderboard() {
  let totalScans = 0;

  // 1. Current tracked usernames (all members of the sorted set).
  const tracked = await redis.zrange("leaderboard", 0, -1);
  const trackedLower = new Set(tracked.map((u) => String(u).toLowerCase()));
  console.error(`Tracked accounts to refresh: ${tracked.length}`);

  // 2. Re-scan each existing tracked account (throttled).
  let refreshedExisting = 0;
  for (let i = 0; i < tracked.length; i++) {
    if (totalScans > 0) await sleep(RATE_LIMIT_MS);
    const name = tracked[i];
    try {
      console.error(`  refresh (${i + 1}/${tracked.length}) @${name}`);
      await scanUser(name, { force: true }); // must be fresh, bypass cache
      refreshedExisting++;
    } catch (e) {
      console.error(`  ⚠️  refresh failed for @${name}: ${e.message}`);
    }
    totalScans++;
  }

  // 3. Discover new candidates.
  console.error(`Discovering new candidates…`);
  if (totalScans > 0) await sleep(RATE_LIMIT_MS);
  const candidatesAll = await discoverCandidates(trackedLower);
  const newDiscovered = candidatesAll.length;

  // 4. Scan up to MAX_NEW_CANDIDATES new candidates (throttled).
  const candidates = candidatesAll.slice(0, MAX_NEW_CANDIDATES);
  console.error(
    `Discovered ${newDiscovered} new candidate(s); scanning ${candidates.length}.`
  );
  let newAdded = 0;
  let newSkippedLowQuality = 0;
  for (let i = 0; i < candidates.length; i++) {
    await sleep(RATE_LIMIT_MS);
    const name = candidates[i];
    try {
      // Scan WITHOUT persisting, so we can apply the quality bar first.
      const result = await scanUser(name, { persist: false });
      const { pass, reason } = evaluateBar(result);
      if (pass) {
        await saveUserResult(name, result, { allowNewLeaderboardEntry: true });
        newAdded++;
        console.error(
          `  new (${i + 1}/${candidates.length}) @${name} — ADDED ` +
            `(score ${Math.round(result.totalScore)}, ${result.tweetCount} tweets, maxEng ${result.maxRawEngagement})`
        );
      } else {
        newSkippedLowQuality++;
        console.error(
          `  new (${i + 1}/${candidates.length}) @${name} — skipped (${reason})`
        );
      }
    } catch (e) {
      console.error(`  ⚠️  scan failed for new @${name}: ${e.message}`);
    }
    totalScans++;
  }

  // 5. Trim the pool to the top MAX_POOL by score (drop the lowest, and their
  //    detail hashes so they don't linger).
  const poolSizeBefore = await redis.zcard("leaderboard");
  let trimmed = 0;
  if (poolSizeBefore > MAX_POOL) {
    // ascending zrange => lowest scores first
    const toRemove = await redis.zrange(
      "leaderboard",
      0,
      poolSizeBefore - MAX_POOL - 1
    );
    if (toRemove.length) {
      await redis.zrem("leaderboard", ...toRemove);
      await redis.del(...toRemove.map((u) => `user:${u}`));
      trimmed = toRemove.length;
    }
  }
  const poolSizeAfter = await redis.zcard("leaderboard");

  const summary = {
    refreshedExisting,
    newDiscovered,
    newAdded,
    newSkippedLowQuality,
    trimmed,
    totalScans,
    poolSizeBefore,
    poolSizeAfter,
  };
  console.error("Refresh complete:", JSON.stringify(summary));
  return summary;
}

// ---------------------------------------------------------------------------
// ADDITION 1 — "Boosted by Ansem" discovery.
// Pull blknoiz06's recent RTs/quotes; any $ANSEM-related boosted content means
// the ORIGINAL author was boosted by Ansem himself → add them regardless of the
// normal quality bar, tagged boostedByAnsem.
// ---------------------------------------------------------------------------
async function fetchLastTweets(userName, cursor) {
  const url = new URL(`${BASE}/twitter/user/last_tweets`);
  url.searchParams.set("userName", userName);
  if (cursor) url.searchParams.set("cursor", cursor);
  const res = await fetch(url, { headers: { "X-API-Key": API_KEY } });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`last_tweets failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function findAnsemBoostedAccounts() {
  const found = new Map(); // lowerName -> original casing
  let boostTweetsFound = 0;
  let cursor = "";
  let page = 0;

  console.error(`Scanning @${ANSEM_HANDLE}'s recent RTs/quotes for boosts…`);
  while (page < BOOST_MAX_PAGES) {
    if (page > 0) await sleep(RATE_LIMIT_MS);
    const body = await fetchLastTweets(ANSEM_HANDLE, cursor);
    const tweets =
      body.data?.tweets ??
      (Array.isArray(body.data) ? body.data : null) ??
      body.tweets ??
      [];

    let olderThanWindow = 0;
    for (const t of tweets) {
      const created = Date.parse(t.createdAt);
      if (!Number.isNaN(created) && created < BOOST_SINCE) {
        olderThanWindow++;
        continue;
      }
      const nested = t.retweeted_tweet || t.quoted_tweet;
      if (!nested || !isAnsemRelated(nested.text)) continue;
      const orig = nested.author?.userName;
      if (!orig || orig.toLowerCase() === ANSEM_HANDLE) continue;
      boostTweetsFound++;
      const lower = orig.toLowerCase();
      if (!found.has(lower)) found.set(lower, orig);
    }

    page += 1;
    console.error(
      `  [boost page ${page}] ${tweets.length} tweets, ${found.size} distinct boosted account(s) so far`
    );

    const hasNext = body.has_next_page ?? body.data?.has_next_page ?? false;
    const nextCursor = body.next_cursor ?? body.data?.next_cursor ?? "";
    // Timeline is reverse-chron: once a whole page is older than the window, stop.
    if (olderThanWindow === tweets.length && tweets.length > 0) break;
    if (!hasNext || !nextCursor) break;
    cursor = nextCursor;
  }

  const names = [...found.values()];
  console.error(
    `Found ${boostTweetsFound} boost-worthy tweet(s) → ${names.length} distinct account(s). Adding…`
  );

  let accountsAdded = 0;
  for (const name of names) {
    await sleep(RATE_LIMIT_MS);
    try {
      // Boosted by Ansem himself — add regardless of the normal quality bar.
      const result = await scanUser(name, { force: true, persist: false });
      await saveUserResult(name, result, {
        allowNewLeaderboardEntry: true,
        boostedByAnsem: true,
      });
      accountsAdded++;
      console.error(
        `  boosted @${name} — ADDED (score ${Math.round(result.totalScore)}, ` +
          `${result.tweetCount} tweets, maxEng ${result.maxRawEngagement})`
      );
    } catch (e) {
      console.error(`  ⚠️  boosted scan failed for @${name}: ${e.message}`);
    }
  }

  const summary = { boostTweetsFound, distinctBoosted: names.length, accountsAdded };
  console.error("findAnsemBoostedAccounts complete:", JSON.stringify(summary));
  return summary;
}

// ---------------------------------------------------------------------------
// ADDITION 2 (cleanup) — re-evaluate EVERY tracked account against the stricter
// combined bar. Boosted-by-Ansem accounts are exempt (kept). Nothing is removed
// by name — the bar decides.
// ---------------------------------------------------------------------------
async function recheckTrackedAgainstBar() {
  const tracked = await redis.zrange("leaderboard", 0, -1);
  console.error(
    `Re-evaluating ${tracked.length} tracked account(s) against the stricter bar…`
  );

  const survivors = [];
  const pruned = [];

  for (let i = 0; i < tracked.length; i++) {
    if (i > 0) await sleep(RATE_LIMIT_MS);
    const name = tracked[i];

    // Boosted-by-Ansem accounts are exempt from the bar.
    const stored = await redis.hgetall(`user:${name}`);
    if (stored && stored.boostedByAnsem) {
      survivors.push({ name, reason: "boosted by Ansem (exempt)" });
      console.error(`  SURVIVE @${name} — boosted by Ansem (exempt)`);
      continue;
    }

    try {
      const result = await scanUser(name, { force: true, persist: false });
      const { pass, reason } = evaluateBar(result);
      if (pass) {
        await saveUserResult(name, result); // update, stays a member
        survivors.push({
          name,
          score: Math.round(result.totalScore),
          tweetCount: result.tweetCount,
          maxRawEngagement: result.maxRawEngagement,
        });
        console.error(
          `  SURVIVE @${name} (score ${Math.round(result.totalScore)}, ` +
            `${result.tweetCount} tweets, maxEng ${result.maxRawEngagement})`
        );
      } else {
        await redis.zrem("leaderboard", name);
        await redis.del(`user:${name}`);
        pruned.push({ name, reason, score: Math.round(result.totalScore) });
        console.error(`  PRUNE   @${name} — ${reason}`);
      }
    } catch (e) {
      // Keep on transient error rather than prune unfairly.
      survivors.push({ name, reason: `kept (scan error: ${e.message})` });
      console.error(`  ⚠️  recheck failed for @${name}: ${e.message} — keeping`);
    }
  }

  console.error(
    `Recheck complete: ${survivors.length} survived, ${pruned.length} pruned.`
  );
  return { survivors, pruned };
}

module.exports = {
  refreshTrackedLeaderboard,
  findAnsemBoostedAccounts,
  recheckTrackedAgainstBar,
  evaluateBar,
};

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

// Quality bar for ADDING a newly-discovered candidate to the pool.
const MIN_SCORE = 50; // must have totalScore > 50 ...
// ... and tweetCount > 0 (checked alongside).

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
      const passes = result.totalScore > MIN_SCORE && result.tweetCount > 0;
      if (passes) {
        await saveUserResult(name, result, { allowNewLeaderboardEntry: true });
        newAdded++;
        console.error(
          `  new (${i + 1}/${candidates.length}) @${name} — ADDED ` +
            `(score ${Math.round(result.totalScore)}, ${result.tweetCount} tweets)`
        );
      } else {
        newSkippedLowQuality++;
        console.error(
          `  new (${i + 1}/${candidates.length}) @${name} — skipped ` +
            `(score ${Math.round(result.totalScore)}, ${result.tweetCount} tweets, below bar)`
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

module.exports = { refreshTrackedLeaderboard };

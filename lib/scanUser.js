// lib/scanUser.js
// Shared single-user scan path used by BOTH the batch/refresh jobs and the live
// website (app/api/scan/route.ts), so they behave identically.
//
// Cost control: before hitting the live twitterapi.io API we consult a Redis
// cache. Tracked accounts (in the "leaderboard" sorted set) are cached for 20h;
// untracked one-off scans are cached for 6h. Pass { force: true } to bypass the
// cache (used by the scheduled refresh, which must produce fresh scores).

const { fetchUserAnsemTweets } = require("./fetchUserTweets");
const { checkDuplicateAgainstHistory } = require("./dedupe");
const { scoreUserMindshare } = require("./scoreUser");
const { saveUserResult } = require("./leaderboard");
const { redis } = require("./redis");

const TRACKED_TTL_MS = 20 * 60 * 60 * 1000; // 20 hours
const UNTRACKED_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Return a cached result if one is fresh enough, else null.
async function getCachedResult(username) {
  const details = await redis.hgetall(`user:${username}`);
  if (!details || !details.timestamp) return null;

  const ts = Date.parse(details.timestamp);
  if (Number.isNaN(ts)) return null;
  const ageMs = Date.now() - ts;

  // Is this account part of the tracked leaderboard pool?
  const inPool = (await redis.zscore("leaderboard", username)) !== null;
  const ttl = inPool ? TRACKED_TTL_MS : UNTRACKED_TTL_MS;
  if (ageMs >= ttl) return null;

  return {
    username,
    totalScore: Number(details.totalScore ?? 0),
    tweetCount: Number(details.tweetCount ?? 0),
    countedTweets: Number(details.countedTweets ?? 0),
    topTweets: details.topTweets ?? [],
    timestamp: details.timestamp,
    source: "cached",
    tracked: inPool,
    ageMs,
  };
}

// scanUser(username, { force, persist })
//   force:   bypass the cache (used by the scheduled refresh)
//   persist: whether to save the result to Redis. Defaults true. The refresh
//            passes persist:false for newly-discovered candidates so it can
//            apply a quality bar BEFORE adding them to the leaderboard.
async function scanUser(username, { force = false, persist = true } = {}) {
  // 1. Cache check (unless forced). Cached results are already persisted.
  if (!force) {
    const cached = await getCachedResult(username);
    if (cached) {
      const ageH = (cached.ageMs / 3600000).toFixed(1);
      console.log(
        `[scanUser] cache HIT @${username} (tracked=${cached.tracked}, age=${ageH}h) — no live API call`
      );
      return cached;
    }
  }

  console.log(`[scanUser] cache MISS @${username} — live fetch`);

  // 2. Live fetch this user's $ANSEM tweets.
  const tweets = await fetchUserAnsemTweets(username);

  // 3. Attach a persistent, cross-time duplicate penalty to each tweet.
  for (const t of tweets) {
    t.duplicatePenalty = await checkDuplicateAgainstHistory(t);
  }

  // 4. Score, 5. optionally persist to Redis (fresh timestamp), 6. return.
  const scoreResult = scoreUserMindshare(tweets);
  if (persist) {
    // Existing members always update their leaderboard entry. A brand-new
    // account earns a spot only if it clears the quality bar; otherwise its
    // hash is still saved (so it can see its own score) but it's not ranked.
    const isMember = (await redis.zscore("leaderboard", username)) !== null;
    let allowNewLeaderboardEntry = isMember;
    if (!isMember) {
      // Lazy require avoids a load-time circular dependency with this module.
      const { evaluateBar } = require("./refreshLeaderboard");
      allowNewLeaderboardEntry = evaluateBar(scoreResult).pass;
    }
    await saveUserResult(username, scoreResult, { allowNewLeaderboardEntry });
  }
  return { ...scoreResult, source: "live", persisted: persist };
}

module.exports = { scanUser };

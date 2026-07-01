// lib/leaderboard.js
// Redis-backed persistence for the $ANSEM mindshare leaderboard.
//
// Data model:
//   - Sorted set "leaderboard": score = totalScore, member = username
//   - Hash "user:<username>": full stored result (totalScore, tweetCount,
//     countedTweets, topTweets, timestamp)

const { redis } = require("./redis");

const PAGE_SIZE = 100;
const MAX_PAGES = 5;
const MAX_ENTRIES = PAGE_SIZE * MAX_PAGES; // 500 hard cap

// Save/update one user's result.
// saveUserResult(username, scoreResult, { allowNewLeaderboardEntry })
//   The detail hash "user:<username>" is ALWAYS written (needed for the user's
//   own result display, card generation, and caching).
//   The public "leaderboard" sorted set is only touched when either:
//     - the username is already a member (an existing tracked account), or
//     - allowNewLeaderboardEntry is true (only the discovery/refresh process
//       passes this — a manual scan of a brand-new user must NOT add them).
async function saveUserResult(
  username,
  scoreResult,
  { allowNewLeaderboardEntry = false } = {}
) {
  const {
    totalScore = 0,
    tweetCount = 0,
    countedTweets = 0,
    topTweets = [],
  } = scoreResult ?? {};

  // Full detail hash — always. @upstash/redis auto-(de)serializes objects.
  await redis.hset(`user:${username}`, {
    totalScore,
    tweetCount,
    countedTweets,
    topTweets,
    timestamp: new Date().toISOString(),
  });

  // Public ranked sorted set — only for existing members, or when explicitly
  // allowed to add a new member (discovery/refresh).
  const isMember =
    allowNewLeaderboardEntry ||
    (await redis.zscore("leaderboard", username)) !== null;
  if (isMember) {
    await redis.zadd("leaderboard", { score: totalScore, member: username });
  }
}

// Read one page of the ranked leaderboard (highest score first) with full
// details. page is clamped to [1, MAX_PAGES]; results never exceed the 500 cap.
async function getLeaderboard(page = 1, pageSize = PAGE_SIZE) {
  const p = Math.min(Math.max(1, Math.floor(page) || 1), MAX_PAGES);

  const start = (p - 1) * pageSize;
  // Never fetch beyond the 500-entry cap.
  const stop = Math.min(start + pageSize - 1, MAX_ENTRIES - 1);
  if (start > stop) return [];

  // rev = highest first; withScores interleaves [member, score, member, score...]
  const raw = await redis.zrange("leaderboard", start, stop, {
    rev: true,
    withScores: true,
  });

  const ranked = [];
  for (let i = 0; i < raw.length; i += 2) {
    const username = raw[i];
    const totalScore = Number(raw[i + 1]);

    const details = (await redis.hgetall(`user:${username}`)) ?? {};

    ranked.push({
      rank: start + i / 2 + 1, // global rank across all pages
      username,
      totalScore,
      tweetCount: Number(details.tweetCount ?? 0),
      countedTweets: Number(details.countedTweets ?? 0),
      topTweets: details.topTweets ?? [],
      timestamp: details.timestamp ?? null,
    });
  }

  return ranked;
}

// Fetch a single user's stored result + current rank (null if not in the pool).
async function getUserResult(username) {
  const details = await redis.hgetall(`user:${username}`);
  const r = await redis.zrevrank("leaderboard", username);
  const rank = r === null || r === undefined ? null : Number(r) + 1;

  if (!details || Object.keys(details).length === 0) {
    return {
      username,
      totalScore: 0,
      tweetCount: 0,
      countedTweets: 0,
      topTweets: [],
      timestamp: null,
      rank,
    };
  }

  return {
    username,
    totalScore: Number(details.totalScore ?? 0),
    tweetCount: Number(details.tweetCount ?? 0),
    countedTweets: Number(details.countedTweets ?? 0),
    topTweets: details.topTweets ?? [],
    timestamp: details.timestamp ?? null,
    rank,
  };
}

// Total entries in the sorted set, capped at MAX_ENTRIES (500) for reporting.
async function getLeaderboardCount() {
  const count = await redis.zcard("leaderboard");
  return Math.min(Number(count) || 0, MAX_ENTRIES);
}

module.exports = {
  saveUserResult,
  getLeaderboard,
  getLeaderboardCount,
  getUserResult,
  PAGE_SIZE,
  MAX_PAGES,
};

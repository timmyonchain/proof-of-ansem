// dedupe.js
// Copy-paste detection. Two flavors:
//   - detectDuplicates(): in-memory, within a single batch (legacy)
//   - checkDuplicateAgainstHistory(): Redis-backed, persists across every run
//     forever — the same normalized text posted by 3+ distinct authors ever
//     gets a heavy penalty.

const crypto = require("crypto");
const { redis } = require("./redis");

// Broad emoji / symbol / variation-selector / ZWJ ranges — stripped to nothing.
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}\u{2000}-\u{206F}]/gu;

// Normalize tweet text for comparison:
// lowercase, strip URLs, strip @mentions, strip emoji, collapse whitespace.
function normalizeText(text) {
  return (text ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")   // strip URLs
    .replace(/@\w+/g, "")             // strip @mentions
    .replace(EMOJI_RE, "")            // strip emoji / symbols
    .replace(/\s+/g, " ")             // collapse whitespace
    .trim();
}

const DUPLICATE_PENALTY = 0.1; // heavy (near-zero) penalty for copy-paste
const MIN_DISTINCT_AUTHORS = 3; // 3+ different authors => coordinated

function detectDuplicates(allTweetsFlat) {
  const tweets = allTweetsFlat ?? [];

  // Group tweets by normalized text.
  const groups = new Map(); // normText -> array of tweets
  for (const t of tweets) {
    const key = normalizeText(t.text);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  // Decide penalty per group based on distinct authorUserName count.
  for (const [key, group] of groups) {
    const distinctAuthors = new Set(
      group.map((t) => t.authorUserName).filter(Boolean)
    );
    const isDuplicate =
      key.length > 0 && distinctAuthors.size >= MIN_DISTINCT_AUTHORS;
    const penalty = isDuplicate ? DUPLICATE_PENALTY : 1;
    for (const t of group) t.duplicatePenalty = penalty;
  }

  return tweets;
}

// Redis-backed, cross-time duplicate check for a SINGLE tweet.
// Persists every distinct author who has ever posted this exact normalized text
// in a Redis SET, and penalizes once 3+ distinct authors have used it.
async function checkDuplicateAgainstHistory(tweet) {
  const norm = normalizeText(tweet?.text);
  const author = tweet?.authorUserName;

  // Nothing meaningful to compare / attribute — no penalty.
  if (!norm || !author) return 1;

  // Short, stable key from the normalized text.
  const hash = crypto.createHash("sha1").update(norm).digest("hex");
  const key = `dup:${hash}`;

  // Record this author, then count how many distinct authors have used the text.
  await redis.sadd(key, author);
  const distinctAuthors = await redis.scard(key);

  return distinctAuthors >= MIN_DISTINCT_AUTHORS ? DUPLICATE_PENALTY : 1;
}

module.exports = {
  detectDuplicates,
  checkDuplicateAgainstHistory,
  normalizeText,
};

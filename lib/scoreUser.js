// scoreUser.js
// Turn an array of flat $ANSEM tweet objects (from fetchUserAnsemTweets) into a
// single Mindshare Score.

const { fetchUserAnsemTweets } = require("./fetchUserTweets");

const CASHTAG_RE = /\$ANSEM\b/i; // cashtag, case-insensitive
const PHRASE_RE = /black bull/i; // phrase, case-insensitive

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Engagement weights.
const W_LIKE = 1;
const W_RETWEET = 3;
const W_QUOTE = 4;
const W_REPLY = 2;
const W_BOOKMARK = 3;
const W_VIEW = 0.01;

function classifyMatch(text) {
  const s = text ?? "";
  // Stronger match wins: if it has the cashtag at all, it's "cashtag".
  if (CASHTAG_RE.test(s)) return "cashtag";
  if (PHRASE_RE.test(s)) return "phrase";
  return "phrase"; // fallback — it came back from the query, so treat as phrase
}

function engagementOf(t) {
  return (
    (t.likeCount ?? 0) * W_LIKE +
    (t.retweetCount ?? 0) * W_RETWEET +
    (t.quoteCount ?? 0) * W_QUOTE +
    (t.replyCount ?? 0) * W_REPLY +
    (t.bookmarkCount ?? 0) * W_BOOKMARK +
    (t.viewCount ?? 0) * W_VIEW
  );
}

function authorityOf(t) {
  let authority = Math.log10((t.authorFollowers ?? 0) + 1);

  // New-account penalty: less than 30 days old → authority × 0.3.
  const created = new Date(t.authorCreatedAt);
  if (!isNaN(created.getTime())) {
    const ageMs = Date.now() - created.getTime();
    if (ageMs < THIRTY_DAYS_MS) authority *= 0.3;
  }
  return authority;
}

function scoreUserMindshare(tweets) {
  const scored = (tweets ?? []).map((t) => {
    const matchType = classifyMatch(t.text);
    const engagement = engagementOf(t);
    const matchMultiplier = matchType === "cashtag" ? 1 : 0.5;
    const authority = authorityOf(t);
    // Cross-user copy-paste penalty (default 1 if dedupe wasn't run).
    const duplicatePenalty = t.duplicatePenalty ?? 1;
    const weightedScore =
      engagement * matchMultiplier * authority * duplicatePenalty;

    return { ...t, matchType, engagement, authority, duplicatePenalty, weightedScore };
  });

  // Sort by weighted score desc, keep only the top 10 (anti volume-spam).
  scored.sort((a, b) => b.weightedScore - a.weightedScore);
  const top10 = scored.slice(0, 10);

  const totalScore = top10.reduce((sum, t) => sum + t.weightedScore, 0);

  const topTweets = top10.slice(0, 3).map((t) => ({
    text: (t.text ?? "").replace(/\s+/g, " ").slice(0, 100),
    matchType: t.matchType,
    duplicatePenalty: t.duplicatePenalty,
    weightedScore: t.weightedScore,
  }));

  return {
    totalScore,
    tweetCount: (tweets ?? []).length,
    countedTweets: top10.length,
    topTweets,
  };
}

async function main() {
  const username = "blknoiz06";
  console.error(`Scoring @${username}...`);
  const tweets = await fetchUserAnsemTweets(username);
  const result = scoreUserMindshare(tweets);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
  });
}

module.exports = { scoreUserMindshare };

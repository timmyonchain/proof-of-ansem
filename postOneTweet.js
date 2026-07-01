// postOneTweet.js
// Simulates ONE account posting the same fixed text, then runs it through the
// persistent cross-time duplicate check. Run as separate processes to prove the
// dedupe history accumulates across runs.
//
//   node postOneTweet.js bot1

const { checkDuplicateAgainstHistory } = require("./lib/dedupe");
const { redis } = require("./lib/redis");
const crypto = require("crypto");

const FIXED_TEXT = "ANSEM to the moon!!! 🚀🚀🚀";

// Must match dedupe.js normalization + key scheme, so we can report the count.
function normalizeText(text) {
  const EMOJI_RE =
    /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}\u{2000}-\u{206F}]/gu;
  return (text ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/@\w+/g, "")
    .replace(EMOJI_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const username = process.argv[2];
  if (!username) {
    console.error("Usage: node postOneTweet.js <username>");
    process.exit(1);
  }

  const tweet = {
    id: `fake-${username}-${Date.now()}`,
    text: FIXED_TEXT,
    authorUserName: username,
    authorFollowers: 50,
    authorFollowing: 500,
    authorIsBlueVerified: false,
  };

  const duplicatePenalty = await checkDuplicateAgainstHistory(tweet);

  // Look up the distinct-author count now on record for this text.
  const hash = crypto.createHash("sha1").update(normalizeText(FIXED_TEXT)).digest("hex");
  const distinctAuthors = await redis.scard(`dup:${hash}`);

  console.log(`username:          ${username}`);
  console.log(`duplicatePenalty:  ${duplicatePenalty}`);
  console.log(`distinct authors:  ${distinctAuthors}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });

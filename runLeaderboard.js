// runLeaderboard.js
// Batch-scan multiple usernames and print the ranked leaderboard.
// Uses the same shared scanUser() code path as the live website, so the batch
// script and the API behave identically.

const { scanUser } = require("./lib/scanUser");
const { getLeaderboard } = require("./lib/leaderboard");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RATE_LIMIT_MS = 400; // paid tier — small courtesy delay

async function runLeaderboard(usernames) {
  const errors = [];       // { username, error }
  const succeeded = [];    // usernames scanned successfully

  // Scan each user through the shared path (resilient — one failure won't stop
  // the batch), throttling between users for the API rate limit.
  for (let i = 0; i < usernames.length; i++) {
    const username = usernames[i];
    if (i > 0) await sleep(RATE_LIMIT_MS);

    try {
      console.error(`Scanning @${username}...`);
      await scanUser(username);
      succeeded.push(username);
    } catch (err) {
      console.error(`⚠️  WARNING: scan failed for @${username}: ${err.message}`);
      errors.push({ username, error: err.message });
    }
  }

  // Read the ranked leaderboard back from Redis and print it.
  const leaderboard = await getLeaderboard();
  printTable(leaderboard);

  // Summary.
  console.log("\n" + "-".repeat(70));
  console.log(`Succeeded: ${succeeded.length} user(s)`);
  console.log(`Failed:    ${errors.length} user(s)`);
  for (const e of errors) console.log(`   ✗ @${e.username} — ${e.error}`);
  console.log(`Leaderboard persisted to Redis (sorted set "leaderboard").`);
  console.log("-".repeat(70));

  return { leaderboard, errors };
}

function printTable(results) {
  console.log("\n" + "=".repeat(70));
  console.log("$ANSEM MINDSHARE LEADERBOARD");
  console.log("=".repeat(70));
  console.log(
    "rank".padEnd(6) +
      "username".padEnd(22) +
      "totalScore".padStart(16) +
      "tweets".padStart(10)
  );
  console.log("-".repeat(70));

  results.forEach((r, i) => {
    const rank = String(i + 1).padEnd(6);
    const user = `@${r.username}`.padEnd(22);
    const score = Number(r.totalScore).toFixed(2).padStart(16);
    const tweets = String(r.tweetCount).padStart(10);
    console.log(rank + user + score + tweets);
  });
  console.log("=".repeat(70));
}

async function main() {
  const usernames = ["blknoiz06", "lookonchain", "dreythehussla"];
  await runLeaderboard(usernames);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Unexpected error:", err);
      process.exit(1);
    });
}

module.exports = { runLeaderboard };

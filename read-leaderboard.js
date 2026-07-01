// read-leaderboard.js
// Reads the leaderboard back out of Redis (fresh process) and verifies types.

const { getLeaderboard } = require("./lib/leaderboard");

async function main() {
  const lb = await getLeaderboard();

  console.log(JSON.stringify(lb, null, 2));

  console.log("\n--- type checks ---");
  for (const u of lb) {
    console.log(
      `@${u.username}: topTweets isArray=${Array.isArray(u.topTweets)} ` +
        `len=${u.topTweets.length} | tweetCount=${typeof u.tweetCount} | ` +
        `totalScore=${typeof u.totalScore} | timestamp=${u.timestamp}`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

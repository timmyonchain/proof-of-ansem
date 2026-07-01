// flush-test-data.js
// Deletes all leaderboard/dedupe keys so we can start from a clean baseline.
// Matches: "leaderboard", "user:*", "dup:*"

const { redis } = require("./lib/redis");

async function main() {
  const patterns = ["leaderboard", "user:*", "dup:*"];

  let allKeys = [];
  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    allKeys = allKeys.concat(keys);
  }
  // De-dupe in case patterns overlap.
  allKeys = [...new Set(allKeys)];

  if (allKeys.length === 0) {
    console.log("No matching keys found — database already clean.");
  } else {
    await redis.del(...allKeys);
    console.log(`Deleted ${allKeys.length} key(s):`);
    for (const k of allKeys) console.log(`  - ${k}`);
  }

  // Confirm nothing remains under our patterns.
  let remaining = [];
  for (const pattern of patterns) {
    remaining = remaining.concat(await redis.keys(pattern));
  }
  console.log(`\nRemaining matching keys: ${remaining.length}`);
  console.log(remaining.length === 0 ? "✅ Database is clean." : remaining);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Flush failed:", err.message);
    process.exit(1);
  });

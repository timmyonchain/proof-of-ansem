// run-refresh.js
// Test runner for refreshTrackedLeaderboard(). Prints the summary.
// Expect this to take several minutes due to API throttling.

const { refreshTrackedLeaderboard } = require("./lib/refreshLeaderboard");

(async () => {
  const start = Date.now();
  const summary = await refreshTrackedLeaderboard();

  console.log("\n=== REFRESH SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`elapsed: ${((Date.now() - start) / 1000).toFixed(1)}s`);
})()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("run-refresh failed:", err);
    process.exit(1);
  });

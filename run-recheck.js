// run-recheck.js — re-evaluate every tracked account against the stricter bar.
const { recheckTrackedAgainstBar } = require("./lib/refreshLeaderboard");

(async () => {
  const { survivors, pruned } = await recheckTrackedAgainstBar();

  console.log("\n=== RECHECK SUMMARY ===");
  console.log(`survived: ${survivors.length}`);
  console.log(`pruned:   ${pruned.length}`);

  console.log("\n--- PRUNED (reason) ---");
  if (pruned.length === 0) console.log("  (none)");
  for (const p of pruned) console.log(`  @${p.name} — ${p.reason}`);

  console.log("\n--- SURVIVED ---");
  for (const s of survivors) {
    if (s.reason) console.log(`  @${s.name} — ${s.reason}`);
    else console.log(`  @${s.name} (score ${s.score}, ${s.tweetCount} tweets, maxEng ${s.maxRawEngagement})`);
  }
})()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("run-recheck failed:", err);
    process.exit(1);
  });

// run-boost.js — find accounts boosted (RT/quote) by Ansem and add them.
const { findAnsemBoostedAccounts } = require("./lib/refreshLeaderboard");

(async () => {
  const summary = await findAnsemBoostedAccounts();
  console.log("\n=== BOOST SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
})()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("run-boost failed:", err);
    process.exit(1);
  });

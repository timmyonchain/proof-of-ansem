// debug-multi-account.js
// Throwaway inspection script — runs advanced_search for the same $ANSEM query
// across three accounts to isolate a bug. Not part of the real pipeline.

require("dotenv").config();
const fetch = require("node-fetch");

const API_KEY = process.env.TWITTERAPI_IO_KEY;
const BASE = "https://api.twitterapi.io";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RATE_LIMIT_MS = 400; // paid tier — small courtesy delay

const USERNAMES = ["blknoiz06", "lookonchain", "dreythehussla"];

async function call(path, params = {}) {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }
  const res = await fetch(url, { headers: { "X-API-Key": API_KEY } });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`${path} failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  if (!API_KEY || API_KEY === "paste_your_key_here") {
    console.error("Missing TWITTERAPI_IO_KEY in .env — add your real key first.");
    process.exit(1);
  }

  const summary = [];

  for (let i = 0; i < USERNAMES.length; i++) {
    const username = USERNAMES[i];
    if (i > 0) await sleep(RATE_LIMIT_MS); // rate limit between accounts

    const query = `($ANSEM OR "black bull") from:${username} since:2026-06-17`;
    const body = await call("/twitter/tweet/advanced_search", {
      query,
      queryType: "Latest",
    });

    const tweets = body.tweets ?? [];
    summary.push({ username, count: tweets.length });

    console.log(`\n@${username}`);
    console.log(`  query: ${query}`);
    console.log(`  tweets found: ${tweets.length}`);
    if (tweets.length > 0) {
      console.log(`  first tweet text: ${tweets[0].text}`);
    }
  }

  console.log("\n" + "=".repeat(45));
  console.log("SUMMARY");
  console.log("=".repeat(45));
  console.log("username".padEnd(30) + "tweet count");
  console.log("-".repeat(45));
  for (const row of summary) {
    console.log(`@${row.username}`.padEnd(30) + row.count);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});

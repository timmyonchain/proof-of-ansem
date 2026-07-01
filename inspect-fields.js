// inspect-fields.js
// Dumps the COMPLETE raw JSON of (a) the first advanced_search tweet and
// (b) that tweet author's /twitter/user/info profile — so we can see every
// available field before building the real pipeline.

require("dotenv").config();
const fetch = require("node-fetch");

const API_KEY = process.env.TWITTERAPI_IO_KEY;
const BASE = "https://api.twitterapi.io";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  // 1. Recent tweets for $ANSEM
  const search = await call("/twitter/tweet/advanced_search", {
    query: "$ANSEM",
    queryType: "Latest",
  });

  const tweets = search.tweets ?? [];
  if (tweets.length === 0) {
    console.log("No tweets returned for query \"$ANSEM\".");
    return;
  }

  // 2. Complete raw JSON of the first tweet
  const first = tweets[0];
  console.log("=".repeat(70));
  console.log("FULL RAW TWEET OBJECT (first result)");
  console.log("=".repeat(70));
  console.log(JSON.stringify(first, null, 2));

  // 3. Resolve author username, then fetch that user's profile
  const username = first.author?.userName ?? first.author?.screen_name;
  if (!username) {
    console.log("\nCould not determine author username from the tweet object.");
    return;
  }

  // Free-tier QPS limit is one request every 5 seconds — wait before the next call.
  await sleep(5500);

  const profile = await call("/twitter/user/info", { userName: username });

  // 4. Complete raw JSON of the user profile response
  console.log("\n" + "=".repeat(70));
  console.log(`FULL RAW USER PROFILE RESPONSE for @${username}`);
  console.log("=".repeat(70));
  console.log(JSON.stringify(profile, null, 2));
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});

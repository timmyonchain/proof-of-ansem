// debug-timeline.js
// Throwaway inspection script — pulls xshephrd's raw timeline directly via
// /twitter/user/last_tweets (no search query) and prints text/createdAt/isReply
// for the most recent 20 tweets. Not part of the real pipeline.

require("dotenv").config();
const fetch = require("node-fetch");

const API_KEY = process.env.TWITTERAPI_IO_KEY;
const BASE = "https://api.twitterapi.io";

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

  const body = await call("/twitter/user/last_tweets", {
    userName: "xshephrd",
    includeReplies: "true", // include replies so the timeline is unfiltered
  });

  // last_tweets is data-wrapped; tweets may sit at data.tweets or data directly.
  const tweets =
    body.data?.tweets ??
    (Array.isArray(body.data) ? body.data : null) ??
    body.tweets ??
    [];

  if (tweets.length === 0) {
    console.error("No tweets returned. Raw response shape:");
    console.error(JSON.stringify(body, null, 2).slice(0, 1500));
    return;
  }

  console.error(`=== showing ${Math.min(20, tweets.length)} of ${tweets.length} tweets ===\n`);
  tweets.slice(0, 20).forEach((t, i) => {
    console.log(`--- #${i + 1} ---`);
    console.log(`createdAt: ${t.createdAt}`);
    console.log(`isReply:   ${t.isReply}`);
    console.log(`text:      ${t.text}`);
    console.log("");
  });
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});

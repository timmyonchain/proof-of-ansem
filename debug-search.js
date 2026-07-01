// debug-search.js
// Throwaway inspection script — runs a broad, unfiltered advanced_search for
// xshephrd's ANSEM-related tweets and prints text/createdAt/isReply for each.
// Not part of the real pipeline.

require("dotenv").config();
const fetch = require("node-fetch");

const API_KEY = process.env.TWITTERAPI_IO_KEY;
const BASE = "https://api.twitterapi.io";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RATE_LIMIT_MS = 400; // paid tier — small courtesy delay

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

  const query = '(ansem OR ANSEM OR $ANSEM OR "black bull") from:xshephrd since:2026-06-17';
  console.error(`Query: ${query}\n`);

  const results = [];
  let cursor = "";
  let page = 0;

  while (true) {
    if (page > 0) await sleep(RATE_LIMIT_MS);

    const body = await call("/twitter/tweet/advanced_search", {
      query,
      queryType: "Latest",
      cursor,
    });

    const tweets = body.tweets ?? [];
    results.push(...tweets);
    page += 1;
    console.error(`[page ${page}] +${tweets.length} tweets (total ${results.length})`);

    if (!body.has_next_page) break;
    cursor = body.next_cursor ?? "";
    if (!cursor) break;
  }

  console.error(`\n=== ${results.length} tweet(s) ===\n`);
  results.forEach((t, i) => {
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

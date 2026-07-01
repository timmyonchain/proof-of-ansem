// test-search.js
// Runs an advanced search on twitterapi.io for "$ANSEM" and prints the first 3 results.

require("dotenv").config();
const fetch = require("node-fetch");

const API_KEY = process.env.TWITTERAPI_IO_KEY;
const BASE = "https://api.twitterapi.io";

async function main() {
  if (!API_KEY || API_KEY === "paste_your_key_here") {
    console.error("Missing TWITTERAPI_IO_KEY in .env — add your real key first.");
    process.exit(1);
  }

  const url = new URL(`${BASE}/twitter/tweet/advanced_search`);
  url.searchParams.set("query", "$ANSEM");

  const res = await fetch(url, {
    headers: { "X-API-Key": API_KEY },
  });

  const body = await res.json();

  if (!res.ok) {
    console.error(`Request failed (${res.status}):`, body.detail ?? body.msg ?? body);
    process.exit(1);
  }

  // advanced_search returns a flat { tweets[], has_next_page, next_cursor } (no data/status wrapper)
  const tweets = body.tweets ?? [];

  if (tweets.length === 0) {
    console.log("No tweets returned for query \"$ANSEM\".");
    return;
  }

  console.log(`Showing first ${Math.min(3, tweets.length)} of ${tweets.length} tweets for "$ANSEM":\n`);

  tweets.slice(0, 3).forEach((t, i) => {
    const author = t.author?.userName ?? t.author?.screen_name ?? "(unknown)";
    const text = (t.text ?? "").replace(/\s+/g, " ").trim();

    console.log(`#${i + 1} @${author}`);
    console.log(`   text:     ${text}`);
    console.log(`   likes:    ${t.likeCount ?? 0}`);
    console.log(`   retweets: ${t.retweetCount ?? 0}`);
    if (t.viewCount !== undefined) {
      console.log(`   views:    ${t.viewCount}`);
    }
    console.log("");
  });
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});

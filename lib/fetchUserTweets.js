// fetchUserTweets.js
// Fetch all of a user's tweets mentioning $ANSEM / ANSEM via advanced_search,
// paging through results and normalizing each into a clean flat object.

require("dotenv").config();
// Prefer the native global fetch (Node 18+, and the Next.js server runtime).
// Fall back to node-fetch only if it's somehow unavailable. This avoids the
// ESM-interop "fetch is not a function" issue when bundled by Turbopack.
const fetch = globalThis.fetch ?? require("node-fetch");

const API_KEY = process.env.TWITTERAPI_IO_KEY;
const BASE = "https://api.twitterapi.io";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Paid tier — small courtesy delay between requests.
const RATE_LIMIT_MS = 400;

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

// Normalize a raw advanced_search tweet into a clean flat object.
function flattenTweet(t) {
  const author = t.author ?? {};
  return {
    id: t.id,
    url: t.url,
    text: t.text,
    createdAt: t.createdAt,

    likeCount: t.likeCount ?? 0,
    retweetCount: t.retweetCount ?? 0,
    quoteCount: t.quoteCount ?? 0,
    replyCount: t.replyCount ?? 0,
    bookmarkCount: t.bookmarkCount ?? 0,
    viewCount: t.viewCount ?? 0,

    authorUserName: author.userName,
    authorFollowers: author.followers,
    authorFollowing: author.following,
    authorIsBlueVerified: author.isBlueVerified,
    authorCreatedAt: author.createdAt,
  };
}

async function fetchUserAnsemTweets(username) {
  const query = `($ANSEM OR "The Black Bull") from:${username} since:2026-06-17`;
  const results = [];
  let cursor = "";
  let page = 0;

  while (true) {
    if (page > 0) await sleep(RATE_LIMIT_MS); // throttle between pages

    const body = await call("/twitter/tweet/advanced_search", {
      query,
      queryType: "Latest",
      cursor,
    });

    const tweets = body.tweets ?? [];
    for (const t of tweets) results.push(flattenTweet(t));

    page += 1;
    console.error(`  [page ${page}] +${tweets.length} tweets (total ${results.length})`);

    if (!body.has_next_page) break;
    cursor = body.next_cursor ?? "";
    if (!cursor) break; // safety: no cursor means we can't continue
  }

  return results;
}

async function main() {
  if (!API_KEY || API_KEY === "paste_your_key_here") {
    console.error("Missing TWITTERAPI_IO_KEY in .env — add your real key first.");
    process.exit(1);
  }

  const testUsername = "xshephrd";
  console.error(`Fetching $ANSEM tweets from @${testUsername}...`);
  const tweets = await fetchUserAnsemTweets(testUsername);
  console.log(JSON.stringify(tweets, null, 2));
  console.error(`\nDone — ${tweets.length} tweet(s) total.`);
}

// Only run the self-test when executed directly (not when require()'d).
if (require.main === module) {
  main().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
  });
}

module.exports = { fetchUserAnsemTweets };

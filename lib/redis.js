// lib/redis.js
// Sets up and exports a shared @upstash/redis client, reading credentials from
// .env (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).

require("dotenv").config();
const { Redis } = require("@upstash/redis");

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token || url.includes("paste_the_url") || token.includes("paste_the_token")) {
  throw new Error(
    "Missing Upstash credentials — set UPSTASH_REDIS_REST_URL and " +
      "UPSTASH_REDIS_REST_TOKEN in .env"
  );
}

const redis = new Redis({ url, token });

module.exports = { redis };

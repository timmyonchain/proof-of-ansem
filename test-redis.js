// test-redis.js
// Quick connectivity check for the Upstash Redis client.

const { redis } = require("./lib/redis");

async function main() {
  // 1. Write
  await redis.set("hello", "proof-of-ansem is connected");
  console.log('Wrote key "hello".');

  // 2. Read back
  const value = await redis.get("hello");
  console.log(`Read back "hello" => ${value}`);

  // 3. Cleanup
  await redis.del("hello");
  const after = await redis.get("hello");
  console.log(`Deleted test key. Value now: ${after}`);

  console.log("\n✅ Upstash Redis connection works.");
}

main().catch((err) => {
  console.error("❌ Redis test failed:", err.message);
  process.exit(1);
});

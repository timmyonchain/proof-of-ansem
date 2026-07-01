// lib/checkWallet.js
// Standalone $ANSEM wallet-holdings checker. Independent of the X mindshare
// scan / leaderboard — no scores, no rankings.

require("dotenv").config();
const { redis } = require("./redis");
const fetch = globalThis.fetch ?? require("node-fetch");

const MINT = "9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump";
const RPC = "https://api.mainnet-beta.solana.com";

// base58 alphabet, Solana pubkeys are 32 bytes => ~32-44 base58 chars.
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const CACHE_TTL_SECONDS = 60 * 60; // 1 hour

async function checkWalletHoldings(walletAddress) {
  const addr = String(walletAddress ?? "").trim();

  // 1. Validate before calling anything.
  if (!BASE58_RE.test(addr)) {
    return { error: "That doesn't look like a valid Solana wallet address." };
  }

  // 2. Serve from cache if fresh (balances don't need live checks every time).
  const cacheKey = `wallet:${addr}`;
  const cached = await redis.get(cacheKey);
  if (cached && typeof cached === "object") {
    return { ...cached, source: "cached" };
  }

  // 3. Query Solana RPC for this owner's token accounts of the $ANSEM mint.
  const rpcBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "getTokenAccountsByOwner",
    params: [addr, { mint: MINT }, { encoding: "jsonParsed" }],
  };

  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rpcBody),
  });
  if (!res.ok) {
    throw new Error(`Solana RPC request failed (HTTP ${res.status}).`);
  }
  const json = await res.json();
  if (json.error) {
    throw new Error(`Solana RPC error: ${json.error.message || "unknown"}`);
  }

  // 4. Sum uiAmount across any matching token accounts (usually just one).
  //    No token account => wallet simply doesn't hold it => balance 0 (valid).
  const accounts = json.result?.value ?? [];
  let balance = 0;
  for (const acc of accounts) {
    const ui = acc?.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
    if (typeof ui === "number") balance += ui;
  }

  const result = { walletAddress: addr, balance, isHolder: balance > 0 };

  // 5. Cache for 1 hour.
  await redis.set(cacheKey, result, { ex: CACHE_TTL_SECONDS });

  return { ...result, source: "live" };
}

module.exports = { checkWalletHoldings };

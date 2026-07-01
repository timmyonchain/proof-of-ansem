import { NextResponse } from "next/server";
import { scanUser } from "@/lib/scanUser";
import { redis } from "@/lib/redis";

// Needs Node.js APIs (crypto, node-fetch, @upstash/redis) and must never be
// statically cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rate limit: max RL_MAX scan requests per IP per RL_WINDOW seconds.
const RL_MAX = 10;
const RL_WINDOW = 600; // 10 minutes

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: Request) {
  try {
    // --- rate limiting ---
    const ip = clientIp(request);
    const rlKey = `ratelimit:${ip}`;
    const count: number = await redis.incr(rlKey);
    if (count === 1) {
      await redis.expire(rlKey, RL_WINDOW);
    }
    if (count > RL_MAX) {
      return NextResponse.json(
        { error: "Too many checks — try again in a few minutes." },
        { status: 429 }
      );
    }

    // --- validate input ---
    const body = await request.json().catch(() => ({}));
    const rawUsername = body?.username;
    if (typeof rawUsername !== "string" || rawUsername.trim() === "") {
      return NextResponse.json(
        { error: "username is required" },
        { status: 400 }
      );
    }

    // --- scan (cache-aware) ---
    const username = rawUsername.trim();
    const result = await scanUser(username);
    return NextResponse.json({ username, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

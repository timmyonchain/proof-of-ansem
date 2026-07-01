import { ImageResponse } from "next/og";
import { Redis } from "@upstash/redis";
import { checkWalletHoldings } from "@/lib/checkWallet";

// nodejs (not edge) so we can reuse checkWalletHoldings, which relies on
// Node-oriented modules. ImageResponse works in both runtimes.
export const runtime = "nodejs";

// Static TTFs (satori needs real font buffers, not CSS font-family).
const FONT_GOTHIC =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/pirataone/PirataOne-Regular.ttf";
const FONT_MONO_R =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/spacemono/SpaceMono-Regular.ttf";
const FONT_MONO_B =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/spacemono/SpaceMono-Bold.ttf";

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font fetch ${res.status} ${url}`);
  return res.arrayBuffer();
}

// Fetch the bull photo and inline it as a data URI (avoids satori self-fetch
// quirks and works in any environment).
async function bullDataUri(origin: string): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/black-bull.jpg`);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return `data:image/jpeg;base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ username: string }> }
) {
  const { username: rawParam } = await ctx.params;
  const username = decodeURIComponent(rawParam).replace(/^@+/, "").trim();

  // --- data lookup (never throw; unranked/unknown just render an empty state) ---
  let score = 0;
  let tweetCount = 0;
  let rank: number | null = null;
  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    const details = await redis.hgetall<Record<string, unknown>>(
      `user:${username}`
    );
    if (details) {
      score = Number(details.totalScore ?? 0);
      tweetCount = Number(details.tweetCount ?? 0);
    }
    const r = await redis.zrevrank("leaderboard", username);
    rank = r === null || r === undefined ? null : Number(r) + 1;
  } catch {
    // leave defaults
  }

  const url = new URL(request.url);
  const origin = url.origin;

  // --- optional wallet holdings (only when ?wallet= is present) ---
  const walletParam = url.searchParams.get("wallet");
  let walletBalance: number | null = null;
  if (walletParam) {
    try {
      const w = await checkWalletHoldings(walletParam);
      if (w && !w.error && typeof w.balance === "number") {
        walletBalance = w.balance;
      }
    } catch {
      // ignore — omit the wallet section rather than break the card
    }
  }

  const [gothic, monoR, monoB, bull] = await Promise.all([
    fetchFont(FONT_GOTHIC),
    fetchFont(FONT_MONO_R),
    fetchFont(FONT_MONO_B),
    bullDataUri(origin),
  ]);

  const fmtScore = Math.round(score).toLocaleString("en-US");
  const fmtBalance =
    walletBalance != null
      ? Number(walletBalance).toLocaleString("en-US", {
          maximumFractionDigits: 2,
        })
      : null;
  // When holdings are shown, compact the layout so everything fits in 630px.
  const hasWallet = fmtBalance !== null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          backgroundColor: "#050505",
          padding: "50px",
          fontFamily: "Mono",
        }}
      >
        {/* Left: text column */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: hasWallet ? "flex-start" : "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* $ANSEM tag */}
            <div style={{ display: "flex" }}>
              <div
                style={{
                  display: "flex",
                  backgroundColor: "#ECECE9",
                  color: "#050505",
                  fontFamily: "Mono",
                  fontWeight: 700,
                  fontSize: "58px",
                  padding: "2px 18px",
                  transform: "rotate(-1.5deg)",
                }}
              >
                $ANSEM
              </div>
            </div>
            {/* THE BLACK BULL gothic + green */}
            <div style={{ display: "flex", marginTop: "14px" }}>
              <div
                style={{
                  display: "flex",
                  backgroundColor: "#00E676",
                  color: "#050505",
                  fontFamily: "Gothic",
                  fontSize: "70px",
                  padding: "0 20px 10px",
                  transform: "rotate(1.5deg)",
                }}
              >
                THE BLACK BULL
              </div>
            </div>

            {/* username */}
            <div
              style={{
                display: "flex",
                marginTop: hasWallet ? "22px" : "46px",
                color: "#7A7972",
                fontSize: "30px",
              }}
            >
              @{username}
            </div>
            {/* score */}
            <div
              style={{
                display: "flex",
                color: "#5DCAA5",
                fontFamily: "Mono",
                fontWeight: 700,
                fontSize: hasWallet ? "86px" : "120px",
                lineHeight: "1",
              }}
            >
              {fmtScore}
            </div>
            <div
              style={{
                display: "flex",
                color: "#7A7972",
                fontSize: "22px",
                letterSpacing: "3px",
              }}
            >
              MINDSHARE SCORE
            </div>

            {/* tweets + rank badge */}
            <div
              style={{
                display: "flex",
                marginTop: hasWallet ? "14px" : "30px",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", color: "#ECECE9", fontSize: "28px" }}>
                {tweetCount} {tweetCount === 1 ? "tweet" : "tweets"}
              </div>
              <div style={{ display: "flex", width: "28px" }} />
              {rank ? (
                <div
                  style={{
                    display: "flex",
                    border: "3px solid #ECECE9",
                    color: "#ECECE9",
                    fontWeight: 700,
                    fontSize: "28px",
                    padding: "6px 18px",
                  }}
                >
                  RANK #{rank}
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    border: "3px solid #7A7972",
                    color: "#7A7972",
                    fontSize: "22px",
                    padding: "6px 18px",
                  }}
                >
                  NOT YET RANKED · TOP 500 ONLY
                </div>
              )}
            </div>

            {/* optional: $ANSEM wallet holdings */}
            {fmtBalance !== null && (
              <div
                style={{
                  display: "flex",
                  marginTop: "10px",
                  alignItems: "baseline",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    color: "#5DCAA5",
                    fontFamily: "Mono",
                    fontWeight: 700,
                    fontSize: "40px",
                  }}
                >
                  {fmtBalance}
                </div>
                <div
                  style={{
                    display: "flex",
                    marginLeft: "14px",
                    color: "#7A7972",
                    fontSize: "22px",
                    letterSpacing: "2px",
                  }}
                >
                  $ANSEM HELD
                </div>
              </div>
            )}
          </div>

          {/* credit */}
          <div
            style={{
              display: "flex",
              marginTop: hasWallet ? "12px" : "0px",
              color: "#5F5E5A",
              fontSize: "22px",
            }}
          >
            built by @xshephrd
          </div>
        </div>

        {/* Right: bull photo in a bordered box (plain, no blend) */}
        <div
          style={{
            display: "flex",
            width: "400px",
            height: "530px",
            marginLeft: "44px",
            border: "4px solid #ECECE9",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {bull ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bull}
              width={392}
              height={522}
              alt="The Black Bull"
              style={{ objectFit: "cover" }}
            />
          ) : (
            <div style={{ display: "flex", color: "#5F5E5A", fontSize: "24px" }}>
              THE BLACK BULL
            </div>
          )}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Gothic", data: gothic, weight: 400, style: "normal" },
        { name: "Mono", data: monoR, weight: 400, style: "normal" },
        { name: "Mono", data: monoB, weight: 700, style: "normal" },
      ],
    }
  );
}

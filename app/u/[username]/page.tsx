import type { Metadata } from "next";
import Link from "next/link";
import { getUserResult } from "@/lib/leaderboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

function fmt(n: number): string {
  return Math.round(Number(n) || 0).toLocaleString("en-US");
}

function clean(raw: string): string {
  return decodeURIComponent(raw).replace(/^@+/, "").trim();
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ wallet?: string }>;
}): Promise<Metadata> {
  const { username: raw } = await params;
  const username = clean(raw);
  const { wallet } = await searchParams;

  const walletQuery = wallet ? `?wallet=${encodeURIComponent(wallet)}` : "";
  const cardUrl = `${SITE_URL}/api/card/${encodeURIComponent(
    username
  )}${walletQuery}`;
  const pageUrl = `${SITE_URL}/u/${encodeURIComponent(username)}${walletQuery}`;
  const title = `@${username}'s $ANSEM Mindshare Score`;
  const description = `See @${username}'s standing on the Proof of Ansem — The Black Bull mindshare leaderboard.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      images: [{ url: cardUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [cardUrl],
    },
  };
}

export default async function UserPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: raw } = await params;
  const username = clean(raw);
  const data = await getUserResult(username);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-4 py-10 text-[#ecece9]">
      <div className="w-full max-w-lg">
        {/* Card preview */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/card/${encodeURIComponent(username)}`}
          alt={`@${username}'s $ANSEM mindshare card`}
          width={1200}
          height={630}
          className="w-full border-2 border-[#ecece9]"
        />

        {/* Simple text summary */}
        <div className="mt-6 text-center">
          <div className="font-num text-sm uppercase tracking-wider text-[#7a7972]">
            @{username}
          </div>
          <div className="font-num text-5xl font-bold text-[#5dcaa5]">
            {fmt(data.totalScore)}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a7972]">
            Mindshare Score
          </div>
          <div className="mt-3 font-num text-sm text-[#ecece9]">
            {data.tweetCount} {data.tweetCount === 1 ? "tweet" : "tweets"}
            <span className="mx-2 text-[#5f5e5a]">/</span>
            {data.rank ? (
              <span>Rank #{data.rank}</span>
            ) : (
              <span className="text-[#7a7972]">Not yet ranked · top 500 only</span>
            )}
          </div>

          <Link
            href="/"
            className="mt-8 inline-flex items-center gap-2 border-2 border-[#ecece9] bg-[#ecece9] px-5 py-3 font-display text-sm uppercase tracking-wider text-[#050505] hover:bg-[#050505] hover:text-[#ecece9]"
          >
            Check Your Own Mindshare →
          </Link>
        </div>
      </div>
    </main>
  );
}

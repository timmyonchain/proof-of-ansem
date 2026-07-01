import { NextResponse } from "next/server";
// @ts-expect-error — JS module without type declarations
import { getLeaderboard, getLeaderboardCount } from "@/lib/leaderboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const totalCount: number = await getLeaderboardCount();
    const totalPages = Math.max(
      1,
      Math.min(MAX_PAGES, Math.ceil(totalCount / PAGE_SIZE))
    );

    const requested = Math.floor(Number(searchParams.get("page")) || 1);
    const page = Math.min(Math.max(1, requested), totalPages);

    const leaderboard = await getLeaderboard(page);

    return NextResponse.json({ leaderboard, page, totalPages, totalCount });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "failed to load leaderboard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

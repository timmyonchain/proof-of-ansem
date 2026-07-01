import { NextResponse } from "next/server";
import { checkWalletHoldings } from "@/lib/checkWallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const raw = body?.walletAddress;

    if (typeof raw !== "string" || raw.trim() === "") {
      return NextResponse.json(
        { error: "walletAddress is required" },
        { status: 400 }
      );
    }

    const result = await checkWalletHoldings(raw.trim());
    if (result?.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Wallet check failed. Try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

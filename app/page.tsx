"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TopTweet = {
  text: string;
  matchType: string;
  weightedScore: number;
};

type LeaderboardEntry = {
  rank: number;
  username: string;
  totalScore: number;
  tweetCount: number;
};

type ScanResult = {
  username: string;
  totalScore: number;
  tweetCount: number;
  countedTweets?: number;
  topTweets?: TopTweet[];
};

const CONTRACT = "9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump";
const CONTRACT_SHORT = "9cRCn9r...TGpump";
const CHART_URL = `https://pump.fun/coin/${CONTRACT}`;

// Absolute base URL for shareable links (unfurls correctly once deployed).
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

function formatScore(n: number): string {
  return Math.round(Number(n) || 0).toLocaleString("en-US");
}

function formatBalance(n: number): string {
  return (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function stripAt(input: string): string {
  return input.trim().replace(/^@+/, "").trim();
}

function CopyIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
    >
      <rect x="9" y="9" width="11" height="11" />
      <path d="M5 15V5a1 1 0 0 1 1-1h9" />
    </svg>
  );
}

/* Film-grain / charcoal texture overlay via SVG feTurbulence, desaturated. */
function GrainOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 opacity-[0.14] mix-blend-screen"
    >
      <svg className="h-full w-full">
        <filter id="grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.82"
            numOctaves="4"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </div>
  );
}

// shared grid so leaderboard header labels and rows align to the same columns
// Single source of truth for leaderboard columns. Every track is FIXED except
// account (1fr), so the header row and every data row resolve to identical
// column widths and line up perfectly. (An `auto` last column would size to its
// own content per-row, drifting the fixed columns.)
//   rank | account | tweets | mindshare score
const GRID =
  "grid grid-cols-[2rem_1fr_3rem_7rem] sm:grid-cols-[3rem_1fr_4rem_8rem] gap-2 sm:gap-3 items-center";

export default function Home() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbLoading, setLbLoading] = useState(true);
  const [lbError, setLbError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [resultRank, setResultRank] = useState<number | null>(null);

  const [copied, setCopied] = useState(false);
  const scanRef = useRef<HTMLDivElement | null>(null);

  // Wallet holdings checker (fully independent from the X scan/leaderboard).
  const [wallet, setWallet] = useState("");
  const [walletChecking, setWalletChecking] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletResult, setWalletResult] = useState<{
    walletAddress: string;
    balance: number;
    isHolder: boolean;
  } | null>(null);
  // Last successfully-checked wallet this session — appended to card/share URLs.
  const [checkedWallet, setCheckedWallet] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const loadLeaderboard = useCallback(
    async (p = 1): Promise<LeaderboardEntry[]> => {
      setLbError(null);
      try {
        const res = await fetch(`/api/leaderboard?page=${p}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list: LeaderboardEntry[] = Array.isArray(data?.leaderboard)
          ? data.leaderboard
          : [];
        setLeaderboard(list);
        setPage(Number(data?.page) || 1);
        setTotalPages(Number(data?.totalPages) || 1);
        return list;
      } catch {
        setLbError("Couldn't load the leaderboard. Try refreshing.");
        return [];
      } finally {
        setLbLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadLeaderboard(1);
  }, [loadLeaderboard]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = stripAt(username);
    if (!clean || scanning) return;

    setScanning(true);
    setScanError(null);
    setResult(null);
    setResultRank(null);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: clean }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Scan failed (HTTP ${res.status})`);
      }

      setResult(data as ScanResult);

      // Reload page 1 so the fresh top of the board (and any new/updated row)
      // is visible; look up the scanned user's rank if they're on this page.
      const list = await loadLeaderboard(1);
      const idx = list.findIndex(
        (u) => u.username?.toLowerCase() === clean.toLowerCase()
      );
      setResultRank(idx >= 0 ? list[idx].rank : null);
    } catch (err) {
      setScanError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setScanning(false);
    }
  }

  async function handleWalletSubmit(e: React.FormEvent) {
    e.preventDefault();
    const addr = wallet.trim();
    if (!addr || walletChecking) return;

    setWalletChecking(true);
    setWalletError(null);
    setWalletResult(null);

    try {
      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: addr }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Check failed (HTTP ${res.status})`);
      }
      setWalletResult(data);
      if (data?.walletAddress) setCheckedWallet(data.walletAddress);
    } catch (err) {
      setWalletError(
        err instanceof Error ? err.message : "Something went wrong. Try again."
      );
    } finally {
      setWalletChecking(false);
    }
  }

  async function copyContract() {
    try {
      await navigator.clipboard.writeText(CONTRACT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function scrollToScan() {
    scanRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Appended to card/share URLs when a wallet has been checked this session.
  const walletQuery = checkedWallet
    ? `?wallet=${encodeURIComponent(checkedWallet)}`
    : "";

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#ecece9]">
      <GrainOverlay />

      <div className="relative z-10 mx-auto w-full max-w-md px-4 py-5 sm:max-w-2xl sm:px-6 sm:py-8 md:max-w-5xl lg:max-w-7xl lg:px-12 lg:py-10 xl:max-w-[100rem] xl:px-20">
        {/* Utility bar — hairline, monochrome */}
        <div className="flex flex-col gap-3 border-b border-[#24241f] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a7972]">
              CA
            </span>
            <span className="font-num text-sm text-[#ecece9]">
              {CONTRACT_SHORT}
            </span>
            <button
              type="button"
              onClick={copyContract}
              aria-label="Copy contract address"
              className="flex h-8 items-center justify-center gap-1 border border-[#ecece9] px-2 text-[11px] font-bold uppercase tracking-wider text-[#ecece9] hover:bg-[#ecece9] hover:text-[#050505]"
            >
              {copied ? (
                "Copied"
              ) : (
                <>
                  <CopyIcon className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>

          <a
            href={CHART_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 self-start border border-[#ecece9] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#ecece9] hover:bg-[#ecece9] hover:text-[#050505] sm:self-auto"
          >
            View Chart →
          </a>
        </div>

        {/* Hero */}
        <section className="flex flex-col items-center gap-2 py-8 sm:flex-row sm:gap-6 sm:py-12 md:gap-10 lg:gap-16 lg:py-20">
          <div className="order-2 flex-1 text-center sm:order-1 sm:text-left">
            <h1 className="flex flex-col items-center gap-3 sm:items-start">
              <span className="font-display inline-block rotate-[-1.5deg] bg-[#ecece9] px-4 py-1.5 text-4xl leading-[1.15] text-[#050505] sm:text-6xl lg:text-7xl xl:text-8xl">
                $ANSEM
              </span>
              <span className="font-gothic inline-block rotate-[1.5deg] bg-[#00e676] px-4 py-1.5 text-4xl leading-[1.15] text-[#050505] sm:text-6xl lg:text-7xl xl:text-8xl">
                THE BLACK BULL
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-[#7a7972] sm:mx-0 lg:mt-6 lg:max-w-lg lg:text-base">
              Your proof of bagworking for $ANSEM. Check where you stand from
              your posts and $ANSEM holdings.
            </p>
            <button
              type="button"
              onClick={scrollToScan}
              className="mt-6 inline-flex items-center gap-2 border-2 border-[#ecece9] bg-[#ecece9] px-5 py-3 font-display text-sm uppercase tracking-wider text-[#050505] hover:bg-[#050505] hover:text-[#ecece9] lg:mt-8 lg:px-7 lg:py-4 lg:text-base"
            >
              Check Your Mindshare ↓
            </button>
          </div>

          <div className="order-1 w-full max-w-[260px] sm:order-2 sm:w-[46%] sm:max-w-none lg:w-[50%]">
            {/* Real photo — screen blend drops the dark bull into the page black
                while the hazy backdrop becomes atmospheric glow. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/black-bull.jpg"
              alt="The Black Bull charging forward through dust"
              width={1080}
              height={1440}
              className="mx-auto h-auto w-full object-contain mix-blend-screen sm:max-h-[70vh]"
            />
          </div>
        </section>

        {/* Details strip — three columns, hairlines */}
        <div className="grid grid-cols-3 border-y border-[#24241f]">
          {[
            ["Live X Data", "not aggregator guesses"],
            ["Anti-Spam Scoring", "copy-paste bots buried"],
            ["Verified Contract", "no copycat token"],
          ].map(([title, sub], i) => (
            <div
              key={title}
              className={`px-2 py-4 text-center sm:px-4 ${
                i > 0 ? "border-l border-[#24241f]" : ""
              }`}
            >
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#ecece9] sm:text-xs">
                {title}
              </div>
              <div className="mt-1 text-[10px] text-[#5f5e5a] sm:text-[11px]">
                {sub}
              </div>
            </div>
          ))}
        </div>

        {/* Scan section — THE one loud element (thick border + hard offset shadow) */}
        <div ref={scanRef} className="scroll-mt-6 py-10">
          <div className="relative">
            <div
              aria-hidden
              className="absolute inset-0 translate-x-[8px] translate-y-[8px] bg-[#ecece9]"
            />
            <div className="relative border-[3px] border-[#ecece9] bg-[#0a0a0a] p-4 sm:p-5">
              <form onSubmit={handleSubmit}>
                <label
                  htmlFor="username"
                  className="mb-2 block text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a7972]"
                >
                  Check an X account
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="flex flex-1 items-center border-2 border-[#ecece9] bg-[#050505] px-3">
                    <span className="select-none font-num text-[#7a7972]">
                      @
                    </span>
                    <input
                      id="username"
                      type="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={username}
                      onChange={(e) =>
                        setUsername(e.target.value.replace(/^@+/, ""))
                      }
                      placeholder="username"
                      className="w-full bg-transparent py-3 pl-1 font-num text-base text-[#ecece9] placeholder-[#5f5e5a] outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={scanning || !stripAt(username)}
                    className="border-2 border-[#ecece9] bg-[#ecece9] px-4 py-3 font-display text-sm uppercase tracking-wider text-[#050505] hover:bg-[#050505] hover:text-[#ecece9] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {scanning ? "Scanning…" : "Check My Mindshare"}
                  </button>
                </div>

                {scanning && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-[#7a7972]">
                    <span className="inline-block h-3 w-3 border-2 border-[#5f5e5a] border-t-[#ecece9] motion-safe:animate-spin" />
                    Pulling tweets &amp; scoring… this can take a few seconds.
                  </p>
                )}

                {scanError && (
                  <p className="mt-3 border border-[#7a7972] px-3 py-2 text-sm text-[#ecece9]">
                    {scanError}
                  </p>
                )}
              </form>

              {/* Scan result */}
              {result && !scanning && (
                <div className="mt-4 border-t border-[#24241f] pt-4">
                  {result.tweetCount === 0 ? (
                    <p className="text-sm text-[#ecece9]">
                      No <span className="text-[#ecece9]">$ANSEM</span>{" "}
                      mindshare detected for{" "}
                      <span className="font-bold">@{result.username}</span> yet —
                      go post something real.
                    </p>
                  ) : (
                    <div>
                      <div className="font-num text-xs uppercase tracking-wider text-[#7a7972]">
                        @{result.username}
                      </div>
                      <div className="font-num text-4xl font-bold text-[#5dcaa5]">
                        {formatScore(result.totalScore)}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a7972]">
                        Mindshare Score
                      </div>
                      <div className="mt-2 flex items-center gap-3 font-num text-sm text-[#ecece9]">
                        <span>
                          {result.tweetCount} tweet
                          {result.tweetCount === 1 ? "" : "s"}
                        </span>
                        <span className="text-[#5f5e5a]">/</span>
                        <span>
                          {resultRank
                            ? `Rank #${resultRank}`
                            : "Unranked (top 100)"}
                        </span>
                      </div>

                      {/* Card preview */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/card/${encodeURIComponent(
                          result.username
                        )}${walletQuery}`}
                        alt="Your $ANSEM mindshare card"
                        width={1200}
                        height={630}
                        className="mt-4 w-full border-2 border-[#ecece9]"
                      />

                      {/* Actions */}
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                        <a
                          href={`/api/card/${encodeURIComponent(
                            result.username
                          )}${walletQuery}`}
                          download={`ansem-${result.username}.png`}
                          className="inline-flex items-center justify-center gap-2 border-2 border-[#ecece9] px-4 py-2 text-sm font-bold uppercase tracking-wider text-[#ecece9] hover:bg-[#ecece9] hover:text-[#050505]"
                        >
                          Download Card ↓
                        </a>
                        <a
                          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                            resultRank
                              ? `I'm ranked #${resultRank} on the $ANSEM mindshare leaderboard with a score of ${formatScore(
                                  result.totalScore
                                )} 🐂`
                              : `I scored ${formatScore(
                                  result.totalScore
                                )} on the $ANSEM mindshare leaderboard 🐂`
                          )}&url=${encodeURIComponent(
                            `${SITE_URL}/u/${encodeURIComponent(
                              result.username
                            )}${walletQuery}`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 border-2 border-[#00e676] bg-[#00e676] px-4 py-2 text-sm font-bold uppercase tracking-wider text-[#050505] hover:bg-[#050505] hover:text-[#00e676]"
                        >
                          Share to X ↗
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Wallet holdings checker — standalone, independent of the X scan */}
        <div className="pb-2">
          <div className="relative">
            <div
              aria-hidden
              className="absolute inset-0 translate-x-[8px] translate-y-[8px] bg-[#ecece9]"
            />
            <div className="relative border-[3px] border-[#ecece9] bg-[#0a0a0a] p-4 sm:p-5">
              <form onSubmit={handleWalletSubmit}>
                <label
                  htmlFor="wallet"
                  className="mb-2 block text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a7972]"
                >
                  Check Your Bags
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="flex flex-1 items-center border-2 border-[#ecece9] bg-[#050505] px-3">
                    <input
                      id="wallet"
                      type="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={wallet}
                      onChange={(e) => setWallet(e.target.value)}
                      placeholder="Solana wallet address"
                      className="w-full bg-transparent py-3 font-num text-base text-[#ecece9] placeholder-[#5f5e5a] outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={walletChecking || !wallet.trim()}
                    className="border-2 border-[#ecece9] bg-[#ecece9] px-4 py-3 font-display text-sm uppercase tracking-wider text-[#050505] hover:bg-[#050505] hover:text-[#ecece9] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {walletChecking ? "Checking…" : "Check My Bags"}
                  </button>
                </div>

                {walletChecking && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-[#7a7972]">
                    <span className="inline-block h-3 w-3 border-2 border-[#5f5e5a] border-t-[#ecece9] motion-safe:animate-spin" />
                    Checking on-chain balance…
                  </p>
                )}

                {walletError && (
                  <p className="mt-3 border border-[#7a7972] px-3 py-2 text-sm text-[#ecece9]">
                    {walletError}
                  </p>
                )}
              </form>

              {walletResult && !walletChecking && (
                <div className="mt-4 border-t border-[#24241f] pt-4">
                  <div className="font-num text-4xl font-bold text-[#5dcaa5]">
                    {formatBalance(walletResult.balance)}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a7972]">
                    $ANSEM held
                  </div>
                  <div
                    className={`mt-3 inline-flex items-center border-2 px-3 py-1.5 text-sm font-bold uppercase tracking-wider ${
                      walletResult.isHolder
                        ? "border-[#00e676] bg-[#00e676] text-[#050505]"
                        : "border-[#7a7972] text-[#7a7972]"
                    }`}
                  >
                    {walletResult.isHolder ? "Holder" : "Not holding yet"}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Leaderboard — hairlines, monochrome */}
        <section className="pb-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-xl uppercase tracking-wider text-[#ecece9]">
              Leaderboard
            </h2>
            <button
              type="button"
              onClick={() => loadLeaderboard(page)}
              className="text-[11px] font-bold uppercase tracking-wider text-[#7a7972] hover:text-[#ecece9]"
            >
              Refresh
            </button>
          </div>

          {/* column header row */}
          <div
            className={`${GRID} border-b border-[#ecece9] pb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#7a7972]`}
          >
            <span className="text-center">Rank</span>
            <span>Account</span>
            <span className="text-right">Tweets</span>
            <span className="whitespace-nowrap text-right">Mindshare Score</span>
          </div>

          {lbLoading ? (
            <div className="py-6 text-center text-sm text-[#7a7972]">
              Loading leaderboard…
            </div>
          ) : lbError ? (
            <div className="py-6 text-center text-sm text-[#ecece9]">
              {lbError}
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="py-6 text-center text-sm text-[#7a7972]">
              No one on the board yet. Be the first — check an account above.
            </div>
          ) : (
            <ul>
              {leaderboard.map((u) => {
                const highlight =
                  result &&
                  u.username?.toLowerCase() === result.username?.toLowerCase();
                return (
                  <li
                    key={u.username}
                    className={`${GRID} border-b border-[#24241f] py-3 ${
                      highlight ? "bg-[#141412]" : ""
                    }`}
                  >
                    <span
                      className={`text-center font-num text-sm font-bold ${
                        u.rank <= 3 ? "text-[#ecece9]" : "text-[#7a7972]"
                      }`}
                    >
                      {u.rank}
                    </span>
                    <span className="truncate font-medium text-[#ecece9]">
                      @{u.username}
                    </span>
                    <span className="text-right font-num text-sm text-[#7a7972]">
                      {u.tweetCount}
                    </span>
                    <span className="text-right font-num text-sm font-bold text-[#5dcaa5]">
                      {formatScore(u.totalScore)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Pagination — only shown when there's more than one page (max 5) */}
          {totalPages > 1 && (
            <nav
              aria-label="Leaderboard pages"
              className="mt-4 flex items-center justify-center gap-2"
            >
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => loadLeaderboard(n)}
                  aria-current={n === page ? "page" : undefined}
                  className={`flex h-9 w-9 items-center justify-center border font-num text-sm ${
                    n === page
                      ? "border-[#ecece9] bg-[#ecece9] text-[#050505]"
                      : "border-[#24241f] text-[#7a7972] hover:border-[#ecece9] hover:text-[#ecece9]"
                  }`}
                >
                  {n}
                </button>
              ))}
            </nav>
          )}
        </section>

        <footer className="mt-6 border-t border-[#24241f] pt-4 text-center font-num text-[10px] uppercase tracking-wider text-[#5f5e5a]">
          Not financial advice · Scores from public X engagement
        </footer>
      </div>
    </main>
  );
}

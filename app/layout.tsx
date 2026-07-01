import type { Metadata } from "next";
import { Geist, Geist_Mono, Pirata_One } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Gothic display font for the hero headline only. Pirata One is a blackletter
// face that stays legible at large sizes (UnifrakturMaguntia was too ornate).
const gothic = Pirata_One({
  variable: "--font-gothic",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "$ANSEM — The Black Bull | Mindshare Leaderboard",
  description:
    "Your proof of bagworking for $ANSEM. Check where you stand from your posts and $ANSEM holdings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${gothic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

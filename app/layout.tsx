import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Requis — Pharmacy application review workspace",
    template: "%s · Requis",
  },
  description:
    "Multi-tenant review workspace for pharmacy application filings. Chain-of-custody, review, and reporting for dispensing records.",
};

export const viewport: Viewport = {
  themeColor: "#16302E",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${plexMono.variable}`}>{children}</body>
    </html>
  );
}
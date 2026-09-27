import type { Metadata, Viewport } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
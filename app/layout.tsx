import type { Metadata, Viewport } from "next";

import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: {
    default: "SiroQ — Pharmacy application review workspace",
    template: "%s · SiroQ",
  },
  description:
    "Multi-tenant review workspace for pharmacy application filings. Chain-of-custody, review, and reporting for dispensing records.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1211" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The pre-paint script mutates `data-theme` on this element before React
    // hydrates. That attribute is not part of the rendered React tree, so
    // without this React warns on every load that has a stored preference.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Apply the stored or OS theme before first paint. Without this the server
          sends the light palette and a visitor with a dark theme sees a white
          flash before the swap.
        */}
        <script
          // eslint-disable-next-line react/no-danger -- fixed, self-contained
          // string from lib/theme.ts, no user data.
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

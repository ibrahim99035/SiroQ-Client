"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary.
 *
 * `global-error` replaces the root layout, so it must render its own
 * `<html>` and `<body>` — there is no inherited document, and therefore no
 * global stylesheet either. That constraint is why the page below inlines its
 * handful of styles rather than importing anything: any component that depends
 * on the app shell will render unstyled or crash inside the very boundary meant
 * to contain the crash.
 *
 * The single supported action is a reload, because with no layout there is
 * nothing to navigate to.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] global error boundary:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4f6f5",
          color: "#16302e",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: "2rem",
        }}
      >
        <main style={{ maxWidth: "32rem", textAlign: "center" }}>
          <p
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.7rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#5e6e6b",
              margin: 0,
            }}
          >
            application fault
          </p>
          <h1 style={{ fontSize: "1.5rem", lineHeight: 1.25, margin: "0.5rem 0 0" }}>
            SiroQ could not start this screen.
          </h1>
          <p style={{ fontSize: "0.9rem", lineHeight: 1.6, color: "#5e6e6b", margin: "0.75rem 0 0" }}>
            A failure in the application shell stopped the page from rendering at all. Nothing you
            submitted has been lost. Reloading normally resolves it.
          </p>

          {error.digest ? (
            <p
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.7rem",
                color: "#5e6e6b",
                marginTop: "1rem",
              }}
            >
              Reference for support: {error.digest}
            </p>
          ) : null}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.6rem 1.1rem",
              borderRadius: 10,
              border: 0,
              background: "#2e6f6a",
              color: "#fff",
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}

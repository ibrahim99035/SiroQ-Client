import { AppShell } from "@/components/app-shell";
import { SessionProvider } from "@/components/session-provider";

/**
 * The session provider wraps the shell because the whole authenticated tree
 * derives identity from it. The layout is a server component so the provider
 * mounts once per navigation of this group rather than inside each page.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}

"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Building2,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Pill,
  ScrollText,
  Settings,
  Upload,
  UserRoundCog,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { initials } from "@/lib/utils";
import { useCurrentUser, useSession } from "@/components/session-provider";
import { apiSend, type ApiError } from "@/lib/client-api";
import { can } from "@/lib/permissions";
import { ROLE_LABELS, type User } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ServiceStatusCard } from "@/components/service-status-card";
import { ThemeToggle } from "@/components/theme-toggle";

/* ---------------------------------------------------------------------- */
/* Brand                                                                  */
/* ---------------------------------------------------------------------- */

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-accent" aria-label="SiroQ dashboard">
      <span className="grid h-6 w-6 place-items-center rounded-stamp bg-accent" aria-hidden="true">
        <span className="h-2 w-2 rounded-[2px] border-2 border-white" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-ink">SiroQ</span>
    </Link>
  );
}

/* ---------------------------------------------------------------------- */
/* Nav                                                                    */
/* ---------------------------------------------------------------------- */

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  activePrefix?: string;
}

function useNavItems(user: User | null): NavItem[] {
  if (!user) return [];
  const canCreate = can(user, "createApplication");
  const manageAssociations = can(user, "manageAssociations");
  const managePharmacies = can(user, "managePharmacies");
  const manageUsers = can(user, "manageUsers");
  return [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Applications", href: "/applications", icon: ScrollText, activePrefix: "/applications" },
    ...(canCreate
      ? [{ label: "New filing", href: "/applications/new", icon: Upload }]
      : []),
    ...(manageAssociations
      ? [{ label: "Associations", href: "/admin/associations", icon: Building2 }]
      : []),
    ...(managePharmacies ? [{ label: "Pharmacies", href: "/admin/pharmacies", icon: Pill }] : []),
    ...(manageUsers ? [{ label: "Users", href: "/admin/users", icon: Users }] : []),
    { label: "Settings", href: "/settings", icon: Settings },
    ...(manageUsers ? [{ label: "Team", href: "/settings/team", icon: UserRoundCog }] : []),
  ];
}

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const active =
    item.href === "/dashboard"
      ? pathname === "/dashboard"
      : item.href === "/applications"
        ? pathname === "/applications" || pathname.startsWith("/applications/")
        : pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className="nav-item"
      data-active={active}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {item.label}
    </Link>
  );
}

/* ---------------------------------------------------------------------- */
/* Account menu                                                            */
/* ---------------------------------------------------------------------- */

/**
 * The signed-in identity, and the way out of it.
 *
 * This used to be a "Viewing as — switch identity" menu backed by the mock
 * store: it listed every seeded user and swapped a client-side pointer, so you
 * could impersonate any role, plus a "simulate system fault" toggle that only
 * affected the in-memory store. None of that touched a real session, so it is
 * gone rather than cosmetically relabelled — an identity switcher that does not
 * change the identity is worse than no switcher. Scope now comes from the
 * session cookie, and signing out revokes the session server-side.
 */
function AccountMenu() {
  const user = useCurrentUser();
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);
  if (!user) return null;

  const signOut = async () => {
    setSigningOut(true);
    try {
      await apiSend("/api/auth/logout", "POST");
    } catch {
      // A failed revoke must not strand the user in an authenticated-looking
      // shell, so continue to the sign-in page either way and let the server
      // decide on the next request.
    }
    router.replace("/login");
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-[10px] border border-hairline bg-paper-raised px-2.5 py-1.5 text-left shadow-soft transition-colors hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={`Account menu for ${user.name}`}
        >
          <span
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-medium text-paper-raised"
            aria-hidden="true"
          >
            {initials(user.name)}
          </span>
          <span className="hidden sm:block">
            <span className="block max-w-[160px] truncate text-[13px] font-medium leading-tight text-ink">
              {user.name}
            </span>
            <span className="block font-mono text-[10px] leading-tight text-muted">
              {ROLE_LABELS[user.role]}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 text-muted" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[260px]">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-[13px] font-medium text-ink">{user.name}</span>
          <span className="truncate font-mono text-[10px] font-normal text-muted">{user.email}</span>
          <span className="font-mono text-[10px] font-normal text-muted">{ROLE_LABELS[user.role]}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/settings")}>
          <Settings className="h-4 w-4" aria-hidden="true" />
          Account settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
          disabled={signingOut}
          className="text-destructive"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------------------------------------------------------------------- */
/* Sidebar + topbar                                                        */
/* ---------------------------------------------------------------------- */

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
    const user = useCurrentUser();
    const pathname = usePathname();
    const items = useNavItems(user);
    return (
      <div className="flex flex-col gap-0.5">
        {user ? (
          items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))
        ) : null}
        {/* Only for signed-in staff: the card reports on a service reached with the
            deployment's own key, so showing it to a signed-out sidebar would mean
            a control that can answer nothing useful. Starting and tracking a run
            is not here — that is `analysis-panel`'s job, on the filing itself. */}
        {user ? <ServiceStatusCard /> : null}
      </div>
    );
  }

function topbarLabel(pathname: string): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname === "/applications") return "Applications";
  if (pathname === "/applications/new") return "New filing";
  if (pathname.startsWith("/applications/")) return "Filing record";
  if (pathname.startsWith("/admin/associations")) return "Administration · Associations";
  if (pathname.startsWith("/admin/pharmacies")) return "Administration · Pharmacies";
  if (pathname.startsWith("/admin/users")) return "Administration · Users";
  if (pathname === "/settings/team") return "Settings · Team";
  if (pathname === "/settings") return "Settings";
  return "Workspace";
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  return (
    <header
      data-app-chrome="header"
      className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-hairline/80 bg-paper/70 px-4 shadow-[0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-xl sm:px-6 lg:px-8"
    >
      <button
        type="button"
        onClick={onMenu}
        className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-hairline bg-paper-raised/80 text-ink shadow-soft md:hidden"
        aria-label="Open navigation menu"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
      </button>
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">{topbarLabel(pathname)}</p>
      <div className="ms-auto flex items-center gap-1.5">
        <ThemeToggle />
        <AccountMenu />
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------------- */
/* Signed-out state                                                        */
/* ---------------------------------------------------------------------- */

function SignedOut() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-card border border-hairline/80 bg-paper-raised p-8 shadow-lift">
        <div className="mb-1 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-stamp bg-accent" aria-hidden="true">
            <span className="h-2 w-2 rounded-[2px] border-2 border-white" />
          </span>
          <span className="text-[15px] font-semibold text-ink">SiroQ</span>
        </div>
        <h1 className="text-lg font-semibold text-ink">Your session has ended</h1>
        <p className="mt-2 text-sm text-muted">
          Sign in again to pick up where you left off, or continue to the public site.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">SiroQ home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Placeholder shown while the session is being resolved, or if it cannot be read. */
function SessionPending({ error }: { error: ApiError | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-card border border-hairline/80 bg-paper-raised p-8 shadow-lift">
        <div className="mb-1 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-stamp bg-accent" aria-hidden="true">
            <span className="h-2 w-2 rounded-[2px] border-2 border-white" />
          </span>
          <span className="text-[15px] font-semibold text-ink">SiroQ</span>
        </div>
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-ink">Could not load your session</h1>
            <p className="mt-2 text-sm text-muted">{error.message}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-ink">Loading your workspace</h1>
            <p className="mt-2 text-sm text-muted">Checking your session.</p>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Shell                                                                   */
/* ---------------------------------------------------------------------- */

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const { status, error } = useSession();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // `/api/auth/me` is still in flight. Rendering <SignedOut /> here would flash
  // a sign-in screen on every navigation and then swap it for the app, so the
  // shell waits behind a neutral placeholder instead.
  if (status === "loading" || status === "error") {
    return <SessionPending error={status === "error" ? error : null} />;
  }

  if (!user) return <SignedOut />;

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Desktop sidebar */}
      <aside
        data-app-chrome="nav"
        className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-hairline bg-paper-raised md:flex"
      >
        <div className="flex h-14 items-center border-b border-hairline px-4">
          <Brand />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Primary">
          <SidebarNav />
        </nav>
        <div className="border-t border-hairline px-4 py-3">
          <p className="font-mono text-[10px] leading-relaxed text-muted">
            Live data
            <br />
            served from Neon
          </p>
        </div>
      </aside>

      {/* Mobile drawer */}
      <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-40 bg-[rgba(15,34,32,0.42)] backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          />
          <DialogPrimitive.Content
            className="fixed inset-y-0 left-0 z-50 w-[76vw] max-w-[300px] rounded-r-[20px] border-r border-hairline/80 bg-paper-raised p-0 shadow-lift outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left"
          >
            <div className="flex h-14 items-center justify-between border-b border-hairline px-4">
              <Brand />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-hairline bg-paper-raised/80 text-ink shadow-soft"
                aria-label="Close navigation menu"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Primary">
              <SidebarNav onNavigate={() => setDrawerOpen(false)} />
            </nav>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="md:pl-60">
        <Topbar onMenu={() => setDrawerOpen(true)} />
        <main
          data-app-chrome="main"
          className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6 lg:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
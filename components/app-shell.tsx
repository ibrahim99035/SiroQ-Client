"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Building2,
  Check,
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
import { usePathname } from "next/navigation";
import * as React from "react";
import { cn, initials } from "@/lib/utils";
import { useAppStore, useCurrentUser } from "@/lib/store";
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

/* ---------------------------------------------------------------------- */
/* Brand                                                                  */
/* ---------------------------------------------------------------------- */

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-accent" aria-label="Requis dashboard">
      <span className="grid h-6 w-6 place-items-center rounded-stamp bg-accent" aria-hidden="true">
        <span className="h-2 w-2 rounded-[2px] border-2 border-white" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-ink">Requis</span>
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
/* Identity switcher                                                      */
/* ---------------------------------------------------------------------- */

function UserSwitcher() {
  const user = useCurrentUser();
  const users = useAppStore((s) => s.users);
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);
  const simulateFault = useAppStore((s) => s.simulateFault);
  const setSimulateFault = useAppStore((s) => s.setSimulateFault);
  if (!user) return null;

  const active = users.filter((u) => u.status === "active");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-[10px] border border-hairline bg-paper-raised px-2.5 py-1.5 text-left shadow-soft transition-colors hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
          aria-label="Viewing as — switch identity"
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
      <DropdownMenuContent align="end" className="w-[300px]">
        <DropdownMenuLabel>Viewing as — switch identity</DropdownMenuLabel>
        {active.map((u) => (
          <DropdownMenuItem
            key={u.id}
            onSelect={() => setCurrentUser(u.id)}
            className="flex items-start gap-2"
          >
            <Check
              className={cn("mt-0.5 h-4 w-4 shrink-0", u.id === user.id ? "text-accent" : "opacity-0")}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-ink">{u.name}</span>
              <span className="block font-mono text-[10px] text-muted">{ROLE_LABELS[u.role]}</span>
              {u.associationId || u.pharmacyId ? (
                <span className="mt-0.5 block truncate font-mono text-[10px] text-muted">
                  {u.pharmacyId ?? u.associationId}
                </span>
              ) : null}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            setSimulateFault(!simulateFault);
          }}
          className="flex items-center justify-between"
        >
          <span>Simulate system fault</span>
          <span className="font-mono text-[10px]" role="switch" aria-checked={simulateFault}>
            {simulateFault ? "on" : "off"}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setCurrentUser(null)} className="text-destructive">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out of demo session
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
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-hairline/80 bg-paper/70 px-4 shadow-[0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-xl sm:px-6 lg:px-8">
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
      <div className="ml-auto">
        <UserSwitcher />
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
          <span className="text-[15px] font-semibold text-ink">Requis</span>
        </div>
        <h1 className="text-lg font-semibold text-ink">No active demo session</h1>
        <p className="mt-2 text-sm text-muted">
          The review workspace keeps a mock signed-in identity so every role can be previewed.
          Sign in again, or continue to the public site.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Requis home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Shell                                                                   */
/* ---------------------------------------------------------------------- */

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  if (!user) return <SignedOut />;

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-hairline bg-paper-raised md:flex">
        <div className="flex h-14 items-center border-b border-hairline px-4">
          <Brand />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Primary">
          <SidebarNav />
        </nav>
        <div className="border-t border-hairline px-4 py-3">
          <p className="font-mono text-[10px] leading-relaxed text-muted">
            Mock data layer
            <br />
            pre-release preview
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
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { findUserByEmail } from "@/lib/data";
import { useAppStore } from "@/lib/store";
import { ROLE_LABELS } from "@/lib/types";

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const users = useAppStore((s) => s.users);
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const signInAs = (userId: string) => {
    setCurrentUser(userId);
    router.push("/dashboard");
  };

  const onSubmit = (values: FormValues) => {
    const user = findUserByEmail(values.email);
    if (!user) {
      setError(
        "No account exists for that email on this preview. Pick a demo identity below, or create an account.",
      );
      return;
    }
    if (user.status !== "active") {
      setError("That identity is not active on this preview. Choose another demo identity.");
      return;
    }
    signInAs(user.id);
  };

  return (
    <div className="card px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
      <p className="mt-2 text-sm text-muted">
        Demo mode accepts any password. Use one of the seeded identities from the list, or your
        own email if an account exists.
      </p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@pharmacy.org" {...form.register("email")} />
          {form.formState.errors.email ? (
            <p className="text-xs text-[#7a2e26]">{form.formState.errors.email.message}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" {...form.register("password")} />
          {form.formState.errors.password ? (
            <p className="text-xs text-[#7a2e26]">{form.formState.errors.password.message}</p>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="rounded-stamp border border-[var(--status-rejected)]/40 bg-[#fbf1ee] px-3 py-2 text-[13px] text-[#7a2e26]">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" size="lg">
          Sign in
        </Button>
      </form>

      <div className="mt-4 text-right">
        <Link href="/forgot-password" className="text-[13px] text-accent hover:underline">
          Forgot your password?
        </Link>
      </div>

      <section className="mt-8 border-t border-hairline pt-5" aria-label="Demo identities">
        <h2 className="text-sm font-medium text-ink">Quick demo access</h2>
        <p className="mt-1 text-[13px] text-muted">
          Sign in as one of the seeded identities to preview scoped views.
        </p>
        <ul className="mt-3 divide-y divide-hairline overflow-hidden rounded-card border border-hairline/70 bg-paper-raised shadow-soft">
          {users
            .filter((u) => u.status === "active")
            .slice(0, 6)
            .map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => signInAs(u.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <span>
                    <span className="block text-[13px] font-medium text-ink">{u.name}</span>
                    <span className="block font-mono text-[11px] text-muted">{ROLE_LABELS[u.role]}</span>
                  </span>
                </button>
              </li>
            ))}
        </ul>
      </section>

      <p className="mt-6 text-[13px] text-muted">
        New to Requis?{" "}
        <Link href="/signup" className="text-accent hover:underline">
          Create an account
        </Link>{" "}
        · <Link href="/" className="text-accent hover:underline">Back to site</Link>
      </p>
    </div>
  );
}
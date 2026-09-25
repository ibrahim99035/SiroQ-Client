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

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(
          body?.error?.message ??
            "Sign-in did not complete. Check your connection and try again.",
        );
        return;
      }

      // The session cookie is set by the server; refresh so the shell picks it up.
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
      <p className="mt-2 text-sm text-muted">
        Sign in with your work email. Access is scoped to your role and organisation.
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
        <Button type="submit" className="w-full" size="lg" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="mt-4 text-right">
        <Link href="/forgot-password" className="text-[13px] text-accent hover:underline">
          Forgot your password?
        </Link>
      </div>

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
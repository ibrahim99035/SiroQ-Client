"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z
  .object({
    name: z.string().min(2, "Enter your full name."),
    email: z.string().email("Enter a valid email address."),
    password: z.string().min(8, "Use at least 8 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });
type FormValues = z.infer<typeof schema>;

export default function SignupPage() {
  const [createdEmail, setCreatedEmail] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", confirm: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: values.name, email: values.email, password: values.password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? "The account could not be created. Please try again.");
        return;
      }

      setCreatedEmail(values.email);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (createdEmail) {
    return (
      <div className="card p-8">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Request received</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Your request for{" "}
          <span className="font-mono text-[12px] text-ink">{createdEmail}</span> is with an
          administrator. Once you are attached to a pharmacy you will get an invitation link to set a
          password. No account is active yet, so there is nothing to sign in to.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Back to site</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Create an account</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        This workspace is invite-only. Tell us who you are and an administrator will attach you to a
        pharmacy, then send you a link to set a password.
      </p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" autoComplete="name" placeholder="Jordan Reed" {...form.register("name")} />
          {form.formState.errors.name ? (
            <p className="text-xs text-[var(--danger-text)]">{form.formState.errors.name.message}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@pharmacy.org" {...form.register("email")} />
          {form.formState.errors.email ? (
            <p className="text-xs text-[var(--danger-text)]">{form.formState.errors.email.message}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" placeholder="——————" {...form.register("password")} />
          {form.formState.errors.password ? (
            <p className="text-xs text-[var(--danger-text)]">{form.formState.errors.password.message}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" placeholder="——————" {...form.register("confirm")} />
          {form.formState.errors.confirm ? (
            <p className="text-xs text-[var(--danger-text)]">{form.formState.errors.confirm.message}</p>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="border border-[var(--status-rejected)]/50 bg-paper-raised px-3 py-2 text-[13px] text-[var(--danger-text)]">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" size="lg" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-[13px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">Sign in</Link>{" "}
        · <Link href="/" className="text-accent hover:underline">Back to site</Link>
      </p>
    </div>
  );
}
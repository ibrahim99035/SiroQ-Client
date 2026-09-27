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

const schema = z
  .object({
    password: z
      .string()
      .min(12, "Use at least 12 characters.")
      .max(200, "That password is too long."),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Platform administrator",
  moderator: "Moderator",
  pharmacy_association_admin: "Association administrator",
  pharmacy_worker: "Pharmacy worker",
};

/**
 * Sets the password for an invited account and signs the user in. On success the
 * invite token is already spent server-side, so the link is dead from here on.
 */
export function AcceptInviteForm({
  token,
  name,
  email,
  role,
}: {
  token: string;
  name: string;
  email: string;
  role?: string;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...values }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? "The invitation could not be accepted.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Set your password</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {name}, you have been invited as{" "}
        <span className="text-ink">{ROLE_LABELS[role ?? ""] ?? "a workspace member"}</span> using{" "}
        <span className="font-mono text-[12px] text-ink">{email}</span>.
      </p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="——————"
            {...form.register("password")}
          />
          {form.formState.errors.password ? (
            <p className="text-xs text-[#7a2e26]">{form.formState.errors.password.message}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="——————"
            {...form.register("confirmPassword")}
          />
          {form.formState.errors.confirmPassword ? (
            <p className="text-xs text-[#7a2e26]">{form.formState.errors.confirmPassword.message}</p>
          ) : null}
        </div>
        {error ? (
          <p
            role="alert"
            className="border border-[var(--status-rejected)]/50 bg-paper-raised px-3 py-2 text-[13px] text-[#7a2e26]"
          >
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" size="lg" disabled={busy}>
          {busy ? "Accepting…" : "Accept invitation"}
        </Button>
      </form>

      <p className="mt-6 text-[13px] text-muted">
        <Link href="/login" className="text-accent hover:underline">
          Sign in instead
        </Link>
      </p>
    </div>
  );
}

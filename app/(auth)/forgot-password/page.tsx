"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/client-api";

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
});
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  /**
   * Posts the address to the real route.
   *
   * This used to only set local state and show a confirmation, so the form
   * looked like it worked while no email was ever requested. The route answers
   * identically whether or not the account exists, which is deliberate: a
   * different answer for a known address would turn this form into an account
   * enumeration oracle. The confirmation is therefore the same either way.
   */
  const onSubmit = async (values: FormValues) => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch<{ ok: true; message: string }>("/api/auth/forgot-password", {
        method: "POST",
        body: { email: values.email },
      });
      setSentTo(values.email);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The request could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Reset your password</h1>
      <p className="mt-2 text-sm text-muted">
        Enter the address on your account and we will send a link to set a new password. The link
        expires in one hour.
      </p>

      {sentTo ? (
        <div className="card mt-6 p-6">
          <p className="text-sm leading-relaxed text-ink">
            If an account exists for <span className="font-mono text-[12px]">{sentTo}</span>, a reset
            link is on its way. Check your spam folder if it has not arrived in a few minutes.
          </p>
          <p className="mt-3 text-[13px] text-muted">
            We show the same confirmation for every address so that this page cannot be used to find
            out who has an account.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/login">Return to sign in</Link>
            </Button>
            <Button variant="ghost" onClick={() => setSentTo(null)}>
              Enter another address
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="you@pharmacy.org" {...form.register("email")} />
            {form.formState.errors.email ? (
              <p className="text-xs text-[#7a2e26]">{form.formState.errors.email.message}</p>
            ) : null}
          </div>
          {error ? <p className="text-xs text-[#7a2e26]">{error}</p> : null}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? "Sending…" : "Send reset instructions"}
          </Button>
        </form>
      )}

      <p className="mt-6 text-[13px] text-muted">
        <Link href="/login" className="text-accent hover:underline">Back to sign in</Link>{" "}
        · <Link href="/" className="text-accent hover:underline">Back to site</Link>
      </p>
    </div>
  );
}

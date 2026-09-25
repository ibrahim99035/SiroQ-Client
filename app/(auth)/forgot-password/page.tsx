"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
});
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = (values: FormValues) => setSentTo(values.email);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Reset your password</h1>
      <p className="mt-2 text-sm text-muted">
        This preview does not send email. The form accepts an address and confirms the intended
        flow, then returns you to sign-in.
      </p>

      {sentTo ? (
        <div className="card mt-6 p-6">
          <p className="text-sm leading-relaxed text-ink">
            If an account exists for <span className="font-mono text-[12px]">{sentTo}</span>, a
            reset link would be sent. In this mock preview, no mail is delivered.
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
          <Button type="submit" className="w-full" size="lg">
            Send reset instructions
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
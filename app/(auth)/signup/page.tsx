"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAccount } from "@/lib/data";

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
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", confirm: "" },
  });

  const onSubmit = (values: FormValues) => {
    setError(null);
    try {
      createAccount({ name: values.name, email: values.email });
      setCreatedEmail(values.email);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The account could not be created.");
    }
  };

  if (createdEmail) {
    return (
      <div className="card p-8">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Account created</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          A pharmacy worker account for <span className="font-mono text-[12px] text-ink">{createdEmail}</span>{" "}
          is registered in this session. No pharmacy is assigned yet, so the dashboard will read as
          empty until an association admin assigns you one.
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
      <p className="mt-2 text-sm text-muted">
        Preview accounts live only in this session. Sign-ups are created as pharmacy workers with
        no pharmacy assigned.
      </p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" autoComplete="name" placeholder="Jordan Reed" {...form.register("name")} />
          {form.formState.errors.name ? (
            <p className="text-xs text-[#7a2e26]">{form.formState.errors.name.message}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@pharmacy.org" {...form.register("email")} />
          {form.formState.errors.email ? (
            <p className="text-xs text-[#7a2e26]">{form.formState.errors.email.message}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" placeholder="——————" {...form.register("password")} />
          {form.formState.errors.password ? (
            <p className="text-xs text-[#7a2e26]">{form.formState.errors.password.message}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" placeholder="——————" {...form.register("confirm")} />
          {form.formState.errors.confirm ? (
            <p className="text-xs text-[#7a2e26]">{form.formState.errors.confirm.message}</p>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="border border-[var(--status-rejected)]/50 bg-paper-raised px-3 py-2 text-[13px] text-[#7a2e26]">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" size="lg">
          Create account
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
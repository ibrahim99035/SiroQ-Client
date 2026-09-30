"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, MapPin, ShieldCheck } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { updateOwnProfile } from "@/lib/data";
import { useSession } from "@/components/session-provider";
import { useAssociations, useCurrentUser, usePharmacies } from "@/lib/store";
import { ROLE_LABELS } from "@/lib/types";

const schema = z.object({
  name: z.string().min(2, "Enter a full name.").max(120),
});
type FormValues = z.infer<typeof schema>;

export default function SettingsPage() {
  const actor = useCurrentUser();
  const session = useSession();
  const associations = useAssociations();
  const pharmacies = usePharmacies();
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: { name: actor?.name ?? "" },
  });

  if (!actor) return null;

  const associationName = associations.find((a) => a.id === actor.associationId)?.name;
  const pharmacy = pharmacies.find((p) => p.id === actor.pharmacyId);

  const onSubmit = async (values: FormValues) => {
    // The rename is a real request now, so it can fail (offline, or an email
    // clash on the self-service endpoint). Reporting success unconditionally
    // would leave the form showing a name the server never accepted. This goes
    // through /api/users/me, not /api/users/[id], which refuses self-writes.
    setError(null);
    try {
      await updateOwnProfile({ name: values.name });
      // The name shown in the account menu and on every permission-gated view
      // comes from the session, not from this form, so it would keep showing the
      // old name until a full page load.
      session.reload();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The name could not be saved.");
    }
  };

  return (
    <div>
      <PageHeading
        eyebrow="Account"
        title="Settings"
        description="Your profile and the tenant scope attached to this identity."
        rule="hairline"
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card p-5">
          <h2 className="req-field-label font-semibold text-ink">Profile</h2>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input autoComplete="name" {...form.register("name")} />
              {form.formState.errors.name ? (
                <p className="text-xs text-[#7a2e26]">{form.formState.errors.name.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={actor.email} readOnly className="text-muted" />
              <p className="text-xs text-muted">
                Email is your sign-in identifier and cannot be changed.
              </p>
            </div>
            {error ? (
              <p role="alert" className="border border-[var(--status-rejected)]/50 px-3 py-2 text-[13px] text-[#7a2e26]">
                {error}
              </p>
            ) : null}
            <div className="flex items-center gap-3">
              <Button type="submit">Save profile</Button>
              {saved ? (
                <span className="font-mono text-[11px] text-[#245c42]">saved ✓</span>
              ) : null}
            </div>
          </form>
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="req-field-label font-semibold text-ink">Scope</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <ScopeRow
                icon={ShieldCheck}
                label="Role"
                value={ROLE_LABELS[actor.role]}
              />
              {associationName ? (
                <ScopeRow
                  icon={Building2}
                  label="Association"
                  value={associationName}
                />
              ) : null}
              {pharmacy ? (
                <ScopeRow
                  icon={MapPin}
                  label="Pharmacy"
                  value={pharmacy.name}
                />
              ) : (
                <ScopeRow icon={MapPin} label="Pharmacy" value="Unassigned" muted />
              )}
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="req-field-label font-semibold text-ink">Session</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Identity</dt>
                <dd className="mt-0.5 font-mono text-[12px] text-ink">{actor.email}</dd>
              </div>
              <Separator />
              <div>
                <dt className="text-xs text-muted">Tenant context</dt>
                <dd className="mt-0.5 text-[13px] text-muted">
                  {actor.associationId
                    ? `Scoped to your association. An administrator can change your role or tenant.`
                    : `Scoped to the whole estate. An administrator can change your role or tenant.`}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

function ScopeRow({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
      <dt className="w-24 shrink-0 text-xs text-muted">{label}</dt>
      <dd className={`font-medium ${muted ? "text-muted" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
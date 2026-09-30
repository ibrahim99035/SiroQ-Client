"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createAssociation, updateAssociation } from "@/lib/data";
import { useCurrentUser } from "@/components/session-provider";
import type { PharmacyAssociation } from "@/lib/types";

const schema = z.object({
  name: z.string().min(3, "Use the legal association name.").max(120),
  region: z.string().min(2, "Enter the operating region.").max(80),
  gmpCertificateId: z
    .string()
    .min(6, "Enter the certificate reference.")
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, "Only letters, digits and hyphens."),
  status: z.enum(["active", "suspended"]),
});
type FormValues = z.infer<typeof schema>;

export function AssociationFormDialog({
  open,
  onOpenChange,
  onSaved,
  association,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  association?: PharmacyAssociation | null;
}) {
  const user = useCurrentUser();
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: association
      ? {
          name: association.name,
          region: association.region,
          gmpCertificateId: association.gmpCertificateId,
          status: association.status,
        }
      : { name: "", region: "", gmpCertificateId: "", status: "active" },
  });

  const onSubmit = async (values: FormValues) => {
    if (!user) return;
    setError(null);
    try {
      if (association) {
        await updateAssociation(association.id, values, user);
      } else {
        await createAssociation(values, user);
      }
      onSaved();
      onOpenChange(false);
    } catch (reason) {
      // Server-side refusals land here too — e.g. a suspended association
      // rejecting a new pharmacy — so the message is shown verbatim.
      setError(reason instanceof Error ? reason.message : "The operation could not be completed.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{association ? "Edit association" : "Create association"}</DialogTitle>
          <DialogDescription>
            Associations are the top tenant boundary. These records feed every scoped view.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Name" error={form.formState.errors.name?.message}>
            <Input placeholder="e.g. Twin Harbors Pharmacy Group" {...form.register("name")} />
          </Field>
          <Field label="Region" error={form.formState.errors.region?.message}>
            <Input placeholder="e.g. Pacific Northwest" {...form.register("region")} />
          </Field>
          <Field label="GMP certificate ID" error={form.formState.errors.gmpCertificateId?.message}>
            <Input placeholder="GMP-TH-1140" className="font-mono" {...form.register("gmpCertificateId")} />
          </Field>
          <Field label="Status">
            <Select
              value={form.watch("status")}
              onValueChange={(v) => form.setValue("status", v as FormValues["status"], { shouldValidate: true })}
            >
              <SelectTrigger aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {error ? (
            <p role="alert" className="border border-[var(--status-rejected)]/50 px-3 py-2 text-[13px] text-[var(--danger-text)]">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{association ? "Save changes" : "Create association"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-[var(--danger-text)]">{error}</p> : null}
    </div>
  );
}

export { Field };
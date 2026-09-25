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
import { createPharmacy, updatePharmacy } from "@/lib/data";
import { useCurrentUser } from "@/lib/store";
import type { Pharmacy, PharmacyAssociation } from "@/lib/types";

const schema = z.object({
  name: z.string().min(3, "Use the pharmacy name.").max(120),
  address: z.string().min(6, "Enter the street address.").max(160),
  licenseNumber: z
    .string()
    .min(6, "Enter the license reference.")
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, "Only letters, digits and hyphens."),
  associationId: z.string().min(1, "Choose the owning association."),
  status: z.enum(["active", "suspended"]),
});
type FormValues = z.infer<typeof schema>;

export function PharmacyFormDialog({
  open,
  onOpenChange,
  onSaved,
  pharmacy,
  associations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  pharmacy?: Pharmacy | null;
  associations: PharmacyAssociation[];
}) {
  const user = useCurrentUser();
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: pharmacy
      ? {
          name: pharmacy.name,
          address: pharmacy.address,
          licenseNumber: pharmacy.licenseNumber,
          associationId: pharmacy.associationId,
          status: pharmacy.status,
        }
      : { name: "", address: "", licenseNumber: "", associationId: "", status: "active" },
  });

  const onSubmit = (values: FormValues) => {
    if (!user) return;
    setError(null);
    try {
      if (pharmacy) {
        updatePharmacy(pharmacy.id, values, user);
      } else {
        createPharmacy(values, user);
      }
      onSaved();
      onOpenChange(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The operation could not be completed.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pharmacy ? "Edit pharmacy" : "Create pharmacy"}</DialogTitle>
          <DialogDescription>
            Pharmacies belong to exactly one association and own their filings.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input placeholder="e.g. Alder Street Pharmacy" {...form.register("name")} />
            {form.formState.errors.name ? (
              <p className="text-xs text-[#7a2e26]">{form.formState.errors.name.message}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input placeholder="401 Alder St, Portland, OR" {...form.register("address")} />
            {form.formState.errors.address ? (
              <p className="text-xs text-[#7a2e26]">{form.formState.errors.address.message}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>License number</Label>
            <Input placeholder="PH-OR-44231" className="font-mono" {...form.register("licenseNumber")} />
            {form.formState.errors.licenseNumber ? (
              <p className="text-xs text-[#7a2e26]">{form.formState.errors.licenseNumber.message}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Association</Label>
            <Select
              value={form.watch("associationId")}
              onValueChange={(v) => form.setValue("associationId", v, { shouldValidate: true })}
            >
              <SelectTrigger aria-label="Association">
                <SelectValue placeholder="Select owning association" />
              </SelectTrigger>
              <SelectContent>
                {associations.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.associationId ? (
              <p className="text-xs text-[#7a2e26]">{form.formState.errors.associationId.message}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
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
          </div>
          {error ? (
            <p role="alert" className="border border-[var(--status-rejected)]/50 px-3 py-2 text-[13px] text-[#7a2e26]">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{pharmacy ? "Save changes" : "Create pharmacy"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
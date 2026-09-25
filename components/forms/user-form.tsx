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
import { inviteUser, updateUser } from "@/lib/data";
import { can } from "@/lib/permissions";
import { useCurrentUser } from "@/lib/store";
import type { Pharmacy, PharmacyAssociation, Role, User, UserStatus } from "@/lib/types";

const schema = z.object({
  name: z.string().min(2, "Enter a full name.").max(120),
  email: z.string().email("Enter a valid email address."),
  role: z.enum(["super_admin", "moderator", "pharmacy_association_admin", "pharmacy_worker"]),
  associationId: z.string().min(1, "Choose the association this user belongs to."),
  pharmacyId: z.string().optional(),
  status: z.enum(["active", "invited", "disabled"]),
});
type FormValues = z.infer<typeof schema>;

export function UserFormDialog({
  open,
  onOpenChange,
  onSaved,
  user,
  associations,
  pharmacies,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  user?: User | null;
  associations: PharmacyAssociation[];
  pharmacies: Pharmacy[];
}) {
  const actor = useCurrentUser();
  const [error, setError] = React.useState<string | null>(null);
  const isSuper = actor ? can(actor, "manageAssociations") : false;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: user
      ? {
          name: user.name,
          email: user.email,
          role: user.role,
          associationId: user.associationId ?? "",
          pharmacyId: user.pharmacyId,
          status: user.status,
        }
      : { name: "", email: "", role: "pharmacy_worker", associationId: "", pharmacyId: undefined, status: "invited" },
  });

  const associationId = form.watch("associationId");
  const role = form.watch("role");
  const associationPharmacies = pharmacies.filter((p) => p.associationId === associationId);

  React.useEffect(() => {
    const current = form.getValues("pharmacyId");
    if (current && !associationPharmacies.some((p) => p.id === current)) {
      form.setValue("pharmacyId", undefined, { shouldValidate: true });
    }
  }, [associationId, associationPharmacies, form]);

  const roleOptions: Role[] = isSuper
    ? ["super_admin", "moderator", "pharmacy_association_admin", "pharmacy_worker"]
    : ["pharmacy_association_admin", "pharmacy_worker"];

  const onSubmit = (values: FormValues) => {
    if (!actor) return;
    setError(null);
    try {
      const payload = {
        name: values.name,
        email: values.email,
        role: values.role,
        associationId: values.associationId,
        pharmacyId: values.pharmacyId,
        status: values.status,
      };
      if (user) {
        updateUser(user.id, payload, actor);
      } else {
        inviteUser(payload, actor);
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
          <DialogTitle>{user ? "Edit user" : "Invite user"}</DialogTitle>
          <DialogDescription>
            {isSuper
              ? "Manage directory identities and their tenant scope."
              : "Invites are scoped to your own association. Elevated roles are not assignable."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input placeholder="Jordan Reed" {...form.register("name")} />
            {form.formState.errors.name ? (
              <p className="text-xs text-[#7a2e26]">{form.formState.errors.name.message}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" placeholder="jordan.reed@pharmacy.org" {...form.register("email")} />
            {form.formState.errors.email ? (
              <p className="text-xs text-[#7a2e26]">{form.formState.errors.email.message}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select
              value={role}
              onValueChange={(v) => form.setValue("role", v as Role, { shouldValidate: true })}
            >
              <SelectTrigger aria-label="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r === "super_admin"
                      ? "Super admin"
                      : r === "moderator"
                        ? "Moderator"
                        : r === "pharmacy_association_admin"
                          ? "Association admin"
                          : "Pharmacy worker"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Association</Label>
            <Select
              value={associationId}
              onValueChange={(v) => form.setValue("associationId", v, { shouldValidate: true })}
            >
              <SelectTrigger aria-label="Association">
                <SelectValue placeholder="Select association" />
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
            <Label>Pharmacy (optional)</Label>
            <Select
              value={form.watch("pharmacyId") ?? "none"}
              onValueChange={(v) => form.setValue("pharmacyId", v === "none" ? undefined : v, { shouldValidate: true })}
            >
              <SelectTrigger aria-label="Pharmacy">
                <SelectValue placeholder={associationPharmacies.length === 0 ? "No pharmacies in this association" : "Select pharmacy"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {associationPharmacies.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted">
              Workers without a pharmacy assignment see an empty scope.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={form.watch("status")}
              onValueChange={(v) => form.setValue("status", v as UserStatus, { shouldValidate: true })}
            >
              <SelectTrigger aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="invited">Invited</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
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
            <Button type="submit">{user ? "Save changes" : "Invite user"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
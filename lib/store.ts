"use client";

import { create } from "zustand";
import type {
  Application,
  Pharmacy,
  PharmacyAssociation,
  Report,
  User,
} from "./types";
import {
  seedApplications,
  seedAssociations,
  seedPharmacies,
  seedReports,
  seedUsers,
} from "./seed";

/**
 * Single in-memory store shared by the whole app. Mutations go through the
 * data-layer functions in `lib/data.ts`, which read + write this store so
 * changes persist across client-side navigation.
 */
export interface AppState {
  users: User[];
  associations: PharmacyAssociation[];
  pharmacies: Pharmacy[];
  applications: Application[];
  reports: Report[];
  currentUserId: string | null;
  simulateFault: boolean;
  /** Monotonic revision bumped on every data mutation; views re-fetch when it changes. */
  revision: number;
  setCurrentUser: (userId: string | null) => void;
  setSimulateFault: (on: boolean) => void;
  setRevision: (revision: number) => void;
  setUsers: (users: User[]) => void;
  setAssociations: (associations: PharmacyAssociation[]) => void;
  setPharmacies: (pharmacies: Pharmacy[]) => void;
  setApplications: (applications: Application[]) => void;
  setReports: (reports: Report[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  users: seedUsers,
  associations: seedAssociations,
  pharmacies: seedPharmacies,
  applications: seedApplications,
  reports: seedReports,
  currentUserId: seedUsers[0]!.id,
  simulateFault: false,
  revision: 0,
  setCurrentUser: (userId) => set({ currentUserId: userId }),
  setSimulateFault: (on) => set({ simulateFault: on }),
  setRevision: (revision) => set({ revision }),
  setUsers: (users) => set({ users }),
  setAssociations: (associations) => set({ associations }),
  setPharmacies: (pharmacies) => set({ pharmacies }),
  setApplications: (applications) => set({ applications }),
  setReports: (reports) => set({ reports }),
}));

/** Bump the global revision so every subscribed view re-fetches scoped data. */
export function markMutated(): void {
  useAppStore.setState((s) => ({ revision: s.revision + 1 }));
}

/** The user selected via the "Viewing as" switcher (mock auth session). */
export function useCurrentUser(): User | null {
  return useAppStore((s) => {
    if (!s.currentUserId) return null;
    return s.users.find((u) => u.id === s.currentUserId) ?? null;
  });
}

/** Subscribes to the data revision; every mutation re-renders the component. */
export function useRevision(): number {
  return useAppStore((s) => s.revision);
}

/** All users in the registry (unscoped; use the data layer for scoped reads). */
export function useUsers(): User[] {
  return useAppStore((s) => s.users);
}

/** All associations in the registry (unscoped; use the data layer for scoped reads). */
export function useAssociations(): PharmacyAssociation[] {
  return useAppStore((s) => s.associations);
}

/** All pharmacies in the registry (unscoped; use the data layer for scoped reads). */
export function usePharmacies(): Pharmacy[] {
  return useAppStore((s) => s.pharmacies);
}

/** Convenience lookup by id; falls back to undefined while a user is not found. */
export function useUserById(id: string | undefined): User | null {
  return useAppStore((s) => s.users.find((u) => u.id === id) ?? null);
}
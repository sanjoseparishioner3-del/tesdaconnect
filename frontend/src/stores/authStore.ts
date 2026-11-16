import { create } from 'zustand';
import type { UserProfile } from '@/types/auth';

interface AuthState {
  profile: UserProfile | null;
  activeInstitutionId: string | null;
  isLoading: boolean;
  isOfflineSession: boolean;
  offlineOptIn: boolean;
  setProfile: (profile: UserProfile | null, opts?: { isOfflineSession?: boolean; activeInstitutionId?: string | null }) => void;
  setActiveInstitution: (institutionId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setOfflineOptIn: (enabled: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  activeInstitutionId: null,
  isLoading: true,
  isOfflineSession: false,
  // Automatic offline-first mode activated upon authenticated login
  offlineOptIn: true,
  setProfile: (profile, opts) =>
    set({
      profile,
      activeInstitutionId:
        opts?.activeInstitutionId !== undefined
          ? opts.activeInstitutionId
          : (profile?.institutions?.find((i) => i.isPrimary)?.institutionId ??
              profile?.institutions?.[0]?.institutionId ??
              null),
      isLoading: false,
      isOfflineSession: opts?.isOfflineSession ?? false,
    }),
  setActiveInstitution: (activeInstitutionId) => set({ activeInstitutionId }),
  setLoading: (isLoading) => set({ isLoading }),
  setOfflineOptIn: (offlineOptIn) => set({ offlineOptIn }),
  clearAuth: () =>
    set({
      profile: null,
      activeInstitutionId: null,
      isLoading: false,
      isOfflineSession: false,
      offlineOptIn: true,
    }),
}));

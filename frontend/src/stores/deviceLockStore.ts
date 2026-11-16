import { create } from 'zustand';

interface DeviceLockState {
  isLocked: boolean;
  lockedReason: string | null;
  lastActivityAt: number;
  lockDevice: (reason?: string) => void;
  unlockDevice: () => void;
  touchActivity: () => void;
}

export const useDeviceLockStore = create<DeviceLockState>((set) => ({
  isLocked: false,
  lockedReason: null,
  lastActivityAt: Date.now(),
  lockDevice: (reason = 'Device locked to protect cached institutional records.') =>
    set({
      isLocked: true,
      lockedReason: reason,
    }),
  unlockDevice: () =>
    set({
      isLocked: false,
      lockedReason: null,
      lastActivityAt: Date.now(),
    }),
  touchActivity: () => set({ lastActivityAt: Date.now() }),
}));

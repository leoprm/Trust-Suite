import { create } from 'zustand';

interface UIState {
  activeNeedId: string | null;
  activeTreeId: string | null;
  setActiveNeed: (id: string | null) => void;
  setActiveNeedAndTree: (needId: string | null, treeId: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeNeedId: null,
  activeTreeId: null,
  setActiveNeed: (id) => set({ activeNeedId: id, activeTreeId: id ? useUIStore.getState().activeTreeId : null }),
  setActiveNeedAndTree: (needId, treeId) => set({ activeNeedId: needId, activeTreeId: treeId }),
}));

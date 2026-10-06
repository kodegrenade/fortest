import { create } from 'zustand';

/** Below this width the expanded sidebar overlays the content instead of pushing it (see components.css). */
const isNarrow = () => window.matchMedia('(max-width: 900px)').matches;

interface SidebarState {
  isCollapsed: boolean;
  toggleCollapse: () => void;
  /** Closes the overlaid sidebar after a pick on narrow screens; no-op on desktop. */
  collapseIfNarrow: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isCollapsed: isNarrow(),

  toggleCollapse: () => set((state) => ({ isCollapsed: !state.isCollapsed })),

  collapseIfNarrow: () => {
    if (isNarrow()) set({ isCollapsed: true });
  },
}));

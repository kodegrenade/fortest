import { create } from 'zustand';

type SidebarSection = 'collections' | 'history' | 'environments';

interface SidebarState {
  activeSection: SidebarSection;
  isCollapsed: boolean;
  setActiveSection: (section: SidebarSection) => void;
  toggleCollapse: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  activeSection: 'collections',
  isCollapsed: false,

  setActiveSection: (section) => set({ activeSection: section }),

  toggleCollapse: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
}));

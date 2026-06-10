import { useSidebarStore } from '@/stores/sidebarStore';
import { Toolbar } from './Toolbar';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { SplitPane } from './SplitPane';

export function AppShell() {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);

  const mainClass = `main-content${isCollapsed ? ' main-content--sidebar-collapsed' : ''}`;

  return (
    <div className="app-shell">
      <Toolbar />
      <Sidebar />

      <div className={mainClass}>
        <TabBar />
        <SplitPane />
      </div>
    </div>
  );
}

import { useSidebarStore } from '@/stores/sidebarStore';
import { useBucketStore } from '@/stores/bucketStore';
import { Toolbar } from './Toolbar';
import { Sidebar } from './Sidebar';
import { BucketDetail } from '../buckets/BucketDetail';
import { ActionGroupPanel } from '../buckets/ActionGroupPanel';
import { DashboardHub } from '../dashboard/DashboardHub';

export function AppShell() {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);
  const { activeBucketId, activeGroupId } = useBucketStore();

  if (activeBucketId === null) {
    return (
      <div className="app-shell">
        <Toolbar />
        <main style={{ marginTop: 'var(--toolbar-height)', height: 'calc(100vh - var(--toolbar-height))', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <DashboardHub />
        </main>
      </div>
    );
  }

  const mainClass = `main-content${isCollapsed ? ' main-content--sidebar-collapsed' : ''}`;

  return (
    <div className="app-shell">
      <Toolbar />
      <Sidebar />

      <main className={mainClass}>
        {activeGroupId === null ? (
          <BucketDetail />
        ) : (
          <ActionGroupPanel />
        )}
      </main>
    </div>
  );
}

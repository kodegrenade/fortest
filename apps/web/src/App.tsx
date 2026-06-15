import { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { useBucketStore } from '@/stores/bucketStore';
import { useExecutionStore } from '@/stores/executionStore';
import { AppShell } from '@/components/layout/AppShell';
import { ToastContainer } from '@/components/common/ToastContainer';

export function App() {
  const init = useThemeStore((s) => s.init);
  const loadBuckets = useBucketStore((s) => s.loadBuckets);
  const initializeGlobalSocket = useExecutionStore((s) => s.initializeGlobalSocket);

  useEffect(() => {
    const cleanup = init();
    loadBuckets();
    initializeGlobalSocket();

    // Request native push notification permissions if default
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return cleanup;
  }, [init, loadBuckets, initializeGlobalSocket]);

  return (
    <>
      <AppShell />
      <ToastContainer />
    </>
  );
}

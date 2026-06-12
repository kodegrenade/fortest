import { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { useBucketStore } from '@/stores/bucketStore';
import { AppShell } from '@/components/layout/AppShell';
import { ToastContainer } from '@/components/common/ToastContainer';

export function App() {
  const init = useThemeStore((s) => s.init);
  const loadBuckets = useBucketStore((s) => s.loadBuckets);

  useEffect(() => {
    const cleanup = init();
    loadBuckets();
    return cleanup;
  }, [init, loadBuckets]);

  return (
    <>
      <AppShell />
      <ToastContainer />
    </>
  );
}

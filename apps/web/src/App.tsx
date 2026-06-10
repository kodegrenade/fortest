import { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { AppShell } from '@/components/layout/AppShell';

export function App() {
  const init = useThemeStore((s) => s.init);

  useEffect(() => {
    const cleanup = init();
    return cleanup;
  }, [init]);

  return <AppShell />;
}

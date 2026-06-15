import { useThemeStore } from '@/stores/themeStore';
import { useBucketStore } from '@/stores/bucketStore';
import { LogoIcon, SunIcon, MoonIcon, MonitorIcon } from '@/components/common/Icons';
import { BackgroundJobsIndicator } from './BackgroundJobsIndicator';

const THEME_ICONS = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
} as const;

const THEME_LABELS = {
  light: 'Light theme (click for system)',
  dark: 'Dark theme (click for light)',
  system: 'System theme (click for dark)',
} as const;

export function Toolbar() {
  const { theme, toggleTheme, subTheme, setSubTheme } = useThemeStore();
  const activeBucket = useBucketStore((s) => s.buckets.find((b) => b.id === s.activeBucketId));

  const ThemeIcon = THEME_ICONS[theme];

  return (
    <header className="toolbar">
      <div className="toolbar__logo">
        <LogoIcon size={22} className="toolbar__logo-icon" />
        <span className="toolbar__logo-text">Fortest</span>
      </div>

      {activeBucket && (
        <div className="toolbar__bucket-context" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span className="toolbar__bucket-name" style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
            {activeBucket.name}
          </span>
          {activeBucket.baseUrl && (
            <span className="toolbar__bucket-url" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)' }}>
              {activeBucket.baseUrl}
            </span>
          )}
        </div>
      )}

      <div className="toolbar__controls" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <BackgroundJobsIndicator />
        <select
          value={subTheme}
          onChange={(e) => setSubTheme(e.target.value as any)}
          title="Select Color Preset"
          style={{
            fontSize: '11px',
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="default">Default theme</option>
          <option value="dracula">Dracula preset</option>
          <option value="cyberpunk">Cyberpunk preset</option>
          <option value="nord">Nord Ice preset</option>
          <option value="monokai">Monokai preset</option>
        </select>
        <button
          className="btn btn--icon"
          onClick={toggleTheme}
          title={THEME_LABELS[theme]}
          aria-label={THEME_LABELS[theme]}
        >
          <ThemeIcon size={18} />
        </button>
      </div>
    </header>
  );
}

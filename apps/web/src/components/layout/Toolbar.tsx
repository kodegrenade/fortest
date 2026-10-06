import { useThemeStore } from '@/stores/themeStore';
import { useBucketStore } from '@/stores/bucketStore';
import { LogoIcon, SunIcon, MoonIcon, MonitorIcon } from '@/components/common/Icons';
import { BackgroundJobsIndicator } from './BackgroundJobsIndicator';
import { displayBaseUrl } from '@/utils/variableParser';

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
  const { theme, toggleTheme } = useThemeStore();
  const activeBucket = useBucketStore((s) => s.buckets.find((b) => b.id === s.activeBucketId));

  const ThemeIcon = THEME_ICONS[theme];

  return (
    <header className="toolbar">
      <div className="toolbar__logo">
        <LogoIcon size={22} className="toolbar__logo-icon" />
        <span className="toolbar__logo-text">Fortest</span>

        {/* Breadcrumb: where you are, next to the product name */}
        {activeBucket && (
          <div className="toolbar__bucket-context">
            <span aria-hidden="true" style={{ color: 'var(--text-tertiary)' }}>/</span>
            <span className="toolbar__bucket-name">{activeBucket.name}</span>
            {activeBucket.baseUrl && (
              <span className="toolbar__bucket-url" title={activeBucket.baseUrl}>
                {displayBaseUrl(activeBucket)}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="toolbar__controls" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <BackgroundJobsIndicator />
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

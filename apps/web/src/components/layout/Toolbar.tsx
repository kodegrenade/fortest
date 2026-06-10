import { useThemeStore } from '@/stores/themeStore';
import { LogoIcon, SunIcon, MoonIcon, MonitorIcon } from '@/components/common/Icons';

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
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  const ThemeIcon = THEME_ICONS[theme];

  return (
    <header className="toolbar">
      <div className="toolbar__logo">
        <LogoIcon size={22} className="toolbar__logo-icon" />
        <span className="toolbar__logo-text">Fortest</span>
      </div>

      <div className="toolbar__controls">
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

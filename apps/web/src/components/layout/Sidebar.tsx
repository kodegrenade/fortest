import { useSidebarStore } from '@/stores/sidebarStore';
import {
  FolderIcon,
  ClockIcon,
  SlidersIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@/components/common/Icons';

type SidebarSection = 'collections' | 'history' | 'environments';

const SECTIONS: { id: SidebarSection; label: string; Icon: typeof FolderIcon }[] = [
  { id: 'collections', label: 'Collections', Icon: FolderIcon },
  { id: 'history', label: 'History', Icon: ClockIcon },
  { id: 'environments', label: 'Environments', Icon: SlidersIcon },
];

const PLACEHOLDER_TEXT: Record<SidebarSection, string> = {
  collections: 'Your API collections will appear here. Create a new collection to get started.',
  history: 'Recent requests will be logged here as you make API calls.',
  environments: 'Manage variables and environment configurations for your requests.',
};

export function Sidebar() {
  const activeSection = useSidebarStore((s) => s.activeSection);
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);
  const setActiveSection = useSidebarStore((s) => s.setActiveSection);
  const toggleCollapse = useSidebarStore((s) => s.toggleCollapse);

  const sidebarClass = `sidebar${isCollapsed ? ' sidebar--collapsed' : ''}`;

  return (
    <aside className={sidebarClass}>
      <nav className="sidebar__nav">
        {SECTIONS.map(({ id, label, Icon }) => {
          const isActive = activeSection === id;
          const btnClass = `sidebar__nav-btn${isActive ? ' sidebar__nav-btn--active' : ''}`;

          return (
            <button
              key={id}
              className={btnClass}
              onClick={() => setActiveSection(id)}
              title={isCollapsed ? label : undefined}
              aria-label={label}
              aria-pressed={isActive}
            >
              <span className="sidebar__nav-btn-icon">
                <Icon size={18} />
              </span>
              <span className="sidebar__nav-btn-label">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar__content">
        <div className="sidebar__section">
          <div className="sidebar__section-header">
            {activeSection}
          </div>
          <div className="sidebar__placeholder">
            <span className="sidebar__placeholder-icon">
              {SECTIONS.find((s) => s.id === activeSection)?.Icon &&
                (() => {
                  const ActiveIcon = SECTIONS.find((s) => s.id === activeSection)!.Icon;
                  return <ActiveIcon size={32} />;
                })()}
            </span>
            <span>{PLACEHOLDER_TEXT[activeSection]}</span>
          </div>
        </div>
      </div>

      <div className="sidebar__footer">
        <button
          className="sidebar__collapse-btn"
          onClick={toggleCollapse}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRightIcon size={16} /> : <ChevronLeftIcon size={16} />}
        </button>
      </div>
    </aside>
  );
}

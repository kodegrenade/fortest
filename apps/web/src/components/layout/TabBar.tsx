import { useState, useCallback } from 'react';
import { PlusIcon, XIcon } from '@/components/common/Icons';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';

interface Tab {
  id: string;
  name: string;
  method: HttpMethod;
}

const DEFAULT_TABS: Tab[] = [
  { id: 'default-1', name: 'New Request', method: 'get' },
];

let tabCounter = 1;

export function TabBar() {
  const [tabs, setTabs] = useState<Tab[]>(DEFAULT_TABS);
  const [activeTabId, setActiveTabId] = useState(DEFAULT_TABS[0]!.id);

  const handleNewTab = useCallback(() => {
    tabCounter++;
    const newTab: Tab = {
      id: `tab-${tabCounter}-${Date.now()}`,
      name: 'New Request',
      method: 'get',
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, []);

  const handleCloseTab = useCallback(
    (tabId: string, event: React.MouseEvent) => {
      event.stopPropagation();
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== tabId);
        // If closing the active tab, select an adjacent one
        if (activeTabId === tabId && next.length > 0) {
          const closedIdx = prev.findIndex((t) => t.id === tabId);
          const newActive = next[Math.min(closedIdx, next.length - 1)]!;
          setActiveTabId(newActive.id);
        }
        // Always keep at least one tab
        if (next.length === 0) {
          const fallback: Tab = {
            id: `tab-${++tabCounter}-${Date.now()}`,
            name: 'New Request',
            method: 'get',
          };
          setActiveTabId(fallback.id);
          return [fallback];
        }
        return next;
      });
    },
    [activeTabId]
  );

  return (
    <div className="tab-bar" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const tabClass = `tab${isActive ? ' tab--active' : ''}`;

        return (
          <div
            key={tab.id}
            className={tabClass}
            role="tab"
            aria-selected={isActive}
            onClick={() => setActiveTabId(tab.id)}
          >
            <span className="tab__method" data-method={tab.method}>
              {tab.method}
            </span>
            <span className="tab__name">{tab.name}</span>
            <button
              className="tab__close"
              onClick={(e) => handleCloseTab(tab.id, e)}
              aria-label={`Close ${tab.name}`}
            >
              <XIcon size={12} />
            </button>
          </div>
        );
      })}

      <button
        className="tab--new"
        onClick={handleNewTab}
        title="New request"
        aria-label="New request tab"
      >
        <PlusIcon size={14} />
      </button>
    </div>
  );
}

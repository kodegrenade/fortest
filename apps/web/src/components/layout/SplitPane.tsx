import { useState, useCallback, useRef, useEffect } from 'react';
import { SendIcon, InboxIcon } from '@/components/common/Icons';

const STORAGE_KEY = 'fortest-split-ratio';
const MIN_PANEL_HEIGHT = 120;
const HANDLE_HEIGHT = 6;

function readStoredRatio(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const val = parseFloat(stored);
      if (!isNaN(val) && val > 0 && val < 1) return val;
    }
  } catch {
    // Ignore
  }
  return 0.5;
}

function persistRatio(ratio: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, ratio.toFixed(4));
  } catch {
    // Ignore
  }
}

export function SplitPane() {
  const [ratio, setRatio] = useState(readStoredRatio);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const totalHeight = rect.height - HANDLE_HEIGHT;
      const y = e.clientY - rect.top;
      const clampedY = Math.max(MIN_PANEL_HEIGHT, Math.min(y, totalHeight - MIN_PANEL_HEIGHT));
      const newRatio = clampedY / totalHeight;

      setRatio(newRatio);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      persistRatio(ratio);
    };

    // Prevent text selection while dragging
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, ratio]);

  const topHeight = `${ratio * 100}%`;
  const bottomHeight = `${(1 - ratio) * 100}%`;

  const handleClass = `split-pane__handle${isDragging ? ' split-pane__handle--dragging' : ''}`;

  return (
    <div
      ref={containerRef}
      className="split-pane"
      style={{
        gridTemplateRows: `${topHeight} ${HANDLE_HEIGHT}px ${bottomHeight}`,
      }}
    >
      <div className="split-pane__panel split-pane__panel--request">
        <div className="panel-placeholder">
          <div className="panel-placeholder__icon">
            <SendIcon size={40} />
          </div>
          <div className="panel-placeholder__label">Request Builder</div>
          <div className="panel-placeholder__hint">
            Configure your HTTP request — method, URL, headers, and body
          </div>
        </div>
      </div>

      <div
        className={handleClass}
        onMouseDown={handleMouseDown}
        role="separator"
        aria-orientation="horizontal"
        aria-valuenow={Math.round(ratio * 100)}
      />

      <div className="split-pane__panel split-pane__panel--response">
        <div className="panel-placeholder">
          <div className="panel-placeholder__icon">
            <InboxIcon size={40} />
          </div>
          <div className="panel-placeholder__label">Response Viewer</div>
          <div className="panel-placeholder__hint">
            Send a request to see the response here
          </div>
        </div>
      </div>
    </div>
  );
}

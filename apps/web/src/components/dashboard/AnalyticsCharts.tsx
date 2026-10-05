import { useEffect, useState } from 'react';
import { useExecutionStore } from '@/stores/executionStore';
import { ClockIcon } from '@/components/common/Icons';

interface AnalyticsChartsProps {
  groupId: string;
}

export function AnalyticsCharts({ groupId }: AnalyticsChartsProps) {
  const { pastRuns, pastRunsLoading, loadRuns } = useExecutionStore();
  const [hoveredRunIndex, setHoveredRunIndex] = useState<number | null>(null);

  useEffect(() => {
    loadRuns(groupId);
  }, [groupId, loadRuns]);

  if (pastRunsLoading && pastRuns.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '12px', color: 'var(--text-secondary)' }}>
        <div className="spinner"></div>
        <span style={{ fontSize: '14px' }}>Loading analytics...</span>
      </div>
    );
  }

  // Filter completed runs to calculate statistics
  const completedRuns = pastRuns.filter((r) => r.status === 'completed' && r.metrics);

  if (completedRuns.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '48px', gap: '16px', color: 'var(--text-tertiary)' }}>
        <ClockIcon size={48} />
        <div style={{ textAlign: 'center' }}>
          <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>No Analytics Data</h4>
          <p style={{ fontSize: '13px', maxWidth: '320px' }}>Execute at least one successful Action Group run to compile analytics history and P95 latency distributions.</p>
        </div>
      </div>
    );
  }

  // Calculate Aggregates
  const totalRunsCount = completedRuns.length;
  const totalRequests = completedRuns.reduce((sum, r) => sum + (r.metrics?.totalRequests || 0), 0);
  const totalFailed = completedRuns.reduce((sum, r) => sum + (r.metrics?.failed || 0), 0);
  const overallSuccessRate = totalRequests > 0 ? Math.round(((totalRequests - totalFailed) / totalRequests) * 100) : 100;

  const latencies = completedRuns.map((r) => r.metrics?.avgLatency || 0);
  const overallAvgLatency = Math.round(latencies.reduce((sum, l) => sum + l, 0) / totalRunsCount);
  const maxRecordedLatency = Math.max(...completedRuns.map((r) => r.metrics?.maxLatency || 0), 0);

  // Prepare chart data (limit to last 12 runs in chronological order, left to right)
  const chartRuns = [...completedRuns].reverse().slice(-12);
  const numPoints = chartRuns.length;

  // Chart geometry: x spans 50..550, y maps 0..maxScale onto 160..40 (10% headroom).
  const maxScale = Math.max(...chartRuns.flatMap((r) => [r.metrics?.avgLatency || 0, r.metrics?.p95 || 0]), 50) * 1.1;
  const X = (index: number) => 50 + index * (500 / (numPoints - 1 || 1));
  const Y = (value: number) => 160 - (value / maxScale) * 120;
  const linePoints = (field: 'avgLatency' | 'p95') =>
    chartRuns.map((run, index) => `${X(index)},${Y(run.metrics?.[field] || 0)}`).join(' ');

  const tiles = [
    {
      label: 'Success Rate',
      value: `${overallSuccessRate}%`,
      color: overallSuccessRate === 100 ? 'var(--status-2xx)' : 'var(--status-5xx)',
      note: `${totalRequests - totalFailed} / ${totalRequests} total requests`,
    },
    { label: 'Avg Latency (Historical)', value: `${overallAvgLatency} ms`, color: 'var(--text-primary)', note: `Across ${totalRunsCount} recorded runs` },
    { label: 'Max Latency Recorded', value: `${maxRecordedLatency} ms`, color: 'var(--text-primary)', note: 'Single request peak duration' },
    { label: 'Total runs', value: totalRunsCount, color: 'var(--accent-primary)', note: 'Retained runs history size' },
  ];

  const hovered = hoveredRunIndex !== null ? chartRuns[hoveredRunIndex] : undefined;
  const hoveredSuccess = 100 - (hovered?.metrics?.errorRate || 0);
  const hoveredPassed = hovered?.status === 'completed' && hoveredSuccess === 100;

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <div>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Performance & Trend Analytics</h3>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Statistical overviews and latency distribution reports compiled over time.</p>
      </div>

      {/* Aggregate Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        {tiles.map(({ label, value, color, note }) => (
          <div key={label} style={{ padding: '16px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color, marginTop: '4px' }}>{value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{note}</div>
          </div>
        ))}
      </div>

      {/* Latency Distribution SVG Chart */}
      <div style={{ border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--bg-secondary)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Latency Trends (ms)</h4>
            <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>Tracks Average and P95 latency distributions over chronological runs.</p>
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: '16px', fontSize: '11px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
              <span style={{ display: 'inline-block', width: '12px', height: '3px', backgroundColor: 'var(--accent-primary)' }}></span>
              Average
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
              <span style={{ display: 'inline-block', width: '12px', height: '0', borderTop: '2px dashed var(--status-5xx)' }}></span>
              P95 Latency
            </span>
          </div>
        </div>

        {/* SVG Drawing */}
        <div style={{ width: '100%', position: 'relative' }}>
          <svg viewBox="0 0 580 200" style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
            <defs>
              <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.12" />
                <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid Y Lines & Labels */}
            {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
              const y = Y(p * maxScale);
              const val = Math.round(p * maxScale);
              return (
                <g key={idx}>
                  <line x1="50" y1={y} x2="550" y2={y} stroke="var(--border-primary)" strokeWidth="0.5" strokeDasharray="4 4" />
                  <text x="40" y={y + 4} textAnchor="end" fill="var(--text-tertiary)" style={{ fontSize: '9px', fontFamily: 'var(--font-mono)' }}>
                    {val}ms
                  </text>
                </g>
              );
            })}

            {/* X Labels (Runs) */}
            {chartRuns.map((_, index) => {
              return (
                <text key={index} x={X(index)} y="180" textAnchor="middle" fill="var(--text-tertiary)" style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)' }}>
                  #{totalRunsCount - numPoints + index + 1}
                </text>
              );
            })}

            {numPoints >= 2 ? (
              <>
                {/* Area under Average Line */}
                <polygon points={`50,160 ${linePoints('avgLatency')} 550,160`} fill="url(#latencyGrad)" />

                {/* Average Latency Line */}
                <polyline points={linePoints('avgLatency')} fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

                {/* P95 Latency Line */}
                <polyline points={linePoints('p95')} fill="none" stroke="var(--status-5xx)" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" strokeLinejoin="round" />

                {/* Markers, plus a larger invisible hover target per run */}
                {chartRuns.map((run, index) => {
                  const x = X(index);
                  const yAvg = Y(run.metrics?.avgLatency || 0);
                  const isHovered = hoveredRunIndex === index;
                  return (
                    <g key={index}>
                      <circle cx={x} cy={yAvg} r={isHovered ? 5 : 3.5} fill="var(--bg-secondary)" stroke="var(--accent-primary)" strokeWidth={isHovered ? 2.5 : 1.5} style={{ transition: 'all var(--transition-fast)' }} />
                      <circle cx={x} cy={Y(run.metrics?.p95 || 0)} r={isHovered ? 4.5 : 3} fill="var(--bg-secondary)" stroke="var(--status-5xx)" strokeWidth={isHovered ? 2.5 : 1.5} style={{ transition: 'all var(--transition-fast)' }} />
                      <circle
                        cx={x}
                        cy={yAvg}
                        r="16"
                        fill="transparent"
                        style={{ cursor: 'pointer', pointerEvents: 'all' }}
                        onMouseEnter={() => setHoveredRunIndex(index)}
                        onMouseLeave={() => setHoveredRunIndex(null)}
                      />
                    </g>
                  );
                })}
              </>
            ) : (
              // Fallback fallback single point
              <circle cx="50" cy="100" r="4" fill="var(--accent-primary)" />
            )}
          </svg>

          {/* Interactive glassmorphic tooltip card */}
          {hovered && (
            <div
              style={{
                position: 'absolute',
                left: `${(X(hoveredRunIndex!) / 580) * 100}%`,
                top: `${(Y(hovered.metrics?.avgLatency || 0) / 200) * 100}%`,
                transform: 'translate(-50%, -100%) translateY(-10px)',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
                boxShadow: 'var(--shadow-lg)',
                color: 'var(--text-primary)',
                fontSize: '11px',
                zIndex: 10,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--accent-primary)', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '3px', marginBottom: '2px' }}>
                Run #{totalRunsCount - numPoints + hoveredRunIndex! + 1}
              </div>
              {[
                ['Status:', hoveredPassed ? 'Passed' : 'Failed', hoveredPassed ? 'var(--status-2xx)' : 'var(--status-5xx)'],
                ['Average:', `${Math.round(hovered.metrics?.avgLatency || 0)} ms`],
                ['P95 Latency:', `${hovered.metrics?.p95 || 0} ms`],
                ['Success Rate:', `${hoveredSuccess}%`, hoveredSuccess === 100 ? 'var(--status-2xx)' : 'var(--status-5xx)'],
              ].map(([label, value, color]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontWeight: color ? 600 : 500, color }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

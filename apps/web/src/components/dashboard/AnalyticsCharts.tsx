import { useEffect } from 'react';
import { useExecutionStore } from '@/stores/executionStore';
import { ClockIcon } from '@/components/common/Icons';

interface AnalyticsChartsProps {
  groupId: string;
}

export function AnalyticsCharts({ groupId }: AnalyticsChartsProps) {
  const { pastRuns, pastRunsLoading, loadRuns } = useExecutionStore();

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

  // Max values for scaling
  const maxAvgLatency = Math.max(...chartRuns.map((r) => r.metrics?.avgLatency || 0), 50);
  const maxP95Latency = Math.max(...chartRuns.map((r) => r.metrics?.p95 || 0), 50);
  const maxScale = Math.max(maxAvgLatency, maxP95Latency) * 1.1; // Add 10% headroom

  // Helper to generate SVG polyline path for latency
  const getLatencyPath = (field: 'avgLatency' | 'p95') => {
    if (numPoints < 2) return '';
    return chartRuns
      .map((run, index) => {
        const x = 50 + (index * (500 / (numPoints - 1)));
        const val = field === 'avgLatency' ? (run.metrics?.avgLatency || 0) : (run.metrics?.p95 || 0);
        const y = 160 - (val / maxScale) * 120;
        return `${x},${y}`;
      })
      .join(' ');
  };

  // Helper to get SVG points for gradient fill under the line
  const getLatencyAreaPoints = () => {
    if (numPoints < 2) return '';
    const linePoints = chartRuns.map((run, index) => {
      const x = 50 + (index * (500 / (numPoints - 1)));
      const val = run.metrics?.avgLatency || 0;
      const y = 160 - (val / maxScale) * 120;
      return `${x},${y}`;
    });

    const startX = 50;
    const endX = 50 + ((numPoints - 1) * (500 / (numPoints - 1)));
    return `${startX},160 ${linePoints.join(' ')} ${endX},160`;
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', flex: 1 }}>
      <div>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Performance & Trend Analytics</h3>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Statistical overviews and latency distribution reports compiled over time.</p>
      </div>

      {/* Aggregate Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        <div style={{ padding: '16px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--bg-secondary)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Success Rate</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: overallSuccessRate === 100 ? 'var(--status-2xx)' : 'var(--status-5xx)', marginTop: '4px' }}>
            {overallSuccessRate}%
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{totalRequests - totalFailed} / {totalRequests} total requests</div>
        </div>

        <div style={{ padding: '16px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--bg-secondary)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Latency (Historical)</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
            {overallAvgLatency} ms
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Across {totalRunsCount} recorded runs</div>
        </div>

        <div style={{ padding: '16px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--bg-secondary)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Max Latency Recorded</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
            {maxRecordedLatency} ms
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Single request peak duration</div>
        </div>

        <div style={{ padding: '16px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--bg-secondary)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total runs</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-primary)', marginTop: '4px' }}>
            {totalRunsCount}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Retained runs history size</div>
        </div>
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
              const y = 160 - p * 120;
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
              const x = 50 + (index * (500 / (numPoints - 1 || 1)));
              return (
                <text key={index} x={x} y="180" textAnchor="middle" fill="var(--text-tertiary)" style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)' }}>
                  #{totalRunsCount - numPoints + index + 1}
                </text>
              );
            })}

            {numPoints >= 2 ? (
              <>
                {/* Area under Average Line */}
                <polygon points={getLatencyAreaPoints()} fill="url(#latencyGrad)" />

                {/* Average Latency Line */}
                <polyline points={getLatencyPath('avgLatency')} fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

                {/* P95 Latency Line */}
                <polyline points={getLatencyPath('p95')} fill="none" stroke="var(--status-5xx)" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" strokeLinejoin="round" />

                {/* Markers for Points */}
                {chartRuns.map((run, index) => {
                  const x = 50 + (index * (500 / (numPoints - 1)));
                  const yAvg = 160 - ((run.metrics?.avgLatency || 0) / maxScale) * 120;
                  const yP95 = 160 - ((run.metrics?.p95 || 0) / maxScale) * 120;
                  return (
                    <g key={index}>
                      <circle cx={x} cy={yAvg} r="3.5" fill="var(--bg-secondary)" stroke="var(--accent-primary)" strokeWidth="1.5" />
                      <circle cx={x} cy={yP95} r="3" fill="var(--bg-secondary)" stroke="var(--status-5xx)" strokeWidth="1.5" />
                    </g>
                  );
                })}
              </>
            ) : (
              // Fallback fallback single point
              <circle cx="50" cy="100" r="4" fill="var(--accent-primary)" />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}

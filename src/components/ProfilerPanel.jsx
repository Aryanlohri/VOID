import { useMemo } from 'react';

function FlameNode({ node, totalDuration, level }) {
  if (!node) return null;
  const widthPerc = totalDuration > 0 ? (node.duration / totalDuration) * 100 : 0;
  if (widthPerc < 0.1 && level > 0) return null; // Hide ultra-thin nodes

  // Generate a warm color for flame chart based on depth
  const hue = 30 - Math.min(level * 5, 40); // 30 (orange) down to red/purple
  const lightness = 40 + (level % 2) * 10;
  const bgColor = `hsla(${hue < 0 ? 360 + hue : hue}, 70%, ${lightness}%, 0.8)`;

  return (
    <div className="flame-node-wrapper" style={{ width: `${Math.max(widthPerc, 0)}%` }}>
      <div className="flame-node-rect" style={{ backgroundColor: bgColor }} title={`${node.name}\n${node.duration.toFixed(2)}ms`}>
        {widthPerc > 5 && <span className="flame-node-label">{node.name}</span>}
      </div>
      {node.children && node.children.length > 0 && (
        <div className="flame-node-children">
          {node.children.map((child, i) => (
            <FlameNode key={i} node={child} totalDuration={node.duration} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProfilerPanel({ profilerData }) {
  const rootNode = profilerData?.flameChart;
  const hasData = rootNode && rootNode.duration > 0;

  return (
    <div className="panel panel-profiler">
      <div className="panel-title">
        <span className="panel-icon"></span> profiler
        {profilerData && (
          <span className="panel-badge" title="Average Event Loop Latency between checkpoints">
            LATENCY: {profilerData.avgLatency ? profilerData.avgLatency.toFixed(2) : '0.00'}ms
          </span>
        )}
      </div>
      <div className="profiler-content">
        {!hasData ? (
          <div className="empty-state">—</div>
        ) : (
          <div className="flame-chart-container">
            <FlameNode node={rootNode} totalDuration={rootNode.duration} level={0} />
          </div>
        )}
      </div>
    </div>
  );
}

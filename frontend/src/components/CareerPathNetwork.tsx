import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { formatCompactCurrency } from '../lib/format';

interface GraphNode {
  skillTag: string;
  difficulty: number;
  avgIncome: number;
  memberCount: number;
}

interface GraphEdge {
  from: string;
  to: string;
  hopsWeight: number;
  profitWeight: number;
  combinedWeight: number;
  transitionCount: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface CareerPathNetworkProps {
  graph: GraphData;
  highlightedPath?: string[]; // skillTags in the optimal path
}

const NODE_RADIUS = 24;
const GRID_CELL = 110;

export default function CareerPathNetwork({ graph, highlightedPath }: CareerPathNetworkProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  if (!graph?.nodes?.length) {
    return (
      <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        No hay datos del grafo disponibles.
      </div>
    );
  }

  const highlightSet = new Set(highlightedPath || []);
  const nodeMap = new Map(graph.nodes.map((n) => [n.skillTag, n]));

  // Build adjacency for highlighting edges in the path
  const pathEdgeSet = new Set<string>();
  if (highlightedPath && highlightedPath.length > 1) {
    for (let i = 0; i < highlightedPath.length - 1; i++) {
      pathEdgeSet.add(`${highlightedPath[i]}→${highlightedPath[i + 1]}`);
      pathEdgeSet.add(`${highlightedPath[i + 1]}→${highlightedPath[i]}`);
    }
  }

  // Grid layout — arrange nodes roughly in rows
  const cols = Math.ceil(Math.sqrt(graph.nodes.length));
  const nodePositions = new Map<string, { x: number; y: number }>();
  graph.nodes.forEach((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    nodePositions.set(n.skillTag, {
      x: col * GRID_CELL + GRID_CELL / 2 + 40,
      y: row * GRID_CELL + GRID_CELL / 2 + 40,
    });
  });

  const svgW = cols * GRID_CELL + 80;
  const svgH = Math.ceil(graph.nodes.length / cols) * GRID_CELL + 80;

  // Pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === svgRef.current || (e.target as SVGElement).tagName === 'svg') {
        setDragging(true);
        setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      }
    },
    [offset]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragging) {
        setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
      }
    },
    [dragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  const zoomIn = () => setScale((s) => Math.min(s * 1.3, 3));
  const zoomOut = () => setScale((s) => Math.max(s / 1.3, 0.3));
  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleNodeHover = (node: GraphNode, e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltipPos({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 10 });
    }
    setHoveredNode(node);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="glass-panel"
      style={{ padding: '0.75rem', position: 'relative' }}
    >
      {/* Zoom controls */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 10,
          display: 'flex',
          gap: '0.3rem',
          background: 'rgba(0,0,0,0.5)',
          borderRadius: 'var(--radius-md)',
          padding: '0.25rem',
        }}
      >
        <button
          onClick={zoomIn}
          style={zoomBtnStyle}
          title="Zoom in"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={zoomOut}
          style={zoomBtnStyle}
          title="Zoom out"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={resetView}
          style={zoomBtnStyle}
          title="Reset"
        >
          <Maximize size={16} />
        </button>
      </div>

      <div
        style={{
          overflow: 'hidden',
          borderRadius: 'var(--radius-md)',
          cursor: dragging ? 'grabbing' : 'grab',
          background: 'var(--bg-primary)',
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${svgW} ${svgH}`}
          style={{
            width: '100%',
            height: 'clamp(300px, 60vh, 550px)',
            transform: `scale(${scale}) translate(${offset.x}px, ${offset.y}px)`,
            transformOrigin: 'center center',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Edges */}
          {graph.edges.map((edge, i) => {
            const fromPos = nodePositions.get(edge.from);
            const toPos = nodePositions.get(edge.to);
            if (!fromPos || !toPos) return null;

            const key = `${edge.from}→${edge.to}`;
            const isHighlighted = pathEdgeSet.has(key);

            return (
              <line
                key={`edge-${i}`}
                x1={fromPos.x}
                y1={fromPos.y}
                x2={toPos.x}
                y2={toPos.y}
                stroke={isHighlighted ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}
                strokeWidth={isHighlighted ? 2.5 : 1}
                strokeOpacity={isHighlighted ? 1 : 0.5}
                strokeDasharray={isHighlighted ? undefined : '4 3'}
              />
            );
          })}

          {/* Nodes */}
          {graph.nodes.map((node) => {
            const pos = nodePositions.get(node.skillTag);
            if (!pos) return null;

            const isHighlighted = highlightSet.has(node.skillTag);
            const isStart = highlightedPath?.[0] === node.skillTag;
            const isTarget = highlightedPath?.[highlightedPath.length - 1] === node.skillTag;

            return (
              <g
                key={`node-${node.skillTag}`}
                transform={`translate(${pos.x}, ${pos.y})`}
                onMouseEnter={(e) => handleNodeHover(node, e as any)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Glow ring for highlighted path */}
                {isHighlighted && (
                  <circle
                    r={NODE_RADIUS + 6}
                    fill="none"
                    stroke={
                      isStart
                        ? 'var(--accent-success)'
                        : isTarget
                        ? 'var(--accent-warning)'
                        : 'var(--accent-primary)'
                    }
                    strokeWidth={2}
                    opacity={0.5}
                  />
                )}

                <circle
                  r={NODE_RADIUS}
                  fill={
                    isStart
                      ? 'rgba(16,185,129,0.2)'
                      : isTarget
                      ? 'rgba(245,158,11,0.2)'
                      : isHighlighted
                      ? 'rgba(59,130,246,0.18)'
                      : 'rgba(255,255,255,0.05)'
                  }
                  stroke={
                    isStart
                      ? 'var(--accent-success)'
                      : isTarget
                      ? 'var(--accent-warning)'
                      : isHighlighted
                      ? 'var(--accent-primary)'
                      : 'var(--border-color)'
                  }
                  strokeWidth={isHighlighted ? 2 : 1}
                />

                <text
                  textAnchor="middle"
                  dy="0.35em"
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    fill: isHighlighted ? 'var(--text-primary)' : 'var(--text-secondary)',
                    pointerEvents: 'none',
                  }}
                >
                  {node.skillTag.length > 8
                    ? node.skillTag.substring(0, 7) + '…'
                    : node.skillTag}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tooltip */}
      {hoveredNode && (
        <div
          style={{
            position: 'absolute',
            left: tooltipPos.x,
            top: tooltipPos.y,
            zIndex: 20,
            background: 'rgba(10,10,15,0.95)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1rem',
            fontSize: '0.78rem',
            color: 'var(--text-primary)',
            pointerEvents: 'none',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            minWidth: 160,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '0.4rem', color: 'var(--accent-primary)' }}>
            #{hoveredNode.skillTag}
          </div>
          <div style={{ color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>Dificultad: {hoveredNode.difficulty?.toFixed(1)}</span>
            <span>Ingreso: {formatCompactCurrency(hoveredNode.avgIncome)}</span>
            <span>Miembros: {hoveredNode.memberCount}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

const zoomBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  background: 'rgba(255,255,255,0.08)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  transition: 'background 0.15s',
};

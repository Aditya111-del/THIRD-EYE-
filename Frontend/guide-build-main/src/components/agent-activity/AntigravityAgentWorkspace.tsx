import React, { useRef, useState, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Sparkles,
  Layers,
  Activity,
} from 'lucide-react';
import { AgentNodeCard } from './AgentNodeCard';
import {
  useAgentActivityStore,
  type AgentNode,
  type AgentStatus,
  DEFAULT_SUBAGENTS,
} from '@/stores/agentActivityStore';

export const AntigravityAgentWorkspace: React.FC = () => {
  const { agents, connections, selectedAgentId, setSelectedAgent } =
    useAgentActivityStore();
  const shouldReduceMotion = useReducedMotion();

  // Canvas pan & zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  // Zoom handlers
  const handleZoomIn = () => setZoom((z) => Math.min(2, +(z + 0.15).toFixed(2)));
  const handleZoomOut = () => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.group')) return; // ignore clicks on node cards
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Orchestrator node
  const orchestrator: AgentNode = agents['orchestrator'] || {
    id: 'orchestrator',
    name: 'Main Orchestrator',
    role: 'orchestrator',
    status: 'idle' as AgentStatus,
    currentActivity: 'Standing by',
    progress: null,
    activeTool: null,
    lastError: null,
    filesTouched: [],
    isOrchestrator: true,
    x: 0,
    y: 0,
    lastUpdated: Date.now(),
  };

  // Subagent nodes
  const subagents: AgentNode[] = useMemo(() => {
    return DEFAULT_SUBAGENTS.map((sub): AgentNode => {
      const existing = agents[sub.id];
      if (existing) return existing;
      return {
        id: sub.id,
        name: sub.name,
        role: sub.role,
        status: 'idle' as AgentStatus,
        currentActivity: 'Ready for assignment',
        progress: null,
        activeTool: null,
        lastError: null,
        filesTouched: [],
        isOrchestrator: false,
        x: Math.round(Math.cos((sub.angle * Math.PI) / 180) * 230),
        y: Math.round(Math.sin((sub.angle * Math.PI) / 180) * 230),
        lastUpdated: Date.now(),
      };
    });
  }, [agents]);

  // Center coordinates in canvas coordinate system
  const centerX = 450;
  const centerY = 330;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className="relative h-full w-full overflow-hidden bg-[#0D0E12] select-none font-sans cursor-grab active:cursor-grabbing"
      style={{
        backgroundImage: `radial-gradient(circle at 50% 50%, #151824 0%, #0A0B0E 100%)`,
      }}
    >
      {/* ── Background Grid & Orbit Rings ── */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-20">
        <defs>
          <pattern id="grid-dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="#717688" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-dots)" />
      </svg>

      {/* ── Transform Container with Pan & Zoom ── */}
      <div
        className="absolute inset-0 origin-center transition-transform duration-75"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '50% 50%',
        }}
      >
        {/* ── SVG Connections Layer (Curved Bezier Paths & Animated Energy Particles) ── */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          style={{ width: 1400, height: 900, left: -250, top: -120 }}
        >
          <defs>
            <linearGradient id="activeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FF6B00" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.8" />
            </linearGradient>

            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Orbital Guide Ring */}
          <circle
            cx={centerX}
            cy={centerY}
            r={230}
            fill="none"
            stroke="#262A36"
            strokeWidth="1.5"
            strokeDasharray="4 6"
            className="opacity-40"
          />

          {/* Connection lines to each subagent */}
          {subagents.map((sub) => {
            const startX = centerX;
            const startY = centerY;
            const targetX = centerX + sub.x;
            const targetY = centerY + sub.y;

            // Curved Bezier control point
            const midX = (startX + targetX) / 2 + (sub.y * 0.15);
            const midY = (startY + targetY) / 2 - (sub.x * 0.15);

            const pathD = `M ${startX} ${startY} Q ${midX} ${midY} ${targetX} ${targetY}`;

            // Check if connection is actively executing or delegating
            const isSubActive = sub.status !== 'idle' && sub.status !== 'completed' && sub.status !== 'failed';
            const matchingConn = connections.find(
              (c) => (c.to === sub.id || c.from === sub.id) && c.active
            );
            const isOutbound = matchingConn?.direction === 'outbound';

            return (
              <g key={`conn-${sub.id}`}>
                {/* Base curve */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={isSubActive ? '#FF6B00' : '#232734'}
                  strokeWidth={isSubActive ? 2.5 : 1.2}
                  strokeOpacity={isSubActive ? 0.7 : 0.3}
                  filter={isSubActive ? 'url(#glow)' : undefined}
                />

                {/* Animated dash stroke during active work */}
                {isSubActive && !shouldReduceMotion && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#FF6B00"
                    strokeWidth={2.5}
                    strokeDasharray="6 8"
                    className="animate-pulse"
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      from={isOutbound ? '100' : '0'}
                      to={isOutbound ? '0' : '100'}
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                  </path>
                )}

                {/* Traveling energy photon packet */}
                {isSubActive && !shouldReduceMotion && (
                  <circle r="4" fill="#FFA154" filter="url(#glow)">
                    <animateMotion
                      path={pathD}
                      dur="1.8s"
                      repeatCount="indefinite"
                      keyPoints={isOutbound ? '0;1' : '1;0'}
                      keyTimes="0;1"
                    />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>

        {/* ── Central Main Orchestrator Node ── */}
        <div
          className="absolute transform -translate-x-1/2 -translate-y-1/2 z-20"
          style={{ left: centerX, top: centerY }}
        >
          <AgentNodeCard
            node={orchestrator}
            isSelected={selectedAgentId === 'orchestrator'}
            onClick={() => setSelectedAgent('orchestrator')}
          />
        </div>

        {/* ── Orbiting Specialized Subagents ── */}
        {subagents.map((sub) => (
          <div
            key={sub.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 z-20"
            style={{
              left: centerX + sub.x,
              top: centerY + sub.y,
            }}
          >
            <AgentNodeCard
              node={sub}
              isSelected={selectedAgentId === sub.id}
              onClick={() => setSelectedAgent(sub.id)}
            />
          </div>
        ))}
      </div>

      {/* ── Top-Left Agent Legend & Quick Telemetry ── */}
      <div className="absolute top-4 left-4 z-30 flex items-center gap-2 rounded-xl border border-white/10 bg-[#12141C]/85 px-3.5 py-2 backdrop-blur-md text-xs shadow-xl">
        <div className="flex items-center gap-1.5 text-primary font-semibold">
          <Activity className="h-4 w-4 text-[#FF6B00]" />
          <span>Third Eye Dynamic Graph</span>
        </div>
        <span className="text-white/20">|</span>
        <span className="text-[#8E92A4] font-mono text-[11px]">
          {Object.values(agents).filter((a) => a.status !== 'idle' && a.status !== 'completed').length} active agent(s)
        </span>
      </div>

      {/* ── Bottom-Right Floating Canvas Controls ── */}
      <div className="absolute bottom-4 right-4 z-30 flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#12141C]/90 p-1.5 backdrop-blur-md shadow-2xl">
        <button
          onClick={handleZoomIn}
          className="rounded-lg p-2 text-[#9095A2] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="rounded-lg p-2 text-[#9095A2] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={handleReset}
          className="rounded-lg p-2 text-[#9095A2] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          title="Reset Zoom & Centering"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

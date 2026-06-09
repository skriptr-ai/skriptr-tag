/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState, useEffect } from 'react';
import { useGameStore } from '../store';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    const uaMatch = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    return uaMatch || coarsePointer || window.innerWidth < 768;
  });

  useEffect(() => {
    const check = () => {
      const uaMatch = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
      setIsMobile(uaMatch || coarsePointer || window.innerWidth < 768);
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}

// Seeded PRNG for identical obstacle generation
function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

export function Minimap() {
  const isMobile = useIsMobile();
  
  // Subscribing to only the specific parts of the store we need
  const playerPosition = useGameStore(state => state.playerPosition);
  const playerRotation = useGameStore(state => state.playerRotation);
  const otherPlayers = useGameStore(state => state.otherPlayers);

  // Generate the exact same obstacles as Arena.tsx
  const obstacles = useMemo(() => {
    const count = isMobile ? 60 : 150;
    const rngLocal = mulberry32(12345);
    return Array.from({ length: count }).map(() => {
      const type = 'box';
      const x = (rngLocal() - 0.5) * 170;
      const z = (rngLocal() - 0.5) * 170;
      
      if (Math.abs(x) < 20 && Math.abs(z) < 20) return null;

      const height = rngLocal() * 8 + 6;
      const isHorizontal = rngLocal() > 0.5;
      const width = isHorizontal ? rngLocal() * 25 + 10 : rngLocal() * 3 + 1;
      const depth = isHorizontal ? rngLocal() * 3 + 1 : rngLocal() * 25 + 10;
      const color = rngLocal() > 0.5 ? "#00ffff" : "#ff00ff";

      return { type, position: [x, height / 2 - 0.5, z], size: [width, height, depth], color };
    }).filter((obs): obs is { type: string, position: [number, number, number], size: [number, number, number], color: string } => obs !== null);
  }, [isMobile]);

  // Convert rotation to degrees (invert to match SVG clockwise direction)
  const localPlayerRotationDeg = -playerRotation * (180 / Math.PI);

  return (
    <div className="absolute bottom-36 right-4 md:bottom-4 md:right-4 z-20 pointer-events-auto flex flex-col gap-2 items-end">
      {/* Premium Glassmorphism Map Card */}
      <div className="relative p-2 rounded-xl border border-cyan-500/30 bg-black/65 backdrop-blur-md shadow-[0_0_20px_rgba(6,182,212,0.15)] flex flex-col items-center">
        {/* Radar Overlay Grid Scanning Lines */}
        <div className="absolute inset-2 rounded-lg pointer-events-none border border-cyan-500/10 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0)_0%,rgba(6,182,212,0.1)_100%)]" />
          {/* Scanning sweep animation */}
          <div className="absolute top-0 left-0 w-full h-[2px] bg-cyan-400/30 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-[scan_3s_linear_infinite]" />
        </div>

        {/* The SVG Tactical Map */}
        <svg 
          width={isMobile ? "140" : "200"} 
          height={isMobile ? "140" : "200"} 
          viewBox="-110 -110 220 220" 
          className="relative block"
        >
          {/* Grid lines inside the SVG */}
          <g stroke="rgba(34, 211, 238, 0.04)" strokeWidth="0.5">
            <line x1="-100" y1="-50" x2="100" y2="-50" />
            <line x1="-100" y1="0" x2="100" y2="0" />
            <line x1="-100" y1="50" x2="100" y2="50" strokeWidth="1" stroke="rgba(34, 211, 238, 0.08)" />
            <line x1="-50" y1="-100" x2="-50" y2="100" />
            <line x1="0" y1="-100" x2="0" y2="100" />
            <line x1="50" y1="-100" x2="50" y2="100" strokeWidth="1" stroke="rgba(34, 211, 238, 0.08)" />
          </g>

          {/* Radar Circles */}
          <g stroke="rgba(34, 211, 238, 0.08)" fill="none" strokeWidth="1">
            <circle cx="0" cy="0" r="40" />
            <circle cx="0" cy="0" r="80" strokeDasharray="3 3" />
            <circle cx="0" cy="0" r="100" stroke="rgba(34, 211, 238, 0.15)" />
          </g>

          {/* Obstacles Group */}
          <g id="map-obstacles">
            {obstacles.map((obs, i) => (
              <rect
                key={i}
                x={obs.position[0] - obs.size[0] / 2}
                y={obs.position[2] - obs.size[2] / 2}
                width={obs.size[0]}
                height={obs.size[2]}
                fill="rgba(26, 26, 46, 0.75)"
                stroke={obs.color === "#00ffff" ? "rgba(34, 211, 238, 0.3)" : "rgba(240, 70, 245, 0.3)"}
                strokeWidth="1.2"
                rx="1"
              />
            ))}
          </g>

          {/* Outer Boundary Wall Highlight */}
          <rect
            x="-100"
            y="-100"
            width="200"
            height="200"
            fill="none"
            stroke="rgba(34, 211, 238, 0.25)"
            strokeWidth="1.5"
            strokeDasharray="6 2"
          />

          {/* Other Players (NOT bots) */}
          <g id="map-other-players">
            {Object.values(otherPlayers).map((player) => {
              const [px, , pz] = player.position;
              // Ensure we clip inside the minimap boundary
              if (Math.abs(px) > 100 || Math.abs(pz) > 100) return null;

              return (
                <g key={player.id} className="transition-all duration-100 ease-linear">
                  {/* Ripple pulse circle */}
                  <circle
                    cx={px}
                    cy={pz}
                    r="8"
                    fill="none"
                    stroke={player.color || "#ff00ff"}
                    strokeWidth="1"
                    className="animate-ping origin-center opacity-60"
                    style={{ transformOrigin: `${px}px ${pz}px` }}
                  />
                  {/* Player dot */}
                  <circle
                    cx={px}
                    cy={pz}
                    r="3.5"
                    fill={player.color || "#ff00ff"}
                    stroke="#000"
                    strokeWidth="1"
                    className="shadow-[0_0_8px_rgba(240,70,245,0.8)]"
                  />
                  {/* Name tag for other player */}
                  {!isMobile && (
                    <text
                      x={px}
                      y={pz - 6}
                      textAnchor="middle"
                      fill={player.color || "#ff00ff"}
                      fontSize="6px"
                      fontWeight="bold"
                      className="font-mono bg-black/80 px-[2px] rounded drop-shadow-[0_1px_2px_rgba(0,0,0,1)] select-none pointer-events-none"
                    >
                      {player.name}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* Local Player with FOV cone and marker */}
          <g transform={`translate(${playerPosition[0]}, ${playerPosition[2]})`}>
            {/* Smooth transition properties on elements themselves */}
            {/* FOV Visual Arc (Radius 30, 75 deg FOV) */}
            <path
              d="M 0,0 L -18.26,-23.8 A 30,30 0 0,1 18.26,-23.8 Z"
              fill="url(#fov-gradient)"
              stroke="rgba(34, 211, 238, 0.15)"
              strokeWidth="0.5"
              transform={`rotate(${localPlayerRotationDeg})`}
              className="origin-center"
            />

            {/* Glowing local player dot/arrow */}
            <g transform={`rotate(${localPlayerRotationDeg})`} className="origin-center">
              {/* Directional arrow pointer */}
              <path
                d="M 0,-6 L 4,4 L 0,2 L -4,4 Z"
                fill="#00ffff"
                stroke="#000000"
                strokeWidth="1"
                className="drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]"
              />
            </g>

            {/* Local player inner pulsing core */}
            <circle
              cx="0"
              cy="0"
              r="2"
              fill="#ffffff"
              className="pointer-events-none"
            />
          </g>

          {/* Gradients and Filters definitions */}
          <defs>
            <radialGradient id="fov-gradient" cx="50%" cy="100%" r="100%" fx="50%" fy="100%">
              <stop offset="0%" stopColor="rgba(34, 211, 238, 0.4)" />
              <stop offset="60%" stopColor="rgba(34, 211, 238, 0.1)" />
              <stop offset="100%" stopColor="rgba(34, 211, 238, 0)" />
            </radialGradient>
          </defs>
        </svg>

        {/* Digital Coordinates display below the map */}
        <div className="mt-1 flex justify-between w-full px-1 text-[8px] md:text-[10px] text-cyan-400/60 font-mono tracking-widest uppercase">
          <span>X: {Math.round(playerPosition[0]).toString().padStart(3, ' ')}</span>
          <span className="text-cyan-500/20">|</span>
          <span>Z: {Math.round(playerPosition[2]).toString().padStart(3, ' ')}</span>
          <span className="text-cyan-500/20">|</span>
          <span>W: 200m</span>
        </div>
      </div>

      {/* Cybernetic scanning animation CSS keyframes inside component styling */}
      <style>{`
        @keyframes scan {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(${isMobile ? '136px' : '196px'}); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

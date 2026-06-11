/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useEffect, useState, useMemo } from 'react';
import { Game } from './components/Game';
import { MobileControls } from './components/MobileControls';
import { useGameStore } from './store';
import { Minimap } from './components/Minimap';

function HUD() {
  const gameState = useGameStore(state => state.gameState);
  const gameMode = useGameStore(state => state.gameMode);
  const score = useGameStore(state => state.score);
  const timeLeft = useGameStore(state => state.timeLeft);
  const playerState = useGameStore(state => state.playerState);
  const otherPlayers = useGameStore(state => state.otherPlayers);
  const events = useGameStore(state => state.events);
  const headshotAlerts = useGameStore(state => state.headshotAlerts || []);
  const latestAlert = headshotAlerts[headshotAlerts.length - 1];
  const playerCount = Object.keys(otherPlayers).length + 1;
  const leaveGame = useGameStore(state => state.leaveGame);
  const isMobile = useIsMobile();
  const isPointerLocked = useGameStore(state => state.isPointerLocked);
  const isAiming = useGameStore(state => state.isAiming);
  const weaponHeat = useGameStore(state => state.weaponHeat);
  const isOverheated = useGameStore(state => state.isOverheated);
  const enemies = useGameStore(state => state.enemies);

  const fullLeaderboard = useMemo(() => {
    const list = [
      { name: 'You', score: score, isMe: true }
    ];

    if (gameMode === 'single') {
      list.push(...enemies.map(e => ({
        name: e.name || e.id,
        score: e.score || 0,
        isMe: false
      })));
    } else {
      list.push(...Object.values(otherPlayers).map(p => ({
        name: p.name,
        score: p.score,
        isMe: false
      })));
    }

    return list.sort((a, b) => b.score - a.score);
  }, [score, enemies, otherPlayers, gameMode]);

  const topFive = useMemo(() => fullLeaderboard.slice(0, 5), [fullLeaderboard]);
  
  const myRank = useMemo(() => {
    return fullLeaderboard.findIndex(p => p.isMe);
  }, [fullLeaderboard]);

  return (
    <>
      {/* Standby/Pause Overlay */}
      {!isMobile && !isPointerLocked && (
        <div 
          onClick={() => {
            const canvas = document.querySelector('canvas');
            if (canvas) {
              canvas.requestPointerLock();
            } else {
              document.body.requestPointerLock();
            }
          }}
          className="absolute inset-0 bg-black/60 backdrop-blur-[3px] flex flex-col items-center justify-center z-10 cursor-pointer pointer-events-auto group select-none transition-all duration-300 animate-[fade-in_0.2s_ease-out]"
        >
          {/* Cybernetic Reticle standby prompt */}
          <div className="relative p-6 rounded-2xl border border-cyan-500/20 bg-black/80 backdrop-blur-md text-center max-w-sm mx-4 shadow-[0_0_30px_rgba(6,182,212,0.15)] flex flex-col items-center gap-4">
            
            {/* Reticle icon */}
            <div className="relative w-16 h-16 flex items-center justify-center">
              <div className="absolute inset-0 border border-cyan-400/40 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
              <div className="absolute inset-1 border-2 border-dashed border-cyan-400/30 rounded-full animate-[spin_20s_linear_infinite]" />
              <div className="absolute inset-3 border border-cyan-400/80 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <h2 className="text-cyan-400 text-xl font-black tracking-widest uppercase drop-shadow-[0_0_6px_rgba(34,211,238,0.5)]">
                RETICLE STANDBY
              </h2>
              <p className="text-gray-400 text-xs font-semibold tracking-wider">
                SYSTEM PAUSED / LINK OFFLINE
              </p>
            </div>

            <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

            <div className="text-[11px] text-cyan-400/60 uppercase tracking-widest font-bold leading-relaxed">
              Click anywhere to lock cursor<br />
              and resume gameplay
            </div>

            <div className="text-[10px] text-gray-500 font-semibold tracking-wide flex gap-4 uppercase mt-1">
              <span>WASD: Move</span>
              <span>•</span>
              <span>Mouse: Shoot</span>
            </div>
          </div>
        </div>
      )}

      {/* Crosshair */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center">
        <div className="relative">
          <div className={`border-2 rounded-full transition-all duration-150 ${isAiming ? 'w-2 h-2' : 'w-4 h-4'} ${playerState === 'disabled' ? 'border-red-500' : 'border-cyan-400'}`} />
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full ${playerState === 'disabled' ? 'bg-red-500' : 'bg-cyan-400'}`} />
        </div>

        {/* Neon Weapon Heat Bar */}
        {gameState === 'playing' && playerState === 'active' && (
          <div className="mt-4 flex flex-col items-center w-24 gap-1">
            <div className="w-full h-1 bg-black/40 border border-cyan-500/20 rounded-full overflow-hidden relative shadow-[0_0_10px_rgba(0,0,0,0.5)]">
              <div 
                className={`h-full transition-all duration-100 ease-out shadow-[0_0_8px_currentColor] ${
                  isOverheated 
                    ? 'bg-red-500 text-red-500 animate-pulse' 
                    : weaponHeat > 70 
                      ? 'bg-amber-500 text-amber-500' 
                      : 'bg-cyan-400 text-cyan-400'
                }`}
                style={{ width: `${weaponHeat}%` }}
              />
            </div>
            {isOverheated && (
              <span className="text-[9px] font-black text-red-500 tracking-widest uppercase animate-pulse drop-shadow-[0_0_3px_rgba(239,68,68,0.6)]">
                OVERHEATED
              </span>
            )}
          </div>
        )}

        {!isMobile && !isPointerLocked && <div className="mt-4 text-cyan-400/50 text-xs tracking-widest font-bold">CLICK TO AIM</div>}
      </div>

      {/* HUD Left - Score & Leaderboard */}
      <div className="absolute top-2 left-2 md:top-4 md:left-4 flex flex-col gap-2 md:gap-4 pointer-events-none">
        <div className="text-cyan-400 text-lg md:text-2xl font-bold drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]">
          SCORE: {score.toString().padStart(4, '0')}
        </div>
        
        {/* Leaderboard - Hide on mobile if screen is small, or make smaller */}
        {!isMobile && (
          <div className="bg-black/50 border border-cyan-900/50 p-3 rounded w-56 flex flex-col gap-1">
            <div className="text-cyan-400/70 text-xs font-bold mb-1 border-b border-cyan-900/50 pb-1 uppercase tracking-widest">
              LEADERBOARD
            </div>
            {topFive.map((p, i) => (
              <div 
                key={`${p.name}-${i}`} 
                className={`flex justify-between text-sm ${
                  p.isMe 
                    ? 'text-cyan-400 font-bold drop-shadow-[0_0_4px_rgba(34,211,238,0.5)]' 
                    : 'text-cyan-400/70'
                }`}
              >
                <span className="truncate max-w-[150px]">
                  {i + 1}. {p.name}
                </span>
                <span>{p.score}</span>
              </div>
            ))}
            {myRank >= 5 && (
              <>
                <div className="border-t border-cyan-900/30 my-1 pt-1" />
                <div className="flex justify-between text-sm text-cyan-400 font-bold drop-shadow-[0_0_4px_rgba(34,211,238,0.5)]">
                  <span className="truncate max-w-[150px]">{myRank + 1}. You</span>
                  <span>{score}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      
      {/* HUD Right - Time, Leave, Events */}
      <div className="absolute top-2 right-2 md:top-4 md:right-4 flex flex-col items-end gap-1 md:gap-2 pointer-events-auto z-20">
        {gameState === 'playing' && (
          <div className="text-cyan-400 text-lg md:text-2xl font-bold drop-shadow-[0_0_8px_rgba(34,211,238,0.8)] pointer-events-none">
            TIME: {Math.floor(timeLeft / 60)}:{(Math.floor(timeLeft) % 60).toString().padStart(2, '0')}
          </div>
        )}
        <button
          onClick={leaveGame}
          className="px-2 py-1 md:px-4 md:py-2 bg-red-500/20 border border-red-500 text-red-500 text-xs md:text-sm font-bold rounded hover:bg-red-500 hover:text-black transition-all duration-200"
        >
          LEAVE
        </button>
        {!isMobile && <div className="text-cyan-400/50 text-xs mt-1 pointer-events-none uppercase tracking-widest font-bold">ESC to unlock cursor</div>}

        {/* Event Log */}
        <div className="mt-2 md:mt-4 flex flex-col items-end gap-1 pointer-events-none">
          {events.slice(-3).map(event => (
            <div key={event.id} className="text-[10px] md:text-xs font-bold text-fuchsia-400 bg-black/50 px-2 py-1 rounded border border-fuchsia-900/50 animate-pulse">
              {event.message}
            </div>
          ))}
        </div>
      </div>

      {/* Multiplayer Info */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
        <div className="text-cyan-400 text-[10px] md:text-sm font-bold drop-shadow-[0_0_8px_rgba(34,211,238,0.8)] opacity-70 tracking-widest uppercase">
          {gameMode === 'single' ? 'GRID STATUS: OFFLINE SANDBOX' : `PLAYERS ONLINE: ${playerCount}`}
        </div>
      </div>

      {/* Damage Overlay */}
      {playerState === 'disabled' && (
        <div className="absolute inset-0 bg-red-500/20 pointer-events-none flex items-center justify-center">
          <div className="text-red-500 text-4xl md:text-6xl font-black tracking-widest drop-shadow-[0_0_20px_rgba(239,68,68,1)] animate-pulse text-center">
            SYSTEM DISABLED
          </div>
        </div>
      )}

      {/* Headshot Alert Overlay */}
      {latestAlert && (
        <div key={latestAlert.id} className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none z-30 select-none animate-[headshot-enter_0.35s_cubic-bezier(0.34,1.56,0.64,1)_both] flex flex-col items-center gap-1.5">
          <div className="bg-gradient-to-r from-transparent via-fuchsia-500/90 to-transparent text-white text-lg md:text-2xl font-black tracking-[0.25em] px-12 md:px-20 py-2 border-y border-fuchsia-500 shadow-[0_0_30px_rgba(217,70,239,0.6)] flex items-center gap-3">
            <span className="text-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.6)]">🎯</span>
            HEADSHOT
            <span className="text-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.6)] font-mono text-xl md:text-2xl">+200</span>
          </div>
          <div className="text-fuchsia-400 font-bold tracking-widest text-[9px] md:text-xs uppercase drop-shadow-[0_0_3px_rgba(217,70,239,0.5)]">
            CRITICAL NEURAL TAG LINKED
          </div>
        </div>
      )}

      {/* Mobile Controls */}
      {isMobile && gameState === 'playing' && <MobileControls />}

      {/* Live Minimap */}
      <Minimap />
    </>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
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

export default function App() {
  const gameState = useGameStore(state => state.gameState);
  const gameMode = useGameStore(state => state.gameMode);
  const score = useGameStore(state => state.score);
  const startGame = useGameStore(state => state.startGame);
  const isMobile = useIsMobile();
  const [selectedMode, setSelectedMode] = useState<'single' | 'online' | null>(null);

  return (
    <div className="w-screen h-screen bg-black relative overflow-hidden font-mono select-none">
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes pulse-glow {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.02); filter: brightness(1.15); }
        }
        @keyframes headshot-enter {
          0% { transform: translate(-50%, -20px) scale(0.8); opacity: 0; filter: brightness(2) contrast(1.5); }
          15% { transform: translate(-50%, 0) scale(1.1); opacity: 1; filter: brightness(1.5); }
          30% { transform: translate(-50%, 0) scale(1); filter: brightness(1); }
          100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
        }
      `}</style>

      {/* 3D Canvas */}
      <div className="absolute inset-0">
        <Game />
      </div>

      {/* UI Overlay */}
      {gameState === 'playing' && <HUD />}

      {/* Menus */}
      {gameState === 'menu' && (
        <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center z-10 pointer-events-auto overflow-y-auto px-4 py-8">
          {/* Main Title Section */}
          <div className="text-center mb-8 animate-[fade-in_0.5s_ease-out]">
            <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-cyan-400 mb-3 drop-shadow-[0_0_15px_rgba(34,211,238,0.3)] tracking-tighter uppercase select-none animate-pulse">
              NEON ARENA
            </h1>
            <p className="text-cyan-400/60 font-bold tracking-widest text-xs md:text-sm uppercase mb-4">
              [ Grid System Status: Online ]
            </p>
            <div className="h-[2px] w-48 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent mx-auto" />
          </div>

          {/* Lobby Selection Container */}
          <div className="flex flex-col md:flex-row gap-6 max-w-4xl w-full justify-center mb-8 animate-[fade-in_0.6s_ease-out]">
            
            {/* Solo Link Card */}
            <div 
              onClick={() => setSelectedMode('single')}
              className={`relative flex flex-col p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 w-full md:w-80 bg-black/40 backdrop-blur-md hover:translate-y-[-4px] select-none ${
                selectedMode === 'single' 
                  ? 'border-fuchsia-500 shadow-[0_0_25px_rgba(217,70,239,0.3)] bg-fuchsia-950/10' 
                  : 'border-fuchsia-500/20 hover:border-fuchsia-500/40 hover:shadow-[0_0_15px_rgba(217,70,239,0.15)] bg-black/40'
              }`}
            >
              {/* Glow Indicator */}
              {selectedMode === 'single' && (
                <div className="absolute top-3 right-3 w-3 h-3 bg-fuchsia-500 rounded-full shadow-[0_0_8px_rgba(217,70,239,0.8)] animate-pulse" />
              )}
              
              <h2 className="text-2xl font-black text-fuchsia-400 mb-2 uppercase tracking-wide">
                SOLO LINK
              </h2>
              <p className="text-gray-400 text-xs leading-relaxed mb-4 min-h-[40px]">
                Deploy offline against autonomous tactical AI drones. Perfect for raw reflex and weapon practice.
              </p>
              
              <div className="h-[1px] bg-gradient-to-r from-fuchsia-500/20 to-transparent mb-4" />
              
              <ul className="text-[11px] text-fuchsia-300/80 font-bold tracking-wide flex flex-col gap-2 uppercase">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-fuchsia-500 rounded-full" />
                  Offline Sandbox Mode
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-fuchsia-500 rounded-full" />
                  40 Active Drone Targets
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-fuchsia-500 rounded-full" />
                  No Latency / Local Client
                </li>
              </ul>
            </div>

            {/* Multi Link Card */}
            <div 
              onClick={() => setSelectedMode('online')}
              className={`relative flex flex-col p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 w-full md:w-80 bg-black/40 backdrop-blur-md hover:translate-y-[-4px] select-none ${
                selectedMode === 'online' 
                  ? 'border-cyan-400 shadow-[0_0_25px_rgba(34,211,238,0.3)] bg-cyan-950/10' 
                  : 'border-cyan-500/20 hover:border-cyan-400/40 hover:shadow-[0_0_15px_rgba(34,211,238,0.15)] bg-black/40'
              }`}
            >
              {/* Glow Indicator */}
              {selectedMode === 'online' && (
                <div className="absolute top-3 right-3 w-3 h-3 bg-cyan-400 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse" />
              )}
              
              <h2 className="text-2xl font-black text-cyan-400 mb-2 uppercase tracking-wide">
                MULTI LINK
              </h2>
              <p className="text-gray-400 text-xs leading-relaxed mb-4 min-h-[40px]">
                Sync onto the global grid. Hunt tactical drones alongside other players in real-time.
              </p>
              
              <div className="h-[1px] bg-gradient-to-r from-cyan-500/20 to-transparent mb-4" />
              
              <ul className="text-[11px] text-cyan-300/80 font-bold tracking-wide flex flex-col gap-2 uppercase">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
                  Synchronized Grid Match
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
                  Real-time Global Leaderboard
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
                  Cooperative Drone Hunt
                </li>
              </ul>
            </div>

          </div>

          {/* Sliding Action Button Section */}
          <div className="h-20 w-full max-w-sm flex items-center justify-center relative overflow-hidden">
            <div className={`w-full transition-all duration-500 transform ${
              selectedMode 
                ? 'translate-y-0 opacity-100' 
                : 'translate-y-8 opacity-0 pointer-events-none'
            }`}>
              <button
                onClick={() => {
                  if (selectedMode) {
                    startGame(selectedMode);
                  }
                }}
                className={`w-full py-4 text-lg font-black tracking-widest rounded-xl border-2 transition-all duration-300 active:scale-95 cursor-pointer ${
                  selectedMode === 'single'
                    ? 'bg-fuchsia-500/20 border-fuchsia-400 text-fuchsia-400 hover:bg-fuchsia-400 hover:text-black hover:shadow-[0_0_30px_rgba(217,70,239,0.6)] shadow-[0_0_15px_rgba(217,70,239,0.3)]'
                    : 'bg-cyan-500/20 border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black hover:shadow-[0_0_30px_rgba(34,211,238,0.6)] shadow-[0_0_15px_rgba(34,211,238,0.3)]'
                }`}
                style={{
                  animation: 'pulse-glow 2s infinite ease-in-out'
                }}
              >
                INITIALIZE LINK
              </button>
            </div>
          </div>

          {/* Quick Info/Controls Footer */}
          <div className="mt-8 text-center text-[10px] text-gray-500 uppercase tracking-widest font-bold flex gap-4 animate-[fade-in_0.8s_ease-out]">
            <span>WASD: Move</span>
            <span>•</span>
            <span>Mouse: Look & Shoot</span>
            <span>•</span>
            <span>Esc: Release Mouse</span>
          </div>
        </div>
      )}

      {gameState === 'gameover' && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10 pointer-events-auto">
          <h1 className="text-6xl font-black text-red-500 mb-4 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)] tracking-tighter">
            GAME OVER
          </h1>
          <div className="text-3xl text-cyan-400 mb-8 font-bold">
            FINAL SCORE: {score}
          </div>
          <button
            id="start-button"
            onClick={() => startGame(gameMode || 'online')}
            className={`px-8 py-4 border-2 text-xl font-bold rounded hover:text-black transition-all duration-200 cursor-pointer ${
              gameMode === 'single'
                ? 'bg-fuchsia-500/20 border-fuchsia-400 text-fuchsia-400 hover:bg-fuchsia-400 hover:shadow-[0_0_25px_rgba(217,70,239,0.5)] shadow-[0_0_15px_rgba(217,70,239,0.2)]'
                : 'bg-cyan-500/20 border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black hover:shadow-[0_0_25px_rgba(34,211,238,0.5)] shadow-[0_0_15px_rgba(34,211,238,0.2)]'
            }`}
          >
            PLAY AGAIN
          </button>
        </div>
      )}
    </div>
  );
}

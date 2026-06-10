/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { create } from 'zustand';
import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';

export type GameState = 'menu' | 'playing' | 'gameover';
export type EntityState = 'active' | 'disabled';

export interface EnemyData {
  id: string;
  position: [number, number, number];
  state: EntityState;
  disabledUntil: number;
}

export interface PlayerData {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: number;
  state: EntityState;
  disabledUntil: number;
  score: number;
  color: string;
}

export interface LaserData {
  id: string;
  start: [number, number, number];
  end: [number, number, number];
  timestamp: number;
  color: string;
}

export interface ParticleData {
  id: string;
  position: [number, number, number];
  timestamp: number;
  color: string;
}

export interface GameEvent {
  id: string;
  message: string;
  timestamp: number;
}

interface GameStore {
  gameState: GameState;
  gameMode: 'single' | 'online' | null;
  score: number;
  timeLeft: number;
  playerState: EntityState;
  playerDisabledUntil: number;
  enemies: EnemyData[];
  lasers: LaserData[];
  particles: ParticleData[];
  events: GameEvent[];
  playerPosition: [number, number, number];
  playerRotation: number;
  isPointerLocked: boolean;
  setPointerLocked: (locked: boolean) => void;
  
  // Multiplayer
  socket: Socket | null;
  otherPlayers: Record<string, PlayerData>;

  startGame: (mode?: 'single' | 'online') => void;
  endGame: () => void;
  leaveGame: () => void;
  updateTime: (delta: number) => void;
  hitPlayer: () => void;
  hitEnemy: (id: string, byPlayer?: boolean) => void;
  addLaser: (start: [number, number, number], end: [number, number, number], color: string) => void;
  addParticles: (position: [number, number, number], color: string) => void;
  addEvent: (message: string) => void;
  updateEnemies: (time: number) => void;
  cleanupEffects: (time: number) => void;
  setPlayerState: (state: EntityState) => void;
  
  // Multiplayer actions
  updatePlayerPosition: (position: [number, number, number], rotation: number) => void;

  // Mobile Controls
  mobileInput: {
    move: { x: number, y: number };
    look: { x: number, y: number };
    shooting: boolean;
  };
  setMobileInput: (input: Partial<{
    move: { x: number, y: number };
    look: { x: number, y: number };
    shooting: boolean;
  }>) => void;
}

function mulberry32(a: number) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

function isPositionClear(x: number, z: number, obstacles: any[]) {
  if (Math.abs(x) > 90 || Math.abs(z) > 90) return false;
  
  const safetyMargin = 3.5;
  for (const obs of obstacles) {
    if (!obs) continue;
    const [ox, , oz] = obs.position;
    const [ow, , od] = obs.size;
    
    const minX = ox - ow / 2 - safetyMargin;
    const maxX = ox + ow / 2 + safetyMargin;
    const minZ = oz - od / 2 - safetyMargin;
    const maxZ = oz + od / 2 + safetyMargin;
    
    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
      return false;
    }
  }
  return true;
}

function findClearPosition(cx: number, cz: number, obstacles: any[]): [number, number, number] {
  if (isPositionClear(cx, cz, obstacles)) {
    return [cx, 1, cz];
  }
  
  const step = 2;
  for (let r = 1; r < 20; r++) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      const x = cx + Math.cos(angle) * r * step;
      const z = cz + Math.sin(angle) * r * step;
      if (isPositionClear(x, z, obstacles)) {
        return [x, 1, z];
      }
    }
  }
  
  return [cx, 1, cz];
}

function generatePredefinedSpawns(): [number, number, number][] {
  const count = 150;
  const rngLocal = mulberry32(12345);
  const obstacles = Array.from({ length: count }).map(() => {
    const x = (rngLocal() - 0.5) * 170;
    const z = (rngLocal() - 0.5) * 170;
    
    if (Math.abs(x) < 20 && Math.abs(z) < 20) return null;

    const height = rngLocal() * 8 + 6;
    const isHorizontal = rngLocal() > 0.5;
    const width = isHorizontal ? rngLocal() * 25 + 10 : rngLocal() * 3 + 1;
    const depth = isHorizontal ? rngLocal() * 3 + 1 : rngLocal() * 25 + 10;

    return { position: [x, height / 2 - 0.5, z], size: [width, height, depth] };
  }).filter(Boolean);

  const coords = [-80, -40, 0, 40, 80];
  const spawns: [number, number, number][] = [];

  for (const cx of coords) {
    for (const cz of coords) {
      spawns.push(findClearPosition(cx, cz, obstacles));
    }
  }

  return spawns;
}

const SPAWN_LOCATIONS = generatePredefinedSpawns();

function generateInitialEnemies(spawns: [number, number, number][]): EnemyData[] {
  const enemies: EnemyData[] = [];
  let botIndex = 1;
  for (let i = 0; i < spawns.length; i++) {
    if (i === 12) continue; // Skip index 12 (center map area [0, 1, 0]) for player spawn
    enemies.push({
      id: `bot-${botIndex++}`,
      position: spawns[i],
      state: 'active',
      disabledUntil: 0
    });
  }
  return enemies;
}

const INITIAL_ENEMIES: EnemyData[] = [
  { id: 'bot-1', position: [40, 1, 40], state: 'active', disabledUntil: 0 },
  { id: 'bot-2', position: [-40, 1, 40], state: 'active', disabledUntil: 0 },
  { id: 'bot-3', position: [40, 1, -40], state: 'active', disabledUntil: 0 },
  { id: 'bot-4', position: [-40, 1, -40], state: 'active', disabledUntil: 0 },
  { id: 'bot-5', position: [0, 1, -50], state: 'active', disabledUntil: 0 },
  { id: 'bot-6', position: [60, 1, 0], state: 'active', disabledUntil: 0 },
  { id: 'bot-7', position: [-60, 1, 0], state: 'active', disabledUntil: 0 },
  { id: 'bot-8', position: [0, 1, 50], state: 'active', disabledUntil: 0 },
];

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: 'menu',
  gameMode: null,
  score: 0,
  timeLeft: 120, // 2 minutes
  playerState: 'active',
  playerDisabledUntil: 0,
  enemies: [],
  lasers: [],
  particles: [],
  events: [],
  playerPosition: [0, 2, 0],
  playerRotation: 0,
  isPointerLocked: false,
  
  socket: null,
  otherPlayers: {},

  mobileInput: {
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    shooting: false
  },

  setMobileInput: (input) => set((state) => ({
    mobileInput: { ...state.mobileInput, ...input }
  })),

  startGame: (mode = 'online') => {
    const { socket } = get();
    
    if (socket) {
      socket.disconnect();
    }

    if (mode === 'single') {
      const spawns = SPAWN_LOCATIONS;
      const initialEnemies = generateInitialEnemies(spawns);
      const playerSpawn = spawns[12];
      
      set({
        gameState: 'playing',
        gameMode: 'single',
        score: 0,
        timeLeft: 120,
        playerState: 'active',
        playerDisabledUntil: 0,
        enemies: initialEnemies,
        lasers: [],
        particles: [],
        events: [{ id: Math.random().toString(), message: "Solo Link Established. Have fun!", timestamp: Date.now() }],
        socket: null,
        otherPlayers: {},
        isPointerLocked: false,
        playerPosition: [playerSpawn[0], 2, playerSpawn[2]],
      });
      return;
    }

    let newSocket: Socket | null = null;

    // Initialize multiplayer
    newSocket = io(window.location.origin);
    
    newSocket.on('connect', () => {
      newSocket!.emit('joinGame');
    });

    newSocket.on('gameError', (msg: string) => {
      alert(msg);
      get().leaveGame();
    });

    newSocket.on('gameJoined', (players: Record<string, PlayerData>) => {
      const otherPlayers = { ...players };
      delete otherPlayers[newSocket!.id!];
      set({ 
        otherPlayers,
        gameState: 'playing',
        gameMode: 'online',
        timeLeft: 120,
        score: 0,
        enemies: INITIAL_ENEMIES.map(e => ({ ...e, state: 'active', disabledUntil: 0 }))
      });
    });

    newSocket.on('playerJoined', (player: PlayerData) => {
      set(state => ({
        otherPlayers: { ...state.otherPlayers, [player.id]: player },
        events: [...state.events, { id: Math.random().toString(), message: `${player.name} joined`, timestamp: Date.now() }]
      }));
    });

    newSocket.on('playerMoved', (data: { id: string, position: [number, number, number], rotation: number }) => {
      set(state => {
        if (!state.otherPlayers[data.id]) return state;
        return {
          otherPlayers: {
            ...state.otherPlayers,
            [data.id]: {
              ...state.otherPlayers[data.id],
              position: data.position,
              rotation: data.rotation
            }
          }
        };
      });
    });

    newSocket.on('playerShot', (data: { id: string, start: [number, number, number], end: [number, number, number], color: string }) => {
      set(state => ({
        lasers: [...state.lasers, { id: Math.random().toString(36).substr(2, 9), start: data.start, end: data.end, timestamp: Date.now(), color: data.color }],
        particles: [...state.particles, { id: Math.random().toString(36).substr(2, 9), position: data.end, timestamp: Date.now(), color: data.color }]
      }));
    });

    newSocket.on('playerHit', (data: { targetId: string, shooterId: string, targetDisabledUntil: number, shooterScore: number }) => {
      set(state => {
        const now = Date.now();
        const isLocalShooter = data.shooterId === newSocket!.id;
        const isLocalTarget = data.targetId === newSocket!.id;
        
        const shooterName = isLocalShooter ? 'You' : (state.otherPlayers[data.shooterId]?.name || 'Unknown');
        const targetName = isLocalTarget ? 'You' : (state.otherPlayers[data.targetId]?.name || 'Unknown');
        const eventMsg = `${shooterName} tagged ${targetName}`;
        const newEvent = { id: Math.random().toString(), message: eventMsg, timestamp: now };

        let newState: Partial<GameStore> = {
          events: [...state.events, newEvent]
        };

        if (isLocalTarget) {
          newState.playerState = 'disabled';
          newState.playerDisabledUntil = data.targetDisabledUntil;
        }

        if (isLocalShooter) {
          newState.score = data.shooterScore;
        }

        // Update other players' states
        const players = { ...state.otherPlayers };
        let playersChanged = false;

        if (!isLocalTarget && players[data.targetId]) {
          players[data.targetId] = {
            ...players[data.targetId],
            state: 'disabled',
            disabledUntil: data.targetDisabledUntil
          };
          playersChanged = true;
        }

        if (!isLocalShooter && players[data.shooterId]) {
          players[data.shooterId] = {
            ...players[data.shooterId],
            score: data.shooterScore
          };
          playersChanged = true;
        }

        if (playersChanged) {
          newState.otherPlayers = players;
        }

        return newState;
      });
    });

    newSocket.on('playerLeft', (id: string) => {
      set(state => {
        const players = { ...state.otherPlayers };
        const playerName = players[id]?.name || 'Unknown';
        delete players[id];
        return { 
          otherPlayers: players,
          events: [...state.events, { id: Math.random().toString(), message: `${playerName} left`, timestamp: Date.now() }]
        };
      });
    });

    set({
      gameState: 'playing',
      gameMode: 'online',
      score: 0,
      timeLeft: 120,
      playerState: 'active',
      playerDisabledUntil: 0,
      enemies: INITIAL_ENEMIES.map(e => ({ ...e, state: 'active', disabledUntil: 0 })),
      lasers: [],
      particles: [],
      events: [],
      socket: newSocket,
      otherPlayers: {},
      isPointerLocked: false,
    });
  },

  endGame: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    set({ gameState: 'gameover', socket: null, isPointerLocked: false });
  },

  leaveGame: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    set({
      gameState: 'menu',
      gameMode: null,
      socket: null,
      otherPlayers: {},
      enemies: [],
      lasers: [],
      particles: [],
      events: [],
      score: 0,
      timeLeft: 120,
      playerState: 'active',
      isPointerLocked: false
    });
  },

  updateTime: (delta) => set((state) => {
    if (state.gameState !== 'playing') return state;
    const newTime = state.timeLeft - delta;
    if (newTime <= 0) {
      if (state.socket) state.socket.disconnect();
      return { timeLeft: 0, gameState: 'gameover', socket: null, roomId: null };
    }
    return { timeLeft: newTime };
  }),

  hitPlayer: () => set((state) => {
    if (state.playerState === 'disabled' || state.gameState !== 'playing') return state;
    return {
      playerState: 'disabled',
      playerDisabledUntil: Date.now() + 3000,
      score: Math.max(0, state.score - 50), // Penalty for getting hit
    };
  }),

  hitEnemy: (id, byPlayer = false) => set((state) => {
    if (state.gameState !== 'playing') return state;
    
    // Check if it's a multiplayer player
    if (state.socket && state.otherPlayers[id]) {
      state.socket.emit('hitPlayer', id);
      return state;
    }

    const enemies = state.enemies.map(e => {
      if (e.id === id && e.state === 'active') {
        return { ...e, state: 'disabled' as EntityState, disabledUntil: Date.now() + 3000 };
      }
      return e;
    });
    return {
      enemies,
      score: byPlayer ? state.score + 100 : state.score, // Points for hitting enemy
      events: byPlayer ? [...state.events, { id: Math.random().toString(), message: `You tagged ${id}`, timestamp: Date.now() }] : state.events
    };
  }),

  addLaser: (start, end, color) => {
    const { socket } = get();
    if (socket) {
      socket.emit('shoot', { start, end, color });
    }
    set((state) => ({
      lasers: [...state.lasers, { id: Math.random().toString(36).substr(2, 9), start, end, timestamp: Date.now(), color }]
    }));
  },

  addParticles: (position, color) => set((state) => ({
    particles: [...state.particles, { id: Math.random().toString(36).substr(2, 9), position, timestamp: Date.now(), color }]
  })),

  addEvent: (message) => set((state) => ({
    events: [...state.events, { id: Math.random().toString(), message, timestamp: Date.now() }]
  })),

  updateEnemies: (time) => set((state) => {
    let changed = false;
    const enemies = state.enemies.map(e => {
      if (e.state === 'disabled' && time > e.disabledUntil) {
        changed = true;
        const randomSpawn = SPAWN_LOCATIONS[Math.floor(Math.random() * SPAWN_LOCATIONS.length)];
        return { 
          ...e, 
          state: 'active' as EntityState,
          position: randomSpawn
        };
      }
      return e;
    });
    
    // Also update other players' states
    let otherPlayers = state.otherPlayers;
    let playersChanged = false;
    Object.values(state.otherPlayers).forEach(p => {
      if (p.state === 'disabled' && time > p.disabledUntil) {
        if (!playersChanged) {
          otherPlayers = { ...state.otherPlayers };
          playersChanged = true;
        }
        otherPlayers[p.id] = { ...p, state: 'active' };
      }
    });

    if (state.playerState === 'disabled' && time > state.playerDisabledUntil) {
      const randomSpawn = SPAWN_LOCATIONS[Math.floor(Math.random() * SPAWN_LOCATIONS.length)];
      const nextPlayerPosition: [number, number, number] = [randomSpawn[0], 2, randomSpawn[2]];
      
      const newEvent = { 
        id: Math.random().toString(), 
        message: "You respawned at a new sector", 
        timestamp: Date.now() 
      };
      
      return { 
        enemies, 
        playerState: 'active', 
        playerPosition: nextPlayerPosition,
        events: [...state.events, newEvent],
        otherPlayers: playersChanged ? otherPlayers : state.otherPlayers 
      };
    }
    return changed || playersChanged ? { enemies, otherPlayers } : state;
  }),

  cleanupEffects: (time) => set((state) => {
    const lasers = state.lasers.filter(l => time - l.timestamp < 200); // Lasers last 200ms
    const particles = state.particles.filter(p => time - p.timestamp < 500); // Particles last 500ms
    const events = state.events.filter(e => time - e.timestamp < 5000); // Events last 5s
    if (lasers.length !== state.lasers.length || particles.length !== state.particles.length || events.length !== state.events.length) {
      return { lasers, particles, events };
    }
    return state;
  }),

  setPlayerState: (playerState) => set({ playerState }),
  
  setPointerLocked: (isPointerLocked) => set({ isPointerLocked }),

  updatePlayerPosition: (position, rotation) => {
    const { socket } = get();
    if (socket) {
      socket.emit('updatePosition', { position, rotation });
    }
    set({ playerPosition: position, playerRotation: rotation });
  }
}));

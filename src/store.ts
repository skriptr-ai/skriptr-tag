/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { create } from 'zustand';
import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
import { BOT_NAMES } from './botNames';

export type GameState = 'menu' | 'playing' | 'gameover';
export type EntityState = 'active' | 'disabled';

export interface EnemyData {
  id: string;
  position: [number, number, number];
  state: EntityState;
  disabledUntil: number;
  type?: 'seeker' | 'hunter';
  name?: string;
  score?: number;
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

export interface LobbySummary {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  status: 'waiting' | 'playing';
  countdown: number;
}

export interface LobbyData {
  id: string;
  name: string;
  players: Record<string, PlayerData>;
  countdown: number;
  status: 'waiting' | 'playing';
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
  headshotAlerts: { id: string; timestamp: number }[];
  playerPosition: [number, number, number];
  playerRotation: number;
  playerPositionEpoch: number;
  isPointerLocked: boolean;
  setPointerLocked: (locked: boolean) => void;
  
  // Aiming & Weapon Heat States
  isAiming: boolean;
  setAiming: (aiming: boolean) => void;
  weaponHeat: number;
  isOverheated: boolean;
  lastHeatDecayTime: number;
  addShotHeat: () => boolean;
  
  // Multiplayer
  socket: Socket | null;
  otherPlayers: Record<string, PlayerData>;
  onlineMenuState: 'none' | 'browser' | 'waiting';
  activeLobbies: LobbySummary[];
  currentLobby: LobbyData | null;

  getLobbies: () => void;
  createLobby: (name: string) => void;
  joinLobby: (lobbyId: string) => void;
  leaveLobby: () => void;

  startGame: (mode?: 'single' | 'online') => void;
  endGame: () => void;
  leaveGame: () => void;
  updateTime: (delta: number) => void;
  hitPlayer: (botId?: string) => void;
  hitEnemy: (id: string, byPlayer?: boolean, isHeadshot?: boolean, shooterId?: string) => void;
  addLaser: (start: [number, number, number], end: [number, number, number], color: string) => void;
  addParticles: (position: [number, number, number], color: string) => void;
  addEvent: (message: string) => void;
  updateEnemies: (time: number) => void;
  cleanupEffects: (time: number) => void;
  setPlayerState: (state: EntityState) => void;
  forceRespawn: () => void;
  
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
  winnerName: string | null;
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
  }).filter(Boolean) as { position: [number, number, number]; size: [number, number, number] }[];

  // 10x10 grid coordinates to produce exactly 100 unique spawns
  const coordsX = [-75, -58, -42, -25, -8, 8, 25, 42, 58, 75];
  const coordsZ = [-75, -58, -42, -25, -8, 8, 25, 42, 58, 75];
  const spawns: [number, number, number][] = [];

  for (const cx of coordsX) {
    for (const cz of coordsZ) {
      spawns.push(findClearPosition(cx, cz, obstacles));
    }
  }

  // --- Breadth-First Search (BFS) Connectivity Filter ---
  // Construct a discrete 2D grid to flood fill and identify fully-connected walkable areas.
  const GRID_MIN = -100;
  const GRID_MAX = 100;
  const RESOLUTION = 1.0; // 1-meter cell size
  const SIZE = Math.round((GRID_MAX - GRID_MIN) / RESOLUTION) + 1;

  function toGrid(val: number) {
    return Math.round((val - GRID_MIN) / RESOLUTION);
  }

  // Uint8Array for performance. 1 = walkable, 0 = blocked
  const walkableGrid = new Uint8Array(SIZE * SIZE).fill(1);

  // Mark all obstacle-occupied areas as blocked, expanding by player collision radius (0.6m for safety padding)
  const PLAYER_PADDING = 0.6;
  for (const obs of obstacles) {
    const [ox, , oz] = obs.position;
    const [ow, , od] = obs.size;

    const minX = ox - ow / 2 - PLAYER_PADDING;
    const maxX = ox + ow / 2 + PLAYER_PADDING;
    const minZ = oz - od / 2 - PLAYER_PADDING;
    const maxZ = oz + od / 2 + PLAYER_PADDING;

    const startX = Math.max(0, toGrid(minX));
    const endX = Math.min(SIZE - 1, toGrid(maxX));
    const startZ = Math.max(0, toGrid(minZ));
    const endZ = Math.min(SIZE - 1, toGrid(maxZ));

    for (let x = startX; x <= endX; x++) {
      for (let z = startZ; z <= endZ; z++) {
        walkableGrid[x * SIZE + z] = 0; // Blocked
      }
    }
  }

  // Flood-fill / BFS starting from the absolute map center [0, 0] (always open)
  const visited = new Uint8Array(SIZE * SIZE);
  const queue: [number, number][] = [];

  const startX = toGrid(0);
  const startZ = toGrid(0);

  if (walkableGrid[startX * SIZE + startZ] === 1) {
    queue.push([startX, startZ]);
    visited[startX * SIZE + startZ] = 1;
  }

  while (queue.length > 0) {
    const [cx, cz] = queue.shift()!;

    const neighbors = [
      [cx + 1, cz],
      [cx - 1, cz],
      [cx, cz + 1],
      [cx, cz - 1]
    ];

    for (const [nx, nz] of neighbors) {
      if (nx >= 0 && nx < SIZE && nz >= 0 && nz < SIZE) {
        const idx = nx * SIZE + nz;
        if (walkableGrid[idx] === 1 && visited[idx] === 0) {
          visited[idx] = 1;
          queue.push([nx, nz]);
        }
      }
    }
  }

  // Filter out any spawn points that are unreachable/isolated from the map center
  const connectedSpawns = spawns.filter(spawn => {
    const gx = toGrid(spawn[0]);
    const gz = toGrid(spawn[2]);
    if (gx < 0 || gx >= SIZE || gz < 0 || gz >= SIZE) return false;
    return visited[gx * SIZE + gz] === 1;
  });

  // If for some reason a complete map failure blocks center (should be impossible), fall back to original spawns
  if (connectedSpawns.length === 0) {
    return spawns;
  }

  return connectedSpawns;
}

const SPAWN_LOCATIONS = generatePredefinedSpawns();

function generateInitialEnemies(spawns: [number, number, number][]): EnemyData[] {
  const enemies: EnemyData[] = [];
  let botIndex = 1;
  const playerSpawnIndex = Math.floor(spawns.length / 2);
  
  for (let i = 0; i < spawns.length; i++) {
    if (i === playerSpawnIndex) continue; // Skip the center map area spawn for the player
    if (enemies.length >= 40) break; // Limit to exactly 40 bots
    
    // 20% are elite hunters (every 5th bot)
    const type = (botIndex % 5 === 0) ? 'hunter' : 'seeker';
    
    // Assign curated famous tech entrepreneur name
    const name = BOT_NAMES[botIndex - 1] || `Bot ${botIndex}`;

    enemies.push({
      id: `bot-${botIndex++}`,
      position: spawns[i],
      state: 'active',
      disabledUntil: 0,
      type,
      name,
      score: 0
    });
  }
  return enemies;
}

function findSafeSpawn(spawns: [number, number, number][], enemies: EnemyData[]): [number, number, number] {
  const activeEnemies = enemies.filter(e => e.state === 'active');
  if (activeEnemies.length === 0) {
    return spawns[Math.floor(Math.random() * spawns.length)];
  }

  // Calculate the minimum distance to any active enemy for each spawn
  const scoredSpawns = spawns.map(spawn => {
    let minDistance = Infinity;
    for (const enemy of activeEnemies) {
      const dx = spawn[0] - enemy.position[0];
      const dz = spawn[2] - enemy.position[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < minDistance) {
        minDistance = dist;
      }
    }
    return { spawn, minDistance };
  });

  // Sort by minDistance descending (safest spawns first)
  scoredSpawns.sort((a, b) => b.minDistance - a.minDistance);

  // Pick a random spawn from the top 15 safest spawns to ensure variety
  const poolSize = Math.min(15, scoredSpawns.length);
  const randomIndex = Math.floor(Math.random() * poolSize);
  return scoredSpawns[randomIndex].spawn;
}

function findSafeSpawnMultiplayer(spawns: [number, number, number][], otherPlayers: Record<string, PlayerData>): [number, number, number] {
  const activePlayers = Object.values(otherPlayers).filter(p => p.state === 'active');
  if (activePlayers.length === 0) {
    return spawns[Math.floor(Math.random() * spawns.length)];
  }

  // Calculate the minimum distance to any active player for each spawn
  const scoredSpawns = spawns.map(spawn => {
    let minDistance = Infinity;
    for (const player of activePlayers) {
      if (!player.position) continue;
      const dx = spawn[0] - player.position[0];
      const dz = spawn[2] - player.position[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < minDistance) {
        minDistance = dist;
      }
    }
    return { spawn, minDistance };
  });

  // Sort by minDistance descending (safest spawns first)
  scoredSpawns.sort((a, b) => b.minDistance - a.minDistance);

  // Pick a random spawn from the top 15 safest spawns to ensure variety
  const poolSize = Math.min(15, scoredSpawns.length);
  const randomIndex = Math.floor(Math.random() * poolSize);
  return scoredSpawns[randomIndex].spawn;
}

function findSafeSpawnForBot(
  spawns: [number, number, number][],
  playerPosition: [number, number, number],
  playerActive: boolean,
  enemies: EnemyData[],
  selfId: string
): [number, number, number] {
  const activeEnemies = enemies.filter(e => e.state === 'active' && e.id !== selfId);
  
  const scoredSpawns = spawns.map(spawn => {
    let playerDist = Infinity;
    if (playerActive) {
      const dx = spawn[0] - playerPosition[0];
      const dz = spawn[2] - playerPosition[2];
      playerDist = Math.sqrt(dx * dx + dz * dz);
    }

    let minBotDist = Infinity;
    for (const enemy of activeEnemies) {
      const dx = spawn[0] - enemy.position[0];
      const dz = spawn[2] - enemy.position[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < minBotDist) {
        minBotDist = dist;
      }
    }

    // High score means far from both player and other bots
    let score = Math.min(playerDist, 40) + Math.min(minBotDist, 15);
    if (playerDist < 15) score -= 1000; // Heavily penalize spawning too close to the player
    if (minBotDist < 4) score -= 500;   // Heavily penalize spawning on top of another bot

    return { spawn, score };
  });

  scoredSpawns.sort((a, b) => b.score - a.score);

  const poolSize = Math.min(15, scoredSpawns.length);
  const randomIndex = Math.floor(Math.random() * poolSize);
  return scoredSpawns[randomIndex].spawn;
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
  headshotAlerts: [],
  playerPosition: [0, 2, 0],
  playerRotation: 0,
  playerPositionEpoch: 0,
  isPointerLocked: false,
  winnerName: null,

  // Aiming & Weapon Heat States
  isAiming: false,
  setAiming: (isAiming) => set({ isAiming }),
  weaponHeat: 0,
  isOverheated: false,
  lastHeatDecayTime: Date.now(),
  addShotHeat: () => {
    const state = get();
    if (state.isOverheated || state.playerState === 'disabled' || state.gameState !== 'playing') {
      return false;
    }
    const nextHeat = Math.min(100, state.weaponHeat + 20); // 5 rapid shots to overheat
    const nextOverheated = nextHeat >= 100;
    set({
      weaponHeat: nextHeat,
      isOverheated: nextOverheated,
      lastHeatDecayTime: Date.now()
    });
    return true;
  },
  
  socket: null,
  otherPlayers: {},
  onlineMenuState: 'none',
  activeLobbies: [],
  currentLobby: null,

  getLobbies: () => {
    const s = get().socket;
    if (s) s.emit('getLobbies');
  },
  createLobby: (name) => {
    const s = get().socket;
    if (s) s.emit('createLobby', { name });
  },
  joinLobby: (lobbyId) => {
    const s = get().socket;
    if (s) s.emit('joinLobby', lobbyId);
  },
  leaveLobby: () => {
    const s = get().socket;
    if (s) s.emit('leaveLobby');
    set({ onlineMenuState: 'browser', currentLobby: null, otherPlayers: {} });
  },

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
       // Use our safe spawn algorithm to find a secure, secluded sector furthest from any initial bots
       const playerSpawn = findSafeSpawn(spawns, initialEnemies);
      
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
        headshotAlerts: [],
        socket: null,
        otherPlayers: {},
        isPointerLocked: false,
        playerPosition: [playerSpawn[0], 2, playerSpawn[2]],
        playerPositionEpoch: Date.now(),
        winnerName: null,
        onlineMenuState: 'none',
        currentLobby: null
      });
      return;
    }

    let newSocket: Socket | null = null;

    // Initialize multiplayer
    newSocket = io(window.location.origin);
    
    newSocket.on('connect', () => {
      newSocket!.emit('getLobbies');
    });

    newSocket.on('gameError', (msg: string) => {
      alert(msg);
      set({ onlineMenuState: 'browser', currentLobby: null });
    });

    newSocket.on('lobbiesList', (summary: LobbySummary[]) => {
      set({ activeLobbies: summary });
    });

    newSocket.on('lobbyCreated', (lobbyId: string) => {
      newSocket!.emit('joinLobby', lobbyId);
    });

    newSocket.on('lobbyJoined', (lobby: LobbyData) => {
      set({
        currentLobby: lobby,
        onlineMenuState: 'waiting',
        otherPlayers: {}, // Clear for lobby setup, we will populate players when game starts
      });
    });

    newSocket.on('lobbyUpdated', (data: { players: Record<string, PlayerData>, countdown: number, status: 'waiting' | 'playing' }) => {
      set(state => {
        if (!state.currentLobby) return state;
        return {
          currentLobby: {
            ...state.currentLobby,
            players: data.players,
            countdown: data.countdown,
            status: data.status
          }
        };
      });
    });

    newSocket.on('gameStarted', (players: Record<string, PlayerData>) => {
      const otherPlayers = { ...players };
      delete otherPlayers[newSocket!.id!];
      
      const spawns = SPAWN_LOCATIONS;
      const safeSpawn = findSafeSpawnMultiplayer(spawns, otherPlayers);
      const playerSpawn: [number, number, number] = [safeSpawn[0], 2, safeSpawn[2]];

      set({ 
        otherPlayers,
        gameState: 'playing',
        gameMode: 'online',
        onlineMenuState: 'none',
        timeLeft: 120,
        score: 0,
        enemies: [],
        headshotAlerts: [],
        playerPosition: playerSpawn,
        playerPositionEpoch: Date.now()
      });

      newSocket!.emit('updatePosition', { position: playerSpawn, rotation: 0 });
    });

    newSocket.on('playerJoined', (player: PlayerData) => {
      if (get().gameState === 'playing') {
        set(state => ({
          otherPlayers: { ...state.otherPlayers, [player.id]: player },
          events: [...state.events, { id: Math.random().toString(), message: `${player.name} joined`, timestamp: Date.now() }]
        }));
      }
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

    newSocket.on('playerHit', (data: { targetId: string, shooterId: string, targetDisabledUntil: number, shooterScore: number, isHeadshot?: boolean }) => {
      set(state => {
        const now = Date.now();
        const isLocalShooter = data.shooterId === newSocket!.id;
        const isLocalTarget = data.targetId === newSocket!.id;
        
        const shooterName = isLocalShooter ? 'You' : (state.otherPlayers[data.shooterId]?.name || 'Unknown');
        const targetName = isLocalTarget ? 'You' : (state.otherPlayers[data.targetId]?.name || 'Unknown');
        
        const isHeadshot = !!data.isHeadshot;
        const eventMsg = isHeadshot 
          ? `HEADSHOT! ${shooterName} tagged ${targetName}` 
          : `${shooterName} tagged ${targetName}`;
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

        const newAlerts = isLocalShooter && isHeadshot 
          ? [...(state.headshotAlerts || []), { id: Math.random().toString(), timestamp: now }] 
          : (state.headshotAlerts || []);
        newState.headshotAlerts = newAlerts;

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

        // Check for 1000 points winning condition
        if (data.shooterScore >= 1000) {
          if (newSocket) {
            newSocket.disconnect();
          }
          return {
            ...newState,
            gameState: 'gameover' as GameState,
            winnerName: shooterName,
            socket: null,
            isPointerLocked: false,
            onlineMenuState: 'none',
            currentLobby: null,
            events: [...state.events, newEvent, { id: Math.random().toString(), message: `${shooterName} HAS WON THE MATCH!`, timestamp: Date.now() }]
          };
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
      gameState: 'menu',
      gameMode: 'online',
      onlineMenuState: 'browser',
      activeLobbies: [],
      currentLobby: null,
      score: 0,
      timeLeft: 120,
      playerState: 'active',
      playerDisabledUntil: 0,
      enemies: [],
      lasers: [],
      particles: [],
      events: [],
      socket: newSocket,
      otherPlayers: {},
      isPointerLocked: false,
      headshotAlerts: [],
      winnerName: null,
    });
  },

  endGame: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    set({ gameState: 'gameover', socket: null, isPointerLocked: false, onlineMenuState: 'none', currentLobby: null });
  },

  leaveGame: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    set({
      gameState: 'menu',
      gameMode: null,
      onlineMenuState: 'none',
      currentLobby: null,
      activeLobbies: [],
      socket: null,
      otherPlayers: {},
      enemies: [],
      lasers: [],
      particles: [],
      events: [],
      headshotAlerts: [],
      score: 0,
      timeLeft: 120,
      playerState: 'active',
      isPointerLocked: false,
      winnerName: null
    });
  },

  updateTime: (delta) => {},

  hitPlayer: (botId) => set((state) => {
    if (state.playerState === 'disabled' || state.gameState !== 'playing') return state;
    
    let updatedEnemies = state.enemies;
    let newEvents = state.events;
    
    if (botId) {
      const bot = state.enemies.find(e => e.id === botId);
      const botName = bot?.name || botId;
      newEvents = [...state.events, { id: Math.random().toString(), message: `${botName} tagged you!`, timestamp: Date.now() }];
      
      updatedEnemies = state.enemies.map(e => {
        if (e.id === botId) {
          return { ...e, score: (e.score || 0) + 100 };
        }
        return e;
      });
    }

    const nextScore = Math.max(0, state.score - 200);

    // Check if a bot reached 1000 points
    const winningBot = updatedEnemies.find(e => (e.score || 0) >= 1000);
    if (winningBot) {
      if (state.socket) state.socket.disconnect();
      return {
        playerState: 'disabled',
        score: nextScore,
        enemies: updatedEnemies,
        events: [...newEvents, { id: Math.random().toString(), message: `${winningBot.name || winningBot.id} HAS WON THE MATCH!`, timestamp: Date.now() }],
        gameState: 'gameover' as GameState,
        winnerName: winningBot.name || winningBot.id,
        socket: null,
        isPointerLocked: false
      };
    }

    return {
      playerState: 'disabled',
      playerDisabledUntil: Date.now() + 3000,
      score: nextScore,
      enemies: updatedEnemies,
      events: newEvents
    };
  }),

  hitEnemy: (id, byPlayer = false, isHeadshot = false, shooterId) => set((state) => {
    if (state.gameState !== 'playing') return state;
    
    // Check if it's a multiplayer player
    if (state.socket && state.otherPlayers[id]) {
      state.socket.emit('hitPlayer', { targetId: id, isHeadshot });
      return state;
    }

    const victim = state.enemies.find(e => e.id === id);
    const victimName = victim?.name || id;

    const enemies = state.enemies.map(e => {
      if (e.id === id && e.state === 'active') {
        return { ...e, state: 'disabled' as EntityState, disabledUntil: Date.now() + 3000 };
      }
      if (shooterId && e.id === shooterId) {
        return { ...e, score: (e.score || 0) + 100 };
      }
      return e;
    });

    const points = isHeadshot ? 200 : 100;
    let message = '';
    if (byPlayer) {
      message = isHeadshot ? `HEADSHOT! You tagged ${victimName}` : `You tagged ${victimName}`;
    } else if (shooterId) {
      const shooter = state.enemies.find(e => e.id === shooterId);
      const shooterName = shooter?.name || shooterId;
      message = `${shooterName} tagged ${victimName}`;
    } else {
      message = `${victimName} was disabled`;
    }

    const newEvents = [...state.events, { id: Math.random().toString(), message, timestamp: Date.now() }];
    const newAlerts = byPlayer && isHeadshot ? [...(state.headshotAlerts || []), { id: Math.random().toString(), timestamp: Date.now() }] : (state.headshotAlerts || []);

    const nextScore = byPlayer ? state.score + points : state.score;

    if (byPlayer && nextScore >= 1000) {
      if (state.socket) state.socket.disconnect();
      return {
        enemies,
        score: nextScore,
        events: [...newEvents, { id: Math.random().toString(), message: `YOU HAVE WON THE MATCH!`, timestamp: Date.now() }],
        headshotAlerts: newAlerts,
        gameState: 'gameover' as GameState,
        winnerName: 'You',
        socket: null,
        isPointerLocked: false
      };
    }

    if (shooterId) {
      const winningBot = enemies.find(e => (e.score || 0) >= 1000);
      if (winningBot) {
        if (state.socket) state.socket.disconnect();
        return {
          enemies,
          score: nextScore,
          events: [...newEvents, { id: Math.random().toString(), message: `${winningBot.name || winningBot.id} HAS WON THE MATCH!`, timestamp: Date.now() }],
          headshotAlerts: newAlerts,
          gameState: 'gameover' as GameState,
          winnerName: winningBot.name || winningBot.id,
          socket: null,
          isPointerLocked: false
        };
      }
    }

    return {
      enemies,
      score: nextScore,
      events: newEvents,
      headshotAlerts: newAlerts
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
        const safeSpawn = findSafeSpawnForBot(
          SPAWN_LOCATIONS,
          state.playerPosition,
          state.playerState === 'active',
          state.enemies,
          e.id
        );
        return { 
          ...e, 
          state: 'active' as EntityState,
          position: safeSpawn
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
      const isOnline = state.gameMode === 'online';
      const safeSpawn = isOnline 
        ? findSafeSpawnMultiplayer(SPAWN_LOCATIONS, state.otherPlayers)
        : findSafeSpawn(SPAWN_LOCATIONS, state.enemies);
      const nextPlayerPosition: [number, number, number] = [safeSpawn[0], 2, safeSpawn[2]];
      
      const newEvent = { 
        id: Math.random().toString(), 
        message: "You respawned at a new sector", 
        timestamp: Date.now() 
      };

      if (isOnline && state.socket) {
        state.socket.emit('updatePosition', { position: nextPlayerPosition, rotation: 0 });
      }
      
      return { 
        enemies, 
        playerState: 'active', 
        playerPosition: nextPlayerPosition,
        playerPositionEpoch: Date.now(),
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
    const headshotAlerts = (state.headshotAlerts || []).filter(a => time - a.timestamp < 1500); // Alerts last 1.5s
    
    // Weapon heat decay
    const lastDecay = state.lastHeatDecayTime || time;
    const elapsedMs = time - lastDecay;
    const decayRate = state.isOverheated ? 30 : 45; // Cool down slightly slower if overheated (3s) vs normal (2.2s)
    const heatReduction = (decayRate * elapsedMs) / 1000;
    let newHeat = Math.max(0, state.weaponHeat - heatReduction);
    let newOverheated = state.isOverheated;
    if (newOverheated && newHeat === 0) {
      newOverheated = false;
    }

    const alertsChanged = (state.headshotAlerts || []).length !== headshotAlerts.length;

    return {
      lasers,
      particles,
      events,
      headshotAlerts,
      weaponHeat: newHeat,
      isOverheated: newOverheated,
      lastHeatDecayTime: time
    };
  }),

  setPlayerState: (playerState) => set({ playerState }),
  
  forceRespawn: () => {
    const spawns = SPAWN_LOCATIONS;
    const isOnline = get().gameMode === 'online';
    const safeSpawn = isOnline 
      ? findSafeSpawnMultiplayer(spawns, get().otherPlayers)
      : findSafeSpawn(spawns, get().enemies);
    const nextPlayerPosition: [number, number, number] = [safeSpawn[0], 2, safeSpawn[2]];
    
    const newEvent = { 
      id: Math.random().toString(), 
      message: "Emergency warp initiated. Relocated safely.", 
      timestamp: Date.now() 
    };

    const socket = get().socket;
    if (isOnline && socket) {
      socket.emit('updatePosition', { position: nextPlayerPosition, rotation: 0 });
    }
    
    set({
      playerPosition: nextPlayerPosition,
      playerState: 'active',
      playerDisabledUntil: 0,
      playerPositionEpoch: Date.now(),
      events: [...get().events, newEvent]
    });
  },
  
  setPointerLocked: (isPointerLocked) => set((state) => ({
    isPointerLocked,
    isAiming: isPointerLocked ? state.isAiming : false
  })),

  updatePlayerPosition: (position, rotation) => {
    const { socket } = get();
    if (socket) {
      socket.emit('updatePosition', { position, rotation });
    }
    set({ playerPosition: position, playerRotation: rotation });
  }
}));

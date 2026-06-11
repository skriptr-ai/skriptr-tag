/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';

interface Player {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: number;
  state: 'active' | 'disabled';
  disabledUntil: number;
  score: number;
  color: string;
}

interface Lobby {
  id: string;
  name: string;
  players: Record<string, Player>;
  status: 'waiting' | 'playing';
  countdown: number;
  timer?: NodeJS.Timeout;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
    },
  });

  const LOBBY_MAX_PLAYERS = 12;
  let playerCounter = 1;

  // Lobbies state
  const lobbies: Record<string, Lobby> = {
    'neon-alpha': {
      id: 'neon-alpha',
      name: 'NEON-ALPHA',
      players: {},
      status: 'waiting',
      countdown: 60,
    },
    'cyber-omega': {
      id: 'cyber-omega',
      name: 'CYBER-OMEGA',
      players: {},
      status: 'waiting',
      countdown: 60,
    }
  };

  // Fast mapping of socket.id -> lobbyId
  const socketLobbyMap: Record<string, string> = {};

  // Helper to send lobby list to all sockets in lobby browser
  function broadcastLobbiesList() {
    const summary = Object.values(lobbies).map(lobby => ({
      id: lobby.id,
      name: lobby.name,
      playerCount: Object.keys(lobby.players).length,
      maxPlayers: LOBBY_MAX_PLAYERS,
      status: lobby.status,
      countdown: lobby.countdown
    }));
    io.emit('lobbiesList', summary);
  }

  // Helper to start the countdown for a lobby
  function startLobbyCountdown(lobbyId: string) {
    const lobby = lobbies[lobbyId];
    if (!lobby || lobby.timer) return;

    lobby.countdown = 60;
    
    lobby.timer = setInterval(() => {
      const activeLobby = lobbies[lobbyId];
      if (!activeLobby) {
        return; // Lobby was deleted in the meantime
      }

      if (activeLobby.countdown > 0) {
        activeLobby.countdown--;
        io.to(lobbyId).emit('lobbyUpdated', {
          players: activeLobby.players,
          countdown: activeLobby.countdown,
          status: activeLobby.status
        });
        broadcastLobbiesList();
      } else {
        // Countdown hit 0!
        if (activeLobby.timer) {
          clearInterval(activeLobby.timer);
          activeLobby.timer = undefined;
        }
        activeLobby.status = 'playing';
        io.to(lobbyId).emit('gameStarted', activeLobby.players);
        broadcastLobbiesList();
      }
    }, 1000);
  }

  // Helper to cleanly remove a player from a lobby
  function removePlayerFromLobby(socketId: string) {
    const lobbyId = socketLobbyMap[socketId];
    if (!lobbyId) return;

    const lobby = lobbies[lobbyId];
    if (lobby) {
      const playerName = lobby.players[socketId]?.name || 'Unknown';
      delete lobby.players[socketId];
      delete socketLobbyMap[socketId];

      // Broadcast to players in that lobby
      io.to(lobbyId).emit('playerLeft', socketId);
      io.to(lobbyId).emit('lobbyUpdated', {
        players: lobby.players,
        countdown: lobby.countdown,
        status: lobby.status
      });

      console.log(`Player ${playerName} left lobby ${lobby.name}. Remaining: ${Object.keys(lobby.players).length}`);

      // If lobby is empty, handle cleanup
      if (Object.keys(lobby.players).length === 0) {
        if (lobby.timer) {
          clearInterval(lobby.timer);
          lobby.timer = undefined;
        }

        const isDefault = lobbyId === 'neon-alpha' || lobbyId === 'cyber-omega';
        if (isDefault) {
          lobby.status = 'waiting';
          lobby.countdown = 60;
        } else {
          delete lobbies[lobbyId];
          console.log(`Deleted custom lobby: ${lobbyId}`);
        }
      }
    }
    broadcastLobbiesList();
  }

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 1. Send lobby list on request
    socket.on('getLobbies', () => {
      const summary = Object.values(lobbies).map(lobby => ({
        id: lobby.id,
        name: lobby.name,
        playerCount: Object.keys(lobby.players).length,
        maxPlayers: LOBBY_MAX_PLAYERS,
        status: lobby.status,
        countdown: lobby.countdown
      }));
      socket.emit('lobbiesList', summary);
    });

    // 2. Create custom lobby
    socket.on('createLobby', (data: { name: string }) => {
      const cleanedName = (data.name || '').trim().substring(0, 16).toUpperCase();
      if (!cleanedName) {
        socket.emit('gameError', 'Invalid sector designation');
        return;
      }

      const lobbyId = `lobby-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      lobbies[lobbyId] = {
        id: lobbyId,
        name: cleanedName,
        players: {},
        status: 'waiting',
        countdown: 60,
      };

      console.log(`Custom lobby created: ${cleanedName} (${lobbyId})`);
      socket.emit('lobbyCreated', lobbyId);
      broadcastLobbiesList();
    });

    // 3. Join specific lobby
    socket.on('joinLobby', (lobbyId: string) => {
      const lobby = lobbies[lobbyId];
      if (!lobby) {
        socket.emit('gameError', 'Target sector offline or non-existent');
        return;
      }

      if (lobby.status === 'playing') {
        socket.emit('gameError', 'Sector locked. Match already in progress');
        return;
      }

      if (Object.keys(lobby.players).length >= LOBBY_MAX_PLAYERS) {
        socket.emit('gameError', `Sector maximum capacity reached (${LOBBY_MAX_PLAYERS}/${LOBBY_MAX_PLAYERS})`);
        return;
      }

      // Assign random color
      const colors = ['#ff0055', '#00ff00', '#ffff00', '#ff00ff', '#00ffff'];
      const color = colors[Object.keys(lobby.players).length % colors.length];
      const playerName = `Player ${playerCounter++}`;

      const newPlayer: Player = {
        id: socket.id,
        name: playerName,
        position: [0, 2, 0],
        rotation: 0,
        state: 'active',
        disabledUntil: 0,
        score: 0,
        color
      };

      // Add to lobby
      lobby.players[socket.id] = newPlayer;
      socketLobbyMap[socket.id] = lobbyId;

      // Join socket.io room
      socket.join(lobbyId);

      // Confirm join
      socket.emit('lobbyJoined', {
        id: lobby.id,
        name: lobby.name,
        players: lobby.players,
        countdown: lobby.countdown,
        status: lobby.status
      });

      // Notify others in lobby
      socket.to(lobbyId).emit('playerJoined', newPlayer);
      io.to(lobbyId).emit('lobbyUpdated', {
        players: lobby.players,
        countdown: lobby.countdown,
        status: lobby.status
      });

      console.log(`Player ${playerName} joined lobby ${lobby.name}. Total: ${Object.keys(lobby.players).length}`);

      // Start countdown automatically if first player
      if (Object.keys(lobby.players).length === 1) {
        startLobbyCountdown(lobbyId);
      }

      // Update global browser
      broadcastLobbiesList();
    });

    // 4. Leave current lobby
    socket.on('leaveLobby', () => {
      const lobbyId = socketLobbyMap[socket.id];
      if (lobbyId) {
        socket.leave(lobbyId);
        removePlayerFromLobby(socket.id);
      }
    });

    // 5. In-game: Update position within room
    socket.on('updatePosition', (data: { position: [number, number, number], rotation: number }) => {
      const lobbyId = socketLobbyMap[socket.id];
      if (lobbyId) {
        const lobby = lobbies[lobbyId];
        if (lobby && lobby.players[socket.id]) {
          lobby.players[socket.id].position = data.position;
          lobby.players[socket.id].rotation = data.rotation;
          socket.to(lobbyId).emit('playerMoved', { id: socket.id, ...data });
        }
      }
    });

    // 6. In-game: Shoot
    socket.on('shoot', (data: { start: [number, number, number], end: [number, number, number], color: string }) => {
      const lobbyId = socketLobbyMap[socket.id];
      if (lobbyId) {
        socket.to(lobbyId).emit('playerShot', { id: socket.id, ...data });
      }
    });

    // 7. In-game: Hit player
    socket.on('hitPlayer', (data: string | { targetId: string, isHeadshot?: boolean }) => {
      let targetId: string;
      let isHeadshot = false;

      if (typeof data === 'string') {
        targetId = data;
      } else if (data && typeof data === 'object') {
        targetId = data.targetId;
        isHeadshot = !!data.isHeadshot;
      } else {
        return;
      }

      const lobbyId = socketLobbyMap[socket.id];
      if (lobbyId) {
        const lobby = lobbies[lobbyId];
        if (lobby && lobby.players[targetId] && lobby.players[socket.id]) {
          const now = Date.now();
          const target = lobby.players[targetId];
          const shooter = lobby.players[socket.id];

          if (target.state === 'active' || now > target.disabledUntil) {
            target.state = 'disabled';
            target.disabledUntil = now + 3000;

            const points = isHeadshot ? 200 : 100;
            shooter.score += points;

            io.to(lobbyId).emit('playerHit', {
              targetId,
              shooterId: socket.id,
              targetDisabledUntil: target.disabledUntil,
              shooterScore: shooter.score,
              isHeadshot
            });
          }
        }
      }
    });

    // 8. Disconnect cleanly
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      removePlayerFromLobby(socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
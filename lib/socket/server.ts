import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { query } from '@/lib/db/postgres';

let io: SocketIOServer | null = null;

export function initializeSocket(server: HTTPServer) {
  if (io) {
    return io;
  }

  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
    path: '/api/socket',
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Join a game room
    socket.on('join-game', async (gameId: string) => {
      socket.join(`game-${gameId}`);
      console.log(`Client ${socket.id} joined game ${gameId}`);
      
      // Send current game state to the newly joined client
      try {
        if (process.env.DATABASE_URL) {
          const result = await query(
            'SELECT * FROM game_plays WHERE game_id = $1',
            [gameId]
          );
          if (result.rows.length > 0) {
            socket.emit('game-state', result.rows[0]);
          }
        }
      } catch (error) {
        console.error('Error fetching game state for socket:', error);
      }
    });

    // Leave a game room
    socket.on('leave-game', (gameId: string) => {
      socket.leave(`game-${gameId}`);
      console.log(`Client ${socket.id} left game ${gameId}`);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

// Helper function to emit game state updates
export function emitGameState(gameId: string, gameData: any) {
  if (io) {
    io.to(`game-${gameId}`).emit('game-state', gameData);
  }
}

// Helper function to emit to all lobbies list
export function emitLobbyUpdate() {
  if (io) {
    io.emit('lobby-update');
  }
}


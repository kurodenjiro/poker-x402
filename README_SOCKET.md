# Socket.io Real-time Updates

This application now uses Socket.io for real-time game state updates and lobby management.

## Setup

1. **Environment Variables**

   Add to your `.env.local` or `.env` file:
   ```bash
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   DATABASE_URL=postgresql://username:password@localhost:5432/database_name
   ```

2. **Running the Server**

   The application now uses a custom server (`server.js`) to support Socket.io. Run:
   ```bash
   npm run dev
   ```

   This will start both the Next.js server and Socket.io on port 3000.

3. **How It Works**

   - **Home Page (`/`)**: 
     - Shows all active lobbies
     - Updates in real-time when new lobbies are created
     - Guests can click on any lobby to watch the game live
   
   - **Lobby Page (`/lobby/[id]`)**:
     - Connects to Socket.io on page load
     - Joins the game room for real-time updates
     - Receives game state updates via WebSocket (no polling needed)
     - Falls back to HTTP polling if Socket.io is unavailable
   
   - **Game State Updates**:
     - When game state is saved to the database, it's also broadcast via Socket.io
     - All connected clients watching the same game receive updates instantly
     - Lobby list updates when new games are created or status changes

4. **Socket Events**

   - `join-game`: Client joins a game room to receive updates
   - `leave-game`: Client leaves a game room
   - `game-state`: Server broadcasts game state updates to all clients in the room
   - `lobby-update`: Server notifies all clients when lobby list changes

5. **Database Integration**

   - Game state is saved to PostgreSQL
   - Socket.io events are emitted after successful database saves
   - If database is not configured, Socket.io still works (but no persistence)

## Benefits

- **Real-time Updates**: No need to poll for updates every few seconds
- **Better Performance**: WebSocket connections are more efficient than HTTP polling
- **Live Viewing**: Multiple guests can watch the same game simultaneously
- **Instant Notifications**: Lobby list updates immediately when games are created


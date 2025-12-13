# Supabase Realtime Setup

This application now uses [Supabase Realtime](https://supabase.com/realtime) for real-time game state updates and lobby management instead of Socket.io.

## Setup

1. **Create a Supabase Project**

   - Go to [supabase.com](https://supabase.com) and create a new project
   - Note your project URL and anon key from the project settings

2. **Environment Variables**

   Add to your `.env.local` file:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   DATABASE_URL=postgresql://username:password@localhost:5432/database_name
   ```

   **Note**: You can use Supabase's hosted PostgreSQL database or your own. If using Supabase's database, the connection string will be different.

3. **Enable Realtime on Tables** (if using Supabase hosted database)

   In your Supabase dashboard:
   - Go to Database → Replication
   - Enable replication for the `game_plays` table (optional, for database change subscriptions)
   - The broadcast feature works without enabling replication

4. **Running the Server**

   The application now uses standard Next.js (no custom server needed):
   ```bash
   npm run dev
   ```

## How It Works

- **Home Page (`/`)**: 
  - Shows all active lobbies
  - Subscribes to `lobby-updates` channel for real-time updates
  - Updates automatically when new lobbies are created

- **Lobby Page (`/lobby/[id]`)**:
  - Connects to Supabase Realtime on page load
  - Subscribes to `game-{gameId}` channel for game-specific updates
  - Receives game state updates via broadcast messages
  - Falls back to HTTP polling if Realtime is unavailable

- **Game State Updates**:
  - When game state is saved, it's broadcast via Supabase Realtime
  - All connected clients watching the same game receive updates instantly
  - Lobby list updates when new games are created or status changes

## Realtime Channels

- `game-{gameId}`: Channel for each game's state updates
- `lobby-updates`: Channel for lobby list updates

## Broadcast Events

- `game-state`: Broadcast when game state changes
- `lobby-update`: Broadcast when lobby list changes

## Benefits

- **No Custom Server**: Works with standard Next.js deployment
- **Scalable**: Supabase handles WebSocket connections
- **Real-time Updates**: Instant updates via WebSocket
- **Fallback Support**: Falls back to polling if Realtime is unavailable

## Migration from Socket.io

All Socket.io code has been replaced with Supabase Realtime:
- Client-side: Uses `supabase.channel()` and `.on('broadcast')`
- Server-side: Uses `supabase.channel().send()` for broadcasts
- No more `server.js` custom server needed
- Removed `socket.io` and `socket.io-client` dependencies



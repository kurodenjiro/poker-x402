-- Create lobbies table
CREATE TABLE IF NOT EXISTS lobbies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT UNIQUE NOT NULL,
  config JSONB NOT NULL,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'running', 'finished')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create game_plays table for real-time game state
CREATE TABLE IF NOT EXISTS game_plays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT NOT NULL,
  game_state JSONB,
  stats JSONB,
  rankings JSONB,
  is_running BOOLEAN DEFAULT false,
  chat_messages JSONB DEFAULT '[]'::jsonb,
  simulator_status JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(game_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_lobbies_game_id ON lobbies(game_id);
CREATE INDEX IF NOT EXISTS idx_game_plays_game_id ON game_plays(game_id);
CREATE INDEX IF NOT EXISTS idx_game_plays_updated_at ON game_plays(updated_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to auto-update updated_at
DROP TRIGGER IF EXISTS update_lobbies_updated_at ON lobbies;
CREATE TRIGGER update_lobbies_updated_at BEFORE UPDATE ON lobbies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_game_plays_updated_at ON game_plays;
CREATE TRIGGER update_game_plays_updated_at BEFORE UPDATE ON game_plays
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

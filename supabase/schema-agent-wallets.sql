-- Create agent_wallets table to persist agent wallets
CREATE TABLE IF NOT EXISTS agent_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL UNIQUE,
  private_key TEXT NOT NULL, -- Base58 encoded, encrypted in production
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_agent_wallets_agent_name ON agent_wallets(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_wallets_public_key ON agent_wallets(public_key);

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_agent_wallets_updated_at ON agent_wallets;
CREATE TRIGGER update_agent_wallets_updated_at BEFORE UPDATE ON agent_wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();



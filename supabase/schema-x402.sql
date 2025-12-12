-- Create x402_transactions table for agent-to-agent payments
CREATE TABLE IF NOT EXISTS x402_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT NOT NULL,
  hand_number INTEGER,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  amount_chips INTEGER NOT NULL,
  amount_sol NUMERIC(18, 9),
  transaction_signature TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_x402_transactions_game_id ON x402_transactions(game_id);
CREATE INDEX IF NOT EXISTS idx_x402_transactions_from_agent ON x402_transactions(from_agent);
CREATE INDEX IF NOT EXISTS idx_x402_transactions_to_agent ON x402_transactions(to_agent);
CREATE INDEX IF NOT EXISTS idx_x402_transactions_status ON x402_transactions(status);
CREATE INDEX IF NOT EXISTS idx_x402_transactions_created_at ON x402_transactions(created_at);

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_x402_transactions_updated_at ON x402_transactions;
CREATE TRIGGER update_x402_transactions_updated_at BEFORE UPDATE ON x402_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


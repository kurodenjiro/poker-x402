-- Create function to update updated_at timestamp (if it doesn't exist)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create payment_accounts table for game payment accounts
CREATE TABLE IF NOT EXISTS payment_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL, -- Encrypted in production
  total_amount_usd NUMERIC(18, 2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'distributed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payment_accounts_game_id ON payment_accounts(game_id);
CREATE INDEX IF NOT EXISTS idx_payment_accounts_status ON payment_accounts(status);
CREATE INDEX IF NOT EXISTS idx_payment_accounts_created_at ON payment_accounts(created_at);

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_payment_accounts_updated_at ON payment_accounts;
CREATE TRIGGER update_payment_accounts_updated_at BEFORE UPDATE ON payment_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


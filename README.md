# Poker X402 - AI Poker Game with Solana Betting

A competitive poker game where AI models (ChatGPT, Gemini, Grok, Claude Sonnet) play Texas Hold'em poker. Features real-time gameplay, Solana smart contract betting, and x402 micropayments.

## Features

- **AI Models**: ChatGPT (GPT-4), Google Gemini, xAI Grok, and Anthropic Claude Sonnet
- **Real-time Gameplay**: Live poker table with Supabase Realtime updates
- **Solana Betting**: Place bets on players using Solana smart contracts
- **x402 Payments**: Automatic micropayments between agents using x402 protocol
- **Texas Hold'em Engine**: Full poker game with betting rounds, community cards, and hand evaluation
- **Performance Tracking**: Detailed statistics and rankings for each AI model

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (or Supabase)
- Solana CLI tools (for smart contract development)
- Rust and Anchor framework (for smart contract development)

### Installation

1. **Clone and install dependencies:**

```bash
npm install
```

2. **Configure environment variables:**

Create a `.env.local` file:

```env
# AI API Keys
OPENAI_API_KEY=your_openai_api_key
GOOGLE_AI_API_KEY=your_google_ai_api_key
GROK_API_KEY=your_grok_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key

# Database
DATABASE_URL=postgresql://username:password@localhost:5432/database_name

# Supabase (for real-time updates)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Solana
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com

# x402 Payments
X402_PAYMENT_PRIVATE_KEY=your_payment_wallet_private_key
X402_PAYMENT_ADDRESS=your_payment_wallet_address
AGENT_WALLET_CHATGPT_PRIVATE_KEY=your_chatgpt_agent_wallet_private_key

# Betting Contract Owner (for distributing winnings)
BETTING_OWNER_PRIVATE_KEY=your_betting_owner_private_key
```

3. **Set up the database:**

```bash
# Run the database schema
psql -U your_username -d your_database_name -f supabase/schema.sql

# Or use the setup script
node scripts/setup-db.js
```

4. **Build the Solana smart contract (optional, for betting):**

```bash
cd contracts
anchor build
cd ..
```

5. **Run the development server:**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the game.

## Project Structure

```
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── lobby/             # Lobby pages
│   └── page.tsx           # Home page
├── components/            # React components
│   ├── GameBoard.tsx      # Main game board
│   ├── BettingPanel.tsx   # Betting interface
│   └── Paywall.tsx        # Payment modal
├── lib/
│   ├── game-manager.ts    # Game logic
│   ├── solana/            # Solana integration
│   ├── payments/          # Payment processing
│   └── supabase/          # Supabase client
├── contracts/             # Solana smart contracts
│   └── programs/          # Anchor programs
├── scripts/               # Utility scripts
└── supabase/              # Database schemas
```

## Key Features

### Real-time Gameplay

- Uses Supabase Realtime for instant game state updates
- Multiple viewers can watch the same game simultaneously
- No polling required - updates are pushed via WebSocket

### Solana Betting

- Create lobbies and place bets on players
- Smart contract manages escrow and payouts
- Automatic distribution of winnings after game ends

### x402 Micropayments

- Agents automatically pay each other using x402 protocol
- Payments triggered after each hand
- Transaction history tracked in database

## Development

### Running Tests

```bash
npm run build
```

### Database Setup

See `supabase/schema.sql` for the complete database schema.

### Smart Contract Development

```bash
cd contracts
anchor build
anchor deploy
```

## Documentation

- [Smart Contract Setup](docs/SMART_CONTRACT_SETUP.md)
- [Betting Integration](docs/BETTING_INTEGRATION.md)
- [Payment Setup](docs/PAYMENT_SETUP.md)
- [Supabase Realtime](docs/SUPABASE_REALTIME_SETUP.md)
- [x402 Payment Flow](docs/X402_PAYMENT_FLOW.md)

## License

MIT

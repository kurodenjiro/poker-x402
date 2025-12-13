# Betting Integration Guide

This guide explains how the Solana smart contract betting system integrates with the poker game.

## Flow Overview

### 1. Lobby Creation
When a lobby is created:
1. Lobby config is saved to PostgreSQL database
2. **Smart contract lobby is created on-chain** via `/api/betting/create-lobby`
3. Lobby status is set to "Waiting"

### 2. Betting Phase
While the game is running:
1. Users connect their Solana wallet
2. Users select a player and bet amount
3. Bet is placed on-chain via `BettingPanel` component
4. SOL is transferred to escrow account
5. Bet is recorded in the smart contract

### 3. Game Completion
When the game ends:
1. Game manager identifies the winner
2. **Smart contract distributes winnings** via `/api/betting/distribute`
3. Winners receive their bet back + proportional share of losers' bets
4. Lobby status is updated to "Finished"

## Integration Points

### Frontend Components

**BettingPanel** (`components/BettingPanel.tsx`):
- Displays betting interface in the lobby sidebar
- Shows current bets and totals
- Allows users to place bets
- Requires wallet connection

### API Routes

**`/api/betting/create-lobby`**:
- Creates lobby on-chain
- Called automatically when game starts
- Requires `BETTING_OWNER_PRIVATE_KEY` in `.env.local`

**`/api/betting/distribute`**:
- Distributes winnings to all winners
- Called automatically when game ends
- Requires `BETTING_OWNER_PRIVATE_KEY` in `.env.local`

**`/api/betting/[gameId]`**:
- Fetches lobby and bet data
- Used by `BettingPanel` to display current bets

### Game Manager Integration

The `GameManager` automatically:
1. Creates betting lobby when game starts (via API call)
2. Distributes winnings when game ends (via API call)

## Smart Contract Accounts

### Lobby Account (PDA)
- **Seeds**: `["lobby", game_id]`
- Stores game configuration and status
- Tracks total bets

### Bet Account (PDA)
- **Seeds**: `["bet", lobby, bettor, timestamp]`
- Stores individual bet information
- Links bettor to player and amount

### Escrow Account (PDA)
- **Seeds**: `["escrow", lobby]`
- Holds all bet funds
- Distributes winnings when game ends

## Usage Example

```typescript
// In your component
import BettingPanel from '@/components/BettingPanel';

<BettingPanel
  gameId="game-123"
  playerNames={['ChatGPT', 'Gemini', 'Grok', 'Claude']}
  lobbyStatus={isRunning ? 'Running' : 'Finished'}
/>
```

## Testing

1. **Build and deploy the contract:**
   ```bash
   anchor build
   anchor deploy
   ```

2. **Test locally:**
   - Create a game
   - Connect wallet
   - Place a bet
   - Wait for game to finish
   - Check that winnings are distributed

## Security Notes

- Only the lobby owner can update status and distribute winnings
- Bets can only be placed when lobby is "Waiting" or "Running"
- All funds are held in escrow until distribution
- Smart contract validates all operations on-chain


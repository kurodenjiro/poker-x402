# Poker Betting Smart Contract Setup

This document describes the Solana smart contract for poker game betting.

## Overview

The smart contract handles:
1. **Lobby Creation**: Owner creates a lobby with game parameters and players
2. **Betting**: Users place bets on agent players while watching
3. **Payout Distribution**: Owner distributes winnings after the game ends

## Smart Contract Structure

### Accounts

#### Lobby Account
Stores game configuration and state:
- `owner`: Pubkey of the lobby creator
- `game_id`: Unique game identifier
- `model_names`: List of player names (agents)
- `starting_chips`: Starting chips per player
- `small_blind`: Small blind amount
- `big_blind`: Big blind amount
- `max_hands`: Maximum number of hands
- `status`: LobbyStatus (Waiting, Running, Finished)
- `total_bets`: Total amount bet on this lobby
- `created_at`: Timestamp
- `updated_at`: Timestamp

#### Bet Account
Stores individual bet information:
- `bettor`: Pubkey of the person placing the bet
- `lobby`: Pubkey of the lobby
- `player_name`: Name of the player being bet on
- `amount`: Bet amount in lamports
- `placed_at`: Timestamp
- `status`: BetStatus (Active, Paid, Refunded)

#### Escrow Account
Holds all bet funds until distribution (PDA)

## Instructions

### 1. `create_lobby`
Creates a new lobby on-chain.

**Parameters:**
- `game_id`: String
- `model_names`: Vec<String>
- `starting_chips`: u64
- `small_blind`: u64
- `big_blind`: u64
- `max_hands`: u64

**Accounts:**
- `lobby`: PDA (seeds: ["lobby", game_id])
- `owner`: Signer
- `system_program`: System Program

### 2. `place_bet`
Allows users to place bets on players.

**Parameters:**
- `player_name`: String

**Accounts:**
- `lobby`: Lobby account
- `bet`: PDA (seeds: ["bet", lobby, bettor, timestamp])
- `bettor`: Signer (pays for bet)
- `escrow`: PDA (seeds: ["escrow", lobby])
- `system_program`: System Program

**Note:** The bet amount is determined by the lamports sent in the transaction.

### 3. `update_lobby_status`
Updates the lobby status (Waiting → Running → Finished).

**Parameters:**
- `new_status`: LobbyStatus enum

**Accounts:**
- `lobby`: Lobby account
- `owner`: Signer (must be lobby owner)

### 4. `distribute_winnings`
Distributes winnings to bettors after the game ends.

**Parameters:**
- `winner_name`: String

**Accounts:**
- `lobby`: Lobby account
- `owner`: Signer (must be lobby owner)
- `escrow`: Escrow PDA
- `bets`: Vec<Bet> (all bet accounts)
- `bettor_accounts`: Vec<AccountInfo> (accounts to receive payouts)

**Distribution Logic:**
- Winners get their bet back + proportional share of losers' bets
- Share = (loser_total * bet_amount) / winner_total

## Integration with Frontend

### Creating a Lobby

```typescript
import { PokerBettingContract } from '@/lib/solana/betting-contract';
import { useWallet } from '@solana/wallet-adapter-react';

const { publicKey, signTransaction } = useWallet();
const contract = new PokerBettingContract(connection, wallet);

// After creating lobby in database
const tx = await contract.createLobby({
  gameId: 'game-123',
  modelNames: ['ChatGPT', 'Gemini', 'Grok', 'Claude'],
  startingChips: 1000,
  smallBlind: 10,
  bigBlind: 20,
  maxHands: 10,
});
```

### Placing a Bet

```typescript
// User places bet while watching
const tx = await contract.placeBet(
  'game-123',
  'ChatGPT',
  0.1 // 0.1 SOL
);
```

### Updating Status

```typescript
// When game starts
await contract.updateLobbyStatus('game-123', 'Running');

// When game ends
await contract.updateLobbyStatus('game-123', 'Finished');
```

### Distributing Winnings

```typescript
// After game ends, get all bets
const bets = await contract.getBets('game-123');
const betPubkeys = bets.map(b => b.accountPubkey);

// Get winner from game state
const winner = getWinnerFromGameState(); // e.g., 'ChatGPT'

// Distribute
await contract.distributeWinnings('game-123', winner, betPubkeys);
```

## Deployment

1. **Install Anchor CLI:**
   ```bash
   npm install -g @coral-xyz/anchor-cli
   ```

2. **Build the program:**
   ```bash
   anchor build
   ```

3. **Deploy to devnet:**
   ```bash
   anchor deploy
   ```

4. **Update program ID (if changed):**
   - Update `declare_id!` in `lib.rs`
   - Update `PROGRAM_ID` in `betting-contract.ts`
   - Update `Anchor.toml` if needed

5. **Copy generated IDL:**
   After building, the IDL will be in `target/idl/poker_betting.json`
   The TypeScript wrapper will automatically load it.

## Environment Variables

Add to `.env.local`:
```bash
# Betting contract owner (server-side operations)
BETTING_OWNER_PRIVATE_KEY=["your","private","key","array"]

# Solana RPC (optional, defaults to devnet)
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
```

## Security Considerations

1. **Owner Verification**: Only the lobby owner can update status and distribute winnings
2. **Status Validation**: Bets can only be placed when lobby is Waiting or Running
3. **Player Validation**: Only valid players (from model_names) can be bet on
4. **Escrow**: All funds are held in a PDA escrow account until distribution

## Error Handling

The contract includes custom error codes:
- `LobbyNotAcceptingBets`: Lobby is not in Waiting or Running status
- `InvalidPlayer`: Player name not in model_names
- `InvalidBetAmount`: Bet amount is 0
- `Unauthorized`: Caller is not the lobby owner
- `LobbyNotFinished`: Cannot distribute winnings before game ends
- `NoWinners`: No bets found on the winner

## Testing

Run tests with:
```bash
anchor test
```

## Next Steps

1. Integrate contract calls into the lobby creation flow
2. Add betting UI component for users to place bets
3. Add automatic status updates when game state changes
4. Add automatic payout distribution when game ends
5. Add event listeners for bet placement and payouts


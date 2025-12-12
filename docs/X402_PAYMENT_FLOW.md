# Agent-to-Agent x402 Payment Flow

## 📊 Complete Payment Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    POKER HAND COMPLETES                          │
│  (Winner determined, pot calculated)                            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  GameManager.evaluateHand()                                     │
│  • Identifies winners and losers                                │
│  • Calculates chips won/lost                                    │
│  • Calls paymentService.distributePot()                         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  X402AgentPaymentService.distributePot()                        │
│  • Splits pot among winners                                     │
│  • For each winner-loser pair:                                  │
│    → processAgentPayment(fromAgent, toAgent, chips)            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  X402AgentPaymentService.processAgentPayment()                  │
│  1. Fetch current SOL price (CoinGecko API)                     │
│  2. Convert chips → USD → SOL                                   │
│  3. Create payment record                                       │
│  4. Save to database (x402_transactions table)                │
│  5. Return payment object                                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Database: x402_transactions                                     │
│  • game_id, hand_number                                         │
│  • from_agent, to_agent                                         │
│  • amount_chips, amount_sol                                     │
│  • transaction_signature, status                                │
│  • created_at, updated_at                                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  UI: X402Transactions Component                                  │
│  • Fetches from /api/x402-transactions/[gameId]                 │
│  • Auto-refreshes every 5 seconds                               │
│  • Displays in sidebar below TransactionHistory                 │
└─────────────────────────────────────────────────────────────────┘
```

## 🔄 Step-by-Step Flow

### 1. **Game Hand Completion**
When a poker hand finishes:
- Location: `lib/game-manager.ts` → `evaluateHand()`
- Identifies winners and losers
- Calculates pot distribution

### 2. **Payment Processing**
```typescript
// lib/game-manager.ts (line ~772)
const payments = await paymentService.distributePot(
  winnerList,      // [{ agentName: "ChatGPT", chipsWon: 500 }]
  loserList,       // [{ agentName: "Gemini", chipsLost: 300 }]
  this.gameId,     // "game-1234567890"
  this.handsPlayed // 1, 2, 3...
);
```

### 3. **Payment Calculation**
For each payment:
- **Chips → USD**: `chipsAmount / 1000` (1$ = 1000 chips)
- **USD → SOL**: `usdAmount / solPrice` (fetched from CoinGecko)
- **Example**: 500 chips → $0.50 → 0.003333 SOL (if SOL = $150)

### 4. **Database Storage**
```sql
INSERT INTO x402_transactions (
  game_id, hand_number, from_agent, to_agent,
  amount_chips, amount_sol, transaction_signature, status
) VALUES (...)
```

### 5. **UI Display**
- Component: `components/X402Transactions.tsx`
- Location: Sidebar in lobby page (below TransactionHistory)
- Auto-updates: Every 5 seconds
- Shows: From → To, Amount (chips + SOL), Hand #, Status, Transaction Link

## 📍 Where to See Payments

### In the Game UI:
1. **Navigate to a game lobby**: `/lobby/[gameId]`
2. **Look in the right sidebar** (when chat is visible)
3. **Scroll down** below TransactionHistory
4. **See "💸 x402 Transactions"** card

### In the Database:
```sql
SELECT * FROM x402_transactions 
WHERE game_id = 'your-game-id' 
ORDER BY created_at DESC;
```

### In the Console:
Look for logs:
```
[X402 Payment] 💰 Processing agent-to-agent payments
[X402 Payment] ✅ Payments processed
[X402 Payment] 💾 Transaction saved to DB
```

## 🎯 Example Payment Record

```json
{
  "id": "uuid-here",
  "gameId": "game-1234567890",
  "handNumber": 3,
  "fromAgent": "Gemini",
  "toAgent": "ChatGPT",
  "amountChips": 500,
  "amountSol": 0.003333,
  "transactionSignature": "sim_1234567890_abc123",
  "status": "completed",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

## 🔧 Configuration

### Agent Wallets
Wallets are registered when the game starts:
```typescript
// lib/game-manager.ts (line ~70-76)
config.modelNames.forEach((modelName, index) => {
  const agentWallet = process.env[`AGENT_WALLET_${modelName}`] || 
                     `agent_${modelName}_${index}`;
  paymentService.registerAgentWallet(modelName, agentWallet);
});
```

### Environment Variables
```env
# Optional: Set specific wallet addresses for agents
AGENT_WALLET_CHATGPT=wallet_address_here
AGENT_WALLET_GEMINI=wallet_address_here
AGENT_WALLET_GROK=wallet_address_here
AGENT_WALLET_CLAUDE_SONNET=wallet_address_here

# Solana Network
NEXT_PUBLIC_SOLANA_NETWORK=devnet
```

## 🚀 Testing the Flow

1. **Start a game** with multiple AI models
2. **Play a few hands** until someone wins
3. **Check the sidebar** for x402 transactions
4. **Verify in database**:
   ```bash
   node scripts/setup-x402-table.js  # If not already set up
   ```

## 📊 Payment Display Features

- ✅ Real-time updates (every 5 seconds)
- ✅ Shows chip and SOL amounts
- ✅ Links to Solscan for transaction details
- ✅ Color-coded status badges
- ✅ Hand number tracking
- ✅ Scrollable list (max 100 transactions)


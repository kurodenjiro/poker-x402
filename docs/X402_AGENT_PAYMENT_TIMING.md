# x402 Agent-to-Agent Payment Timing & Flow

## 🎯 When Payments Happen

x402 payments between agents are automatically triggered **after each poker hand completes**, when:
1. ✅ A hand finishes (all betting rounds complete)
2. ✅ Winners are determined (best hand evaluation)
3. ✅ Pot is calculated (total chips bet by losers)
4. ✅ There are both winners AND losers
5. ✅ Pot amount > 0

## 📍 Payment Trigger Point

**Location:** `lib/game-manager.ts` → `evaluateHand()` method (line ~771)

```typescript
// After hand evaluation and pot distribution
if (winnerList.length > 0 && loserList.length > 0 && potBeforeDistribution > 0) {
  const payments = await paymentService.distributePot(
    winnerList, 
    loserList, 
    this.gameId, 
    this.handsPlayed
  );
}
```

## 🔄 Complete Payment Flow

```
┌─────────────────────────────────────────────────────────────┐
│  HAND COMPLETES                                              │
│  • All betting rounds finished                              │
│  • Cards revealed                                            │
│  • Winners determined                                        │
└────────────────────┬────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  GameManager.evaluateHand()                                  │
│  • Calculates pot (total chips from losers)                 │
│  • Identifies winners and losers                            │
│  • Calls paymentService.distributePot()                      │
└────────────────────┬────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  X402AgentPaymentService.distributePot()                     │
│  • Splits pot proportionally among winners                   │
│  • For each winner-loser pair:                              │
│    → Calculates payment amount                               │
│    → Calls processAgentPayment()                            │
└────────────────────┬────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  processAgentPayment(fromAgent, toAgent, chipsAmount)        │
│                                                               │
│  1. Get/Create Wallets                                       │
│     • fromAgent wallet (loser)                               │
│     • toAgent wallet (winner)                               │
│                                                               │
│  2. Calculate Payment Amount                                  │
│     • Chips → USD: chipsAmount / 1000                        │
│     • USD → x402: usdAmount * 402                            │
│     • x402 → SOL: x402Amount / solPrice                      │
│                                                               │
│  3. Check Balance                                            │
│     • Verify fromAgent has enough SOL                        │
│     • Request airdrop if needed (devnet/testnet)            │
│                                                               │
│  4. Create Solana Transaction                                │
│     • Get recent blockhash                                    │
│     • Create transfer instruction                            │
│     • Sign with fromAgent's keypair                          │
│                                                               │
│  5. Send & Confirm                                           │
│     • Send transaction to Solana network                      │
│     • Poll for confirmation (up to 30 seconds)               │
│                                                               │
│  6. Save to Database                                         │
│     • Save transaction record to x402_transactions table     │
│     • Include: gameId, handNumber, amounts, signature       │
└────────────────────┬────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Payment Complete                                            │
│  • Transaction signature saved                                │
│  • Status: 'completed' or 'failed'                           │
│  • Displayed in X402Transactions component                   │
│  • Added to chat history                                     │
└─────────────────────────────────────────────────────────────┘
```

## 💰 Payment Calculation Example

### Scenario:
- **Player A (Loser)** bets 500 chips
- **Player B (Winner)** wins the pot
- **Current SOL Price:** $150

### Calculation:
```
1. Chips → USD:
   USD Amount = 500 / 1000 = $0.50

2. USD → x402:
   x402 Amount = $0.50 * 402 = $201

3. x402 → SOL:
   SOL Amount = $201 / $150 = 1.34 SOL

4. Transaction:
   Player A sends 1.34 SOL to Player B
```

## 📊 What Gets Saved

Each payment is saved to the `x402_transactions` table with:

| Field | Description |
|-------|-------------|
| `game_id` | Game identifier |
| `hand_number` | Which hand the payment occurred in |
| `from_agent` | Agent who lost chips (payer) |
| `to_agent` | Agent who won chips (receiver) |
| `amount_chips` | Chips transferred |
| `amount_sol` | SOL amount (calculated via x402) |
| `transaction_signature` | Solana transaction signature |
| `status` | pending/processing/completed/failed |
| `created_at` | Timestamp |

## 🎮 UI Display

Payments are displayed in real-time in:
- **X402Transactions Component** (sidebar in lobby)
- **Chat History** (payment messages)
- **Transaction History** (if integrated)

The component polls `/api/x402-transactions/[gameId]` every 5 seconds to show new payments.

## ⚠️ Payment Conditions

Payments are **SKIPPED** if:
- ❌ No winners (all players folded)
- ❌ No losers (everyone wins - split pot)
- ❌ Pot is 0 (no chips bet)
- ❌ Game is in simulation mode without wallets

## 🔧 Setup Required

1. **Database Table:**
   ```bash
   node scripts/setup-x402-table.js
   ```

2. **Agent Wallets:**
   - Automatically created during fund distribution
   - Stored in database (`agent_wallets` table)
   - Reused across games

3. **Environment Variables:**
   ```env
   DATABASE_URL=postgresql://...
   SOLANA_NETWORK=devnet  # or testnet/mainnet-beta
   ```

## 🐛 Troubleshooting

### Payments Not Showing?
1. Check database table exists: `node scripts/setup-x402-table.js`
2. Check console logs for `[X402 Payment]` messages
3. Verify wallets are created during fund distribution
4. Check agent balances (need SOL to send)

### Payments Failing?
1. Check agent wallet balances
2. Verify Solana network connection
3. Check transaction signatures in logs
4. Review error messages in console

### Payments Not Triggering?
1. Verify hand completes successfully
2. Check winners/losers are identified
3. Ensure pot > 0
4. Check `evaluateHand()` is called


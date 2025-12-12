# Debugging x402 Agent-to-Agent Payments

## Common Issues and Solutions

### Issue 1: Payments not showing up

**Check:**
1. Database table exists: Run `node scripts/setup-x402-table.js`
2. Check console logs for:
   - `[X402 Payment] 💰 Processing agent-to-agent payments`
   - `[X402 Payment] ✅ Payments processed`
   - `[X402 Payment] 💾 Transaction saved to DB`

### Issue 2: "Missing wallet addresses" error

**Solution:** Wallets are now auto-registered. Check logs for:
- `[X402 Payment] Auto-registered wallet for [AgentName]`

### Issue 3: Database errors

**Check:**
- `DATABASE_URL` is set in `.env.local`
- Table exists: `SELECT * FROM x402_transactions LIMIT 1;`
- If table doesn't exist, run: `node scripts/setup-x402-table.js`

### Issue 4: No payments being created

**Check:**
- Are there winners AND losers? (Payments only happen when pot is distributed)
- Is `potBeforeDistribution > 0`?
- Check console for: `[X402 Payment] ⏭️  Skipping payments`

### Testing Steps

1. Start a game with multiple AI models
2. Play until a hand finishes with a winner
3. Check browser console for payment logs
4. Check the X402Transactions component in the sidebar
5. Check database: `SELECT * FROM x402_transactions WHERE game_id = 'your-game-id';`

### Expected Console Output

```
[X402 Payment] 💰 Processing agent-to-agent payments: { winners: [...], losers: [...], pot: 500 }
[X402 Payment] Processing payment: { fromAgent: 'Gemini', toAgent: 'ChatGPT', chipsAmount: 250, ... }
[X402 Payment] ✅ Payment completed: { ... }
[X402 Payment] 💾 Transaction saved to DB: uuid-here
[X402 Payment] ✅ Payments processed: [Array of payments]
```


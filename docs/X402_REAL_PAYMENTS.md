# Real x402 Agent-to-Agent Payments Implementation

## Overview

This implementation creates real Solana wallets for each AI agent and processes actual x402 payments between them using the Solana blockchain.

## Payment Calculation

### Initial Funding Formula

```
Starting Chips = 1000 per player
Number of Players = 4 (example)
Total USD Value = (Starting Chips / 1000) * Number of Players
                = (1000 / 1000) * 4
                = $4

x402 Multiplier = 402
Total x402 Value = Total USD Value * 402
                 = $4 * 402
                 = $1,608

Funding Per Agent = Total x402 Value / Number of Players
                  = $1,608 / 4
                  = $402 per agent
```

### Payment Calculation

When an agent wins chips, the payment is calculated as:

```
Chips Won = 500 (example)
USD Amount = Chips Won / 1000 = $0.50
x402 Amount = USD Amount * 402 = $201
SOL Amount = x402 Amount / SOL Price
```

## Architecture

### Components

1. **SolanaWalletManager** (`lib/payments/solana-wallet-manager.ts`)
   - Generates Solana keypairs for each agent
   - Manages wallet creation and retrieval
   - Handles airdrops on devnet/testnet
   - Checks balances

2. **X402AgentPaymentService** (`lib/payments/x402-agent-payments.ts`)
   - Processes real Solana transactions
   - Calculates x402 payment amounts
   - Sends transactions on-chain
   - Saves transaction records to database

3. **GameManager Integration** (`lib/game-manager.ts`)
   - Creates wallets for all agents on game start
   - Funds wallets with calculated amounts
   - Triggers payments after each hand

## Wallet Management

### Automatic Wallet Generation

When a game starts:
1. For each agent, check if a wallet exists in environment variables
2. If not, generate a new Solana keypair
3. Store the wallet in memory (and optionally in database)
4. Request airdrop on devnet/testnet to fund the wallet

### Environment Variables

You can optionally set agent wallet private keys in `.env.local`:

```env
# Agent Wallet Private Keys (Base58 encoded)
AGENT_WALLET_CHATGPT_PRIVATE_KEY=your_base58_private_key_here
AGENT_WALLET_GEMINI_PRIVATE_KEY=your_base58_private_key_here
AGENT_WALLET_GROK_PRIVATE_KEY=your_base58_private_key_here
AGENT_WALLET_CLAUDE_PRIVATE_KEY=your_base58_private_key_here
```

### Generating a Wallet

To generate a new wallet and get its private key:

```bash
node -e "const {Keypair} = require('@solana/web3.js'); const kp = Keypair.generate(); console.log('Private Key (base58):', require('bs58').encode(kp.secretKey)); console.log('Public Key:', kp.publicKey.toString());"
```

## Payment Flow

### 1. Game Start

```
Game Starts
  ↓
For each agent:
  - Create/get Solana wallet
  - Calculate funding: (startingChips * numPlayers * 402) / numPlayers
  - Request airdrop (devnet/testnet) or transfer funds (mainnet)
  ↓
Wallets ready for payments
```

### 2. Hand Completion

```
Hand Completes
  ↓
Determine winners and losers
  ↓
For each winner-loser pair:
  - Calculate payment: (chipsLost / 1000) * 402
  - Convert to SOL
  - Create Solana transaction
  - Sign with loser's keypair
  - Send transaction
  - Wait for confirmation
  ↓
Save transaction to database
  ↓
Display in UI
```

## Transaction Details

### Real Solana Transactions

Each payment creates a real Solana transaction:

```typescript
const transaction = new Transaction().add(
  SystemProgram.transfer({
    fromPublicKey: fromKeypair.publicKey,
    toPublicKey: toPublicKey,
    lamports: calculatedLamports,
  })
);

const signature = await sendAndConfirmTransaction(
  connection,
  transaction,
  [fromKeypair],
  { commitment: 'confirmed' }
);
```

### Transaction Links

All transactions are viewable on Solscan:
- Devnet: `https://solscan.io/tx/{signature}?cluster=devnet`
- Testnet: `https://solscan.io/tx/{signature}?cluster=testnet`
- Mainnet: `https://solscan.io/tx/{signature}`

## Network Configuration

### Devnet (Default for Development)

- Network: `devnet`
- RPC: `https://api.devnet.solana.com`
- Features:
  - Free SOL airdrops
  - No real money
  - Fast transactions
  - Perfect for testing

### Testnet

- Network: `testnet`
- RPC: `https://api.testnet.solana.com`
- Features:
  - Free SOL airdrops
  - More stable than devnet
  - Good for staging

### Mainnet (Production)

- Network: `mainnet-beta`
- RPC: `https://api.mainnet-beta.solana.com`
- Features:
  - Real SOL required
  - Real money transactions
  - Production use only

Set in `.env.local`:
```env
NEXT_PUBLIC_SOLANA_NETWORK=devnet  # or testnet, mainnet-beta
```

## Security Considerations

### Private Keys

⚠️ **IMPORTANT**: Private keys should be:
- Stored securely (environment variables, KMS, etc.)
- Never committed to git
- Rotated regularly
- Backed up securely

### Production Recommendations

1. **Use a Key Management Service (KMS)**
   - AWS KMS
   - Google Cloud KMS
   - HashiCorp Vault

2. **Separate Wallets**
   - One wallet per agent
   - Don't reuse wallets
   - Monitor balances

3. **Transaction Limits**
   - Set maximum payment amounts
   - Rate limit transactions
   - Monitor for anomalies

## Testing

### Local Development

1. Set `NEXT_PUBLIC_SOLANA_NETWORK=devnet` in `.env.local`
2. Start a game with multiple agents
3. Wallets will be auto-generated
4. Airdrops will be requested automatically
5. Play hands and watch transactions

### Viewing Transactions

1. Check browser console for transaction signatures
2. View in X402Transactions component (sidebar)
3. Check database: `SELECT * FROM x402_transactions`
4. View on Solscan using transaction signatures

## Troubleshooting

### "Insufficient balance" Error

- On devnet/testnet: Airdrop will be requested automatically
- On mainnet: Fund wallets manually before starting game

### "Wallet not found" Error

- Ensure wallets are registered before processing payments
- Check that `registerAgentWallet` is called for all agents

### Transaction Failures

- Check RPC endpoint connectivity
- Verify wallet has enough SOL for fees
- Check transaction signature on Solscan for details

## Example Console Output

```
[X402 Payment] Initial funding calculation: {
  startingChips: 1000,
  numPlayers: 4,
  totalUSDValue: '4.00',
  x402TotalValue: '1608.00',
  fundingPerAgent: '402.00'
}
[X402 Payment] Registered wallet for ChatGPT: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
[X402 Payment] Funding ChatGPT with 2.6800 SOL ($402.00)
[X402 Payment] ✅ Airdrop successful for ChatGPT: 5j7s8K9...
[X402 Payment] Processing payment: {
  fromAgent: 'Gemini',
  toAgent: 'ChatGPT',
  chipsAmount: 500,
  usdAmount: '0.50',
  x402Amount: '201.00',
  solAmount: '0.001340',
  lamports: 1340000
}
[X402 Payment] ✅ Transaction confirmed: 3k4j5L6...
[X402 Payment] View on Solscan: https://solscan.io/tx/3k4j5L6...?cluster=devnet
```

## References

- [x402 Protocol](https://github.com/solana-foundation/templates/tree/main/community/x402-template)
- [x402 AI Solana Example](https://github.com/N-45div/x402-ai-Solana)
- [Solana Web3.js Documentation](https://solana-labs.github.io/solana-web3.js/)
- [Solana Documentation](https://docs.solana.com/)


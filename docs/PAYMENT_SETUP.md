# Payment Setup Guide

## Overview

The system uses a **fixed payment address** from `.env.local` to receive all payments. Agent wallets are **automatically generated** for each game.

## Environment Variables

### Required in `.env.local`:

```env
# Fixed Payment Address (Required)
# This is the address that receives all user payments
X402_PAYMENT_PRIVATE_KEY=your_base58_private_key_here
NEXT_PUBLIC_X402_PAYMENT_ADDRESS=your_public_key_here

# Solana Network
NEXT_PUBLIC_SOLANA_NETWORK=testnet  # or devnet, mainnet-beta
```

### Optional (for agent wallets):
```env
# Agent wallets are auto-generated, but you can optionally set them
# If not set, new wallets will be generated for each agent
AGENT_WALLET_CHATGPT_PRIVATE_KEY=
AGENT_WALLET_GEMINI_PRIVATE_KEY=
AGENT_WALLET_GROK_PRIVATE_KEY=
AGENT_WALLET_CLAUDE_SONNET_PRIVATE_KEY=
```

## Generating Payment Address

To generate a payment address and get its private key:

```bash
node -e "const {Keypair} = require('@solana/web3.js'); const kp = Keypair.generate(); console.log('Private Key (base58):', require('bs58').encode(kp.secretKey)); console.log('Public Key:', kp.publicKey.toString());"
```

Then add to `.env.local`:
```env
X402_PAYMENT_PRIVATE_KEY=<private_key_from_above>
NEXT_PUBLIC_X402_PAYMENT_ADDRESS=<public_key_from_above>
```

## How It Works

1. **Payment Address**: Fixed from `.env.local` - all games use the same payment address
2. **Agent Wallets**: Generated automatically for each agent when game starts
3. **Fund Distribution**: After payment, funds are automatically distributed from the fixed payment address to agent wallets
4. **Agent Payments**: Agents use their generated wallets to make x402 payments to each other

## Payment Flow

```
User creates game
  ↓
Fixed payment address shown (from .env.local)
  ↓
User pays to fixed payment address
  ↓
Agent wallets generated automatically
  ↓
Funds distributed from payment address to agent wallets
  ↓
Game starts with funded agents
  ↓
Agents make x402 payments to each other
```

## Testing

1. Set `X402_PAYMENT_PRIVATE_KEY` and `NEXT_PUBLIC_X402_PAYMENT_ADDRESS` in `.env.local`
2. Fund the payment address with SOL (testnet)
3. Create a game - agent wallets will be generated automatically
4. Payment goes to fixed address
5. Funds are distributed to agent wallets automatically


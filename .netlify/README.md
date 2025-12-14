# Netlify Deployment

This project is configured for deployment on Netlify.

## Configuration Files

- `netlify.toml` - Main Netlify configuration
- `.nvmrc` - Node.js version specification

## Build Process

1. Netlify will automatically detect the `netlify.toml` file
2. It will run `npm run build` which includes:
   - `prebuild`: Copies IDL files to `public/idl/`
   - `build`: Runs Next.js build
3. The `@netlify/plugin-nextjs` plugin handles Next.js serverless functions

## Environment Variables

Make sure to set these in Netlify's environment variables:

### Required:
- `DATABASE_URL` - PostgreSQL connection string
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `NEXT_PUBLIC_SOLANA_NETWORK` - Solana network (devnet/testnet/mainnet)
- `NEXT_PUBLIC_SOLANA_RPC_URL` - Solana RPC endpoint

### AI API Keys:
- `OPENAI_API_KEY`
- `GOOGLE_AI_API_KEY`
- `GROK_API_KEY`
- `ANTHROPIC_API_KEY`

### x402 Payments:
- `X402_PAYMENT_PRIVATE_KEY`
- `NEXT_PUBLIC_X402_PAYMENT_ADDRESS`
- `AGENT_WALLET_CHATGPT_PRIVATE_KEY` (and other agent wallets)

### Betting (if using):
- `BETTING_OWNER_PRIVATE_KEY`

## Function Timeouts

- Free tier: 10 seconds max
- Pro/Enterprise: Up to 26 seconds

The `/api/game` route is configured for 26 seconds timeout (will use 10s on free tier).

## Notes

- The app uses Supabase Realtime for WebSocket connections
- Long-running game operations may need to be moved to background jobs for free tier
- Database connections are pooled and should work with Netlify's serverless functions


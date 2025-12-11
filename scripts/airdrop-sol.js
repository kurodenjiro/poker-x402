const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
require('dotenv').config();

// Get network from environment or default to devnet
const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
const WALLET_ADDRESS = process.env.WALLET_ADDRESS || '8Ps7YromU1eoAUKoQFdwM57V8RzxbSzYikigfqDM1nyC';
const AMOUNT_SOL = parseFloat(process.env.AIRDROP_AMOUNT || '2'); // Default 2 SOL

// RPC endpoints
const RPC_ENDPOINTS = {
  devnet: [
    'https://api.devnet.solana.com',
    'https://devnet.solana.com',
  ],
  testnet: [
    'https://api.testnet.solana.com',
    'https://testnet.solana.com',
  ],
};

async function airdropSol() {
  console.log(`\n🚀 Airdropping ${AMOUNT_SOL} SOL to ${WALLET_ADDRESS} on ${NETWORK}...\n`);

  // Try multiple RPC endpoints
  let connection = null;
  for (const endpoint of RPC_ENDPOINTS[NETWORK] || RPC_ENDPOINTS.devnet) {
    try {
      console.log(`Trying RPC endpoint: ${endpoint}`);
      connection = new Connection(endpoint, 'confirmed');
      await connection.getVersion();
      console.log(`✓ Connected to ${endpoint}\n`);
      break;
    } catch (err) {
      console.warn(`✗ Failed to connect to ${endpoint}: ${err.message}`);
    }
  }

  if (!connection) {
    console.error('❌ Failed to connect to any RPC endpoint');
    process.exit(1);
  }

  try {
    // Validate wallet address
    const publicKey = new PublicKey(WALLET_ADDRESS);
    console.log(`Wallet address: ${publicKey.toString()}`);

    // Check current balance
    const balanceBefore = await connection.getBalance(publicKey);
    console.log(`Balance before: ${(balanceBefore / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);

    // Request airdrop
    console.log(`Requesting airdrop of ${AMOUNT_SOL} SOL...`);
    const signature = await connection.requestAirdrop(
      publicKey,
      AMOUNT_SOL * LAMPORTS_PER_SOL
    );

    console.log(`✓ Airdrop transaction sent: ${signature}`);
    console.log(`Waiting for confirmation...`);

    // Wait for confirmation
    await connection.confirmTransaction(signature, 'confirmed');
    console.log(`✓ Transaction confirmed!\n`);

    // Check new balance
    const balanceAfter = await connection.getBalance(publicKey);
    console.log(`Balance after: ${(balanceAfter / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log(`Airdropped: ${((balanceAfter - balanceBefore) / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);

    console.log(`✅ Success! You can view the transaction at:`);
    console.log(`https://solscan.io/tx/${signature}?cluster=${NETWORK}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('429')) {
      console.error('\n⚠️  Rate limit exceeded. Please wait a few minutes and try again.');
      console.error('   Devnet/testnet airdrops are rate-limited to prevent abuse.\n');
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  airdropSol().catch(console.error);
}

module.exports = { airdropSol };


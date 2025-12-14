import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import { getWalletManager } from './solana-wallet-manager';
import bs58 from 'bs58';

const SOLANA_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
const SOLANA_RPC = SOLANA_NETWORK === 'devnet' 
  ? 'https://api.devnet.solana.com'
  : SOLANA_NETWORK === 'testnet'
  ? 'https://api.testnet.solana.com'
  : 'https://api.mainnet-beta.solana.com';

/**
 * Distributes funds from payment account to agent wallets
 */
export class FundDistributor {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(SOLANA_RPC, 'confirmed');
  }

  /**
   * Distribute funds from payment account to agent wallets
   * @param gameId Game ID
   * @param agentNames List of agent names
   * @param totalAmountUSD Total amount in USD that was paid
   */
  async distributeFunds(
    gameId: string,
    agentNames: string[],
    totalAmountUSD: number
  ): Promise<void> {
    const walletManager = getWalletManager();

    // Get fixed payment address from environment
    const paymentPrivateKey = process.env.X402_PAYMENT_PRIVATE_KEY;
    if (!paymentPrivateKey) {
      throw new Error(
        'Payment address not configured. Please set X402_PAYMENT_PRIVATE_KEY in .env.local'
      );
    }

    // Create keypair from fixed payment address
    let paymentKeypair: Keypair;
    try {
      const secretKey = bs58.decode(paymentPrivateKey);
      paymentKeypair = Keypair.fromSecretKey(secretKey);
      console.log(`[Fund Distributor] Using fixed payment address: ${paymentKeypair.publicKey.toString()}`);
    } catch (error: any) {
      throw new Error(`Invalid payment private key in .env.local: ${error.message || error}`);
    }

    // Check if payment was actually received by checking balance
    const paymentBalance = await this.connection.getBalance(paymentKeypair.publicKey);
    const paymentBalanceSOL = paymentBalance / LAMPORTS_PER_SOL;

    // If balance is 0 or very small, payment hasn't been received yet
    if (paymentBalanceSOL < 0.0001) {
      throw new Error(
        `Payment not received yet. Payment account balance: ${paymentBalanceSOL.toFixed(6)} SOL. ` +
        `Please wait for the transaction to confirm or send SOL to: ${paymentKeypair.publicKey.toString()}`
      );
    }

    // Calculate distribution per agent
    const amountPerAgentUSD = totalAmountUSD / agentNames.length;
    
    // Get SOL price (with retry and timeout)
    const { getCachedSolPrice } = await import('../utils/sol-price-fetcher');
    const solPrice = await getCachedSolPrice();

    const solAmountPerAgent = amountPerAgentUSD / solPrice;
    const lamportsPerAgent = Math.floor(solAmountPerAgent * LAMPORTS_PER_SOL);

    console.log(`[Fund Distributor] Distributing funds:`, {
      gameId,
      totalAmountUSD,
      amountPerAgentUSD: amountPerAgentUSD.toFixed(2),
      solAmountPerAgent: solAmountPerAgent.toFixed(6),
      lamportsPerAgent,
      numAgents: agentNames.length,
      paymentBalanceSOL: paymentBalanceSOL.toFixed(6),
    });

    // Verify balance is sufficient for distribution
    const totalNeeded = solAmountPerAgent * agentNames.length + 0.001; // Add buffer for fees

    if (paymentBalanceSOL < totalNeeded) {
      throw new Error(
        `Insufficient balance in payment account. Have ${paymentBalanceSOL.toFixed(6)} SOL, need ${totalNeeded.toFixed(6)} SOL. ` +
        `Payment may still be confirming. Please wait a moment and try again.`
      );
    }

    // Get recent blockhash once (can reuse for multiple transactions)
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');

    // Distribute to each agent
    for (const agentName of agentNames) {
      try {
        // Get or create agent wallet
        const agentWallet = await walletManager.getOrCreateWallet(agentName);
        const agentPublicKey = new PublicKey(agentWallet.publicKey);

        // Validate public keys
        if (!paymentKeypair.publicKey) {
          throw new Error('Payment keypair public key is undefined');
        }
        if (!agentPublicKey) {
          throw new Error(`Agent ${agentName} public key is undefined`);
        }

        console.log(`[Fund Distributor] Transferring ${solAmountPerAgent.toFixed(6)} SOL to ${agentName}...`);
        console.log(`[Fund Distributor] From: ${paymentKeypair.publicKey.toString()}`);
        console.log(`[Fund Distributor] To: ${agentPublicKey.toString()}`);
        console.log(`[Fund Distributor] Amount: ${lamportsPerAgent} lamports`);

        // Create transfer transaction
        const transaction = new Transaction();
        
        // Set blockhash and fee payer BEFORE adding instructions
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = paymentKeypair.publicKey;

        // Add transfer instruction
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: paymentKeypair.publicKey,
            toPubkey: agentPublicKey,
            lamports: lamportsPerAgent,
          })
        );

        // Sign transaction
        transaction.sign(paymentKeypair);
        
        // Send transaction (without WebSocket subscriptions to avoid Next.js conflicts)
        console.log(`[Fund Distributor] Sending transaction...`);
        const signature = await this.connection.sendRawTransaction(
          transaction.serialize(),
          {
            skipPreflight: false,
            maxRetries: 3,
          }
        );
        
        console.log(`[Fund Distributor] Transaction sent: ${signature}`);
        console.log(`[Fund Distributor] View: https://solscan.io/tx/${signature}?cluster=${SOLANA_NETWORK}`);
        
        // Wait for confirmation by polling (instead of WebSocket subscription)
        console.log(`[Fund Distributor] Waiting for confirmation...`);
        
        // Manual polling for confirmation (avoids WebSocket issues)
        let confirmed = false;
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds timeout
        
        while (!confirmed && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
          attempts++;
          
          try {
            const status = await this.connection.getSignatureStatus(signature);
            
            if (status?.value) {
              if (status.value.err) {
                throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
              }
              if (status.value.confirmationStatus === 'confirmed' || status.value.confirmationStatus === 'finalized') {
                confirmed = true;
                console.log(`[Fund Distributor] Transaction confirmed after ${attempts} seconds`);
                break;
              }
            }
          } catch (error: any) {
            // Continue polling on error
            if (attempts >= maxAttempts) {
              throw new Error(`Transaction confirmation timeout after ${maxAttempts} seconds: ${error.message || error}`);
            }
          }
        }
        
        if (!confirmed) {
          throw new Error(`Transaction confirmation timeout after ${maxAttempts} seconds`);
        }
        
        console.log(`[Fund Distributor] ✅ Transferred to ${agentName}: ${signature}`);
      } catch (error: any) {
        console.error(`[Fund Distributor] ❌ Failed to transfer to ${agentName}:`, error);
        throw error;
      }
    }

    console.log(`[Fund Distributor] ✅ All funds distributed for game ${gameId}`);
  }
}

// Singleton instance
let fundDistributorInstance: FundDistributor | null = null;

export function getFundDistributor(): FundDistributor {
  if (!fundDistributorInstance) {
    fundDistributorInstance = new FundDistributor();
  }
  return fundDistributorInstance;
}


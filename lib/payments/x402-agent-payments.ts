import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { query } from '../db/postgres';
import { getWalletManager, SolanaWalletManager } from './solana-wallet-manager';

// x402 Agent-to-Agent Payment Service
// Based on: https://github.com/solana-foundation/templates/tree/main/community/solana-chatgpt-kit

const SOLANA_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
const SOLANA_RPC = SOLANA_NETWORK === 'devnet' 
  ? 'https://api.devnet.solana.com'
  : SOLANA_NETWORK === 'testnet'
  ? 'https://api.testnet.solana.com'
  : 'https://api.mainnet-beta.solana.com';

const CHIPS_TO_SOL_RATE = 1000; // 1$ = 1000 chips

export interface AgentPayment {
  id?: string;
  gameId?: string;
  handNumber?: number;
  fromAgent: string; // Agent name/model
  toAgent: string; // Agent name/model
  amount: number; // Amount in chips
  amountSol?: number; // Amount in SOL
  transactionSignature?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt?: Date;
}

export class X402AgentPaymentService {
  private connection: Connection;
  private agentWallets: Map<string, string>; // Map agent name to wallet address (public key)
  public walletManager: SolanaWalletManager; // Public for access in game-manager

  constructor() {
    this.connection = new Connection(SOLANA_RPC, 'confirmed');
    this.agentWallets = new Map();
    this.walletManager = getWalletManager();
  }

  /**
   * Register an agent's wallet address
   * Uses existing funded wallet from wallet manager (created during fund distribution)
   */
  async registerAgentWallet(agentName: string, walletAddress?: string): Promise<string> {
    // If wallet already registered in payment service, use it
    if (this.agentWallets.has(agentName)) {
      const existingWallet = this.agentWallets.get(agentName)!;
      console.log(`[X402 Payment] Using existing registered wallet for ${agentName}: ${existingWallet}`);
      return existingWallet;
    }

    if (walletAddress) {
      // Use provided wallet address
      this.agentWallets.set(agentName, walletAddress);
      console.log(`[X402 Payment] Registered provided wallet for ${agentName}: ${walletAddress}`);
      return walletAddress;
    }

    // Get existing wallet from wallet manager (checks database first)
    // Don't create new wallet - use the one that was funded
    const existingWallet = await this.walletManager.getWallet(agentName);
    if (existingWallet) {
      this.agentWallets.set(agentName, existingWallet.publicKey);
      console.log(`[X402 Payment] Using existing funded wallet for ${agentName}: ${existingWallet.publicKey}`);
      return existingWallet.publicKey;
    }

    // If no wallet exists, it means funds weren't distributed yet
    // In this case, we still need a wallet, but it should be created during fund distribution
    // For now, get or create (but this should rarely happen)
    const wallet = await this.walletManager.getOrCreateWallet(agentName);
    this.agentWallets.set(agentName, wallet.publicKey);
    
    console.log(`[X402 Payment] ⚠️  Created new wallet for ${agentName} (funds may not be distributed yet): ${wallet.publicKey}`);
    return wallet.publicKey;
  }

  /**
   * Process agent-to-agent payment when a hand is won/lost
   */
  async processAgentPayment(
    fromAgent: string,
    toAgent: string,
    chipsAmount: number,
    gameId?: string,
    handNumber?: number
  ): Promise<AgentPayment> {
    console.log('🟡 [X402 Payment] ========== processAgentPayment START ==========');
    console.log('🟡 [X402 Payment] From:', fromAgent);
    console.log('🟡 [X402 Payment] To:', toAgent);
    console.log('🟡 [X402 Payment] Amount (chips):', chipsAmount);
    console.log('🟡 [X402 Payment] Game ID:', gameId);
    console.log('🟡 [X402 Payment] Hand Number:', handNumber);
    
    const payment: AgentPayment = {
      fromAgent,
      toAgent,
      amount: chipsAmount,
      status: 'pending',
    };

    try {
      console.log('🟡 [X402 Payment] Getting wallets...');
      // Get or create wallets for both agents
      let fromWallet = this.agentWallets.get(fromAgent);
      let toWallet = this.agentWallets.get(toAgent);
      console.log('🟡 [X402 Payment] From wallet (cached):', fromWallet || 'NOT FOUND');
      console.log('🟡 [X402 Payment] To wallet (cached):', toWallet || 'NOT FOUND');

      if (!fromWallet) {
        console.log('🟡 [X402 Payment] Registering fromAgent wallet...');
        fromWallet = await this.registerAgentWallet(fromAgent);
        console.log('🟡 [X402 Payment] From wallet registered:', fromWallet);
      }
      if (!toWallet) {
        console.log('🟡 [X402 Payment] Registering toAgent wallet...');
        toWallet = await this.registerAgentWallet(toAgent);
        console.log('🟡 [X402 Payment] To wallet registered:', toWallet);
      }

      console.log('🟡 [X402 Payment] Getting keypairs...');
      // Get keypairs for signing
      const fromKeypair = await this.walletManager.getKeypair(fromAgent);
      const toPublicKey = await this.walletManager.getPublicKey(toAgent);
      console.log('🟡 [X402 Payment] From keypair:', fromKeypair ? 'FOUND' : 'NOT FOUND');
      console.log('🟡 [X402 Payment] To public key:', toPublicKey ? toPublicKey.toString() : 'NOT FOUND');

      if (!fromKeypair || !toPublicKey) {
        throw new Error(`Failed to get wallet keypairs for payment: ${fromAgent} -> ${toAgent}`);
      }

      // Fetch current SOL price for accurate conversion
      let solPrice = 150; // Fallback price
      try {
        // Use node-fetch or native fetch if available
        const fetch = (global as any).fetch || require('node-fetch');
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        const data = await response.json();
        if (data.solana && data.solana.usd) {
          solPrice = data.solana.usd;
        }
      } catch (err) {
        console.warn('[X402 Payment] Could not fetch SOL price, using fallback:', err);
      }

      // Direct Chip to SOL Conversion:
      // Starting chips = 1000 per player = $1
      // 1 chip = $0.001 USD
      // Convert chips to USD, then to SOL
      
      // Convert chips to USD (1$ = 1000 chips, so 1 chip = $0.001)
      const usdAmount = chipsAmount / CHIPS_TO_SOL_RATE;
      // Convert USD directly to SOL
      const solAmount = usdAmount / solPrice;
      const lamports = Math.ceil(solAmount * LAMPORTS_PER_SOL);

      if (lamports === 0) {
        console.log(`🟡 [X402 Payment] ⚠️  Amount too small to process: ${chipsAmount} chips`);
        payment.status = 'completed'; // Skip micro-transactions
        payment.gameId = gameId;
        payment.handNumber = handNumber;
        await this.saveTransactionToDB(payment).catch(err => console.error('🟡 [X402 Payment] Failed to save:', err));
        return payment;
      }

      console.log('🟡 [X402 Payment] ✅ Amount is valid, setting status to processing...');
      console.log('🟡 [X402 Payment] Payment calculation:', {
        chipsAmount,
        usdAmount: usdAmount.toFixed(4),
        solAmount: solAmount.toFixed(6),
        lamports,
        solPrice
      });
      payment.status = 'processing';

      console.log(`🟡 [X402 Payment] Processing payment:`, {
        fromAgent,
        toAgent,
        chipsAmount,
        usdAmount: usdAmount.toFixed(2),
        solAmount: solAmount.toFixed(6),
        lamports,
        fromWallet,
        toWallet,
      });

      // Ensure sender has enough balance
      console.log('🟡 [X402 Payment] Checking balance...');
      const fromBalance = await this.walletManager.getBalance(fromAgent);
      const requiredSOL = solAmount + 0.00001; // Add small buffer for fees
      console.log('🟡 [X402 Payment] Balance check:', {
        fromAgent,
        fromBalance,
        requiredSOL,
        hasEnough: fromBalance >= requiredSOL
      });
      
      if (fromBalance < requiredSOL) {
        console.warn(`🟡 [X402 Payment] ⚠️  Insufficient balance for ${fromAgent}: ${fromBalance} SOL < ${requiredSOL} SOL`);
        // Try to airdrop on devnet/testnet
        if (SOLANA_NETWORK !== 'mainnet-beta') {
          console.log(`🟡 [X402 Payment] Requesting airdrop for ${fromAgent}...`);
          await this.walletManager.requestAirdrop(fromAgent, requiredSOL * 2);
          // Wait a bit for airdrop to confirm
          await new Promise(resolve => setTimeout(resolve, 2000));
          console.log(`🟡 [X402 Payment] Airdrop requested, waiting...`);
        } else {
          throw new Error(`Insufficient balance: ${fromAgent} has ${fromBalance} SOL but needs ${requiredSOL} SOL`);
        }
      }

      // Get recent blockhash first
      console.log('🟡 [X402 Payment] Getting recent blockhash...');
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      console.log('🟡 [X402 Payment] Blockhash obtained:', blockhash.substring(0, 16) + '...');

      // Create transaction
      console.log('🟡 [X402 Payment] Creating Solana transaction...');
      const transaction = new Transaction();
      
      // Set blockhash and fee payer BEFORE adding instructions
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromKeypair.publicKey;
      console.log('🟡 [X402 Payment] Transaction blockhash and fee payer set');

      // Add transfer instruction
      console.log('🟡 [X402 Payment] Adding transfer instruction...');
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: fromKeypair.publicKey,
          toPubkey: toPublicKey,
          lamports,
        })
      );
      console.log('🟡 [X402 Payment] Transfer instruction added');

      // Sign transaction
      console.log('🟡 [X402 Payment] Signing transaction...');
      transaction.sign(fromKeypair);
      console.log('🟡 [X402 Payment] Transaction signed');

      // Send transaction (without WebSocket subscriptions to avoid Next.js conflicts)
      console.log(`🟡 [X402 Payment] 🚀🚀🚀 SENDING TRANSACTION NOW 🚀🚀🚀`);
      console.log(`🟡 [X402 Payment] From: ${fromAgent} (${fromKeypair.publicKey.toString().substring(0, 8)}...)`);
      console.log(`🟡 [X402 Payment] To: ${toAgent} (${toPublicKey.toString().substring(0, 8)}...)`);
      console.log(`🟡 [X402 Payment] Amount: ${lamports} lamports (${solAmount.toFixed(6)} SOL)`);
      
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          maxRetries: 3,
        }
      );

      console.log(`🟡 [X402 Payment] ✅✅✅ TRANSACTION SENT ✅✅✅`);
      console.log(`🟡 [X402 Payment] Signature: ${signature}`);
      console.log(`🟡 [X402 Payment] View: https://solscan.io/tx/${signature}?cluster=${SOLANA_NETWORK}`);

      // Wait for confirmation by polling (instead of WebSocket subscription)
      console.log(`🟡 [X402 Payment] ⏳ Waiting for confirmation...`);
      
      let confirmed = false;
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds timeout
      
      while (!confirmed && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        attempts++;
        
        if (attempts % 5 === 0) {
          console.log(`🟡 [X402 Payment] Still waiting... (${attempts}/${maxAttempts} seconds)`);
        }
        
        try {
          const status = await this.connection.getSignatureStatus(signature);
          
          if (status?.value) {
            if (status.value.err) {
              console.error(`🟡 [X402 Payment] ❌ Transaction error:`, status.value.err);
              throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
            }
            if (status.value.confirmationStatus === 'confirmed' || status.value.confirmationStatus === 'finalized') {
              confirmed = true;
              console.log(`🟡 [X402 Payment] ✅✅✅ TRANSACTION CONFIRMED ✅✅✅`);
              console.log(`🟡 [X402 Payment] Confirmed after ${attempts} seconds`);
              break;
            }
          }
        } catch (error: any) {
          // Continue polling on error
          if (attempts >= maxAttempts) {
            console.error(`🟡 [X402 Payment] ❌ Confirmation timeout after ${maxAttempts} seconds`);
            throw new Error(`Transaction confirmation timeout after ${maxAttempts} seconds: ${error.message || error}`);
          }
        }
      }
      
      if (!confirmed) {
        console.error(`🟡 [X402 Payment] ❌ Transaction not confirmed after ${maxAttempts} seconds`);
        throw new Error(`Transaction confirmation timeout after ${maxAttempts} seconds`);
      }

      console.log(`🟡 [X402 Payment] ✅✅✅ TRANSACTION CONFIRMED ✅✅✅`);
      console.log(`🟡 [X402 Payment] Signature: ${signature}`);
      console.log(`🟡 [X402 Payment] View on Solscan: https://solscan.io/tx/${signature}?cluster=${SOLANA_NETWORK}`);

      payment.status = 'completed';
      payment.transactionSignature = signature;
      payment.amountSol = solAmount;
      payment.gameId = gameId;
      payment.handNumber = handNumber;

      // Save to database
      await this.saveTransactionToDB(payment);

      console.log(`[X402 Payment] ✅ Payment completed and saved:`, {
        fromAgent: payment.fromAgent,
        toAgent: payment.toAgent,
        amount: payment.amount,
        amountSol: payment.amountSol,
        signature: payment.transactionSignature,
        gameId: payment.gameId,
        handNumber: payment.handNumber,
      });

      return payment;
    } catch (error: any) {
      console.error(`[X402 Payment] ❌ Payment failed:`, error);
      payment.status = 'failed';
      payment.gameId = gameId;
      payment.handNumber = handNumber;
      
      // Save failed payment to database so it can be displayed
      await this.saveTransactionToDB(payment).catch(err => {
        console.error(`[X402 Payment] Failed to save failed payment to DB:`, err);
      });
      
      return payment;
    }
  }

  /**
   * Save transaction to database
   */
  private async saveTransactionToDB(payment: AgentPayment): Promise<void> {
    if (!payment.gameId) {
      console.warn('[X402 Payment] Skipping DB save (no gameId)');
      return;
    }

    if (!process.env.DATABASE_URL) {
      console.warn('[X402 Payment] Skipping DB save (no DATABASE_URL)');
      return;
    }

    try {
      console.log(`[X402 Payment] 💾 Saving transaction to DB:`, {
        gameId: payment.gameId,
        handNumber: payment.handNumber,
        fromAgent: payment.fromAgent,
        toAgent: payment.toAgent,
        amountChips: payment.amount,
        amountSol: payment.amountSol,
        signature: payment.transactionSignature?.substring(0, 16) + '...',
        status: payment.status,
      });

      const result = await query(
        `INSERT INTO x402_transactions 
         (game_id, hand_number, from_agent, to_agent, amount_chips, amount_sol, transaction_signature, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING id`,
        [
          payment.gameId,
          payment.handNumber || null,
          payment.fromAgent,
          payment.toAgent,
          payment.amount,
          payment.amountSol || null,
          payment.transactionSignature || null,
          payment.status,
        ]
      );

      if (result.rows && result.rows.length > 0) {
        payment.id = result.rows[0].id;
        console.log(`[X402 Payment] ✅ Transaction saved to DB with ID: ${payment.id}`);
      } else {
        console.warn(`[X402 Payment] ⚠️  Transaction insert returned no rows`);
      }
    } catch (error: any) {
      // Check if error is due to missing table
      if (error.message && error.message.includes('does not exist')) {
        console.error('[X402 Payment] ⚠️  x402_transactions table does not exist. Run: node scripts/setup-x402-table.js');
        console.error('[X402 Payment] Full error:', error);
      } else {
        console.error('[X402 Payment] ❌ Error saving transaction to DB:', error.message || error);
        console.error('[X402 Payment] Full error details:', error);
      }
      // Don't throw - payment should still be considered successful even if DB save fails
    }
  }

  /**
   * Process pot distribution to winner(s)
   * Creates x402 payments from losers to winners
   * ALWAYS called after each hand finishes
   */
  async distributePot(
    winners: Array<{ agentName: string; chipsWon: number }>,
    losers: Array<{ agentName: string; chipsLost: number }>,
    gameId?: string,
    handNumber?: number
  ): Promise<AgentPayment[]> {
    console.log('🟢 [X402 Payment] distributePot CALLED');
    console.log('🟢 [X402 Payment] Winners:', JSON.stringify(winners, null, 2));
    console.log('🟢 [X402 Payment] Losers:', JSON.stringify(losers, null, 2));
    console.log('🟢 [X402 Payment] Game ID:', gameId);
    console.log('🟢 [X402 Payment] Hand Number:', handNumber);
    
    const payments: AgentPayment[] = [];

    // Validate inputs
    if (!winners || winners.length === 0) {
      console.log(`🟢 [X402 Payment] ⚠️  No winners to receive payments (Hand #${handNumber || '?'})`);
      return payments;
    }

    if (!losers || losers.length === 0) {
      console.log(`🟢 [X402 Payment] ⚠️  No losers to pay from (Hand #${handNumber || '?'})`);
      return payments;
    }

    // Calculate total pot from losers
    const totalPot = losers.reduce((sum, loser) => sum + loser.chipsLost, 0);
    console.log('🟢 [X402 Payment] Total pot calculated:', totalPot);
    
    if (totalPot === 0) {
      console.log(`🟢 [X402 Payment] ⚠️  No pot to distribute - total pot is 0 (Hand #${handNumber || '?'})`);
      return payments;
    }

    const potPerWinner = Math.floor(totalPot / winners.length);
    const remainder = totalPot % winners.length;

    console.log(`🟢 [X402 Payment] Distributing pot:`, {
      totalPot,
      potPerWinner,
      remainder,
      winners: winners.length,
      losers: losers.length,
      gameId,
      handNumber,
    });

    // Process payments from each loser to each winner
    console.log(`🟢 [X402 Payment] Starting payment loop: ${winners.length} winners × ${losers.length} losers`);
    let paymentIndex = 0;
    
    for (const winner of winners) {
      const winnerAmount = potPerWinner + (winner === winners[0] ? remainder : 0);
      console.log(`🟢 [X402 Payment] Processing winner: ${winner.agentName}, amount: ${winnerAmount}`);
      
      for (const loser of losers) {
        if (loser.chipsLost > 0) {
          // Calculate proportional payment from this loser to this winner
          const paymentAmount = Math.floor((loser.chipsLost / totalPot) * winnerAmount);
          paymentIndex++;
          
          console.log(`🟢 [X402 Payment] Payment ${paymentIndex}: ${loser.agentName} → ${winner.agentName}, ${paymentAmount} chips`);
          
          if (paymentAmount > 0) {
            console.log(`🟢 [X402 Payment] ✅ Payment amount > 0, calling processAgentPayment...`);
            
            try {
              const payment = await this.processAgentPayment(
                loser.agentName,
                winner.agentName,
                paymentAmount,
                gameId,
                handNumber
              );
              
              console.log(`🟢 [X402 Payment] processAgentPayment returned:`, payment);
              payments.push(payment);
              
              if (payment.status === 'completed') {
                console.log(`🟢 [X402 Payment] ✅ Payment completed: ${loser.agentName} → ${winner.agentName}`);
              } else if (payment.status === 'failed') {
                console.error(`🟢 [X402 Payment] ❌ Payment failed: ${loser.agentName} → ${winner.agentName}`);
              } else {
                console.log(`🟢 [X402 Payment] ⚠️  Payment status: ${payment.status}`);
              }
            } catch (error) {
              console.error(`🟢 [X402 Payment] ❌ ERROR in processAgentPayment:`, error);
              const failedPayment: AgentPayment = {
                fromAgent: loser.agentName,
                toAgent: winner.agentName,
                amount: paymentAmount,
                status: 'failed',
                gameId,
                handNumber,
              };
              payments.push(failedPayment);
            }
          } else {
            console.log(`🟢 [X402 Payment] ⚠️  Skipping payment (amount is 0)`);
          }
        } else {
          console.log(`🟢 [X402 Payment] ⚠️  Skipping loser ${loser.agentName} (chipsLost is 0)`);
        }
      }
    }

    console.log(`🟢 [X402 Payment] ========== distributePot COMPLETE ==========`);
    console.log(`🟢 [X402 Payment] Total payments processed: ${payments.length}`);
    console.log(`🟢 [X402 Payment] Payment statuses:`, payments.map(p => `${p.fromAgent}→${p.toAgent}:${p.status}`));
    
    // Summary of payments
    const completed = payments.filter(p => p.status === 'completed').length;
    const failed = payments.filter(p => p.status === 'failed').length;
    const processing = payments.filter(p => p.status === 'processing').length;
    const pending = payments.filter(p => p.status === 'pending').length;
    
    console.log(`🟢 [X402 Payment] Payment Summary:`);
    console.log(`🟢 [X402 Payment]   ✅ Completed: ${completed}`);
    console.log(`🟢 [X402 Payment]   ❌ Failed: ${failed}`);
    console.log(`🟢 [X402 Payment]   ⏳ Processing: ${processing}`);
    console.log(`🟢 [X402 Payment]   ⏸️  Pending: ${pending}`);
    
    if (completed > 0) {
      console.log(`🟢 [X402 Payment] ✅✅✅ ${completed} X402 PAYMENT(S) COMPLETED SUCCESSFULLY ✅✅✅`);
    }
    if (failed > 0) {
      console.error(`🟢 [X402 Payment] ❌❌❌ ${failed} X402 PAYMENT(S) FAILED ❌❌❌`);
    }
    
    return payments;
  }

  /**
   * Get payment history for an agent
   */
  getAgentPaymentHistory(agentName: string): AgentPayment[] {
    // In production, this would query a database
    return [];
  }
}

// Singleton instance
let paymentServiceInstance: X402AgentPaymentService | null = null;

export function getPaymentService(): X402AgentPaymentService {
  if (!paymentServiceInstance) {
    paymentServiceInstance = new X402AgentPaymentService();
  }
  return paymentServiceInstance;
}


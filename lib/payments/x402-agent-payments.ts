import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

// x402 Agent-to-Agent Payment Service
// Based on: https://github.com/solana-foundation/templates/tree/main/community/solana-chatgpt-kit

const SOLANA_TESTNET_RPC = 'https://api.testnet.solana.com';
const CHIPS_TO_SOL_RATE = 1000; // 1 SOL = 1000 chips (or 1$ = 1000 chips)

export interface AgentPayment {
  fromAgent: string; // Agent name/model
  toAgent: string; // Agent name/model
  amount: number; // Amount in chips
  transactionSignature?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export class X402AgentPaymentService {
  private connection: Connection;
  private agentWallets: Map<string, string>; // Map agent name to wallet address

  constructor() {
    this.connection = new Connection(SOLANA_TESTNET_RPC, 'confirmed');
    this.agentWallets = new Map();
  }

  /**
   * Register an agent's wallet address
   */
  registerAgentWallet(agentName: string, walletAddress: string): void {
    this.agentWallets.set(agentName, walletAddress);
    console.log(`[X402 Payment] Registered wallet for ${agentName}: ${walletAddress}`);
  }

  /**
   * Process agent-to-agent payment when a hand is won/lost
   */
  async processAgentPayment(
    fromAgent: string,
    toAgent: string,
    chipsAmount: number
  ): Promise<AgentPayment> {
    const payment: AgentPayment = {
      fromAgent,
      toAgent,
      amount: chipsAmount,
      status: 'pending',
    };

    try {
      const fromWallet = this.agentWallets.get(fromAgent);
      const toWallet = this.agentWallets.get(toAgent);

      if (!fromWallet || !toWallet) {
        console.error(`[X402 Payment] Missing wallet addresses:`, {
          fromAgent,
          toAgent,
          fromWallet: !!fromWallet,
          toWallet: !!toWallet,
        });
        payment.status = 'failed';
        return payment;
      }

      // Convert chips to SOL (1$ = 1000 chips, assuming 1$ = 1 SOL for simplicity)
      const solAmount = chipsAmount / CHIPS_TO_SOL_RATE;
      const lamports = Math.ceil(solAmount * LAMPORTS_PER_SOL);

      if (lamports === 0) {
        console.log(`[X402 Payment] Amount too small to process: ${chipsAmount} chips`);
        payment.status = 'completed'; // Skip micro-transactions
        return payment;
      }

      payment.status = 'processing';

      // In a real implementation, this would use the agent's wallet to sign
      // For now, we'll simulate the payment flow
      // In production, you'd need to:
      // 1. Get the agent's wallet (from secure storage or wallet adapter)
      // 2. Create and sign the transaction
      // 3. Send it to the network

      console.log(`[X402 Payment] Processing payment:`, {
        fromAgent,
        toAgent,
        chipsAmount,
        solAmount: solAmount.toFixed(6),
        lamports,
        fromWallet,
        toWallet,
      });

      // Simulate transaction (replace with actual Solana transaction in production)
      // const fromPublicKey = new PublicKey(fromWallet);
      // const toPublicKey = new PublicKey(toWallet);
      // const transaction = new Transaction().add(
      //   SystemProgram.transfer({
      //     fromPublicKey,
      //     toPublicKey,
      //     lamports,
      //   })
      // );
      // const signature = await this.sendTransaction(transaction, fromPublicKey);
      // payment.transactionSignature = signature;

      // For now, simulate successful payment
      payment.status = 'completed';
      payment.transactionSignature = `sim_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      console.log(`[X402 Payment] ✅ Payment completed:`, payment);

      return payment;
    } catch (error: any) {
      console.error(`[X402 Payment] ❌ Payment failed:`, error);
      payment.status = 'failed';
      return payment;
    }
  }

  /**
   * Process pot distribution to winner(s)
   */
  async distributePot(
    winners: Array<{ agentName: string; chipsWon: number }>,
    losers: Array<{ agentName: string; chipsLost: number }>
  ): Promise<AgentPayment[]> {
    const payments: AgentPayment[] = [];

    // Calculate total pot from losers
    const totalPot = losers.reduce((sum, loser) => sum + loser.chipsLost, 0);
    const potPerWinner = Math.floor(totalPot / winners.length);
    const remainder = totalPot % winners.length;

    // Process payments from each loser to each winner
    for (const winner of winners) {
      const winnerAmount = potPerWinner + (winner === winners[0] ? remainder : 0);
      
      for (const loser of losers) {
        if (loser.chipsLost > 0) {
          const payment = await this.processAgentPayment(
            loser.agentName,
            winner.agentName,
            Math.floor((loser.chipsLost / totalPot) * winnerAmount)
          );
          payments.push(payment);
        }
      }
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


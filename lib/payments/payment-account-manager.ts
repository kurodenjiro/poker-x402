import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { query } from '../db/postgres';

export interface PaymentAccount {
  gameId: string;
  publicKey: string;
  privateKey: string; // Base58 encoded
  keypair: Keypair;
  totalAmountUSD: number;
  status: 'pending' | 'paid' | 'distributed';
  createdAt: Date;
}

/**
 * Manages payment accounts for games
 * Each game gets a unique payment account to receive user payments
 */
export class PaymentAccountManager {
  private paymentAccounts: Map<string, PaymentAccount> = new Map();

  /**
   * Get payment account for a game
   * Uses fixed payment address from .env.local, not generated
   */
  async createPaymentAccount(gameId: string, totalAmountUSD: number): Promise<PaymentAccount> {
    // Check if account already exists
    if (this.paymentAccounts.has(gameId)) {
      return this.paymentAccounts.get(gameId)!;
    }

    // Get fixed payment address from environment
    const paymentPrivateKey = process.env.X402_PAYMENT_PRIVATE_KEY;
    if (!paymentPrivateKey) {
      throw new Error(
        'Payment address not configured. Please set X402_PAYMENT_PRIVATE_KEY in .env.local with a base58-encoded Solana private key.'
      );
    }

    // Create keypair from environment variable
    let keypair: Keypair;
    try {
      const secretKey = bs58.decode(paymentPrivateKey);
      keypair = Keypair.fromSecretKey(secretKey);
    } catch (error) {
      throw new Error(
        `Invalid payment private key in .env.local. ` +
        `Please check that X402_PAYMENT_PRIVATE_KEY contains a valid base58-encoded Solana private key. Error: ${error}`
      );
    }

    const publicKey = keypair.publicKey.toString();
    const privateKey = bs58.encode(keypair.secretKey);

    const account: PaymentAccount = {
      gameId,
      publicKey,
      privateKey,
      keypair,
      totalAmountUSD,
      status: 'pending',
      createdAt: new Date(),
    };

    this.paymentAccounts.set(gameId, account);

    // Save to database if available
    try {
      if (process.env.DATABASE_URL) {
        await query(
          `INSERT INTO payment_accounts (game_id, public_key, private_key, total_amount_usd, status, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (game_id) DO UPDATE SET
             public_key = EXCLUDED.public_key,
             private_key = EXCLUDED.private_key,
             total_amount_usd = EXCLUDED.total_amount_usd,
             status = EXCLUDED.status`,
          [gameId, publicKey, privateKey, totalAmountUSD, 'pending']
        );
      }
    } catch (error) {
      console.warn('[Payment Account] Could not save to database:', error);
    }

    console.log(`[Payment Account] Created payment account for game ${gameId}: ${publicKey}`);
    return account;
  }

  /**
   * Get payment account for a game
   * Loads from database if not in memory
   */
  async getPaymentAccount(gameId: string): Promise<PaymentAccount | null> {
    // Check memory first
    if (this.paymentAccounts.has(gameId)) {
      return this.paymentAccounts.get(gameId)!;
    }

    // Try to load from database
    try {
      if (process.env.DATABASE_URL) {
        const result = await query(
          'SELECT game_id, public_key, private_key, total_amount_usd, status, created_at FROM payment_accounts WHERE game_id = $1',
          [gameId]
        );

        if (result.rows.length > 0) {
          const row = result.rows[0];
          const keypair = Keypair.fromSecretKey(bs58.decode(row.private_key));
          
          const account: PaymentAccount = {
            gameId: row.game_id,
            publicKey: row.public_key,
            privateKey: row.private_key,
            keypair,
            totalAmountUSD: parseFloat(row.total_amount_usd),
            status: row.status,
            createdAt: new Date(row.created_at),
          };

          this.paymentAccounts.set(gameId, account);
          console.log(`[Payment Account] Loaded from database: ${gameId}`);
          return account;
        }
      }
    } catch (error) {
      console.warn('[Payment Account] Could not load from database:', error);
    }

    return null;
  }

  /**
   * Get payment account public key
   */
  async getPaymentAddress(gameId: string): Promise<string | null> {
    const account = await this.getPaymentAccount(gameId);
    return account ? account.publicKey : null;
  }

  /**
   * Mark payment account as paid
   */
  async markAsPaid(gameId: string): Promise<void> {
    const account = await this.getPaymentAccount(gameId);
    if (!account) {
      throw new Error(`Payment account not found for game: ${gameId}`);
    }

    account.status = 'paid';

    try {
      if (process.env.DATABASE_URL) {
        await query(
          `UPDATE payment_accounts SET status = $1, updated_at = NOW() WHERE game_id = $2`,
          ['paid', gameId]
        );
      }
    } catch (error) {
      console.warn('[Payment Account] Could not update database:', error);
    }
  }

  /**
   * Mark payment account as distributed
   */
  async markAsDistributed(gameId: string): Promise<void> {
    const account = await this.getPaymentAccount(gameId);
    if (!account) {
      throw new Error(`Payment account not found for game: ${gameId}`);
    }

    account.status = 'distributed';

    try {
      if (process.env.DATABASE_URL) {
        await query(
          `UPDATE payment_accounts SET status = $1, updated_at = NOW() WHERE game_id = $2`,
          ['distributed', gameId]
        );
      }
    } catch (error) {
      console.warn('[Payment Account] Could not update database:', error);
    }
  }

  /**
   * Get keypair for payment account (for signing transactions)
   */
  async getKeypair(gameId: string): Promise<Keypair | null> {
    const account = await this.getPaymentAccount(gameId);
    return account ? account.keypair : null;
  }
}

// Singleton instance
let paymentAccountManagerInstance: PaymentAccountManager | null = null;

export function getPaymentAccountManager(): PaymentAccountManager {
  if (!paymentAccountManagerInstance) {
    paymentAccountManagerInstance = new PaymentAccountManager();
  }
  return paymentAccountManagerInstance;
}


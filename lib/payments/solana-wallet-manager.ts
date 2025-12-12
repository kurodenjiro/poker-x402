import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { query } from '../db/postgres';

const SOLANA_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
const SOLANA_RPC = SOLANA_NETWORK === 'devnet' 
  ? 'https://api.devnet.solana.com'
  : SOLANA_NETWORK === 'testnet'
  ? 'https://api.testnet.solana.com'
  : 'https://api.mainnet-beta.solana.com';

export interface AgentWallet {
  agentName: string;
  publicKey: string;
  privateKey: string; // Base58 encoded secret key
  keypair: Keypair;
}

/**
 * Manages Solana wallets for AI agents
 * Generates and stores wallets for each agent
 */
export class SolanaWalletManager {
  private connection: Connection;
  private agentWallets: Map<string, AgentWallet> = new Map();

  constructor() {
    this.connection = new Connection(SOLANA_RPC, 'confirmed');
  }

  /**
   * Generate or retrieve a wallet for an agent
   * Checks database first, then memory, then creates new one
   */
  async getOrCreateWallet(agentName: string): Promise<AgentWallet> {
    // Check memory first
    if (this.agentWallets.has(agentName)) {
      const existing = this.agentWallets.get(agentName)!;
      console.log(`[Wallet Manager] Using existing wallet from memory for ${agentName}: ${existing.publicKey}`);
      return existing;
    }

    // Check database for existing wallet
    try {
      if (process.env.DATABASE_URL) {
        const result = await query(
          'SELECT agent_name, public_key, private_key FROM agent_wallets WHERE agent_name = $1',
          [agentName]
        );

        if (result.rows.length > 0) {
          const row = result.rows[0];
          const keypair = Keypair.fromSecretKey(bs58.decode(row.private_key));
          
          const wallet: AgentWallet = {
            agentName: row.agent_name,
            publicKey: row.public_key,
            privateKey: row.private_key,
            keypair,
          };

          this.agentWallets.set(agentName, wallet);
          console.log(`[Wallet Manager] Loaded existing wallet from database for ${agentName}: ${wallet.publicKey}`);
          return wallet;
        }
      }
    } catch (error) {
      console.warn(`[Wallet Manager] Could not load wallet from database for ${agentName}:`, error);
    }

    // Generate new wallet if none exists
    const keypair = Keypair.generate();
    const privateKey = bs58.encode(keypair.secretKey);
    const publicKey = keypair.publicKey.toString();

    const wallet: AgentWallet = {
      agentName,
      publicKey,
      privateKey,
      keypair,
    };

    this.agentWallets.set(agentName, wallet);

    // Save to database
    try {
      if (process.env.DATABASE_URL) {
        await query(
          `INSERT INTO agent_wallets (agent_name, public_key, private_key, created_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (agent_name) DO UPDATE SET
             public_key = EXCLUDED.public_key,
             private_key = EXCLUDED.private_key,
             updated_at = NOW()`,
          [agentName, publicKey, privateKey]
        );
        console.log(`[Wallet Manager] Saved new wallet to database for ${agentName}: ${publicKey}`);
      }
    } catch (error) {
      console.warn(`[Wallet Manager] Could not save wallet to database for ${agentName}:`, error);
    }

    console.log(`[Wallet Manager] Generated new wallet for ${agentName}: ${publicKey}`);
    return wallet;
  }

  /**
   * Get wallet for an agent
   * Checks memory first, then database
   */
  async getWallet(agentName: string): Promise<AgentWallet | null> {
    // Check memory first
    if (this.agentWallets.has(agentName)) {
      return this.agentWallets.get(agentName)!;
    }

    // Check database
    try {
      if (process.env.DATABASE_URL) {
        const result = await query(
          'SELECT agent_name, public_key, private_key FROM agent_wallets WHERE agent_name = $1',
          [agentName]
        );

        if (result.rows.length > 0) {
          const row = result.rows[0];
          const keypair = Keypair.fromSecretKey(bs58.decode(row.private_key));
          
          const wallet: AgentWallet = {
            agentName: row.agent_name,
            publicKey: row.public_key,
            privateKey: row.private_key,
            keypair,
          };

          this.agentWallets.set(agentName, wallet);
          console.log(`[Wallet Manager] Loaded wallet from database for ${agentName}: ${wallet.publicKey}`);
          return wallet;
        }
      }
    } catch (error) {
      console.warn(`[Wallet Manager] Could not load wallet from database for ${agentName}:`, error);
    }

    return null;
  }

  /**
   * Get wallet public key as PublicKey object
   */
  async getPublicKey(agentName: string): Promise<PublicKey | null> {
    const wallet = await this.getWallet(agentName);
    return wallet ? new PublicKey(wallet.publicKey) : null;
  }

  /**
   * Get wallet keypair for signing transactions
   */
  async getKeypair(agentName: string): Promise<Keypair | null> {
    const wallet = await this.getWallet(agentName);
    return wallet ? wallet.keypair : null;
  }

  /**
   * Check balance of an agent's wallet
   */
  async getBalance(agentName: string): Promise<number> {
    const wallet = await this.getWallet(agentName);
    if (!wallet) {
      throw new Error(`Wallet not found for agent: ${agentName}`);
    }

    try {
      const balance = await this.connection.getBalance(new PublicKey(wallet.publicKey));
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error(`[Wallet Manager] Error getting balance for ${agentName}:`, error);
      return 0;
    }
  }

  /**
   * Request airdrop for an agent's wallet (devnet/testnet only)
   */
  async requestAirdrop(agentName: string, amount: number = 1): Promise<string | null> {
    if (SOLANA_NETWORK === 'mainnet-beta') {
      console.warn(`[Wallet Manager] Cannot airdrop on mainnet for ${agentName}`);
      return null;
    }

    const wallet = await this.getWallet(agentName);
    if (!wallet) {
      throw new Error(`Wallet not found for agent: ${agentName}`);
    }

    try {
      const publicKey = new PublicKey(wallet.publicKey);
      const lamports = amount * LAMPORTS_PER_SOL;
      
      console.log(`[Wallet Manager] Requesting ${amount} SOL airdrop for ${agentName}...`);
      const signature = await this.connection.requestAirdrop(publicKey, lamports);
      
      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      console.log(`[Wallet Manager] ✅ Airdrop successful for ${agentName}: ${signature}`);
      return signature;
    } catch (error) {
      console.error(`[Wallet Manager] ❌ Airdrop failed for ${agentName}:`, error);
      return null;
    }
  }

  /**
   * Ensure agent has minimum balance
   * Note: No automatic airdrops - funds must be transferred from payment account
   */
  async ensureMinimumBalance(agentName: string, minimumSOL: number = 0.1): Promise<void> {
    // Check balance but don't auto-airdrop
    const balance = await this.getBalance(agentName);
    if (balance < minimumSOL) {
      console.warn(`[Wallet Manager] Balance too low for ${agentName} (${balance} SOL), needs ${minimumSOL} SOL`);
      // Funds should be transferred from payment account, not airdropped
    }
  }

  /**
   * Get all registered wallets
   */
  getAllWallets(): AgentWallet[] {
    return Array.from(this.agentWallets.values());
  }
}

// Singleton instance
let walletManagerInstance: SolanaWalletManager | null = null;

export function getWalletManager(): SolanaWalletManager {
  if (!walletManagerInstance) {
    walletManagerInstance = new SolanaWalletManager();
  }
  return walletManagerInstance;
}


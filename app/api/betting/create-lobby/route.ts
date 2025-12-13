import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, Transaction, VersionedTransaction } from '@solana/web3.js';
import { PokerBettingContract } from '@/lib/solana/betting-contract';
import { AnchorProvider } from '@coral-xyz/anchor';

// Simple Wallet implementation for server-side use
class NodeWallet {
  constructor(readonly payer: Keypair) { }

  get publicKey() {
    return this.payer.publicKey;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof Transaction) {
      tx.partialSign(this.payer);
    } else {
      tx.sign([this.payer]);
    }
    return tx;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return txs.map((t) => {
      if (t instanceof Transaction) {
        t.partialSign(this.payer);
      } else {
        t.sign([this.payer]);
      }
      return t;
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gameId, config } = body;

    if (!gameId || !config) {
      return NextResponse.json(
        { error: 'Game ID and config are required' },
        { status: 400 }
      );
    }

    // Get owner wallet from environment (server-side)
    const ownerPrivateKey = process.env.BETTING_OWNER_PRIVATE_KEY;
    if (!ownerPrivateKey) {
      return NextResponse.json(
        { error: 'Betting owner private key not configured' },
        { status: 500 }
      );
    }

    const ownerKeypair = Keypair.fromSecretKey(
      Buffer.from(JSON.parse(ownerPrivateKey))
    );

    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );

    const wallet = new NodeWallet(ownerKeypair);
    const contract = new PokerBettingContract(connection, wallet as any);

    // Create lobby on-chain
    const tx = await contract.createLobby({
      gameId,
      modelNames: config.modelNames || [],
      startingChips: config.startingChips || 1000,
      smallBlind: config.smallBlind || 10,
      bigBlind: config.bigBlind || 20,
      maxHands: config.maxHands || 10,
    });

    return NextResponse.json({
      success: true,
      transaction: tx,
      lobbyPda: await contract.getLobby(gameId).then(l => l ? 'created' : null),
    });
  } catch (error: any) {
    console.error('Error creating betting lobby:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create betting lobby' },
      { status: 500 }
    );
  }
}



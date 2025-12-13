import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { PokerBettingContract } from '@/lib/solana/betting-contract';
import { AnchorProvider } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

// Define Wallet interface for read-only operations
interface ReadOnlyWallet {
  publicKey: PublicKey;
  signTransaction: (tx: any) => Promise<any>;
  signAllTransactions: (txs: any[]) => Promise<any[]>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  try {
    const { gameId } = params;

    if (!gameId) {
      return NextResponse.json(
        { error: 'Game ID is required' },
        { status: 400 }
      );
    }

    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );

    // Create a dummy wallet for read-only operations
    // Use a valid dummy keypair for the publicKey
    const dummyKeypair = Keypair.generate();
    const dummyWallet: ReadOnlyWallet = {
      publicKey: dummyKeypair.publicKey,
      signTransaction: async () => { throw new Error('Read-only'); },
      signAllTransactions: async () => { throw new Error('Read-only'); },
    };

    // Load IDL file for server-side usage
    let programIdl: any = undefined;
    try {
      // Load IDL file for server-side usage - check new location first
      const idlPath = path.join(process.cwd(), 'contracts', 'target', 'idl', 'poker_betting.json');
      if (fs.existsSync(idlPath)) {
        const idlContent = fs.readFileSync(idlPath, 'utf-8');
        programIdl = JSON.parse(idlContent);
        console.log('[API] Successfully loaded IDL from:', idlPath);
      } else {
        // Fallback to old path just in case
        const oldPath = path.join(process.cwd(), 'target', 'idl', 'poker_betting.json');
        if (fs.existsSync(oldPath)) {
          const idlContent = fs.readFileSync(oldPath, 'utf-8');
          programIdl = JSON.parse(idlContent);
          console.log('[API] Loaded IDL from old path:', oldPath);
        } else {
          console.error('[API] IDL file not found at:', idlPath);
          return NextResponse.json(
            { error: 'IDL file not found. Please build the Anchor program: anchor build' },
            { status: 500 }
          );
        }
      }
    } catch (error: any) {
      console.error('[API] Failed to load IDL:', error);
      return NextResponse.json(
        { error: `Failed to load IDL: ${error.message}` },
        { status: 500 }
      );
    }

    if (!programIdl) {
      return NextResponse.json(
        { error: 'IDL not loaded' },
        { status: 500 }
      );
    }

    // Validate IDL structure
    if (!programIdl.instructions || !Array.isArray(programIdl.instructions)) {
      console.error('[API] Invalid IDL structure - missing instructions array');
      return NextResponse.json(
        { error: 'Invalid IDL structure' },
        { status: 500 }
      );
    }

    // Validate metadata.address exists and is a string
    if (!programIdl.metadata || !programIdl.metadata.address || typeof programIdl.metadata.address !== 'string') {
      console.error('[API] Invalid IDL - metadata.address is missing or invalid');
      return NextResponse.json(
        { error: 'Invalid IDL metadata.address' },
        { status: 500 }
      );
    }

    // Validate the address is a valid PublicKey format
    try {
      const testPubkey = new (await import('@solana/web3.js')).PublicKey(programIdl.metadata.address);
      console.log('[API] Validated IDL metadata.address:', testPubkey.toString());
    } catch (error: any) {
      console.error('[API] Invalid PublicKey format in IDL metadata.address:', error.message);
      return NextResponse.json(
        { error: `Invalid PublicKey in IDL metadata: ${error.message}` },
        { status: 500 }
      );
    }

    try {
      const contract = new PokerBettingContract(connection, dummyWallet, programIdl);

      // Get lobby data
      const lobby = await contract.getLobby(gameId);

      // Get all bets
      const bets = await contract.getBets(gameId);

      return NextResponse.json({
        lobby,
        bets,
      });
    } catch (contractError: any) {
      console.error('[API] Error creating contract or fetching data:', contractError);
      return NextResponse.json(
        { error: `Contract error: ${contractError.message}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error fetching betting data:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch betting data' },
      { status: 500 }
    );
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair } from '@solana/web3.js';
import { PokerBettingContract } from '@/lib/solana/betting-contract';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gameId, winnerName } = body;

    if (!gameId || !winnerName) {
      return NextResponse.json(
        { error: 'Game ID and winner name are required' },
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

    const wallet = new Wallet(ownerKeypair);
    const contract = new PokerBettingContract(connection, wallet);

    // Distribute winnings to all winners
    const signatures = await contract.distributeAllWinnings(gameId, winnerName);

    return NextResponse.json({
      success: true,
      transactions: signatures,
      count: signatures.length,
    });
  } catch (error: any) {
    console.error('Error distributing winnings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to distribute winnings' },
      { status: 500 }
    );
  }
}


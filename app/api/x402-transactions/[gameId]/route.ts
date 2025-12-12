import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres';

export async function GET(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  try {
    const { gameId } = params;

    if (!gameId) {
      return NextResponse.json({ error: 'Game ID is required' }, { status: 400 });
    }

    // Check if DATABASE_URL is configured
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ transactions: [] });
    }

    // Fetch x402 transactions for this game
    const result = await query(
      `SELECT 
        id,
        game_id,
        hand_number,
        from_agent,
        to_agent,
        amount_chips,
        amount_sol,
        transaction_signature,
        status,
        created_at,
        updated_at
       FROM x402_transactions
       WHERE game_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [gameId]
    );

    const transactions = result.rows.map((row: any) => ({
      id: row.id,
      gameId: row.game_id,
      handNumber: row.hand_number,
      fromAgent: row.from_agent,
      toAgent: row.to_agent,
      amountChips: row.amount_chips,
      amountSol: row.amount_sol ? parseFloat(row.amount_sol) : null,
      transactionSignature: row.transaction_signature,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({ transactions });
  } catch (error: any) {
    console.error('Error fetching x402 transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions', details: error.message },
      { status: 500 }
    );
  }
}


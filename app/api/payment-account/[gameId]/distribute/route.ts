import { NextRequest, NextResponse } from 'next/server';
import { getPaymentAccountManager } from '@/lib/payments/payment-account-manager';
import { getFundDistributor } from '@/lib/payments/fund-distributor';
import { query } from '@/lib/db/postgres';

export async function POST(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  try {
    const { gameId } = params;
    const fundDistributor = getFundDistributor();

    // Get game config from database
    let config: any = null;
    try {
      if (process.env.DATABASE_URL) {
        const result = await query(
          'SELECT config FROM lobbies WHERE game_id = $1',
          [gameId]
        );
        if (result.rows.length > 0) {
          config = typeof result.rows[0].config === 'string'
            ? JSON.parse(result.rows[0].config)
            : result.rows[0].config;
        }
      }
    } catch (error) {
      console.warn('[Distribute] Could not get config from database:', error);
    }

    if (!config || !config.modelNames) {
      return NextResponse.json(
        { error: 'Game config not found' },
        { status: 404 }
      );
    }

    // Calculate total amount from config
    const startingChips = config.startingChips || 1000;
    const numPlayers = config.modelNames.length;
    const totalAmountUSD = (startingChips / 1000) * numPlayers;

    // Distribute funds to agent wallets (uses fixed payment address from .env)
    await fundDistributor.distributeFunds(
      gameId,
      config.modelNames,
      totalAmountUSD
    );

    // On-chain betting lobby creation removed as requested

    return NextResponse.json({
      success: true,
      message: 'Funds distributed and lobby initialized successfully',
    });
  } catch (error: any) {
    console.error('Fund distribution error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


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

    // Create lobby on Solana smart contract (moved here as per user request)
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      console.log(`[Distribute] Creating on-chain lobby for ${gameId}...`);

      const response = await fetch(`${appUrl}/api/betting/create-lobby`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId,
          config: {
            modelNames: config.modelNames,
            startingChips: config.startingChips || 1000,
            smallBlind: config.smallBlind || 10,
            bigBlind: config.bigBlind || 20,
            maxHands: config.maxHands || 10,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [Distribute] Betting lobby created on-chain:', data.transaction);
      } else {
        const errData = await response.json().catch(() => ({}));
        console.warn('⚠️ [Distribute] Failed to create lobby via API:', response.status, errData);
      }
    } catch (error) {
      console.error('Error creating betting lobby from distribute (non-fatal):', error);
    }

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


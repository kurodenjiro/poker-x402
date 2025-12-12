import { NextRequest, NextResponse } from 'next/server';
import { getPaymentAccountManager } from '@/lib/payments/payment-account-manager';

export async function POST(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  try {
    const { gameId } = params;
    const body = await request.json();
    const { totalAmountUSD } = body;

    if (!totalAmountUSD || totalAmountUSD <= 0) {
      return NextResponse.json(
        { error: 'totalAmountUSD is required and must be greater than 0' },
        { status: 400 }
      );
    }

    // Payment address is fixed from .env.local, not generated
    const paymentAddress = process.env.NEXT_PUBLIC_X402_PAYMENT_ADDRESS;
    
    if (!paymentAddress || paymentAddress === '11111111111111111111111111111111') {
      return NextResponse.json(
        { error: 'Payment address not configured. Please set NEXT_PUBLIC_X402_PAYMENT_ADDRESS in .env.local' },
        { status: 500 }
      );
    }

    // Create payment account record for tracking (uses fixed address)
    const paymentAccountManager = getPaymentAccountManager();
    await paymentAccountManager.createPaymentAccount(gameId, totalAmountUSD);

    return NextResponse.json({
      success: true,
      paymentAddress: paymentAddress, // Fixed address from .env
      gameId: gameId,
      totalAmountUSD: totalAmountUSD,
    });
  } catch (error: any) {
    console.error('Payment account API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  try {
    const { gameId } = params;
    const paymentAccountManager = getPaymentAccountManager();
    const account = await paymentAccountManager.getPaymentAccount(gameId);

    if (!account) {
      return NextResponse.json(
        { error: 'Payment account not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      paymentAddress: account.publicKey,
      gameId: account.gameId,
      totalAmountUSD: account.totalAmountUSD,
      status: account.status,
    });
  } catch (error: any) {
    console.error('Payment account API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


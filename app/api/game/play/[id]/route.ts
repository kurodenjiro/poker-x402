import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gameId = params.id;

    // Check if DATABASE_URL is configured
    if (!process.env.DATABASE_URL) {
      // Return null if database not configured (fallback to API)
      return NextResponse.json(null);
    }

    const result = await query(
      'SELECT * FROM game_plays WHERE game_id = $1',
      [gameId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(null);
    }

    return NextResponse.json(result.rows[0]);
  } catch (error: any) {
    console.error('Game play API error:', error.message || error);
    // Return null on error to allow fallback to API
    return NextResponse.json(null);
  }
}


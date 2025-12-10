import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres';

export async function GET(request: NextRequest) {
  try {
    // Check if DATABASE_URL is configured
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ lobbies: [] });
    }

    const result = await query(
      `SELECT game_id, config, status, created_at, updated_at 
       FROM lobbies 
       ORDER BY created_at DESC 
       LIMIT 50`
    );

    return NextResponse.json({ lobbies: result.rows });
  } catch (error: any) {
    console.error('Lobbies API error:', error.message || error);
    return NextResponse.json({ lobbies: [] });
  }
}


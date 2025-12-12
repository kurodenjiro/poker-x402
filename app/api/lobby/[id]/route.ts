import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gameId = params.id;
    const body = await request.json();
    const { config, status } = body;

    // Check if DATABASE_URL is configured
    if (!process.env.DATABASE_URL) {
      console.warn('DATABASE_URL not configured, skipping database save');
      return NextResponse.json({ success: true, warning: 'Database not configured' });
    }

    if (config) {
      // Create or update lobby
      await query(
        `INSERT INTO lobbies (game_id, config, status, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (game_id) 
         DO UPDATE SET 
           config = EXCLUDED.config,
           status = EXCLUDED.status,
           updated_at = NOW()`,
        [gameId, JSON.stringify(config), status || 'waiting']
      );
    } else if (status) {
      // Update lobby status only
      await query(
        `UPDATE lobbies 
         SET status = $1, updated_at = NOW()
         WHERE game_id = $2`,
        [status, gameId]
      );
    }

    // Broadcast lobby update via Supabase Realtime
    try {
      const { supabase } = await import('@/lib/supabase/server');
      const channel = supabase.channel('lobby-updates');
      await channel.send({
        type: 'broadcast',
        event: 'lobby-update',
        payload: {},
      });
    } catch (error) {
      console.error('Error broadcasting lobby update:', error);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Lobby API error:', error.message || error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gameId = params.id;

    // Check if DATABASE_URL is configured
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const result = await query(
      'SELECT * FROM lobbies WHERE game_id = $1',
      [gameId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error: any) {
    console.error('Lobby API error:', error.message || error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


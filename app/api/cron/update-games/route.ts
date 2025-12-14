import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres';

/**
 * Cronjob endpoint to update game states periodically
 * Can be called by Vercel Cron or external cron service
 * 
 * Usage with Vercel Cron (vercel.json):
 * {
 *   "crons": [{
 *     "path": "/api/cron/update-games",
 *     "schedule": "*/30 * * * * *"  // Every 30 seconds
 *   }]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret if set (for security)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get all active games
    const result = await query(
      `SELECT game_id, updated_at, is_running 
       FROM game_plays 
       WHERE is_running = true 
       ORDER BY updated_at DESC 
       LIMIT 100`
    );

    const activeGames = result.rows || [];
    
    return NextResponse.json({
      success: true,
      activeGames: activeGames.length,
      games: activeGames.map((g: any) => ({
        gameId: g.game_id,
        updatedAt: g.updated_at,
        isRunning: g.is_running,
      })),
      message: 'Cronjob executed successfully',
    });
  } catch (error: any) {
    console.error('Cronjob error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Allow POST for external cron services
export async function POST(request: NextRequest) {
  return GET(request);
}


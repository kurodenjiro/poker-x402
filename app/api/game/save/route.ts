import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres';
import { getSimulatorStatus } from '@/lib/ai/simulator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gameId, gameState, stats, rankings, isRunning, chatMessages } = body;

    if (!gameId) {
      return NextResponse.json({ error: 'Game ID is required' }, { status: 400 });
    }

    const simulatorStatus = getSimulatorStatus();
    const gameData = {
      game_id: gameId,
      game_state: gameState,
      stats: stats || [],
      rankings: rankings || [],
      is_running: isRunning || false,
      chat_messages: chatMessages || [],
      simulator_status: simulatorStatus,
    };

    // Check if DATABASE_URL is configured
    if (process.env.DATABASE_URL) {
      // Upsert game play data using PostgreSQL
      await query(
        `INSERT INTO game_plays (game_id, game_state, stats, rankings, is_running, chat_messages, simulator_status, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (game_id) 
         DO UPDATE SET 
           game_state = EXCLUDED.game_state,
           stats = EXCLUDED.stats,
           rankings = EXCLUDED.rankings,
           is_running = EXCLUDED.is_running,
           chat_messages = EXCLUDED.chat_messages,
           simulator_status = EXCLUDED.simulator_status,
           updated_at = NOW()`,
        [
          gameId,
          JSON.stringify(gameState),
          JSON.stringify(stats || []),
          JSON.stringify(rankings || []),
          isRunning || false,
          JSON.stringify(chatMessages || []),
          JSON.stringify(simulatorStatus),
        ]
      );
    }

    // HTTP polling will handle updates - no broadcast needed

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Game save API error:', error.message || error);
    // Don't fail the game if database save fails
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Database save failed',
      warning: 'Game continues without database persistence'
    });
  }
}


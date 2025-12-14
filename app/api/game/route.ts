import { NextRequest, NextResponse } from 'next/server';
import { GameManager } from '@/lib/game-manager';
import { ChatGPTModel, GeminiModel, GrokModel, ClaudeModel } from '@/lib/ai/real-models';
import { getSimulatorStatus } from '@/lib/ai/simulator';
import { chatHistory } from '@/lib/ai/chat-history';
import { query } from '@/lib/db/postgres';

// Store game manager instance (in production, use Redis or database)
let gameManager: GameManager | null = null;

function getGameManager(): GameManager {
  if (!gameManager) {
    gameManager = new GameManager([
      new ChatGPTModel(),
      new GeminiModel(),
      new GrokModel(),
      new ClaudeModel(),
    ]);
  }
  return gameManager;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, config } = body;

    const manager = getGameManager();

    switch (action) {
      case 'start':
        if (!config || !config.modelNames || config.modelNames.length < 2) {
          return NextResponse.json(
            { error: 'Invalid config. Need at least 2 models.' },
            { status: 400 }
          );
        }
        const gameId = body.gameId;
        
        if (!gameId) {
          return NextResponse.json(
            { error: 'Game ID is required' },
            { status: 400 }
          );
        }
        
        // Check if this game is already running
        const currentGameId = manager.getGameId();
        if (manager.isGameRunning() && currentGameId === gameId) {
          // Game is already running for this gameId, don't restart
          return NextResponse.json({ success: true, message: 'Game already running' });
        }
        
        // Check if a different game is running
        if (manager.isGameRunning() && currentGameId !== gameId) {
          return NextResponse.json(
            { error: `Another game (${currentGameId}) is already running. Cannot start game ${gameId}.` },
            { status: 409 }
          );
        }
        
        // Save lobby config if gameId provided
        if (gameId && process.env.DATABASE_URL) {
          try {
            await query(
              `INSERT INTO lobbies (game_id, config, status, updated_at)
               VALUES ($1, $2, $3, NOW())
               ON CONFLICT (game_id) 
               DO UPDATE SET 
                 config = EXCLUDED.config,
                 status = EXCLUDED.status,
                 updated_at = NOW()`,
              [gameId, JSON.stringify(config), 'running']
            );
            
            // On-chain lobby creation removed - betting is now off-chain only
            
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
          } catch (error) {
            console.error('Error saving lobby (non-fatal):', error);
            // Continue even if database save fails
          }
        }
        
        // Start game in background (don't await)
        manager.startGame({
          modelNames: config.modelNames,
          startingChips: config.startingChips || 1000,
          smallBlind: config.smallBlind || 10,
          bigBlind: config.bigBlind || 20,
          maxHands: config.maxHands || 10,
        }, gameId).catch(error => {
          console.error('Error in game execution:', error);
        });
        return NextResponse.json({ success: true });

      case 'stop':
        manager.stopGame();
        if (manager.getGameId()) {
          manager.saveGameStateToDB().catch(console.error);
        }
        return NextResponse.json({ success: true });

      case 'state':
        const gameState = manager.getGameState();
        const stats = manager.getStats();
        const rankings = manager.getRankings();
        const simulatorStatus = getSimulatorStatus();
        const chatMessages = chatHistory.getAllMessages();
        return NextResponse.json({
          gameState,
          stats,
          rankings,
          isRunning: manager.isGameRunning(),
          simulatorStatus,
          chatMessages,
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Game API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const manager = getGameManager();
    const gameState = manager.getGameState();
    const stats = manager.getStats();
    const rankings = manager.getRankings();
    const simulatorStatus = getSimulatorStatus();
    const chatMessages = chatHistory.getAllMessages();

    return NextResponse.json({
      gameState,
      stats,
      rankings,
      isRunning: manager.isGameRunning(),
      simulatorStatus,
      chatMessages,
    });
  } catch (error) {
    console.error('Game API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


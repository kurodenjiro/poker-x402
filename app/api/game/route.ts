import { NextRequest, NextResponse } from 'next/server';
import { GameManager } from '@/lib/game-manager';
import { ChatGPTModel, GeminiModel, GrokModel, ClaudeModel } from '@/lib/ai/real-models';
import { getSimulatorStatus } from '@/lib/ai/simulator';
import { chatHistory } from '@/lib/ai/chat-history';

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
        // Start game in background (don't await)
        manager.startGame({
          modelNames: config.modelNames,
          startingChips: config.startingChips || 1000,
          smallBlind: config.smallBlind || 10,
          bigBlind: config.bigBlind || 20,
          maxHands: config.maxHands || 10,
        }).catch(error => {
          console.error('Error in game execution:', error);
        });
        return NextResponse.json({ success: true });

      case 'stop':
        manager.stopGame();
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


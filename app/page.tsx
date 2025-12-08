'use client';

import { useState, useEffect } from 'react';
import GameBoard from '@/components/GameBoard';
import GameControls from '@/components/GameControls';
import ChatPlayground from '@/components/ChatPlayground';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function Home() {
  const [gameState, setGameState] = useState<any>(null);
  const [stats, setStats] = useState<any[]>([]);
  const [rankings, setRankings] = useState<any[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [gameTime, setGameTime] = useState(0);
  const [simulatorStatus, setSimulatorStatus] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);

  const fetchGameState = async () => {
    try {
      const response = await fetch('/api/game');
      const data = await response.json();
      setGameState(data.gameState);
      setStats(data.stats || []);
      setRankings(data.rankings || []);
      setIsRunning(data.isRunning || false);
      setSimulatorStatus(data.simulatorStatus || null);
      setChatMessages(data.chatMessages || []);
    } catch (error) {
      console.error('Error fetching game state:', error);
    }
  };

  useEffect(() => {
    fetchGameState();
    const interval = setInterval(fetchGameState, isRunning ? 300 : 2000);
    return () => clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        setGameTime((prev) => prev + 0.1);
      }, 100);
    } else {
      setGameTime(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning]);

  const handleStartGame = async (config: any) => {
    setIsLoading(true);
    setGameTime(0);
    try {
      const response = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', config }),
      });
      if (response.ok) {
        setIsRunning(true);
        await fetchGameState();
      }
    } catch (error) {
      console.error('Error starting game:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopGame = async () => {
    try {
      await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      setIsRunning(false);
      setGameTime(0);
      await fetchGameState();
    } catch (error) {
      console.error('Error stopping game:', error);
    }
  };

  const handleReplay = () => {
    handleStopGame();
    setTimeout(() => {
      const config = {
        modelNames: rankings.map(r => r.modelName) || ['ChatGPT', 'Gemini', 'Grok', 'Claude Sonnet'],
        startingChips: 1000,
        smallBlind: 10,
        bigBlind: 20,
        maxHands: 10,
      };
      handleStartGame(config);
    }, 500);
  };

  return (
    <main className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Simulator Mode Banner */}
        {simulatorStatus?.isSimulator && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-yellow-600">⚠️</span>
              <span className="text-sm text-yellow-800 font-medium">
                {simulatorStatus.message}
              </span>
            </div>
          </div>
        )}

        {/* Header - Matching Wordle Battle Style */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Live Demo
            </div>
            <h1 className="text-5xl font-bold text-gray-900 mb-2">Poker X402</h1>
            <p className="text-gray-600 text-lg">
              {rankings.length > 0 ? `${rankings.length} models` : 'AI models'} compete in Texas Hold'em
            </p>
          </div>
          <div className="flex items-center gap-4">
            {isRunning && (
              <div className="text-3xl font-mono font-bold text-gray-900 tabular-nums">
                {gameTime.toFixed(1)}s
              </div>
            )}
            <Button
              onClick={isRunning ? handleStopGame : handleReplay}
              variant={isRunning ? 'destructive' : 'default'}
              disabled={isLoading || rankings.length === 0}
              className="bg-black text-white hover:bg-gray-900 h-10 px-6 font-semibold"
            >
              {isRunning ? 'Stop' : 'Replay'}
            </Button>
          </div>
        </div>

        {/* Game Controls - Only show when not running */}
        {!isRunning && (
          <div className="mb-8">
            <GameControls
              onStart={handleStartGame}
              onStop={handleStopGame}
              isRunning={isRunning}
              isLoading={isLoading}
            />
          </div>
        )}

        {/* Main Content: Game and Chat Playground */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Game Board - Takes 2 columns */}
          <div className="lg:col-span-2">
            <GameBoard
              gameState={gameState}
              stats={stats}
              rankings={rankings}
              isRunning={isRunning}
              chatMessages={chatMessages}
            />
          </div>

          {/* Chat Playground - Takes 1 column */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <Card className="p-6 bg-white border-2 border-gray-200 h-[calc(100vh-8rem)] flex flex-col">
                <ChatPlayground
                  messages={chatMessages}
                  modelNames={rankings.map(r => r.modelName)}
                />
              </Card>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import GameBoard from '@/components/GameBoard';
import ChatPlayground from '@/components/ChatPlayground';
import X402Transactions from '@/components/X402Transactions';
import PlayerStats from '@/components/PlayerStats';
import BettingPanel from '@/components/BettingPanel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function LobbyPage() {
  const router = useRouter();
  const params = useParams();
  const gameId = params.id as string;
  
  const [gameState, setGameState] = useState<any>(null);
  const [stats, setStats] = useState<any[]>([]);
  const [rankings, setRankings] = useState<any[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [gameTime, setGameTime] = useState(0);
  const [simulatorStatus, setSimulatorStatus] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [showChatPlayground, setShowChatPlayground] = useState(true);
  const [gameConfig, setGameConfig] = useState<any>(null);
  const [hasFetchedInitialState, setHasFetchedInitialState] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [showPlayerStatsModal, setShowPlayerStatsModal] = useState(false);

  // Define fetchGameState first so it can be used in other hooks
  const fetchGameState = useCallback(async () => {
    try {
      // Always fetch from PostgreSQL by gameId - never use singleton fallback
      const response = await fetch(`/api/game/play/${gameId}`);
      if (response.ok) {
        const gamePlayData = await response.json();
        if (gamePlayData && gamePlayData.game_state) {
          setGameState(gamePlayData.game_state);
          setStats(gamePlayData.stats || []);
          setRankings(gamePlayData.rankings || []);
          setIsRunning(gamePlayData.is_running || false);
          setChatMessages(gamePlayData.chat_messages || []);
          setSimulatorStatus(gamePlayData.simulator_status || null);
          // If game is running, mark that we've checked so we don't auto-start
          if (gamePlayData.is_running) {
            setHasAttemptedStart(true);
          }
          setHasFetchedInitialState(true);
          return;
        }
      }
      
      // If no game data found, mark as fetched (game doesn't exist yet)
      console.log(`No game data found for gameId: ${gameId}`);
      setHasFetchedInitialState(true);
    } catch (error) {
      console.error('Error fetching game state:', error);
      setHasFetchedInitialState(true);
    }
  }, [gameId]);

  // Initialize Supabase Realtime connection for real-time updates
  useEffect(() => {
    setConnectionStatus('connecting');
    
    console.log('[Supabase Realtime] Setting up channel for game:', gameId);
    
    // Create a channel for this game with optimized config
    const channel = supabase.channel(`game-${gameId}`, {
      config: {
        broadcast: { self: false }, // Don't receive own broadcasts (optimization)
      },
    });

    // Subscribe to broadcast messages (game state updates)
    channel
      .on('broadcast', { event: 'game-state' }, (payload) => {
        const data = payload.payload;
        if (data) {
          // Batch state updates for better performance
          setGameState(data.game_state);
          setStats(data.stats || []);
          setRankings(data.rankings || []);
          setIsRunning(data.is_running || false);
          setChatMessages(data.chat_messages || []);
          setSimulatorStatus(data.simulator_status || null);
        }
        setConnectionStatus('connected');
      })
      .on('broadcast', { event: 'lobby-update' }, () => {
        // Only fetch if game state is missing
        if (!gameState) {
          fetchGameState();
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
          // Don't fetch here - already fetched on mount
        } else if (status === 'CHANNEL_ERROR') {
          setConnectionStatus('disconnected');
          console.error('[Supabase Realtime] Channel error');
        } else if (status === 'TIMED_OUT') {
          setConnectionStatus('disconnected');
          console.error('[Supabase Realtime] Connection timed out');
        } else {
          setConnectionStatus('connecting');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]); // Removed fetchGameState dependency to prevent re-subscription

  const handleStartGame = useCallback(async () => {
    if (!gameConfig) return;
    
    setIsLoading(true);
    setGameTime(0);
    try {
      // Update lobby status to running
      await fetch(`/api/lobby/${gameId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'running' }),
      });

      const response = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', config: gameConfig, gameId }),
      });
      if (response.ok) {
        setIsRunning(true);
        // Fetch will happen via the interval
      }
    } catch (error) {
      console.error('Error starting game:', error);
    } finally {
      setIsLoading(false);
    }
  }, [gameConfig, gameId]);

  useEffect(() => {
    // Load game config from localStorage or PostgreSQL
    const loadConfig = async () => {
      const savedConfig = localStorage.getItem(`game-config-${gameId}`);
      if (savedConfig) {
        const config = JSON.parse(savedConfig);
        setGameConfig(config);
      } else {
        // Try to load from PostgreSQL via API
        try {
          const response = await fetch(`/api/lobby/${gameId}`);
          if (response.ok) {
            const lobby = await response.json();
            if (lobby?.config) {
              setGameConfig(lobby.config);
              localStorage.setItem(`game-config-${gameId}`, JSON.stringify(lobby.config));
            }
          }
        } catch (error) {
          console.error('Error loading lobby from PostgreSQL:', error);
        }
      }
    };

    loadConfig();
    // Initial fetch on mount - Supabase Realtime will handle all subsequent real-time updates
    fetchGameState();
    
    // Minimal fallback polling only if Supabase Realtime connection fails
    // This is a safety net, not the primary update mechanism
    let fallbackInterval: NodeJS.Timeout | null = null;
    
    // Only start fallback polling if connection is not connected after 5 seconds
    const fallbackTimer = setTimeout(() => {
      if (connectionStatus !== 'connected') {
        console.log('Supabase Realtime not connected, starting fallback polling');
        fallbackInterval = setInterval(() => {
          fetchGameState();
        }, 5000); // Poll every 5 seconds as fallback
      }
    }, 5000);
    
    // Stop fallback polling if connection is established
    if (connectionStatus === 'connected' && fallbackInterval) {
      clearInterval(fallbackInterval);
      fallbackInterval = null;
    }
    
    return () => {
      clearTimeout(fallbackTimer);
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
      }
    };
  }, [gameId, fetchGameState, connectionStatus]);

  // Track if we've attempted to start the game to prevent multiple starts
  const [hasAttemptedStart, setHasAttemptedStart] = useState(false);
  
  // Auto-start game ONLY if:
  // 1. Config is loaded
  // 2. Game is not running
  // 3. Not currently loading
  // 4. We've fetched the initial state (to check if game exists)
  // 5. We haven't already attempted to start
  // 6. No game state exists (meaning it's a new game, not reloading an existing one)
  useEffect(() => {
    // Wait for initial state fetch to complete before deciding to auto-start
    if (!hasFetchedInitialState) {
      return;
    }
    
    // Only auto-start if there's no game state (new game) and we haven't tried to start yet
    if (gameConfig && !isRunning && !isLoading && !hasAttemptedStart && gameState === null) {
      // Small delay to ensure everything is ready
      const timer = setTimeout(() => {
        setHasAttemptedStart(true);
        handleStartGame();
      }, 500);
      return () => clearTimeout(timer);
    }
    
    // If game state exists, mark that we've checked (don't auto-start existing games)
    if (gameState !== null) {
      setHasAttemptedStart(true);
    }
  }, [gameConfig, isRunning, isLoading, hasFetchedInitialState, hasAttemptedStart, gameState, handleStartGame]);

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


  // If no config, redirect to home
  useEffect(() => {
    if (!gameConfig && !isLoading) {
      // Try to get config from URL search params
      const urlParams = new URLSearchParams(window.location.search);
      const configParam = urlParams.get('config');
      if (configParam) {
        try {
          const config = JSON.parse(decodeURIComponent(configParam));
          setGameConfig(config);
          localStorage.setItem(`game-config-${gameId}`, JSON.stringify(config));
        } catch (e) {
          console.error('Error parsing config:', e);
        }
      } else {
        // If no config found, redirect to home after a short delay
        const timer = setTimeout(() => {
          router.push('/');
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [gameConfig, gameId, isLoading, router]);

  return (
    <main className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Connection Status & Simulator Mode Banner - Hidden */}
        {/* <div className="mb-4 space-y-2">
          <div className={`p-3 rounded-lg border-2 ${
            connectionStatus === 'connected' 
              ? 'bg-green-50 border-green-200' 
              : connectionStatus === 'connecting'
              ? 'bg-yellow-50 border-yellow-200'
              : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-2">
              <span className={
                connectionStatus === 'connected' ? 'text-green-600' :
                connectionStatus === 'connecting' ? 'text-yellow-600' :
                'text-red-600'
              }>
                {connectionStatus === 'connected' ? '🟢' :
                 connectionStatus === 'connecting' ? '🟡' :
                 '🔴'}
              </span>
              <span className={`text-sm font-medium ${
                connectionStatus === 'connected' ? 'text-green-800' :
                connectionStatus === 'connecting' ? 'text-yellow-800' :
                'text-red-800'
              }`}>
                {connectionStatus === 'connected' ? 'Connected - Real-time updates active' :
                 connectionStatus === 'connecting' ? 'Connecting...' :
                 'Disconnected - Using fallback polling'}
              </span>
            </div>
          </div>
          
          {simulatorStatus?.isSimulator && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-yellow-600">⚠️</span>
                <span className="text-sm text-yellow-800 font-medium">
                  {simulatorStatus.message}
                </span>
              </div>
            </div>
          )}
        </div> */}

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Game Lobby
            </div>
            <p className="text-gray-600 text-lg">
              Game ID: <span className="font-mono text-sm">{gameId}</span>
            </p>
            {gameConfig && (
              <p className="text-gray-600 text-sm mt-1">
                {gameConfig.modelNames?.length || 0} models • ${gameConfig.startingChips || 1000} starting chips
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Button
              onClick={() => router.push('/')}
              variant="outline"
              className="h-10 px-4 font-semibold"
            >
              Home
            </Button>
            <Button
              onClick={() => {
                // Fetch latest stats before showing modal
                fetchGameState();
                setShowPlayerStatsModal(true);
              }}
              variant="outline"
              className="h-10 px-4 font-semibold"
            >
              Player Statistics
            </Button>
            <Button
              onClick={() => setShowChatPlayground(!showChatPlayground)}
              variant="outline"
              className="h-10 px-4 font-semibold"
            >
              {showChatPlayground ? 'Hide' : 'Show'} Chat
            </Button>
            {!isRunning && gameConfig && !isLoading && (
              <div className="text-sm text-gray-600">
                Starting game...
              </div>
            )}
          </div>
        </div>

        {/* Main Content: Game and Chat Playground */}
        <div className={`grid grid-cols-1 gap-6 transition-all duration-500 ${showChatPlayground ? 'lg:grid-cols-3' : 'lg:grid-cols-1'}`}>
          {/* Game Board - Takes 2 columns when chat is visible, full width when hidden */}
          <div className={showChatPlayground ? 'lg:col-span-2' : 'lg:col-span-1'}>
            <GameBoard
              gameState={gameState}
              stats={stats}
              rankings={rankings}
              isRunning={isRunning}
              chatMessages={chatMessages}
              isChatHidden={!showChatPlayground}
              gameTime={gameTime}
              gameId={gameId}
            />
          </div>

          {/* Chat Playground - Takes 1 column, hidden when toggled off */}
          {showChatPlayground && (
            <div className="lg:col-span-1 animate-fade-in">
              <div className="sticky top-6 flex flex-col gap-4">
                {/* Betting Panel */}
                {gameConfig && (
                  <BettingPanel
                    gameId={gameId}
                    playerNames={gameConfig.modelNames || []}
                    lobbyStatus={isRunning ? 'Running' : gameState ? 'Finished' : 'Waiting'}
                  />
                )}
                
                <Card className="p-6 bg-white border-2 border-gray-200 h-[calc(50vh-4rem)] flex flex-col">
                  <ChatPlayground
                    messages={chatMessages}
                    modelNames={rankings.map(r => r.modelName)}
                  />
                </Card>
                {/* X402 Agent-to-Agent Transactions */}
                <X402Transactions gameId={gameId} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Player Statistics Modal */}
      {showPlayerStatsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] p-4">
          <Card className="bg-white border-2 border-gray-300 shadow-2xl max-w-4xl w-full relative max-h-[90vh] overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={() => setShowPlayerStatsModal(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center z-10 bg-white rounded-full hover:bg-gray-100"
            >
              ×
            </button>

            <div className="p-8">
              {stats && stats.length > 0 ? (
                <PlayerStats 
                  stats={stats} 
                  rankings={rankings}
                  onBet={(playerName, playerId) => {
                    // TODO: Implement bet functionality
                    console.log('Bet on player:', playerName, playerId);
                    // You can add bet logic here or open another modal for bet amount
                  }}
                />
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-lg">No statistics available yet</p>
                  <p className="text-gray-400 text-sm mt-2">Statistics will appear once the game starts</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}


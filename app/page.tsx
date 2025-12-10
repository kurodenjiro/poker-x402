'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Lobby {
  game_id: string;
  config: {
    modelNames: string[];
    startingChips: number;
    smallBlind: number;
    bigBlind: number;
    maxHands: number;
  };
  status: 'waiting' | 'running' | 'finished';
  created_at: string;
  updated_at: string;
}

export default function Home() {
  const router = useRouter();
  const [selectedModels, setSelectedModels] = useState<string[]>(['ChatGPT', 'Gemini', 'Grok', 'Claude Sonnet']);
  const [startingChips, setStartingChips] = useState(1000);
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);
  const [maxHands, setMaxHands] = useState(10);
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [isLoadingLobbies, setIsLoadingLobbies] = useState(true);
  const [isCreatingGame, setIsCreatingGame] = useState(false);

  // Fetch lobbies on mount and set up Socket.io for real-time updates
  useEffect(() => {
    const fetchLobbies = async () => {
      try {
        const response = await fetch('/api/lobbies');
        const data = await response.json();
        setLobbies(data.lobbies || []);
      } catch (error) {
        console.error('Error fetching lobbies:', error);
      } finally {
        setIsLoadingLobbies(false);
      }
    };

    fetchLobbies();

    // Set up Socket.io for real-time lobby updates
    const socket = io(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000', {
      path: '/api/socket',
    });

    socket.on('connect', () => {
      console.log('Socket connected for lobby updates');
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected for lobby updates');
    });

    socket.on('reconnect', () => {
      console.log('Socket reconnected for lobby updates');
      fetchLobbies();
    });

    socket.on('lobby-update', () => {
      console.log('Lobby update received');
      fetchLobbies();
    });

    // More frequent fallback polling for smoother updates (every 5 seconds)
    const interval = setInterval(fetchLobbies, 5000);

    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, []);

  const handleCreateGame = async () => {
    // Disable button and show loading
    setIsCreatingGame(true);
    
    try {
      // Generate a unique game ID
      const gameId = `game-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      // Prepare game config
      const config = {
        modelNames: selectedModels,
        startingChips,
        smallBlind,
        bigBlind,
        maxHands,
      };
      
      // Save config to localStorage
      localStorage.setItem(`game-config-${gameId}`, JSON.stringify(config));
      
      // Save lobby to PostgreSQL
      const response = await fetch(`/api/lobby/${gameId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, status: 'waiting' }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create game');
      }
      
      // Navigate to lobby with game ID after successful creation
      router.push(`/lobby/${gameId}`);
    } catch (error) {
      console.error('Error creating game:', error);
      setIsCreatingGame(false); // Re-enable button on error
      alert('Failed to create game. Please try again.');
    }
  };

  const handleJoinLobby = (gameId: string) => {
    router.push(`/lobby/${gameId}`);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Setup Game
          </div>
          <h1 className="text-6xl font-bold text-gray-900 mb-4">Poker X402</h1>
          <p className="text-xl text-gray-600">
            Configure your AI poker game settings
          </p>
        </div>

        {/* Game Setup Card */}
        <Card className="p-8 bg-white border-2 border-gray-200 shadow-lg">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Game Configuration</h2>
          
          <div className="space-y-6">
            {/* Model Selection */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-3 block">
                Select AI Models (Minimum 2)
              </label>
              <div className="flex flex-wrap gap-3">
                {['ChatGPT', 'Gemini', 'Grok', 'Claude Sonnet'].map(model => (
                  <button
                    key={model}
                    onClick={() => {
                      if (selectedModels.includes(model)) {
                        if (selectedModels.length > 2) {
                          setSelectedModels(selectedModels.filter(m => m !== model));
                        }
                      } else {
                        setSelectedModels([...selectedModels, model]);
                      }
                    }}
                    className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                      selectedModels.includes(model)
                        ? 'bg-green-500 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {model}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {selectedModels.length} model{selectedModels.length !== 1 ? 's' : ''} selected
              </p>
            </div>

            {/* Settings Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Starting Chips
                </label>
                <input
                  type="number"
                  value={startingChips}
                  onChange={(e) => setStartingChips(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  min={100}
                  step={100}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Small Blind
                </label>
                <input
                  type="number"
                  value={smallBlind}
                  onChange={(e) => setSmallBlind(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  min={1}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Big Blind
                </label>
                <input
                  type="number"
                  value={bigBlind}
                  onChange={(e) => setBigBlind(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  min={1}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Max Hands
                </label>
                <input
                  type="number"
                  value={maxHands}
                  onChange={(e) => setMaxHands(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  min={1}
                />
              </div>
            </div>

            {/* Create Button */}
            <div className="pt-4">
              <Button
                onClick={handleCreateGame}
                disabled={selectedModels.length < 2 || isCreatingGame}
                className="w-full bg-blue-600 text-white hover:bg-blue-700 h-12 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingGame ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating Game...
                  </span>
                ) : (
                  'Create Game'
                )}
              </Button>
              {selectedModels.length < 2 && !isCreatingGame && (
                <p className="text-sm text-red-500 mt-2 text-center">
                  Please select at least 2 models to create a game
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Info Section */}
        <div className="mt-8 text-center">
          <p className="text-gray-600">
            Configure your game settings and click "Create Game" to start playing
          </p>
        </div>
      </div>

      {/* Active Lobbies Section */}
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Active Lobbies</h2>
          <p className="text-gray-600">Join an existing game to watch AI models play in real-time</p>
        </div>

        {isLoadingLobbies ? (
          <div className="text-center py-12 text-gray-500">
            <p>Loading lobbies...</p>
          </div>
        ) : lobbies.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No active lobbies. Create a game to get started!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {lobbies.map((lobby) => (
              <Card
                key={lobby.game_id}
                className={cn(
                  'p-6 cursor-pointer transition-all hover:shadow-lg border-2',
                  lobby.status === 'running' && 'border-green-500 bg-green-50/30',
                  lobby.status === 'waiting' && 'border-blue-500 bg-blue-50/30',
                  lobby.status === 'finished' && 'border-gray-300 bg-gray-50/30'
                )}
                onClick={() => handleJoinLobby(lobby.game_id)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-bold text-lg text-gray-900">
                        {lobby.config?.modelNames?.join(' vs ') || 'Game'}
                      </h3>
                    </div>
                    <Badge
                      className={cn(
                        'mb-2',
                        lobby.status === 'running' && 'bg-green-500 text-white',
                        lobby.status === 'waiting' && 'bg-blue-500 text-white',
                        lobby.status === 'finished' && 'bg-gray-500 text-white'
                      )}
                    >
                      {lobby.status.toUpperCase()}
                    </Badge>
                  </div>
                </div>
                
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>Models:</span>
                    <span className="font-semibold">{lobby.config?.modelNames?.length || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Starting Chips:</span>
                    <span className="font-semibold">${lobby.config?.startingChips || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Blinds:</span>
                    <span className="font-semibold">
                      ${lobby.config?.smallBlind || 0}/${lobby.config?.bigBlind || 0}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-3">
                    ID: {lobby.game_id.substring(0, 20)}...
                  </div>
                </div>

                <Button
                  className={cn(
                    'w-full mt-4',
                    lobby.status === 'running' && 'bg-green-600 hover:bg-green-700',
                    lobby.status === 'waiting' && 'bg-blue-600 hover:bg-blue-700',
                    lobby.status === 'finished' && 'bg-gray-600 hover:bg-gray-700'
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleJoinLobby(lobby.game_id);
                  }}
                >
                  {lobby.status === 'running' ? 'Watch Live' : lobby.status === 'waiting' ? 'Join' : 'View'}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Connection, PublicKey } from '@solana/web3.js';
import { PokerBettingContract } from '@/lib/solana/betting-contract';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface BettingPanelProps {
  gameId: string;
  playerNames: string[];
  lobbyStatus?: 'Waiting' | 'Running' | 'Finished';
}

export default function BettingPanel({ gameId, playerNames, lobbyStatus: lobbyStatusProp }: BettingPanelProps) {
  const { publicKey, signTransaction, signAllTransactions, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [bets, setBets] = useState<any[]>([]);
  const [totalBets, setTotalBets] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [betAmount, setBetAmount] = useState<string>('0.1');
  const [error, setError] = useState<string | null>(null);
  
  // Ensure lobbyStatus has the correct type
  const lobbyStatus = (lobbyStatusProp ?? 'Waiting') as 'Waiting' | 'Running' | 'Finished';

  const connection = new Connection(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );

  // Disabled: Don't fetch from /api/betting
  // useEffect(() => {
  //   if (gameId) {
  //     fetchBets();
  //     const interval = setInterval(fetchBets, 5000); // Poll every 5 seconds
  //     return () => clearInterval(interval);
  //   }
  // }, [gameId]);

  // Disabled: Don't fetch from /api/betting
  // const fetchBets = async () => {
  //   try {
  //     const response = await fetch(`/api/betting/${gameId}`);
  //     if (response.ok) {
  //       const data = await response.json();
  //       setBets(data.bets || []);
  //       // Ensure totalBets is always a number
  //       const total = data.lobby?.totalBets;
  //       setTotalBets(typeof total === 'number' ? total : (typeof total === 'string' ? parseFloat(total) || 0 : 0));
  //     }
  //   } catch (err) {
  //     console.error('Error fetching bets:', err);
  //   }
  // };

  const handlePlaceBet = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet');
      return;
    }

    if (!selectedPlayer) {
      setError('Please select a player');
      return;
    }

    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid bet amount');
      return;
    }

    if (lobbyStatus === 'Finished') {
      setError('Betting is closed. Game has finished.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Create wallet object compatible with PokerBettingContract
      const wallet = {
        publicKey,
        signTransaction: signTransaction!,
        signAllTransactions: signAllTransactions!,
      };

      // Load IDL first before creating contract
      let programIdl: any = null;
      try {
        const response = await fetch('/idl/poker_betting.json');
        if (!response.ok) {
          throw new Error(`Failed to load IDL: ${response.status} ${response.statusText}`);
        }
        programIdl = await response.json();
        console.log('[BettingPanel] ✅ Loaded IDL successfully');
        console.log('[BettingPanel] IDL instructions:', programIdl.instructions?.map((ix: any) => ix.name));
      } catch (idlError: any) {
        console.error('[BettingPanel] ❌ Failed to load IDL:', idlError);
        setError(`Failed to load contract IDL: ${idlError.message}. Please ensure the IDL file exists at /target/idl/poker_betting.json`);
        setIsLoading(false);
        return;
      }

      if (!programIdl) {
        setError('Failed to load contract IDL');
        setIsLoading(false);
        return;
      }

      // Ensure IDL has address field (required by Anchor 0.32.1)
      if (!programIdl.address && programIdl.metadata?.address) {
        programIdl.address = programIdl.metadata.address;
      }

      // Create contract with loaded IDL
      console.log('[BettingPanel] Creating PokerBettingContract with IDL...');
      const contract = new PokerBettingContract(connection, wallet, programIdl);

      // Verify the program is initialized and placeBet method exists
      const program = (contract as any).program;
      if (!program) {
        throw new Error('Program is not initialized. The contract may not have been created correctly.');
      }

      // Check if placeBet method exists
      if (!program.methods || !program.methods.placeBet) {
        const availableMethods = program.methods ? Object.keys(program.methods) : [];
        console.error('[BettingPanel] ❌ Program methods available:', availableMethods);
        console.error('[BettingPanel] IDL instructions:', programIdl.instructions?.map((ix: any) => ix.name));
        throw new Error(`placeBet method is not available. Available methods: ${availableMethods.join(', ')}. The IDL may be missing the placeBet instruction.`);
      }

      // Validate inputs before calling placeBet
      if (!gameId || typeof gameId !== 'string' || gameId.trim() === '') {
        throw new Error(`Invalid gameId: "${gameId}". Game ID must be a non-empty string.`);
      }
      if (!selectedPlayer || typeof selectedPlayer !== 'string' || selectedPlayer.trim() === '') {
        throw new Error(`Invalid player: "${selectedPlayer}". Player name must be a non-empty string.`);
      }
      if (isNaN(amount) || amount <= 0) {
        throw new Error(`Invalid amount: ${amount}. Amount must be a positive number.`);
      }

      console.log('[BettingPanel] ✅ Contract initialized successfully, calling placeBet...');
      console.log('[BettingPanel] placeBet parameters:', { gameId, selectedPlayer, amount });
      const tx = await contract.placeBet(gameId, selectedPlayer, amount);

      setError(null);
      setBetAmount('0.1');
      setSelectedPlayer('');

      // Disabled: Don't refresh bets from API
      // setTimeout(fetchBets, 2000);

      alert(`Bet placed! Transaction: ${tx}`);
    } catch (err: any) {
      console.error('Error placing bet:', err);
      setError(err.message || 'Failed to place bet');
    } finally {
      setIsLoading(false);
    }
  };

  const getBetsByPlayer = (playerName: string) => {
    return bets.filter(b => b.playerName === playerName && b.status === 'Active');
  };

  const getTotalBetsByPlayer = (playerName: string) => {
    return getBetsByPlayer(playerName).reduce((sum, b) => sum + b.amount, 0);
  };

  if (lobbyStatus === 'Finished') {
    return (
      <Card className="p-4 bg-gray-50">
        <h3 className="text-lg font-bold mb-2">Betting Closed</h3>
        <p className="text-sm text-gray-600">This game has finished. No new bets can be placed.</p>
        {bets.length > 0 && (
          <div className="mt-4">
            <h4 className="font-semibold mb-2">Betting Summary</h4>
            <div className="space-y-2">
              {playerNames.map(player => {
                const playerBets = getTotalBetsByPlayer(player);
                return playerBets > 0 ? (
                  <div key={player} className="flex justify-between text-sm">
                    <span>{player}:</span>
                    <span className="font-medium">{playerBets.toFixed(4)} SOL</span>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <span>💰</span>
          <span>Place Your Bet</span>
        </h3>
        <Badge className="bg-blue-500 text-white">
          {(typeof totalBets === 'number' ? totalBets : parseFloat(String(totalBets)) || 0).toFixed(4)} SOL total
        </Badge>
      </div>

      {!connected && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-sm text-yellow-800 mb-2">Connect your wallet to place bets</p>
          <Button
            onClick={() => setVisible(true)}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
          >
            Connect Wallet
          </Button>
        </div>
      )}


      <div className="space-y-4">
        {/* Player Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Player
          </label>
          <div className="grid grid-cols-2 gap-2">
            {playerNames.map((player) => {
              const playerTotal = getTotalBetsByPlayer(player);
              return (
                <button
                  key={player}
                  onClick={() => setSelectedPlayer(player)}
                  className={`p-3 rounded-lg border-2 transition-all ${selectedPlayer === player
                    ? 'border-blue-500 bg-blue-100'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                >
                  <div className="font-semibold">{player}</div>
                  {playerTotal > 0 && (
                    <div className="text-xs text-gray-600 mt-1">
                      {playerTotal.toFixed(4)} SOL bet
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bet Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Bet Amount (SOL)
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="0.1"
          />
        </div>

        {/* Place Bet Button */}
        <Button
          onClick={handlePlaceBet}
          disabled={!connected || isLoading || !selectedPlayer || (lobbyStatus as string) === 'Finished'}
          className="w-full"
        >
          {isLoading ? 'Placing Bet...' : `Place Bet (${betAmount} SOL)`}
        </Button>

        {/* Current Bets Display */}
        {bets.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h4 className="font-semibold text-sm mb-2">Current Bets</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {bets
                .filter(b => b.status === 'Active')
                .slice(0, 10)
                .map((bet, idx) => (
                  <div key={idx} className="flex justify-between text-xs bg-white p-2 rounded">
                    <span className="text-gray-600">
                      {bet.bettor.toString().substring(0, 8)}... → {bet.playerName}
                    </span>
                    <span className="font-medium">{bet.amount.toFixed(4)} SOL</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}


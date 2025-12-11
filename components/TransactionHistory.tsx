'use client';

import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Transaction {
  id: string;
  timestamp: Date;
  playerName: string;
  playerId: string;
  type: 'win' | 'loss' | 'bet' | 'fold';
  amount: number;
  handNumber?: number;
  description: string;
}

interface TransactionHistoryProps {
  stats: any[];
  gameState: any;
  previousStats?: Map<string, { totalChips: number; handsPlayed: number }>;
}

export default function TransactionHistory({ stats, gameState, previousStats }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const transactionsEndRef = useRef<HTMLDivElement>(null);
  const prevStatsRef = useRef<Map<string, { totalChips: number; handsPlayed: number }>>(new Map());

  useEffect(() => {
    if (!stats || stats.length === 0) return;

    const newTransactions: Transaction[] = [];

    stats.forEach(stat => {
      const prevStat = prevStatsRef.current.get(stat.modelId);
      
      if (prevStat) {
        const chipChange = stat.totalChips - prevStat.totalChips;
        const handsChange = stat.handsPlayed - prevStat.handsPlayed;

        if (chipChange !== 0 || handsChange > 0) {
          if (chipChange > 0) {
            // Win transaction
            newTransactions.push({
              id: `${stat.modelId}-${Date.now()}-win`,
              timestamp: new Date(),
              playerName: stat.modelName,
              playerId: stat.modelId,
              type: 'win',
              amount: chipChange,
              handNumber: gameState?.round,
              description: `Won $${chipChange.toLocaleString('en-US')} in hand #${gameState?.round || 'N/A'}`,
            });
          } else if (chipChange < 0) {
            // Loss transaction
            newTransactions.push({
              id: `${stat.modelId}-${Date.now()}-loss`,
              timestamp: new Date(),
              playerName: stat.modelName,
              playerId: stat.modelId,
              type: 'loss',
              amount: Math.abs(chipChange),
              handNumber: gameState?.round,
              description: `Lost $${Math.abs(chipChange).toLocaleString('en-US')} in hand #${gameState?.round || 'N/A'}`,
            });
          }
        }
      }

      // Update previous stats
      prevStatsRef.current.set(stat.modelId, {
        totalChips: stat.totalChips,
        handsPlayed: stat.handsPlayed,
      });
    });

    if (newTransactions.length > 0) {
      setTransactions(prev => [...newTransactions, ...prev].slice(0, 50)); // Keep last 50 transactions
    }
  }, [stats, gameState]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (transactionsEndRef.current) {
      transactionsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transactions]);

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-gray-900 mb-2">X402 Transaction History</h3>
        <p className="text-xs text-gray-500">Recent chip transactions</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-2">
        {transactions.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            <p>No transactions yet. Start a game to see transaction history!</p>
          </div>
        ) : (
          transactions.map((transaction) => (
            <Card
              key={transaction.id}
              className={cn(
                'p-3 border-2 transition-all',
                transaction.type === 'win' && 'bg-green-50 border-green-200',
                transaction.type === 'loss' && 'bg-red-50 border-red-200',
                transaction.type === 'bet' && 'bg-yellow-50 border-yellow-200',
                transaction.type === 'fold' && 'bg-gray-50 border-gray-200'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      className={cn(
                        'text-xs font-semibold',
                        transaction.type === 'win' && 'bg-green-500 text-white',
                        transaction.type === 'loss' && 'bg-red-500 text-white',
                        transaction.type === 'bet' && 'bg-yellow-500 text-white',
                        transaction.type === 'fold' && 'bg-gray-500 text-white'
                      )}
                    >
                      {transaction.type.toUpperCase()}
                    </Badge>
                    <span className="text-sm font-semibold text-gray-900">{transaction.playerName}</span>
                    {transaction.handNumber && (
                      <span className="text-xs text-gray-500">Hand #{transaction.handNumber}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-700">{transaction.description}</div>
                </div>
                <div className={cn(
                  'text-lg font-bold ml-4',
                  transaction.type === 'win' && 'text-green-600',
                  transaction.type === 'loss' && 'text-red-600',
                  transaction.type === 'bet' && 'text-yellow-600',
                  transaction.type === 'fold' && 'text-gray-600'
                )}>
                  {transaction.type === 'win' ? '+' : '-'}${transaction.amount.toLocaleString('en-US')}
                </div>
              </div>
              <div className="text-xs text-gray-400 mt-2">
                {transaction.timestamp.toLocaleTimeString()}
              </div>
            </Card>
          ))
        )}
        <div ref={transactionsEndRef} />
      </div>
    </div>
  );
}


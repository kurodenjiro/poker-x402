'use client';

import { ModelStats } from '@/lib/ai/types';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface PlayerStatsProps {
  stats: ModelStats[];
  rankings: ModelStats[];
}

export default function PlayerStats({ stats, rankings }: PlayerStatsProps) {
  if (!stats || stats.length === 0) {
    return null;
  }

  return (
    <Card className="p-6 bg-white border-2 border-gray-200">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Player Statistics</h3>
      <div className="flex flex-wrap gap-4 overflow-x-auto">
        {rankings.map((modelStat, index) => {
          const winRate = ((modelStat.handsWon / Math.max(modelStat.handsPlayed, 1)) * 100).toFixed(0);
          const profit = modelStat.netProfit || 0;
          
          return (
            <div
              key={modelStat.modelId}
              className={cn(
                'p-4 rounded-lg border-2 transition-all flex-shrink-0 min-w-[200px]',
                index === 0 ? 'bg-yellow-50 border-yellow-300' : 'bg-gray-50 border-gray-200'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {index === 0 && <span className="text-xl">👑</span>}
                  <span className="font-bold text-gray-900">{modelStat.modelName}</span>
                </div>
                <span className="text-xs font-semibold text-gray-500">#{index + 1}</span>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Wins:</span>
                  <span className="font-semibold text-gray-900">
                    {modelStat.handsWon}/{modelStat.handsPlayed}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Win Rate:</span>
                  <span className={cn(
                    'font-semibold',
                    parseFloat(winRate) >= 50 ? 'text-green-600' : 'text-gray-900'
                  )}>
                    {winRate}%
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Profit:</span>
                  <span className={cn(
                    'font-semibold',
                    profit >= 0 ? 'text-green-600' : 'text-red-600'
                  )}>
                    {profit >= 0 ? '+' : ''}${profit.toLocaleString('en-US')}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}


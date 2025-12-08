import { ModelStats } from './types';
import { GameState, Player, Action } from '../poker/types';
import { evaluateHand } from '../poker/cards';

export class ModelEvaluator {
  private stats: Map<string, ModelStats> = new Map();

  initializeModel(modelId: string, modelName: string, startingChips: number): void {
    this.stats.set(modelId, {
      modelId,
      modelName,
      handsPlayed: 0,
      handsWon: 0,
      totalChips: startingChips,
      startingChips,
      netProfit: 0,
      winRate: 0,
      averageHandValue: 0,
      totalActions: {
        fold: 0,
        check: 0,
        call: 0,
        raise: 0,
        allIn: 0,
      },
    });
  }

  recordAction(modelId: string, action: Action): void {
    const stats = this.stats.get(modelId);
    if (!stats) return;

    if (action in stats.totalActions) {
      stats.totalActions[action as keyof typeof stats.totalActions]++;
    }
  }

  recordHandResult(
    modelId: string,
    won: boolean,
    finalChips: number,
    handValue?: number
  ): void {
    const stats = this.stats.get(modelId);
    if (!stats) return;

    stats.handsPlayed++;
    if (won) {
      stats.handsWon++;
    }
    stats.totalChips = finalChips;
    stats.netProfit = finalChips - stats.startingChips;
    stats.winRate = stats.handsWon / stats.handsPlayed;

    if (handValue !== undefined) {
      const currentAvg = stats.averageHandValue;
      const newAvg = (currentAvg * (stats.handsPlayed - 1) + handValue) / stats.handsPlayed;
      stats.averageHandValue = newAvg;
    }
  }

  getStats(modelId: string): ModelStats | undefined {
    return this.stats.get(modelId);
  }

  getAllStats(): ModelStats[] {
    return Array.from(this.stats.values());
  }

  getRankings(): ModelStats[] {
    return this.getAllStats().sort((a, b) => {
      // Primary: net profit
      if (b.netProfit !== a.netProfit) {
        return b.netProfit - a.netProfit;
      }
      // Secondary: win rate
      if (b.winRate !== a.winRate) {
        return b.winRate - a.winRate;
      }
      // Tertiary: total chips
      return b.totalChips - a.totalChips;
    });
  }

  reset(): void {
    this.stats.clear();
  }
}


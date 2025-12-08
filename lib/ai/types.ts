import { GameState, Player, Action } from '../poker/types';
import { HandEvaluation } from '../poker/types';

export interface AIModel {
  name: string;
  decideAction(gameState: GameState, playerId: string): Promise<AIDecision>;
}

export interface AIDecision {
  action: Action;
  amount?: number;
}

export interface ModelStats {
  modelId: string;
  modelName: string;
  handsPlayed: number;
  handsWon: number;
  totalChips: number;
  startingChips: number;
  netProfit: number;
  winRate: number;
  averageHandValue: number;
  totalActions: {
    fold: number;
    check: number;
    call: number;
    raise: number;
    allIn: number;
  };
}


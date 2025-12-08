export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type HandRank = 
  | 'high-card'
  | 'pair'
  | 'two-pair'
  | 'three-of-a-kind'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'four-of-a-kind'
  | 'straight-flush'
  | 'royal-flush';

export interface HandEvaluation {
  rank: HandRank;
  value: number;
  cards: Card[];
}

export type Action = 'fold' | 'check' | 'call' | 'raise' | 'all-in';

export interface PlayerAction {
  playerId: string;
  action: Action;
  amount?: number;
}

export interface Player {
  id: string;
  name: string;
  chips: number;
  hand: Card[];
  isActive: boolean;
  isAllIn: boolean;
  currentBet: number;
  totalBetThisRound: number;
  lastAction?: Action;
}

export type GamePhase = 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished';

export interface GameState {
  phase: GamePhase;
  players: Player[];
  communityCards: Card[];
  pot: number;
  currentBet: number;
  dealerIndex: number;
  currentPlayerIndex: number;
  round: number;
  smallBlind: number;
  bigBlind: number;
  deck: Card[];
}


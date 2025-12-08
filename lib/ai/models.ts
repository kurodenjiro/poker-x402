import { AIModel, AIDecision } from './types';
import { GameState, Player, Action, Card, HandEvaluation } from '../poker/types';
import { evaluateHand, getRankValue } from '../poker/cards';

export class ConservativeModel implements AIModel {
  name = 'Conservative';

  async decideAction(gameState: GameState, playerId: string): Promise<AIDecision> {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return { action: 'fold' };

    const handStrength = this.evaluateHandStrength(player.hand, gameState.communityCards);
    const potOdds = this.calculatePotOdds(gameState, player);
    const canCheck = gameState.currentBet === player.totalBetThisRound;

    // Very conservative - only play strong hands
    if (handStrength < 0.6) {
      return { action: canCheck ? 'check' : 'fold' };
    }

    if (handStrength < 0.75) {
      if (canCheck) return { action: 'check' };
      if (potOdds > 0.3) return { action: 'call' };
      return { action: 'fold' };
    }

    if (handStrength < 0.85) {
      if (canCheck) return { action: 'check' };
      return { action: 'call' };
    }

    // Strong hand - bet/raise
    if (canCheck) {
      return { action: 'raise', amount: gameState.bigBlind * 2 };
    }
    return { action: 'raise', amount: gameState.currentBet * 1.5 };
  }

  private evaluateHandStrength(hand: Card[], communityCards: Card[]): number {
    if (hand.length < 2) return 0;
    if (communityCards.length === 0) {
      return this.evaluatePreFlop(hand);
    }

    const allCards = [...hand, ...communityCards];
    if (allCards.length < 5) return 0.5;

    try {
      const evaluation = evaluateHand(allCards);
      return this.handRankToStrength(evaluation);
    } catch {
      return 0.5;
    }
  }

  private evaluatePreFlop(hand: Card[]): number {
    const [card1, card2] = hand;
    const rank1 = getRankValue(card1.rank);
    const rank2 = getRankValue(card2.rank);
    const isPair = card1.rank === card2.rank;
    const isSuited = card1.suit === card2.suit;

    if (isPair) {
      if (rank1 >= 10) return 0.9; // High pair
      if (rank1 >= 7) return 0.7; // Medium pair
      return 0.5; // Low pair
    }

    const highCard = Math.max(rank1, rank2);
    if (highCard >= 12) { // Q, K, A
      if (isSuited) return 0.65;
      return 0.55;
    }

    return 0.3;
  }

  private handRankToStrength(evaluation: HandEvaluation): number {
    const rankValues: Record<string, number> = {
      'high-card': 0.1,
      'pair': 0.3,
      'two-pair': 0.5,
      'three-of-a-kind': 0.7,
      'straight': 0.8,
      'flush': 0.85,
      'full-house': 0.9,
      'four-of-a-kind': 0.95,
      'straight-flush': 0.99,
      'royal-flush': 1.0,
    };
    return rankValues[evaluation.rank] || 0.5;
  }

  private calculatePotOdds(gameState: GameState, player: Player): number {
    const toCall = gameState.currentBet - player.totalBetThisRound;
    if (toCall === 0) return 0;
    const potAfterCall = gameState.pot + toCall;
    return toCall / potAfterCall;
  }
}

export class AggressiveModel implements AIModel {
  name = 'Aggressive';

  async decideAction(gameState: GameState, playerId: string): Promise<AIDecision> {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return { action: 'fold' };

    const handStrength = this.evaluateHandStrength(player.hand, gameState.communityCards);
    const canCheck = gameState.currentBet === player.totalBetThisRound;

    // Aggressive - bet/raise often
    if (handStrength < 0.3) {
      return { action: canCheck ? 'check' : 'fold' };
    }

    if (handStrength < 0.5) {
      if (canCheck) return { action: 'raise', amount: gameState.bigBlind * 1.5 };
      return { action: 'call' };
    }

    if (handStrength < 0.7) {
      if (canCheck) return { action: 'raise', amount: gameState.bigBlind * 2 };
      return { action: 'raise', amount: gameState.currentBet * 1.3 };
    }

    // Strong hand - big bet
    if (canCheck) {
      return { action: 'raise', amount: gameState.bigBlind * 3 };
    }
    return { action: 'raise', amount: gameState.currentBet * 2 };
  }

  private evaluateHandStrength(hand: Card[], communityCards: Card[]): number {
    if (hand.length < 2) return 0;
    if (communityCards.length === 0) {
      return this.evaluatePreFlop(hand);
    }

    const allCards = [...hand, ...communityCards];
    if (allCards.length < 5) return 0.5;

    try {
      const evaluation = evaluateHand(allCards);
      return this.handRankToStrength(evaluation);
    } catch {
      return 0.5;
    }
  }

  private evaluatePreFlop(hand: Card[]): number {
    const [card1, card2] = hand;
    const rank1 = getRankValue(card1.rank);
    const rank2 = getRankValue(card2.rank);
    const isPair = card1.rank === card2.rank;
    const isSuited = card1.suit === card2.suit;

    if (isPair) {
      if (rank1 >= 8) return 0.8;
      return 0.6;
    }

    const highCard = Math.max(rank1, rank2);
    if (highCard >= 11) {
      return isSuited ? 0.7 : 0.6;
    }

    return 0.4;
  }

  private handRankToStrength(evaluation: HandEvaluation): number {
    const rankValues: Record<string, number> = {
      'high-card': 0.2,
      'pair': 0.4,
      'two-pair': 0.6,
      'three-of-a-kind': 0.75,
      'straight': 0.85,
      'flush': 0.9,
      'full-house': 0.95,
      'four-of-a-kind': 0.98,
      'straight-flush': 0.99,
      'royal-flush': 1.0,
    };
    return rankValues[evaluation.rank] || 0.5;
  }
}

export class BalancedModel implements AIModel {
  name = 'Balanced';

  async decideAction(gameState: GameState, playerId: string): Promise<AIDecision> {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return { action: 'fold' };

    const handStrength = this.evaluateHandStrength(player.hand, gameState.communityCards);
    const potOdds = this.calculatePotOdds(gameState, player);
    const canCheck = gameState.currentBet === player.totalBetThisRound;
    const position = this.getPosition(gameState, player);

    // Balanced strategy considering position and pot odds
    if (handStrength < 0.4) {
      if (position === 'late' && canCheck) return { action: 'check' };
      return { action: canCheck ? 'check' : 'fold' };
    }

    if (handStrength < 0.6) {
      if (canCheck) {
        if (position === 'late') return { action: 'raise', amount: gameState.bigBlind * 1.5 };
        return { action: 'check' };
      }
      if (potOdds < 0.25) return { action: 'fold' };
      return { action: 'call' };
    }

    if (handStrength < 0.8) {
      if (canCheck) return { action: 'raise', amount: gameState.bigBlind * 2 };
      if (potOdds > 0.3) return { action: 'raise', amount: gameState.currentBet * 1.2 };
      return { action: 'call' };
    }

    // Strong hand
    if (canCheck) {
      return { action: 'raise', amount: gameState.bigBlind * 2.5 };
    }
    return { action: 'raise', amount: gameState.currentBet * 1.5 };
  }

  private evaluateHandStrength(hand: Card[], communityCards: Card[]): number {
    if (hand.length < 2) return 0;
    if (communityCards.length === 0) {
      return this.evaluatePreFlop(hand);
    }

    const allCards = [...hand, ...communityCards];
    if (allCards.length < 5) return 0.5;

    try {
      const evaluation = evaluateHand(allCards);
      return this.handRankToStrength(evaluation);
    } catch {
      return 0.5;
    }
  }

  private evaluatePreFlop(hand: Card[]): number {
    const [card1, card2] = hand;
    const rank1 = getRankValue(card1.rank);
    const rank2 = getRankValue(card2.rank);
    const isPair = card1.rank === card2.rank;
    const isSuited = card1.suit === card2.suit;

    if (isPair) {
      if (rank1 >= 9) return 0.85;
      if (rank1 >= 6) return 0.7;
      return 0.55;
    }

    const highCard = Math.max(rank1, rank2);
    const lowCard = Math.min(rank1, rank2);
    const gap = Math.abs(rank1 - rank2);

    if (highCard >= 12) {
      if (isSuited) return 0.7;
      if (gap <= 3) return 0.65;
      return 0.55;
    }

    if (highCard >= 10 && gap <= 2 && isSuited) return 0.6;
    return 0.4;
  }

  private handRankToStrength(evaluation: HandEvaluation): number {
    const rankValues: Record<string, number> = {
      'high-card': 0.15,
      'pair': 0.35,
      'two-pair': 0.55,
      'three-of-a-kind': 0.7,
      'straight': 0.8,
      'flush': 0.85,
      'full-house': 0.92,
      'four-of-a-kind': 0.96,
      'straight-flush': 0.99,
      'royal-flush': 1.0,
    };
    return rankValues[evaluation.rank] || 0.5;
  }

  private calculatePotOdds(gameState: GameState, player: Player): number {
    const toCall = gameState.currentBet - player.totalBetThisRound;
    if (toCall === 0) return 0;
    const potAfterCall = gameState.pot + toCall;
    return toCall / potAfterCall;
  }

  private getPosition(gameState: GameState, player: Player): 'early' | 'late' {
    const activePlayers = gameState.players.filter(p => p.isActive);
    const playerIndex = activePlayers.findIndex(p => p.id === player.id);
    const dealerIndex = activePlayers.findIndex((_, i) => 
      gameState.players[i] === gameState.players[gameState.dealerIndex]
    );
    const position = (playerIndex - dealerIndex + activePlayers.length) % activePlayers.length;
    return position > activePlayers.length / 2 ? 'late' : 'early';
  }
}

export class RandomModel implements AIModel {
  name = 'Random';

  async decideAction(gameState: GameState, playerId: string): Promise<AIDecision> {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return { action: 'fold' };

    const canCheck = gameState.currentBet === player.totalBetThisRound;
    const actions: Action[] = canCheck 
      ? ['check', 'raise', 'fold']
      : ['fold', 'call', 'raise', 'all-in'];

    const randomAction = actions[Math.floor(Math.random() * actions.length)];

    if (randomAction === 'raise') {
      const minRaise = gameState.currentBet * 1.2;
      const maxRaise = Math.min(player.chips, gameState.currentBet * 3);
      return {
        action: 'raise',
        amount: Math.floor(minRaise + Math.random() * (maxRaise - minRaise)),
      };
    }

    return { action: randomAction };
  }
}


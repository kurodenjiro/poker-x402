import { Card, Suit, Rank, HandRank, HandEvaluation } from './types';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return shuffleDeck(deck);
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function getRankValue(rank: Rank): number {
  const values: Record<Rank, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return values[rank];
}

export function evaluateHand(cards: Card[]): HandEvaluation {
  if (cards.length < 5) {
    throw new Error('Need at least 5 cards to evaluate hand');
  }

  // Get all possible 5-card combinations
  const combinations = getCombinations(cards, 5);
  let bestHand: HandEvaluation | null = null;

  for (const combo of combinations) {
    const evaluation = evaluateFiveCards(combo);
    if (!bestHand || evaluation.value > bestHand.value) {
      bestHand = evaluation;
    }
  }

  return bestHand!;
}

function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];
  
  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, k - 1).map(combo => [first, ...combo]);
  const withoutFirst = getCombinations(rest, k);
  
  return [...withFirst, ...withoutFirst];
}

function evaluateFiveCards(cards: Card[]): HandEvaluation {
  const sorted = [...cards].sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
  const ranks = sorted.map(c => c.rank);
  const suits = sorted.map(c => c.suit);
  const rankValues = sorted.map(c => getRankValue(c.rank));
  
  const rankCounts: Record<Rank, number> = {
    '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 0,
    'J': 0, 'Q': 0, 'K': 0, 'A': 0
  };
  
  ranks.forEach(rank => rankCounts[rank]++);
  
  const counts = Object.values(rankCounts).filter(c => c > 0).sort((a, b) => b - a);
  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = isStraightSequence(rankValues);
  
  // Royal flush
  if (isFlush && isStraight && rankValues[0] === 14 && rankValues[4] === 10) {
    return { rank: 'royal-flush', value: 9000000 + rankValues[0], cards: sorted };
  }
  
  // Straight flush
  if (isFlush && isStraight) {
    return { rank: 'straight-flush', value: 8000000 + rankValues[0], cards: sorted };
  }
  
  // Four of a kind
  if (counts[0] === 4) {
    const fourRank = Object.entries(rankCounts).find(([_, count]) => count === 4)![0] as Rank;
    const kicker = rankValues.find(v => v !== getRankValue(fourRank))!;
    return { rank: 'four-of-a-kind', value: 7000000 + getRankValue(fourRank) * 100 + kicker, cards: sorted };
  }
  
  // Full house
  if (counts[0] === 3 && counts[1] === 2) {
    const threeRank = Object.entries(rankCounts).find(([_, count]) => count === 3)![0] as Rank;
    const pairRank = Object.entries(rankCounts).find(([_, count]) => count === 2)![0] as Rank;
    return { rank: 'full-house', value: 6000000 + getRankValue(threeRank) * 100 + getRankValue(pairRank), cards: sorted };
  }
  
  // Flush
  if (isFlush) {
    return { rank: 'flush', value: 5000000 + rankValues[0] * 10000 + rankValues[1] * 1000 + rankValues[2] * 100 + rankValues[3] * 10 + rankValues[4], cards: sorted };
  }
  
  // Straight
  if (isStraight) {
    return { rank: 'straight', value: 4000000 + rankValues[0], cards: sorted };
  }
  
  // Three of a kind
  if (counts[0] === 3) {
    const threeRank = Object.entries(rankCounts).find(([_, count]) => count === 3)![0] as Rank;
    const kickers = rankValues.filter(v => v !== getRankValue(threeRank)).sort((a, b) => b - a);
    return { rank: 'three-of-a-kind', value: 3000000 + getRankValue(threeRank) * 10000 + kickers[0] * 100 + kickers[1], cards: sorted };
  }
  
  // Two pair
  if (counts[0] === 2 && counts[1] === 2) {
    const pairs = Object.entries(rankCounts)
      .filter(([_, count]) => count === 2)
      .map(([rank, _]) => getRankValue(rank as Rank))
      .sort((a, b) => b - a);
    const kicker = rankValues.find(v => !pairs.includes(v))!;
    return { rank: 'two-pair', value: 2000000 + pairs[0] * 10000 + pairs[1] * 100 + kicker, cards: sorted };
  }
  
  // Pair
  if (counts[0] === 2) {
    const pairRank = Object.entries(rankCounts).find(([_, count]) => count === 2)![0] as Rank;
    const kickers = rankValues.filter(v => v !== getRankValue(pairRank)).sort((a, b) => b - a);
    return { rank: 'pair', value: 1000000 + getRankValue(pairRank) * 10000 + kickers[0] * 100 + kickers[1] * 10 + kickers[2], cards: sorted };
  }
  
  // High card
  return { rank: 'high-card', value: rankValues[0] * 10000 + rankValues[1] * 1000 + rankValues[2] * 100 + rankValues[3] * 10 + rankValues[4], cards: sorted };
}

function isStraightSequence(rankValues: number[]): boolean {
  const sorted = [...rankValues].sort((a, b) => a - b);
  
  // Check for regular straight
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      // Check for A-2-3-4-5 straight (wheel)
      if (sorted[0] === 2 && sorted[4] === 14) {
        return sorted[1] === 3 && sorted[2] === 4 && sorted[3] === 5;
      }
      return false;
    }
  }
  return true;
}

export function compareHands(hand1: HandEvaluation, hand2: HandEvaluation): number {
  return hand1.value - hand2.value;
}


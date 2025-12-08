import { GameState, Player } from '../poker/types';
import { ChatMessage } from './chat-history';

// Generate emoji based on action
export function getActionEmoji(action: string): string {
  const emojiMap: Record<string, string> = {
    'fold': '😔',
    'check': '👀',
    'call': '👍',
    'raise': '💪',
    'all-in': '🔥',
    'system': '🎯',
  };
  return emojiMap[action] || '🤔';
}

// Generate strategy conversation when opponent acts
export function generateStrategyChat(
  currentPlayer: Player,
  opponent: Player,
  gameState: GameState,
  action: string
): string {
  const strategies = [
    `"${opponent.name} just ${action}ed. I need to reconsider my position..."`,
    `"Hmm, ${opponent.name} is being ${action === 'raise' ? 'aggressive' : action === 'fold' ? 'cautious' : 'moderate'}. Let me adjust."`,
    `"Interesting move by ${opponent.name}. My hand strength suggests I should ${getRecommendedAction(currentPlayer, gameState)}."`,
    `"${opponent.name}'s ${action} changes the pot odds. Time to recalculate..."`,
    `"I see ${opponent.name} ${action}ed. Based on my cards, I'm thinking ${getRecommendedAction(currentPlayer, gameState)}."`,
    `"${opponent.name} ${action}ed. This is getting interesting - I'll need to be strategic here."`,
    `"Watching ${opponent.name} ${action}. My position and cards tell me to ${getRecommendedAction(currentPlayer, gameState)}."`,
    `"${opponent.name} made a ${action} move. I'm analyzing the board and my options carefully."`,
  ];
  
  return strategies[Math.floor(Math.random() * strategies.length)];
}

function getRecommendedAction(player: Player, gameState: GameState): string {
  const toCall = gameState.currentBet - player.totalBetThisRound;
  if (toCall === 0) return 'check or raise';
  if (toCall > player.chips * 0.3) return 'fold or call carefully';
  return 'call or raise';
}

// Generate emoji for card dealing phases
export function getCardDealEmoji(phase: string, cardIndex: number): string {
  if (phase === 'pre-flop') {
    return '🎴';
  }
  if (phase === 'flop' && cardIndex < 3) {
    return '🃏';
  }
  if (phase === 'turn') {
    return '🂮';
  }
  if (phase === 'river') {
    return '🂭';
  }
  return '🃏';
}


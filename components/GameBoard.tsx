'use client';

import { useState, useEffect, useRef } from 'react';
import { GameState } from '@/lib/poker/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ModelStats } from '@/lib/ai/types';
import { ChatMessage } from '@/lib/ai/chat-history';
import { evaluateHand } from '@/lib/poker/cards';
import { HandRank } from '@/lib/poker/types';
import { cn } from '@/lib/utils';

function getActionEmoji(action: string): string {
  const emojiMap: Record<string, string> = {
    'fold': '😔',
    'check': '👀',
    'call': '👍',
    'raise': '💪',
    'all-in': '🔥',
  };
  return emojiMap[action] || '🤔';
}

// Hand rank mapping to number and display name
const HAND_RANK_MAP: Record<HandRank, { rank: number; name: string }> = {
  'royal-flush': { rank: 1, name: 'Royal Flush' },
  'straight-flush': { rank: 2, name: 'Straight Flush' },
  'four-of-a-kind': { rank: 3, name: 'Four of a Kind' },
  'full-house': { rank: 4, name: 'Full House' },
  'flush': { rank: 5, name: 'Flush' },
  'straight': { rank: 6, name: 'Straight' },
  'three-of-a-kind': { rank: 7, name: 'Three of a Kind' },
  'two-pair': { rank: 8, name: 'Two Pair' },
  'pair': { rank: 9, name: 'One Pair' },
  'high-card': { rank: 10, name: 'High Card' },
};

function getHandInfo(playerHand: any[], communityCards: any[]): { rank: number; name: string } | null {
  if (playerHand.length < 2) return null;
  if (communityCards.length < 3) return null;
  
  try {
    const allCards = [...playerHand, ...communityCards];
    if (allCards.length < 5) return null;
    
    const evaluation = evaluateHand(allCards);
    return HAND_RANK_MAP[evaluation.rank];
  } catch (error) {
    return null;
  }
}

interface GameBoardProps {
  gameState: GameState | null;
  stats: ModelStats[];
  rankings: ModelStats[];
  isRunning: boolean;
  chatMessages?: ChatMessage[];
}

export default function GameBoard({ gameState, stats, rankings, isRunning, chatMessages = [] }: GameBoardProps) {
  // Track previous stats to detect wins/losses
  const prevStatsRef = useRef<Map<string, { handsWon: number; handsPlayed: number; totalChips: number }>>(new Map());
  const [winLossAnimations, setWinLossAnimations] = useState<Map<string, { type: 'win' | 'loss'; profit: number } | null>>(new Map());

  useEffect(() => {
    if (!stats || stats.length === 0) return;

    const newAnimations = new Map<string, { type: 'win' | 'loss'; profit: number } | null>();
    
    stats.forEach(stat => {
      const prevStat = prevStatsRef.current.get(stat.modelId);
      
      if (prevStat) {
        const profitChange = stat.totalChips - prevStat.totalChips;
        
        // Check if handsWon increased (win)
        if (stat.handsWon > prevStat.handsWon && profitChange > 0) {
          newAnimations.set(stat.modelId, { type: 'win', profit: profitChange });
          // Clear animation after 4 seconds
          setTimeout(() => {
            setWinLossAnimations(prev => {
              const updated = new Map(prev);
              updated.delete(stat.modelId);
              return updated;
            });
          }, 4000);
        }
        // Check if handsPlayed increased but handsWon didn't (loss)
        else if (stat.handsPlayed > prevStat.handsPlayed && stat.handsWon === prevStat.handsWon && profitChange < 0) {
          newAnimations.set(stat.modelId, { type: 'loss', profit: Math.abs(profitChange) });
          // Clear animation after 4 seconds
          setTimeout(() => {
            setWinLossAnimations(prev => {
              const updated = new Map(prev);
              updated.delete(stat.modelId);
              return updated;
            });
          }, 4000);
        }
      }
      
      // Update previous stats
      prevStatsRef.current.set(stat.modelId, {
        handsWon: stat.handsWon,
        handsPlayed: stat.handsPlayed,
        totalChips: stat.totalChips,
      });
    });

    if (newAnimations.size > 0) {
      setWinLossAnimations(newAnimations);
    }
  }, [stats]);

  if (!gameState || rankings.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-lg">No game in progress. Start a new game to begin!</p>
      </div>
    );
  }

  const activePlayers = gameState.players.filter(p => p.isActive && p.chips > 0);
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  return (
    <div className="space-y-6">
      {/* Game Info Bar */}
      <div className="flex items-center justify-center gap-6 mb-6 flex-wrap">
        <Card className="px-6 py-4 bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300 shadow-lg min-w-[140px]">
          <div className="text-center">
            <div className="text-xs font-semibold text-green-700 mb-1 uppercase tracking-wider">Pot</div>
            <div className="text-3xl font-bold text-green-800">${gameState.pot}</div>
          </div>
        </Card>
        <Card className="px-6 py-4 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 shadow-lg min-w-[140px]">
          <div className="text-center">
            <div className="text-xs font-semibold text-blue-700 mb-1 uppercase tracking-wider">Phase</div>
            <div className="text-xl font-bold text-blue-800 uppercase tracking-wide">
              {gameState.phase.replace('-', ' ')}
            </div>
          </div>
        </Card>
        <Card className="px-6 py-4 bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300 shadow-lg min-w-[140px]">
          <div className="text-center">
            <div className="text-xs font-semibold text-purple-700 mb-1 uppercase tracking-wider">Hand</div>
            <div className="text-3xl font-bold text-purple-800">#{gameState.round}</div>
          </div>
        </Card>
      </div>

      {/* Community Cards - Dedicated Space */}
      <div className="mb-8">
        <Card className="px-8 py-6 bg-gradient-to-br from-yellow-50 to-yellow-100 border-2 border-yellow-300 shadow-lg">
          <div className="text-center mb-4">
            <div className="text-sm font-semibold text-yellow-700 uppercase tracking-wider">Community Cards</div>
          </div>
          <div className="flex gap-3 justify-center items-center min-h-[120px]">
            {gameState.communityCards.length > 0 ? (
              gameState.communityCards.map((card, index) => (
                <CardComponent 
                  key={index} 
                  card={card} 
                  size="large" 
                  index={index}
                  isDealing={isRunning}
                />
              ))
            ) : (
              <div className="flex gap-3 justify-center">
                {/* Placeholder cards for visual consistency */}
                {[0, 1, 2, 3, 4].map((index) => (
                  <CardComponent 
                    key={index} 
                    card={null} 
                    isRevealed={false}
                    size="large" 
                    index={index}
                    isDealing={false}
                  />
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Model Panels - Vertical Layout like Wordle */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rankings.map((modelStat, index) => {
          const player = gameState.players.find(p => p.name === modelStat.modelName);
          if (!player) return null;

          const isCurrentPlayer = player.id === currentPlayer?.id;
          const rank = index + 1;
          const animationData = winLossAnimations.get(modelStat.modelId);
          const animationState = animationData?.type || null;
          const profitAmount = animationData?.profit || 0;
          
          // Get only the most recent message for this player (exclude thinking/observing messages)
          const playerRecentMessages = chatMessages
            .filter(m => m.modelName === modelStat.modelName && 
              m.action !== 'observe' &&
              m.action !== 'system' &&
              !m.decision?.toLowerCase().includes('observing') &&
              !m.decision?.toLowerCase().includes('thinking') &&
              (m.strategy || m.reasoning || (m.decision && m.role === 'assistant')))
            .slice(-1);
          
          // Get only the most recent message from other players mentioning this player (exclude thinking/observing)
          const otherPlayerMessages = chatMessages
            .filter(m => m.modelName !== modelStat.modelName && 
              m.action !== 'observe' &&
              m.action !== 'system' &&
              !m.decision?.toLowerCase().includes('observing') &&
              !m.decision?.toLowerCase().includes('thinking') &&
              m.strategy && 
              m.strategy.toLowerCase().includes(modelStat.modelName.toLowerCase()))
            .slice(-1);

          // Get the most recent relevant message (prioritize player's own message)
          const latestMessage = playerRecentMessages[0] || otherPlayerMessages[0];

          return (
            <div key={modelStat.modelId} className="relative">
              <Card
                className={cn(
                  'p-6 bg-gradient-to-br from-white to-green-50/30 border-2 transition-all rounded-xl shadow-md hover:shadow-lg relative overflow-hidden',
                  isCurrentPlayer
                    ? 'border-green-500 shadow-xl ring-4 ring-green-200/50 scale-105'
                    : 'border-green-200 hover:border-green-300',
                  rank === 1 && 'ring-2 ring-yellow-400 border-yellow-300',
                  animationState === 'win' && 'animate-win-celebration ring-4 ring-green-400',
                  animationState === 'loss' && 'animate-loss-shake ring-4 ring-red-400',
                  !player.isActive && 'opacity-40 transition-opacity duration-500'
                )}
              >
              {/* Messenger Balloon - Inside Card */}
              {latestMessage && (
                <div className="mb-4">
                  {playerRecentMessages.length > 0 ? (
                    // Show player's own latest message
                    <div
                      className={cn(
                        "relative bg-gradient-to-br from-white to-gray-50 border-2 border-gray-300 rounded-2xl shadow-lg p-3 text-xs w-full",
                        latestMessage.emoji && "animate-pulse",
                        "animate-fade-in"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {latestMessage.emoji && (
                          <span className="text-lg flex-shrink-0">{latestMessage.emoji}</span>
                        )}
                        <div className="flex-1 min-w-0">
                          {latestMessage.strategy && (
                            <div className="text-gray-900 font-semibold leading-relaxed text-xs">
                              {latestMessage.strategy}
                            </div>
                          )}
                          {!latestMessage.strategy && latestMessage.reasoning && (
                            <div className="text-gray-700 italic leading-relaxed text-xs">
                              "{latestMessage.reasoning}"
                            </div>
                          )}
                          {!latestMessage.strategy && !latestMessage.reasoning && latestMessage.decision && (
                            <div className="text-gray-900 font-bold text-xs">
                              {latestMessage.decision}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : otherPlayerMessages.length > 0 ? (
                    // Show other player's message about this player
                    <div
                      className={cn(
                        "relative bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-2xl shadow-md p-3 text-xs w-full",
                        "animate-fade-in"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {latestMessage.emoji && (
                          <span className="text-base">{latestMessage.emoji}</span>
                        )}
                        <div className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                          {latestMessage.modelName}
                        </div>
                      </div>
                      <div className="text-gray-800 leading-relaxed font-medium text-xs">
                        {latestMessage.strategy}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Win/Loss Animation Overlay */}
              {animationState === 'win' && (
                <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none overflow-hidden">
                  {/* Celebration Emojis */}
                  <div className="absolute top-8 left-1/4 text-5xl animate-float-up rotate-12">🎊</div>
                  <div className="absolute top-6 right-1/4 text-4xl animate-float-up-delayed -rotate-12">✨</div>
                  <div className="absolute bottom-8 left-1/3 text-4xl animate-float-up-delayed-2 rotate-6">🏆</div>
                  <div className="absolute bottom-6 right-1/3 text-5xl animate-float-up-delayed-3 -rotate-6">⭐</div>
                  
                  {/* Main Celebration Emoji */}
                  <div className="text-7xl animate-bounce-in-slow relative z-10">
                    🎉
                  </div>
                  
                  {/* Profit Amount - Enhanced */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 mt-20 animate-profit-pop-enhanced">
                    <div className="relative">
                      {/* Glow effect */}
                      <div className="absolute inset-0 bg-green-400 rounded-full blur-xl opacity-50 animate-pulse"></div>
                      {/* Main badge */}
                      <div className="relative bg-gradient-to-r from-green-500 via-green-600 to-green-500 text-white font-extrabold text-3xl px-8 py-4 rounded-full shadow-2xl border-4 border-white/90 backdrop-blur-sm">
                        <div className="flex items-center gap-3">
                          <span className="text-4xl animate-spin-slow">💰</span>
                          <span className="tracking-wide">+${profitAmount.toLocaleString()}</span>
                          <span className="text-2xl animate-bounce">🎊</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Confetti effect */}
                  <div className="absolute top-0 left-1/2 w-2 h-2 bg-yellow-400 rounded-full animate-confetti-1"></div>
                  <div className="absolute top-0 left-1/3 w-2 h-2 bg-green-400 rounded-full animate-confetti-2"></div>
                  <div className="absolute top-0 right-1/3 w-2 h-2 bg-blue-400 rounded-full animate-confetti-3"></div>
                  <div className="absolute top-0 right-1/4 w-2 h-2 bg-pink-400 rounded-full animate-confetti-4"></div>
                </div>
              )}
              {animationState === 'loss' && (
                <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none overflow-hidden">
                  {/* Loss Emojis */}
                  <div className="absolute top-8 left-1/4 text-4xl animate-float-down rotate-12">💔</div>
                  <div className="absolute top-6 right-1/4 text-5xl animate-float-down-delayed -rotate-12">😢</div>
                  <div className="absolute bottom-8 left-1/3 text-4xl animate-float-down-delayed-2 rotate-6">💸</div>
                  <div className="absolute bottom-6 right-1/3 text-4xl animate-float-down-delayed-3 -rotate-6">📉</div>
                  
                  {/* Main Sad Emoji */}
                  <div className="text-7xl animate-bounce-in-slow relative z-10">
                    😔
                  </div>
                  
                  {/* Loss Amount - Enhanced */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 mt-20 animate-profit-pop-enhanced">
                    <div className="relative">
                      {/* Glow effect */}
                      <div className="absolute inset-0 bg-red-400 rounded-full blur-xl opacity-50 animate-pulse"></div>
                      {/* Main badge */}
                      <div className="relative bg-gradient-to-r from-red-500 via-red-600 to-red-500 text-white font-extrabold text-3xl px-8 py-4 rounded-full shadow-2xl border-4 border-white/90 backdrop-blur-sm">
                        <div className="flex items-center gap-3">
                          <span className="text-4xl animate-shake">💸</span>
                          <span className="tracking-wide">-${profitAmount.toLocaleString()}</span>
                          <span className="text-2xl">😢</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* Header with Name and Status */}
              <div className="flex items-start justify-between mb-5">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-xl text-gray-900">{modelStat.modelName}</h3>
                    {rank === 1 && (
                      <span className="text-lg">👑</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-600">
                    <span className="font-medium">
                      {modelStat.handsWon}/{modelStat.handsPlayed} wins
                    </span>
                    <span>•</span>
                    <span>
                      {((modelStat.handsWon / Math.max(modelStat.handsPlayed, 1)) * 100).toFixed(0)}% win rate
                    </span>
                    {modelStat.netProfit !== 0 && (
                      <>
                        <span>•</span>
                        <span className={cn(
                          "font-semibold",
                          modelStat.netProfit >= 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {modelStat.netProfit >= 0 ? '+' : ''}${modelStat.netProfit.toLocaleString()} profit
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {isCurrentPlayer && (
                    <Badge className="bg-yellow-400 text-black animate-pulse text-xs font-semibold px-3 py-1 flex items-center gap-1.5 shadow-md">
                      <span className="text-sm">🤔</span>
                      <span>Thinking...</span>
                    </Badge>
                  )}
                  {player.lastAction && !isCurrentPlayer && (
                    <div className="text-3xl animate-bounce drop-shadow-lg">
                      {getActionEmoji(player.lastAction)}
                    </div>
                  )}
                </div>
              </div>

              {/* Key Stats - Enhanced */}
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="bg-gradient-to-br from-white to-gray-50 rounded-lg p-3 border border-gray-200 shadow-sm">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Chips</div>
                  <div className="text-2xl font-bold text-gray-900">${modelStat.totalChips.toLocaleString()}</div>
                </div>
                <div className="bg-gradient-to-br from-white to-gray-50 rounded-lg p-3 border border-gray-200 shadow-sm">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Bet</div>
                  <div className="flex items-center gap-2">
                    {player.currentBet > 0 ? (
                      <>
                        <span className="text-2xl">💰</span>
                        <div className="text-xl font-bold text-gray-900">
                          ${player.currentBet.toLocaleString()}
                        </div>
                      </>
                    ) : (
                      <div className="text-lg font-medium text-gray-400 italic">
                        $0
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Current Hand */}
              {player.hand.length > 0 && (
                <div className="mb-5">
                  <div className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Hole Cards</div>
                  <div className="flex gap-3 justify-center">
                    {player.hand.map((card, cardIndex) => (
                      <CardComponent
                        key={cardIndex}
                        card={card}
                        isRevealed={gameState.phase === 'showdown' || isCurrentPlayer}
                        index={cardIndex}
                        isDealing={isRunning}
                      />
                    ))}
                  </div>
                  
                  {/* Hand Rank and Name */}
                  {gameState.communityCards.length >= 3 && (gameState.phase === 'showdown' || isCurrentPlayer) && (
                    (() => {
                      const handInfo = getHandInfo(player.hand, gameState.communityCards);
                      return handInfo ? (
                        <div className="mt-4 flex items-center justify-center">
                          <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg px-4 py-2 shadow-lg">
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-bold">#{handInfo.rank}</span>
                              <span className="text-sm font-semibold">{handInfo.name}</span>
                            </div>
                          </div>
                        </div>
                      ) : null;
                    })()
                  )}
                </div>
              )}

              {/* Current Status - Enhanced */}
              <div className="space-y-2">
                {player.lastAction && (
                  <div className="text-center">
                    <div className="inline-flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1.5">
                      <span className="text-lg">{getActionEmoji(player.lastAction)}</span>
                      <span className="text-xs text-gray-600 font-medium">Last:</span>
                      <span className="text-xs font-bold text-gray-900 uppercase">{player.lastAction}</span>
                    </div>
                  </div>
                )}
                {player.isAllIn && (
                  <div className="flex items-center justify-center">
                    <Badge className="bg-gradient-to-r from-red-500 to-red-600 text-white text-xs font-bold px-4 py-1.5 shadow-lg animate-pulse">
                      🔥 ALL-IN
                    </Badge>
                  </div>
                )}
              </div>

              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardComponent({ 
  card, 
  isRevealed = true, 
  size = 'normal',
  index = 0,
  isDealing = false
}: { 
  card: any | null; 
  isRevealed?: boolean; 
  size?: 'normal' | 'large';
  index?: number;
  isDealing?: boolean;
}) {
  // If no card provided, show back
  if (!card) {
    isRevealed = false;
  }
  
  const cardSize = size === 'large' 
    ? 'w-20 h-28' 
    : 'w-14 h-20';
  const textSize = size === 'large'
    ? { rank: 'text-xl', suit: 'text-4xl' }
    : { rank: 'text-base', suit: 'text-2xl' };
  const borderRadius = size === 'large' ? 'rounded-lg' : 'rounded-md';

  if (!isRevealed) {
    return (
      <div 
        className={cn(
          cardSize,
          borderRadius,
          'bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 border-2 border-blue-900 shadow-xl flex items-center justify-center relative overflow-hidden',
          isDealing && 'animate-card-deal'
        )}
        style={{
          animationDelay: `${index * 0.1}s`,
        }}
      >
        {/* Card back pattern - standard playing card design */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-2 left-2 w-8 h-8 border-2 border-white rounded"></div>
          <div className="absolute bottom-2 right-2 w-8 h-8 border-2 border-white rounded"></div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white font-bold text-4xl opacity-80">♠</div>
        </div>
      </div>
    );
  }

  const suitSymbols: Record<string, string> = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠',
  };

  const suitColors: Record<string, string> = {
    hearts: 'text-red-600',
    diamonds: 'text-red-600',
    clubs: 'text-gray-900',
    spades: 'text-gray-900',
  };

  return (
    <div
      className={cn(
        cardSize,
        borderRadius,
        'bg-white border-2 border-gray-400 flex flex-col items-center justify-center shadow-xl font-bold transition-all hover:scale-105',
        suitColors[card.suit],
        isDealing && 'animate-card-deal'
      )}
      style={{
        animationDelay: `${index * 0.1}s`,
      }}
    >
      <div className={cn(textSize.rank, 'font-extrabold')}>{card.rank}</div>
      <div className={cn(textSize.suit, 'leading-none')}>{suitSymbols[card.suit]}</div>
    </div>
  );
}


'use client';

import { GameState } from '@/lib/poker/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ModelStats } from '@/lib/ai/types';
import { ChatMessage } from '@/lib/ai/chat-history';
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

interface GameBoardProps {
  gameState: GameState | null;
  stats: ModelStats[];
  rankings: ModelStats[];
  isRunning: boolean;
  chatMessages?: ChatMessage[];
}

export default function GameBoard({ gameState, stats, rankings, isRunning, chatMessages = [] }: GameBoardProps) {
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
          
          // Get recent messages for this player (last 3, showing conversation)
          const playerRecentMessages = chatMessages
            .filter(m => m.modelName === modelStat.modelName && 
              (m.strategy || m.reasoning || (m.decision && m.role === 'assistant')))
            .slice(-3);
          
          // Get messages from other players mentioning this player or reacting
          const otherPlayerMessages = chatMessages
            .filter(m => m.modelName !== modelStat.modelName && 
              m.strategy && 
              m.strategy.toLowerCase().includes(modelStat.modelName.toLowerCase()))
            .slice(-2);

          return (
            <div key={modelStat.modelId} className="relative">
              {/* Conversation Balloons - Show multiple messages like players talking */}
              {(playerRecentMessages.length > 0 || otherPlayerMessages.length > 0) && (
                <div className="absolute -top-2 left-0 right-0 z-10 mb-2 space-y-2">
                  {/* Other players talking about this player */}
                  {otherPlayerMessages.map((msg, msgIndex) => (
                    <div
                      key={`other-${msgIndex}`}
                      className={cn(
                        "relative bg-blue-50 border-2 border-blue-300 rounded-lg shadow-md p-2 text-xs max-w-full",
                        "before:absolute before:bottom-0 before:left-4 before:w-0 before:h-0",
                        "before:border-l-6 before:border-r-6 before:border-t-6",
                        "before:border-l-transparent before:border-r-transparent before:border-t-blue-50",
                        "before:-mb-1.5",
                        "animate-fade-in"
                      )}
                      style={{ animationDelay: `${msgIndex * 0.1}s` }}
                    >
                      <div className="text-xs font-semibold text-blue-700 mb-1">
                        {msg.modelName}:
                      </div>
                      {msg.emoji && (
                        <span className="text-sm mr-1 inline-block">{msg.emoji}</span>
                      )}
                      <div className="text-gray-700">
                        {msg.strategy}
                      </div>
                    </div>
                  ))}
                  
                  {/* This player's messages */}
                  {playerRecentMessages.map((msg, msgIndex) => (
                    <div
                      key={`self-${msgIndex}`}
                      className={cn(
                        "relative bg-white border-2 border-gray-300 rounded-lg shadow-lg p-2 text-xs max-w-full",
                        "before:absolute before:bottom-0 before:left-6 before:w-0 before:h-0",
                        "before:border-l-6 before:border-r-6 before:border-t-6",
                        "before:border-l-transparent before:border-r-transparent before:border-t-white",
                        "before:-mb-1.5",
                        msg.emoji && "animate-pulse",
                        "animate-fade-in"
                      )}
                      style={{ animationDelay: `${(otherPlayerMessages.length + msgIndex) * 0.1}s` }}
                    >
                      {msg.emoji && (
                        <span className="text-sm mr-1 inline-block">{msg.emoji}</span>
                      )}
                      {msg.strategy && (
                        <div className="text-gray-700 font-medium">
                          {msg.strategy}
                        </div>
                      )}
                      {!msg.strategy && msg.reasoning && (
                        <div className="text-gray-700 italic">
                          "{msg.reasoning}"
                        </div>
                      )}
                      {!msg.strategy && !msg.reasoning && msg.decision && (
                        <div className="text-gray-700 font-semibold">
                          {msg.decision}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              <Card
                className={cn(
                  'p-5 bg-green-50/50 border-2 transition-all rounded-lg',
                  isCurrentPlayer
                    ? 'border-green-500 shadow-lg ring-2 ring-green-200'
                    : 'border-green-200',
                  rank === 1 && 'ring-2 ring-green-400',
                  (playerRecentMessages.length > 0 || otherPlayerMessages.length > 0) && 'mt-32'
                )}
              >
              {/* Header with Name */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-lg text-gray-900">{modelStat.modelName}</h3>
                  <div className="text-xs text-gray-500">
                    {modelStat.handsWon}/{modelStat.handsPlayed} hands won
                  </div>
                </div>
                {isCurrentPlayer && (
                  <Badge className="bg-yellow-400 text-black animate-pulse text-xs flex items-center gap-1">
                    <span>🤔</span>
                    <span>Thinking...</span>
                  </Badge>
                )}
                {player.lastAction && (
                  <div className="text-2xl animate-bounce">
                    {getActionEmoji(player.lastAction)}
                  </div>
                )}
              </div>

              {/* Key Stats */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white rounded p-2">
                  <div className="text-xs text-gray-500">Chips</div>
                  <div className="text-lg font-bold text-gray-900">${modelStat.totalChips}</div>
                </div>
                <div className="bg-white rounded p-2">
                  <div className="text-xs text-gray-500">Profit</div>
                  <div
                    className={cn(
                      'text-lg font-bold',
                      modelStat.netProfit >= 0 ? 'text-green-600' : 'text-red-600'
                    )}
                  >
                    {modelStat.netProfit >= 0 ? '+' : ''}${modelStat.netProfit}
                  </div>
                </div>
              </div>

              {/* Current Hand */}
              {player.hand.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs text-gray-600 mb-2 font-medium">Hole Cards</div>
                  <div className="flex gap-2">
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
                </div>
              )}

              {/* Current Status */}
              <div className="space-y-2 mb-4">
                {player.currentBet > 0 && (
                  <div className="flex items-center gap-2">
                    <Badge className="bg-orange-400 text-white text-xs">
                      Bet: ${player.currentBet}
                    </Badge>
                  </div>
                )}
                {player.isAllIn && (
                  <Badge className="bg-red-500 text-white text-xs">ALL-IN</Badge>
                )}
                {player.lastAction && (
                  <div className="text-xs text-gray-600">
                    Last: <span className="font-semibold uppercase">{player.lastAction}</span>
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


'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { GameState } from '@/lib/poker/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ModelStats } from '@/lib/ai/types';
import { ChatMessage } from '@/lib/ai/chat-history';
import { evaluateHand } from '@/lib/poker/cards';
import { HandRank } from '@/lib/poker/types';
import { cn } from '@/lib/utils';
import AnimatedChips from '@/components/AnimatedChips';

// Component for flying pot distribution animation (pot to player)
function PotDistributionAnimation({
  playerId,
  amount,
  playerCardRef,
  potRef
}: {
  playerId: string;
  amount: number;
  playerCardRef: HTMLDivElement | undefined;
  potRef: HTMLDivElement | null;
}) {
  const [positions, setPositions] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const animationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playerCardRef || !potRef) {
      return;
    }

    // Retry mechanism - try multiple times if refs aren't ready
    let attempts = 0;
    const maxAttempts = 10;

    const tryCalculatePositions = () => {
      attempts++;
      try {
        if (!playerCardRef || !potRef) {
          if (attempts < maxAttempts) {
            setTimeout(tryCalculatePositions, 50);
          }
          return;
        }

        const startRect = potRef.getBoundingClientRect(); // Start from pot
        const endRect = playerCardRef.getBoundingClientRect(); // End at player

        if (startRect.width === 0 || startRect.height === 0 || endRect.width === 0 || endRect.height === 0) {
          if (attempts < maxAttempts) {
            setTimeout(tryCalculatePositions, 50);
          }
          return;
        }

        const startX = startRect.left + startRect.width / 2;
        const startY = startRect.top + startRect.height / 2;
        const endX = endRect.left + endRect.width / 2;
        const endY = endRect.top + endRect.height / 2;

        setPositions({ startX, startY, endX, endY });
      } catch (error) {
        console.error('[Pot Distribution] ❌ Error calculating positions (attempt', attempts, '):', error);
        if (attempts < maxAttempts) {
          setTimeout(tryCalculatePositions, 50);
        }
      }
    };

    const timer = setTimeout(tryCalculatePositions, 50);
    return () => clearTimeout(timer);
  }, [playerCardRef, potRef, amount, playerId]);

  useEffect(() => {
    if (!animationRef.current || !positions) {
      return;
    }

    const element = animationRef.current;
    const deltaX = positions.endX - positions.startX;
    const deltaY = positions.endY - positions.startY;
    let startTime: number | null = null;
    const duration = 2000; // 2 seconds

    element.style.display = 'block';
    element.style.visibility = 'visible';
    element.style.opacity = '1';
    element.style.zIndex = '99999';
    element.style.pointerEvents = 'none';
    element.style.position = 'fixed';

    const animate = (currentTime: number) => {
      if (startTime === null) {
        startTime = currentTime;
      }
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentX = positions.startX + deltaX * easeOut;
      const currentY = positions.startY + deltaY * easeOut - (80 * Math.sin(progress * Math.PI));
      const scale = 1 + (0.3 * Math.sin(progress * Math.PI));
      const opacity = Math.max(0, 1 - progress * 0.7);

      element.style.left = `${currentX}px`;
      element.style.top = `${currentY}px`;
      element.style.transform = `translate(-50%, -50%) scale(${scale})`;
      element.style.opacity = `${opacity}`;

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [positions, playerId, amount]);

  if (!positions) {
    return null;
  }

  return (
    <div
      ref={animationRef}
      className="fixed pointer-events-none"
      style={{
        left: `${positions.startX}px`,
        top: `${positions.startY}px`,
        transform: 'translate(-50%, -50%)',
        zIndex: 99999,
        display: 'block',
        visibility: 'visible',
        opacity: 1,
      }}
    >
      <div
        className="bg-gradient-to-r from-green-500 to-green-700 text-white font-bold text-xl px-4 py-2 rounded-full shadow-2xl border-2 border-white flex items-center gap-2 whitespace-nowrap"
        style={{
          filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))',
        }}
      >
        <span className="text-2xl">💰</span>
        <span>+${amount.toLocaleString('en-US')}</span>
      </div>
    </div>
  );
}

// Component for flying bet animation
function BetFlyAnimation({
  playerId,
  amount,
  playerCardRef,
  potRef
}: {
  playerId: string;
  amount: number;
  playerCardRef: HTMLDivElement | undefined;
  potRef: HTMLDivElement | null;
}) {
  const [positions, setPositions] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const animationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playerCardRef || !potRef) {
      return;
    }

    // Retry mechanism - try multiple times if refs aren't ready
    let attempts = 0;
    const maxAttempts = 10;

    const tryCalculatePositions = () => {
      attempts++;
      try {
        if (!playerCardRef || !potRef) {
          if (attempts < maxAttempts) {
            setTimeout(tryCalculatePositions, 50);
          }
          return;
        }

        const startRect = playerCardRef.getBoundingClientRect();
        const endRect = potRef.getBoundingClientRect();

        // Check if elements are actually visible
        if (startRect.width === 0 || startRect.height === 0 || endRect.width === 0 || endRect.height === 0) {
          if (attempts < maxAttempts) {
            setTimeout(tryCalculatePositions, 50);
          }
          return;
        }

        const startX = startRect.left + startRect.width / 2;
        const startY = startRect.top + startRect.height / 2;
        const endX = endRect.left + endRect.width / 2;
        const endY = endRect.top + endRect.height / 2;

        setPositions({ startX, startY, endX, endY });
      } catch (error) {
        console.error('[Bet Animation] ❌ Error calculating positions (attempt', attempts, '):', error);
        if (attempts < maxAttempts) {
          setTimeout(tryCalculatePositions, 50);
        }
      }
    };

    // Start trying after a small initial delay
    const timer = setTimeout(tryCalculatePositions, 50);

    return () => clearTimeout(timer);
  }, [playerCardRef, potRef, amount, playerId]);

  // Use requestAnimationFrame to ensure smooth animation
  // This hook must always run (before conditional return) to follow Rules of Hooks
  useEffect(() => {
    if (!animationRef.current || !positions) {
      return;
    }


    const element = animationRef.current;
    const deltaX = positions.endX - positions.startX;
    const deltaY = positions.endY - positions.startY;
    let startTime: number | null = null;
    const duration = 1500; // 1.5 seconds

    // Make sure element is visible and on top
    element.style.display = 'block';
    element.style.visibility = 'visible';
    element.style.opacity = '1';
    element.style.zIndex = '99999';
    element.style.pointerEvents = 'none';
    element.style.position = 'fixed';

    const animate = (currentTime: number) => {
      if (startTime === null) {
        startTime = currentTime;
      }
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3);

      // Calculate current position with arc (slight upward curve)
      const currentX = positions.startX + deltaX * easeOut;
      const currentY = positions.startY + deltaY * easeOut - (50 * Math.sin(progress * Math.PI)); // Arc effect
      const scale = 1 + (0.2 * Math.sin(progress * Math.PI)); // Scale up then down
      const opacity = Math.max(0, 1 - progress * 0.8); // Fade out but keep some opacity longer

      element.style.left = `${currentX}px`;
      element.style.top = `${currentY}px`;
      element.style.transform = `translate(-50%, -50%) scale(${scale})`;
      element.style.opacity = `${opacity}`;

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [positions, playerId, amount]);

  // Conditional return must come AFTER all hooks
  if (!positions) {
    return null;
  }

  return (
    <div
      ref={animationRef}
      className="fixed pointer-events-none"
      style={{
        left: `${positions.startX}px`,
        top: `${positions.startY}px`,
        transform: 'translate(-50%, -50%)',
        zIndex: 99999,
        display: 'block',
        visibility: 'visible',
        opacity: 1,
      }}
    >
      <div
        className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-white font-bold text-xl px-4 py-2 rounded-full shadow-2xl border-2 border-white flex items-center gap-2 whitespace-nowrap"
        style={{
          filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))',
        }}
      >
        <span className="text-2xl">💰</span>
        <span>${amount.toLocaleString('en-US')}</span>
      </div>
    </div>
  );
}

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

// Color mapping for hand ranks (for comparison feature)
const HAND_RANK_COLORS: Record<number, string> = {
  1: 'from-yellow-400 to-yellow-600', // Royal Flush - Gold
  2: 'from-purple-500 to-purple-700', // Straight Flush - Purple
  3: 'from-red-500 to-red-700', // Four of a Kind - Red
  4: 'from-orange-500 to-orange-700', // Full House - Orange
  5: 'from-blue-500 to-blue-700', // Flush - Blue
  6: 'from-green-500 to-green-700', // Straight - Green
  7: 'from-teal-500 to-teal-700', // Three of a Kind - Teal
  8: 'from-pink-500 to-pink-700', // Two Pair - Pink
  9: 'from-indigo-500 to-indigo-700', // One Pair - Indigo
  10: 'from-gray-400 to-gray-600', // High Card - Gray
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
  isChatHidden?: boolean;
  gameTime?: number;
  gameId?: string;
}

export default function GameBoard({ gameState, stats, rankings, isRunning, chatMessages = [], isChatHidden = false, gameTime = 0, gameId }: GameBoardProps) {
  const router = useRouter();
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  // Track previous stats to detect wins/losses
  const prevStatsRef = useRef<Map<string, { handsWon: number; handsPlayed: number; totalChips: number }>>(new Map());
  const [winLossAnimations, setWinLossAnimations] = useState<Map<string, { type: 'win' | 'loss'; profit: number } | null>>(new Map());

  // Track previous chip values for animation
  const prevChipsRef = useRef<Map<string, number>>(new Map());
  const [chipAnimations, setChipAnimations] = useState<Map<string, { from: number; to: number; isAnimating: boolean }>>(new Map());
  // Track displayed chip values (may be delayed during win/loss animations)
  const [displayedChips, setDisplayedChips] = useState<Map<string, number>>(new Map());

  // Track bet animations - flying chips from player to pot
  const prevBetRef = useRef<Map<string, number>>(new Map());
  const prevPotRef = useRef<number>(0);
  const prevChipsForPotDistRef = useRef<Map<string, number>>(new Map());
  const [betAnimations, setBetAnimations] = useState<Map<string, { amount: number; isAnimating: boolean }>>(new Map());
  const [potDistributionAnimations, setPotDistributionAnimations] = useState<Map<string, { amount: number; isAnimating: boolean }>>(new Map());
  const playerCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const potRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!stats || stats.length === 0) {
      return;
    }

    const newAnimations = new Map<string, { type: 'win' | 'loss'; profit: number }>();

    stats.forEach(stat => {
      const prevStat = prevStatsRef.current.get(stat.modelId);

      if (prevStat) {
        const profitChange = stat.totalChips - prevStat.totalChips;
        const handsPlayedChanged = stat.handsPlayed > prevStat.handsPlayed;
        const handsWonChanged = stat.handsWon > prevStat.handsWon;

        // Only trigger animations when a hand has completed (handsPlayed increased)
        if (handsPlayedChanged) {
          // Win: handsWon increased (player won the hand)
          if (handsWonChanged) {
            const profitAmount = Math.max(profitChange, 100); // At least 100 for visibility
            newAnimations.set(stat.modelId, { type: 'win', profit: profitAmount });
            // Also set by player name as backup
            const player = gameState?.players?.find(p => p.name === stat.modelName);
            if (player) {
              newAnimations.set(player.id, { type: 'win', profit: profitAmount });
            }
          }
          // Loss: handsPlayed increased but handsWon didn't (player lost the hand)
          else {
            const profitAmount = Math.max(Math.abs(profitChange), 100); // At least 100 for visibility
            newAnimations.set(stat.modelId, { type: 'loss', profit: profitAmount });
            // Also set by player name as backup
            const player = gameState?.players?.find(p => p.name === stat.modelName);
            if (player) {
              newAnimations.set(player.id, { type: 'loss', profit: profitAmount });
            }
          }
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
      setWinLossAnimations(prev => {
        const updated = new Map(prev);
        newAnimations.forEach((value, key) => {
          updated.set(key, value);
        });
        return updated;
      });

      // Clear animations after 5 seconds
      setTimeout(() => {
        setWinLossAnimations(prev => {
          const updated = new Map(prev);
          newAnimations.forEach((_, key) => {
            updated.delete(key);
          });
          return updated;
        });
      }, 5000);
    }
  }, [stats, gameState]);

  // Track previous phase to detect when hand finishes
  const prevPhaseRef = useRef<string>('');

  // Track pot distribution FIRST (before bet tracking updates prevPotRef)
  // This must run before bet tracking to detect pot decreases
  useEffect(() => {
    if (!gameState || !gameState.players) return;

    const currentPot = gameState.pot || 0;
    const prevPot = prevPotRef.current;
    const potDecrease = prevPot - currentPot;
    const currentPhase = gameState.phase || '';
    const prevPhase = prevPhaseRef.current;
    const phaseChangedToFinished = prevPhase !== 'finished' && currentPhase === 'finished';


    // If pot decreased OR phase changed to 'finished', check for winners
    // Phase changes to 'finished' after pot distribution, so this is a reliable trigger
    if (potDecrease > 0 || phaseChangedToFinished) {
      if (potDecrease > 0) {
      }
      if (phaseChangedToFinished) {
      }

      // Find players whose chips increased (winners)
      gameState.players.forEach(player => {
        const prevChips = prevChipsForPotDistRef.current.get(player.id);
        const currentChips = player.chips || 0;

        // If we don't have previous chips, use current chips as baseline
        const baselineChips = prevChips !== undefined ? prevChips : currentChips;
        const chipIncrease = currentChips - baselineChips;


        // If chips increased and (pot decreased OR phase finished), this player won
        if (chipIncrease > 0 && (potDecrease > 0 || phaseChangedToFinished)) {
          // Calculate the actual winnings (use pot decrease if available, otherwise chip increase)
          const winnings = potDecrease > 0 ? Math.min(chipIncrease, potDecrease) : chipIncrease;

          setPotDistributionAnimations(prev => {
            const updated = new Map(prev);
            updated.set(player.id, { amount: winnings, isAnimating: true });
            return updated;
          });

          // Clear animation after it completes (2.5 seconds)
          setTimeout(() => {
            setPotDistributionAnimations(prev => {
              const updated = new Map(prev);
              updated.delete(player.id);
              return updated;
            });
          }, 2500);
        }

        // Update previous chips
        prevChipsForPotDistRef.current.set(player.id, currentChips);
      });
    } else {
      // Pot didn't decrease, but still update previous chips to track changes
      gameState.players.forEach(player => {
        const currentChips = player.chips || 0;
        prevChipsForPotDistRef.current.set(player.id, currentChips);
      });
    }

    // Update previous phase
    prevPhaseRef.current = currentPhase;
  }, [gameState]);

  // Track bet changes and create flying chip animations
  useEffect(() => {
    if (!gameState || !gameState.players) return;

    // Track pot changes - when pot increases, it means someone bet
    const currentPot = gameState.pot || 0;
    const prevPot = prevPotRef.current;
    const potIncrease = currentPot - prevPot;


    // If pot increased, find which player(s) contributed
    if (potIncrease > 0) {
      gameState.players.forEach(player => {
        const prevTotalBet = prevBetRef.current.get(player.id) || 0;
        const currentTotalBet = player.totalBetThisRound || 0;


        // If player's total bet this round increased, create animation
        if (currentTotalBet > prevTotalBet) {
          const betIncrease = currentTotalBet - prevTotalBet;
          if (betIncrease > 0) {
            setBetAnimations(prev => {
              const updated = new Map(prev);
              updated.set(player.id, { amount: betIncrease, isAnimating: true });
              return updated;
            });

            // Clear animation after it completes (2.5 seconds - longer to ensure animation finishes)
            setTimeout(() => {
              setBetAnimations(prev => {
                const updated = new Map(prev);
                updated.delete(player.id);
                return updated;
              });
            }, 2500);
          }
        }

        // Update previous total bet
        prevBetRef.current.set(player.id, currentTotalBet);
      });
    } else {
      // Pot didn't increase, but still update previous bets to track changes
      gameState.players.forEach(player => {
        const currentTotalBet = player.totalBetThisRound || 0;
        prevBetRef.current.set(player.id, currentTotalBet);
      });
    }

    // Update previous pot AFTER checking for pot distribution
    prevPotRef.current = currentPot;
  }, [gameState]);

  // Track chip changes for animation
  // Delay chip updates if there's an active win/loss animation
  useEffect(() => {
    if (!gameState || !gameState.players) return;

    const newChipAnimations = new Map<string, { from: number; to: number; isAnimating: boolean }>();

    gameState.players.forEach(player => {
      const prevChips = prevChipsRef.current.get(player.id);
      const currentChips = player.chips;

      // Find the player's model stat to check for win/loss animation
      const modelStat = rankings.find(r => r.modelName === player.name);
      const hasWinLossAnimation = modelStat && winLossAnimations.has(modelStat.modelId);

      if (prevChips !== undefined && prevChips !== currentChips) {
        if (hasWinLossAnimation) {
          // Delay chip update until win/loss animation completes (4 seconds)
          // Keep showing old chips during win/loss animation
          setDisplayedChips(prev => {
            const updated = new Map(prev);
            updated.set(player.id, prevChips); // Show old value
            return updated;
          });

          // Schedule chip animation to start after win/loss animation
          setTimeout(() => {
            setChipAnimations(prev => {
              const updated = new Map(prev);
              updated.set(player.id, {
                from: prevChips,
                to: currentChips,
                isAnimating: true,
              });
              return updated;
            });

            // Update displayed chips to trigger animation
            setDisplayedChips(prev => {
              const updated = new Map(prev);
              updated.set(player.id, currentChips);
              return updated;
            });

            // Clear animation after it completes
            setTimeout(() => {
              setChipAnimations(prev => {
                const updated = new Map(prev);
                const anim = updated.get(player.id);
                if (anim) {
                  updated.set(player.id, { ...anim, isAnimating: false });
                }
                return updated;
              });
            }, 1500); // Chip animation duration

            // Update previous chips after animation starts
            prevChipsRef.current.set(player.id, currentChips);
          }, 4000); // Wait for win/loss animation to complete
        } else {
          // No win/loss animation - update chips immediately
          newChipAnimations.set(player.id, {
            from: prevChips,
            to: currentChips,
            isAnimating: true,
          });

          // Update displayed chips immediately
          setDisplayedChips(prev => {
            const updated = new Map(prev);
            updated.set(player.id, currentChips);
            return updated;
          });

          // Clear animation after it completes
          setTimeout(() => {
            setChipAnimations(prev => {
              const updated = new Map(prev);
              const anim = updated.get(player.id);
              if (anim) {
                updated.set(player.id, { ...anim, isAnimating: false });
              }
              return updated;
            });
          }, 1500); // Animation duration

          // Update previous chips
          prevChipsRef.current.set(player.id, currentChips);
        }
      } else if (prevChips === undefined) {
        // First time seeing this player - just set the value
        prevChipsRef.current.set(player.id, currentChips);
        setDisplayedChips(prev => {
          const updated = new Map(prev);
          updated.set(player.id, currentChips);
          return updated;
        });
      }
    });

    if (newChipAnimations.size > 0) {
      setChipAnimations(prev => {
        const updated = new Map(prev);
        newChipAnimations.forEach((anim, playerId) => {
          updated.set(playerId, anim);
        });
        return updated;
      });
    }
  }, [gameState, rankings, winLossAnimations]);

  // Show summary modal when game finishes
  useEffect(() => {
    if (!isRunning && gameState && rankings.length > 0) {
      // Small delay to ensure all final updates are complete
      const timer = setTimeout(() => {
        setShowSummaryModal(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isRunning, gameState, rankings]);

  if (!gameState || rankings.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-lg">Loading...</p>
      </div>
    );
  }

  const activePlayers = gameState.players.filter(p => p.isActive && p.chips > 0);
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  // Find the player with the most chips
  const maxChips = Math.max(...gameState.players.map(p => p.chips || 0));
  const playerWithMostChips = gameState.players.find(p => p.chips === maxChips);

  // Calculate hand ranks for all players at showdown for color matching
  const handRankMap = new Map<string, number>();
  if (gameState.phase === 'showdown' && gameState.communityCards.length >= 3) {
    gameState.players.forEach(player => {
      if (player.hand.length >= 2) {
        const handInfo = getHandInfo(player.hand, gameState.communityCards);
        if (handInfo) {
          handRankMap.set(player.id, handInfo.rank);
        }
      }
    });
  }

  // Group players by hand rank for color matching
  const rankGroups = new Map<number, string[]>();
  handRankMap.forEach((rank, playerId) => {
    if (!rankGroups.has(rank)) {
      rankGroups.set(rank, []);
    }
    rankGroups.get(rank)!.push(playerId);
  });

  // Calculate card matches (same rank or suit) for color matching
  // Match colors for cards that are part of the same match group
  const cardMatchColors = new Map<string, string>();
  const matchGroups: Array<{ cards: Array<{ card: any; source: 'community' | string }> }> = [];

  if (gameState.communityCards.length >= 3) {
    // Find all matching cards (same rank or suit)
    const allCards: Array<{ card: any; source: 'community' | string }> = [
      ...gameState.communityCards.map(c => ({ card: c, source: 'community' as const })),
      ...gameState.players.flatMap(p =>
        p.hand.map(c => ({ card: c, source: p.id }))
      )
    ];

    // Group cards by rank
    const rankGroups: Map<string, Array<{ card: any; source: 'community' | string }>> = new Map();
    allCards.forEach(({ card, source }) => {
      if (!rankGroups.has(card.rank)) {
        rankGroups.set(card.rank, []);
      }
      rankGroups.get(card.rank)!.push({ card, source });
    });

    // Group cards by suit
    const suitGroups: Map<string, Array<{ card: any; source: 'community' | string }>> = new Map();
    allCards.forEach(({ card, source }) => {
      if (!suitGroups.has(card.suit)) {
        suitGroups.set(card.suit, []);
      }
      suitGroups.get(card.suit)!.push({ card, source });
    });

    // Generate colors for match groups
    const matchColors = [
      'ring-4 ring-yellow-400 border-yellow-500',
      'ring-4 ring-blue-400 border-blue-500',
      'ring-4 ring-green-400 border-green-500',
      'ring-4 ring-purple-400 border-purple-500',
      'ring-4 ring-pink-400 border-pink-500',
      'ring-4 ring-orange-400 border-orange-500',
      'ring-4 ring-red-400 border-red-500',
      'ring-4 ring-indigo-400 border-indigo-500',
    ];

    let colorIndex = 0;

    // Assign colors to rank matches (only if 2+ cards match)
    rankGroups.forEach((cards) => {
      if (cards.length >= 2) {
        const color = matchColors[colorIndex % matchColors.length];
        cards.forEach(({ card, source }) => {
          const cardKey = `${card.rank}-${card.suit}-${source}`;
          cardMatchColors.set(cardKey, color);
        });
        colorIndex++;
      }
    });

    // Assign colors to suit matches (only if 3+ cards match, for flushes)
    suitGroups.forEach((cards) => {
      if (cards.length >= 3) {
        const color = matchColors[colorIndex % matchColors.length];
        cards.forEach(({ card, source }) => {
          const cardKey = `${card.rank}-${card.suit}-${source}`;
          // Only set if not already set by rank match
          if (!cardMatchColors.has(cardKey)) {
            cardMatchColors.set(cardKey, color);
          }
        });
        colorIndex++;
      }
    });
  }

  // Helper function to calculate player position around the table
  const getPlayerPosition = (index: number, total: number) => {
    const angle = ((360 / total) * index - 90) * (Math.PI / 180); // Start from top
    const radius = 40; // Percentage from center
    return {
      left: `${50 + Math.cos(angle) * radius}%`,
      top: `${50 + Math.sin(angle) * radius}%`,
    };
  };

  return (
    <div className="space-y-6">
      {/* Circular Poker Table */}
      <div className="relative w-full" style={{ paddingBottom: '75%', minHeight: '600px' }}>
        <div
          className="absolute inset-0 rounded-[50%] border-8 border-amber-800 shadow-2xl overflow-visible"
          style={{
            background: 'radial-gradient(ellipse at center, #1a5f3c 0%, #0d3b24 70%, #092a1a 100%)',
            boxShadow: 'inset 0 0 100px rgba(0,0,0,0.5), 0 10px 40px rgba(0,0,0,0.5)',
          }}
        >
          {/* Table rim/edge effect */}
          <div className="absolute inset-2 rounded-[50%] border-4 border-amber-900/30" />

          {/* Center Area - Community Cards & Pot */}
          <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
            <div className="flex flex-col items-center gap-4">
              {/* Phase & Round Info */}
              <div className="flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full px-4 py-1.5">
                <span className="text-sm font-bold text-white uppercase tracking-wide">
                  {gameState.phase.replace('-', ' ')}
                </span>
                <span className="text-white/50">•</span>
                <span className="text-sm font-bold text-yellow-300">#{gameState.round}</span>
                {gameTime > 0 && (
                  <>
                    <span className="text-white/50">•</span>
                    <span className="text-xs font-mono text-white/80">{gameTime.toFixed(1)}s</span>
                  </>
                )}
              </div>

              {/* Community Cards */}
              <div className="flex gap-2 justify-center items-center">
                {gameState.communityCards.length > 0 ? (
                  gameState.communityCards.map((card, index) => {
                    const cardKey = `${card.rank}-${card.suit}-community`;
                    const matchColor = cardMatchColors.get(cardKey);
                    return (
                      <CardComponent
                        key={index}
                        card={card}
                        size="large"
                        index={index}
                        isDealing={isRunning}
                        matchColor={matchColor}
                      />
                    );
                  })
                ) : (
                  <div className="flex gap-2 justify-center">
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

              {/* Pot */}
              <Card ref={potRef} className="px-5 py-3 bg-gradient-to-br from-green-600 to-green-800 border-2 border-green-400 shadow-lg">
                <div className="text-center">
                  <div className="text-xs font-semibold text-green-200 uppercase tracking-wider">Pot</div>
                  <div className="text-2xl font-bold text-white">${gameState.pot}</div>
                </div>
              </Card>
            </div>
          </div>

          {/* Flying Bet Animations */}
          {Array.from(betAnimations.entries()).map(([playerId, anim]) => {
            if (!anim.isAnimating) return null;
            const player = gameState.players.find(p => p.id === playerId);
            if (!player) return null;
            const playerCard = playerCardRefs.current.get(playerId);
            const pot = potRef.current;
            if (!playerCard || !pot) return null;
            return (
              <BetFlyAnimation
                key={`bet-fly-${playerId}-${anim.amount}`}
                playerId={playerId}
                amount={anim.amount}
                playerCardRef={playerCard}
                potRef={pot}
              />
            );
          })}

          {/* Pot Distribution Animations */}
          {Array.from(potDistributionAnimations.entries()).map(([playerId, anim]) => {
            if (!anim.isAnimating) return null;
            const player = gameState.players.find(p => p.id === playerId);
            if (!player) return null;
            const playerCard = playerCardRefs.current.get(playerId);
            const pot = potRef.current;
            if (!playerCard || !pot) return null;
            return (
              <PotDistributionAnimation
                key={`pot-dist-${playerId}-${anim.amount}`}
                playerId={playerId}
                amount={anim.amount}
                playerCardRef={playerCard}
                potRef={pot}
              />
            );
          })}

          {/* Players positioned around the table */}
          {rankings.map((modelStat, index) => {
            const player = gameState.players.find(p => p.name === modelStat.modelName);
            if (!player) return null;
            const position = getPlayerPosition(index, rankings.length);

            const isCurrentPlayer = player.id === currentPlayer?.id;
            const rank = index + 1;

            // Try multiple ways to find animation: by modelId, player.id, or modelName
            let animationData = winLossAnimations.get(modelStat.modelId) ||
              winLossAnimations.get(player.id) ||
              winLossAnimations.get(modelStat.modelName);

            // If still not found, try matching by modelName in stats
            if (!animationData) {
              const matchingStat = stats.find(s => s.modelName === modelStat.modelName);
              if (matchingStat) {
                animationData = winLossAnimations.get(matchingStat.modelId);
              }
            }

            // Also try all keys in winLossAnimations to see if any match
            if (!animationData && winLossAnimations.size > 0) {
              winLossAnimations.forEach((value, key) => {
                if (!animationData && (key === modelStat.modelId ||
                  key === player.id ||
                  key === modelStat.modelName ||
                  key === player.name)) {
                  animationData = value;
                }
              });
            }

            const animationState = animationData?.type || null;
            const profitAmount = animationData?.profit || 0;


            // Get player's hand rank for color matching
            const playerHandRank = handRankMap.get(player.id);
            const sameRankPlayers = playerHandRank ? rankGroups.get(playerHandRank) || [] : [];
            const hasHandMatch = sameRankPlayers.length > 1;

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

            // Hide messenger when current player is still thinking
            const isThinking = isCurrentPlayer && gameState.phase !== 'finished' && isRunning;
            const shouldShowMessenger = latestMessage && !isThinking;

            return (
              <div
                key={modelStat.modelId}
                className="absolute w-64 transform -translate-x-1/2 -translate-y-1/2"
                style={{ left: position.left, top: position.top, zIndex: animationState ? 20 : 5 }}
                ref={(el) => {
                  if (el && player) {
                    playerCardRefs.current.set(player.id, el);
                  }
                }}
              >
                <Card
                  className={cn(
                    'p-6 bg-gradient-to-br from-white to-green-50/30 border-2 transition-all rounded-xl shadow-md hover:shadow-lg relative',
                    // Remove overflow-hidden when animation is active to allow animation to show
                    !animationState && 'overflow-hidden',
                    isCurrentPlayer
                      ? 'border-green-500 shadow-xl ring-4 ring-green-200/50 scale-105'
                      : 'border-green-200 hover:border-green-300',
                    playerWithMostChips && player.id === playerWithMostChips.id && 'ring-2 ring-yellow-400 border-yellow-300',
                    animationState === 'win' && 'animate-win-celebration ring-4 ring-green-400',
                    animationState === 'loss' && 'animate-loss-shake ring-4 ring-red-400',
                    player.chips <= 0 && 'opacity-40 transition-opacity duration-500'
                  )}
                  style={{
                    // Ensure overflow is visible when animation is active
                    overflow: animationState ? 'visible' : undefined,
                    position: 'relative',
                    zIndex: animationState ? 10 : undefined,
                  }}
                >
                  {/* Messenger Balloon - Inside Card */}
                  {shouldShowMessenger && (
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
                    <div
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        overflow: 'visible',
                        zIndex: 10000,
                        pointerEvents: 'none',
                        backgroundColor: 'rgba(0, 255, 0, 0.2)' // Temporary: green background to see if overlay renders
                      }}
                    >
                      {(() => {
                        return null;
                      })()}
                      {/* Celebration Emojis */}
                      <div className="absolute top-8 left-1/4 text-5xl animate-float-up rotate-12">🎊</div>
                      <div className="absolute top-6 right-1/4 text-4xl animate-float-up-delayed -rotate-12">✨</div>
                      <div className="absolute bottom-8 left-1/3 text-4xl animate-float-up-delayed-2 rotate-6">🏆</div>
                      <div className="absolute bottom-6 right-1/3 text-5xl animate-float-up-delayed-3 -rotate-6">⭐</div>

                      {/* Main Celebration Emoji */}
                      <div className="text-7xl animate-bounce-in-slow relative z-10">
                        🎉
                      </div>

                      {/* Profit Amount - Enhanced with larger, more visible display */}
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 mt-24 animate-profit-pop-enhanced z-20">
                        <div className="relative">
                          {/* Glow effect */}
                          <div className="absolute inset-0 bg-green-400 rounded-full blur-2xl opacity-60 animate-pulse"></div>
                          {/* Main badge - larger and more prominent */}
                          <div className="relative bg-gradient-to-r from-green-500 via-green-600 to-green-500 text-white font-extrabold text-4xl px-10 py-6 rounded-full shadow-2xl border-4 border-white/90 backdrop-blur-sm animate-bounce">
                            <div className="flex items-center gap-4">
                              <span className="text-5xl animate-spin-slow">💰</span>
                              <span className="tracking-wide font-black">+${profitAmount.toLocaleString('en-US')}</span>
                              <span className="text-3xl animate-bounce">🎊</span>
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
                    <div
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        overflow: 'visible',
                        zIndex: 10000,
                        pointerEvents: 'none',
                        backgroundColor: 'rgba(255, 0, 0, 0.2)' // Temporary: red background to see if overlay renders
                      }}
                    >
                      {(() => {
                        return null;
                      })()}
                      {/* Loss Emojis */}
                      <div className="absolute top-8 left-1/4 text-4xl animate-float-down rotate-12">💔</div>
                      <div className="absolute top-6 right-1/4 text-5xl animate-float-down-delayed -rotate-12">😢</div>
                      <div className="absolute bottom-8 left-1/3 text-4xl animate-float-down-delayed-2 rotate-6">💸</div>
                      <div className="absolute bottom-6 right-1/3 text-4xl animate-float-down-delayed-3 -rotate-6">📉</div>

                      {/* Main Sad Emoji */}
                      <div className="text-7xl animate-bounce-in-slow relative z-10">
                        😔
                      </div>

                      {/* Loss Amount - Enhanced with larger, more visible display */}
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 mt-24 animate-profit-pop-enhanced z-20">
                        <div className="relative">
                          {/* Glow effect */}
                          <div className="absolute inset-0 bg-red-400 rounded-full blur-2xl opacity-60 animate-pulse"></div>
                          {/* Main badge - larger and more prominent */}
                          <div className="relative bg-gradient-to-r from-red-500 via-red-600 to-red-500 text-white font-extrabold text-4xl px-10 py-6 rounded-full shadow-2xl border-4 border-white/90 backdrop-blur-sm animate-bounce">
                            <div className="flex items-center gap-4">
                              <span className="text-5xl animate-shake">💸</span>
                              <span className="tracking-wide font-black">-${profitAmount.toLocaleString('en-US')}</span>
                              <span className="text-3xl">😢</span>
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
                        {playerWithMostChips && player.id === playerWithMostChips.id && (
                          <span className="text-lg">👑</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {isCurrentPlayer && gameState.phase !== 'finished' && isRunning && (
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
                      <div className="text-2xl font-bold text-gray-900">
                        <AnimatedChips
                          value={displayedChips.get(player.id) ?? player.chips}
                          isAnimating={chipAnimations.get(player.id)?.isAnimating || false}
                        />
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-white to-gray-50 rounded-lg p-3 border border-gray-200 shadow-sm">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Bet</div>
                      <div className="flex items-center gap-2">
                        {player.currentBet > 0 ? (
                          <>
                            <span className="text-2xl">💰</span>
                            <div className="text-xl font-bold text-gray-900">
                              ${player.currentBet.toLocaleString('en-US')}
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
                        {player.hand.map((card, cardIndex) => {
                          const cardKey = `${card.rank}-${card.suit}-${player.id}`;
                          const matchColor = cardMatchColors.get(cardKey);
                          // Hide cards if player folded, show if all-in or at showdown or is current player
                          const hasFolded = player.lastAction === 'fold';
                          const shouldReveal = !hasFolded && (
                            gameState.phase === 'showdown' ||
                            player.isAllIn ||
                            (isCurrentPlayer && gameState.phase !== 'finished')
                          );
                          return (
                            <CardComponent
                              key={cardIndex}
                              card={card}
                              isRevealed={shouldReveal}
                              index={cardIndex}
                              isDealing={isRunning}
                              matchColor={matchColor}
                            />
                          );
                        })}
                      </div>

                      {/* Hand Rank and Name with Color Matching */}
                      {gameState.communityCards.length >= 3 && !(player.lastAction === 'fold') && (gameState.phase === 'showdown' || player.isAllIn || (isCurrentPlayer && gameState.phase !== 'finished')) && (
                        (() => {
                          const handInfo = getHandInfo(player.hand, gameState.communityCards);
                          if (!handInfo) return null;

                          // Get color based on hand rank, with matching for same ranks
                          const colorClass = HAND_RANK_COLORS[handInfo.rank] || 'from-purple-500 to-purple-600';

                          return (
                            <div className="mt-4 flex items-center justify-center">
                              <div className={cn(
                                "bg-gradient-to-r text-white rounded-lg px-4 py-2 shadow-lg border-2",
                                colorClass,
                                hasHandMatch ? 'border-white ring-2 ring-white/50' : 'border-transparent'
                              )}>
                                <div className="flex items-center gap-2">
                                  <span className="text-lg font-bold">#{handInfo.rank}</span>
                                  <span className="text-sm font-semibold">{handInfo.name}</span>
                                  {hasHandMatch && (
                                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                                      {sameRankPlayers.length} tied
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })()
                      )}
                    </div>
                  )}

                  {/* Current Status - Enhanced */}
                  <div className="space-y-2">
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

      {/* Summary Modal - Show when game finishes */}
      {!isRunning && gameState && rankings.length > 0 && showSummaryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] p-4">
          <Card className="bg-gray-100 border-2 border-gray-300 shadow-2xl max-w-2xl w-full relative">
            {/* Close Button */}
            <button
              onClick={() => setShowSummaryModal(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center"
            >
              ×
            </button>

            <div className="p-8">
              {/* Winner Header - Find player with most chips */}
              {gameState && (() => {
                // Find the player with the most chips
                const playersWithChips = gameState.players.filter(p => p.chips > 0);
                if (playersWithChips.length === 0) return null;

                const sortedByChips = [...gameState.players].sort((a, b) => b.chips - a.chips);
                const winnerPlayer = sortedByChips[0];
                const winnerStats = rankings.find(r => r.modelName === winnerPlayer.name);

                return (
                  <>
                    <div className="text-center mb-8">
                      <div className="text-4xl font-bold text-gray-900 mb-2">
                        {winnerPlayer.name} becomes the winner! 🏆
                      </div>
                    </div>

                    {/* Winner Statistics */}
                    <div className="bg-white rounded-lg p-6 mb-6 border-2 border-yellow-400">
                      <div className="grid grid-cols-4 gap-4 text-center">
                        <div>
                          <div className="text-xs font-semibold text-gray-600 mb-1 uppercase">Total Chips</div>
                          <div className="text-2xl font-bold text-blue-600">
                            ${winnerPlayer.chips.toLocaleString('en-US')}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-gray-600 mb-1 uppercase">Cash</div>
                          <div className="text-2xl font-bold text-green-600">
                            ${winnerPlayer.chips.toLocaleString('en-US')}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-gray-600 mb-1 uppercase">Hands Won</div>
                          <div className="text-2xl font-bold text-blue-600">
                            {winnerStats?.handsWon || 0}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-gray-600 mb-1 uppercase">Hands Played</div>
                          <div className="text-2xl font-bold text-blue-600">
                            {winnerStats?.handsPlayed || 0}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Other Players - Show all players except the winner */}
              {gameState && (() => {
                // Find the winner (player with most chips)
                const sortedByChips = [...gameState.players].sort((a, b) => b.chips - a.chips);
                const winnerPlayer = sortedByChips[0];
                const otherPlayers = gameState.players.filter(p => p.id !== winnerPlayer.id);

                // Sort other players by chips (descending)
                const sortedOtherPlayers = otherPlayers.sort((a, b) => b.chips - a.chips);

                return (
                  <div className="mb-6">
                    <div className="text-lg font-bold text-gray-900 mb-4">Other Players</div>
                    <div className="space-y-3">
                      {sortedOtherPlayers.map((player, index) => {
                        const playerStats = rankings.find(r => r.modelName === player.name);
                        const playerChips = player.chips;
                        const isKnockedOut = playerChips <= 0;

                        return (
                          <div key={index} className="bg-white rounded-lg p-4 border border-gray-200 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="text-xl font-bold text-gray-700">{player.name}</div>
                            </div>
                            <div className="flex items-center gap-4">
                              {isKnockedOut ? (
                                <Badge className="bg-red-500 text-white">K.O.</Badge>
                              ) : (
                                <>
                                  <div className="text-lg font-bold text-blue-600">
                                    ${playerChips.toLocaleString('en-US')}
                                  </div>
                                  <div className="text-sm text-gray-600">
                                    ({playerStats?.handsWon || 0} wins)
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Action Buttons */}
              <div className="flex gap-4">
                <Button
                  onClick={() => {
                    if (!gameState) return;

                    // Find the winner (player with most chips)
                    const sortedByChips = [...gameState.players].sort((a, b) => b.chips - a.chips);
                    const winnerPlayer = sortedByChips[0];
                    const winnerStats = rankings.find(r => r.modelName === winnerPlayer.name);

                    // Get other players
                    const otherPlayers = gameState.players
                      .filter(p => p.id !== winnerPlayer.id)
                      .sort((a, b) => b.chips - a.chips);

                    // Share result functionality
                    const resultText = `🏆 ${winnerPlayer.name} won the poker game!\n\n` +
                      `Total Chips: $${winnerPlayer.chips.toLocaleString('en-US')}\n` +
                      `Hands Won: ${winnerStats?.handsWon || 0}/${winnerStats?.handsPlayed || 0}\n\n` +
                      otherPlayers.map(p => {
                        const pStats = rankings.find(r => r.modelName === p.name);
                        return `${p.name}: $${p.chips.toLocaleString('en-US')} (${pStats?.handsWon || 0} wins)`;
                      }).join('\n');

                    if (navigator.share) {
                      navigator.share({
                        title: 'Poker Game Results',
                        text: resultText,
                      });
                    } else {
                      navigator.clipboard.writeText(resultText);
                      alert('Results copied to clipboard!');
                    }
                  }}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
                >
                  Share Result
                </Button>
                <Button
                  onClick={() => {
                    router.push('/');
                  }}
                  className="flex-1 bg-gray-700 hover:bg-gray-800 text-white"
                >
                  Back to Lobby
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function CardComponent({
  card,
  isRevealed = true,
  size = 'normal',
  index = 0,
  isDealing = false,
  matchColor
}: {
  card: any | null;
  isRevealed?: boolean;
  size?: 'normal' | 'large';
  index?: number;
  isDealing?: boolean;
  matchColor?: string;
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
        'bg-white border-2 flex flex-col items-center justify-center shadow-xl font-bold transition-all hover:scale-105',
        matchColor ? matchColor : 'border-gray-400',
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


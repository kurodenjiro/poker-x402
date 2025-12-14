import { PokerGame } from './poker/game';
import { GameState } from './poker/types';
import { AIModel, AIDecision } from './ai/types';
import { ModelEvaluator } from './ai/evaluator';
import { evaluateHand } from './poker/cards';
import { chatHistory, ChatMessage } from './ai/chat-history';
import { getActionEmoji, generateStrategyChat, getCardDealEmoji } from './ai/strategy-chat';
import { getSimulatorStatus } from './ai/simulator';
import { query } from './db/postgres';
import { getPaymentService } from './payments/x402-agent-payments';

export interface GameConfig {
  modelNames: string[];
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  maxHands?: number;
}

export class GameManager {
  private game: PokerGame | null = null;
  private models: Map<string, AIModel> = new Map();
  private evaluator: ModelEvaluator = new ModelEvaluator();
  private config: GameConfig | null = null;
  private handsPlayed: number = 0;
  private isRunning: boolean = false;
  private gameId: string | null = null;

  constructor(models: AIModel[]) {
    models.forEach(model => {
      this.models.set(model.name, model);
    });
  }

  async startGame(config: GameConfig, gameId?: string): Promise<void> {
    // Prevent starting a new game if a different game is already running
    if (this.isRunning && this.gameId && this.gameId !== gameId) {
      console.log(`Game ${this.gameId} is already running. Cannot start game ${gameId}.`);
      return;
    }
    
    // If the same game is already running, don't restart it
    if (this.isRunning && this.gameId === gameId) {
      console.log(`Game ${gameId} is already running. Skipping restart.`);
      return;
    }
    
    this.config = config;
    this.gameId = gameId || null;
    this.handsPlayed = 0;
    this.evaluator.reset();
    chatHistory.clear(); // Clear chat history for new game

    // Initialize evaluator for each model
    config.modelNames.forEach((modelName, index) => {
      const playerId = `player-${index}`;
      this.evaluator.initializeModel(playerId, modelName, config.startingChips);
    });

    this.game = new PokerGame(
      config.modelNames,
      config.startingChips,
      config.smallBlind,
      config.bigBlind
    );

    // Register agent wallets for x402 payments
    // Use existing wallets that were funded during payment distribution
    const paymentService = getPaymentService();
    
    console.log(`[X402 Payment] Registering agent wallets (using existing funded wallets)...`);
    for (const modelName of config.modelNames) {
      // Don't generate new wallets - use existing ones from fund distribution
      const walletAddress = await paymentService.registerAgentWallet(modelName);
      console.log(`[X402 Payment] Using wallet for ${modelName}: ${walletAddress}`);
    }

    this.isRunning = true;
    
    // Save initial game state to database immediately so it can be fetched on refresh
    if (this.gameId) {
      await this.saveGameStateToDB().catch(console.error);
    }
    
    await this.playHand();
  }

  private async playHand(): Promise<void> {
    if (!this.game || !this.config) return;

    // Capture chip balances at the START of the hand (before any actions)
    // This will be used later to calculate chip changes after pot distribution
    const stateAtHandStart = this.game.getState();
    const chipsAtHandStart = new Map<string, number>();
    stateAtHandStart.players.forEach(p => {
      chipsAtHandStart.set(p.id, p.chips);
    });
    // Store in a way that evaluateHand can access it
    (this as any).chipsAtHandStart = chipsAtHandStart;
    console.log('🟣 [playHand] Captured chips at hand start:', Array.from(chipsAtHandStart.entries()).map(([id, chips]) => {
      const player = stateAtHandStart.players.find(p => p.id === id);
      return `${player?.name || id}: ${chips}`;
    }));

    // Check maxHands BEFORE starting a new hand
    if (this.config?.maxHands && this.handsPlayed >= this.config.maxHands) {
      console.log(`[playHand] 🛑 Max hands reached (${this.handsPlayed}/${this.config.maxHands}). Not starting new hand.`);
      this.isRunning = false;
      
      const state = this.game.getState();
      // Find player with most chips
      const playersWithChips = state.players.filter(p => p.chips > 0);
      if (playersWithChips.length > 0) {
        const sortedPlayers = [...state.players].sort((a, b) => b.chips - a.chips);
        const winner = sortedPlayers[0];
        
        if (state.pot > 0) {
          winner.chips += state.pot;
        }
        
        const winnerMessage: ChatMessage = {
          modelName: 'System',
          timestamp: Date.now(),
          phase: 'finished',
          action: 'win',
          decision: `🏆 ${winner.name} wins the game with ${winner.chips} chips after ${this.handsPlayed} hands!`,
          emoji: '🏆',
          role: 'system',
        };
        chatHistory.addMessage(winnerMessage);
      }
      
      if (this.gameId) {
        await this.saveGameStateToDB().catch(console.error);
        try {
          const { query } = await import('@/lib/db/postgres');
          await query(
            `UPDATE lobbies SET status = 'finished', updated_at = NOW() WHERE game_id = $1`,
            [this.gameId]
          );
          // Broadcast lobby update via Supabase Realtime (non-blocking)
          import('@/lib/supabase/server').then(({ supabase }) => {
            const channel = supabase.channel('lobby-updates');
            channel.send({
              type: 'broadcast',
              event: 'lobby-update',
              payload: {},
            }).catch((error) => {
              console.error('Error broadcasting lobby update:', error);
            });
          }).catch(() => {
            // Silently fail - lobby updates are not critical
          });
        } catch (error) {
          console.error('Error updating lobby status:', error);
        }
      }
      return;
    }

    const state = this.game.getState();
    
    // Check if game should end (when only one player has chips, they win)
    // This is the ONLY condition that should stop the game
    const playersWithChips = state.players.filter(p => p.chips > 0);
    
    // Debug logging
    console.log(`[playHand] Players with chips: ${playersWithChips.length}`, 
      playersWithChips.map(p => `${p.name}: ${p.chips} chips (active: ${p.isActive})`));
    
    if (playersWithChips.length <= 1) {
      console.log(`[playHand] Game ending: Only ${playersWithChips.length} player(s) with chips`);
      this.isRunning = false;
      
      // Ensure the winner gets any remaining pot
      if (playersWithChips.length === 1 && state.pot > 0) {
        console.log(`[playHand] Giving remaining pot (${state.pot}) to winner`);
        playersWithChips[0].chips += state.pot;
        // Update game state - need to access actual game state, not copy
        // The pot will be distributed in distributePot() or we handle it here
      }
      
      // Save final state and update lobby status
      if (this.gameId) {
        await this.saveGameStateToDB().catch(console.error);
        // Update lobby status to finished
        try {
          const { query } = await import('@/lib/db/postgres');
          await query(
            `UPDATE lobbies SET status = 'finished', updated_at = NOW() WHERE game_id = $1`,
            [this.gameId]
          );
          // Emit lobby update
          // Broadcast lobby update via Supabase Realtime (non-blocking)
          import('@/lib/supabase/server').then(({ supabase }) => {
            const channel = supabase.channel('lobby-updates');
            channel.send({
              type: 'broadcast',
              event: 'lobby-update',
              payload: {},
            }).catch((error) => {
              console.error('Error broadcasting lobby update:', error);
            });
          }).catch(() => {
            // Silently fail - lobby updates are not critical
          });
        } catch (error) {
          console.error('Error updating lobby status:', error);
        }
      }
      return;
    }
    
    // Reactivate players who have chips but are inactive (they folded in previous hand)
    // IMPORTANT: getState() returns a copy, so we need to modify the actual game state
    // The startHand() method in PokerGame will handle reactivation, but we need to ensure
    // the game state is correct before calling it
    
    // Verify we have at least 2 players with chips (regardless of active status)
    const playersWithChipsCount = state.players.filter(p => p.chips > 0).length;
    if (playersWithChipsCount < 2) {
      this.isRunning = false;
      if (this.gameId) {
        await this.saveGameStateToDB().catch(console.error);
        // Update lobby status to finished
        try {
          const { query } = await import('@/lib/db/postgres');
          await query(
            `UPDATE lobbies SET status = 'finished', updated_at = NOW() WHERE game_id = $1`,
            [this.gameId]
          );
          // Emit lobby update
          // Broadcast lobby update via Supabase Realtime (non-blocking)
          import('@/lib/supabase/server').then(({ supabase }) => {
            const channel = supabase.channel('lobby-updates');
            channel.send({
              type: 'broadcast',
              event: 'lobby-update',
              payload: {},
            }).catch((error) => {
              console.error('Error broadcasting lobby update:', error);
            });
          }).catch(() => {
            // Silently fail - lobby updates are not critical
          });
        } catch (error) {
          console.error('Error updating lobby status:', error);
        }
      }
      return;
    }

    // Add card dealing emoji messages
    const dealingMessage: ChatMessage = {
      modelName: 'System',
      timestamp: Date.now(),
      phase: 'pre-flop',
      action: 'deal',
      decision: 'Dealing hole cards...',
      emoji: '🎴',
      role: 'system',
    };
    chatHistory.addMessage(dealingMessage);

    this.game.startHand();
    await new Promise(resolve => setTimeout(resolve, 1500)); // Delay for card dealing animation
    await this.playRound();
  }

  private async playRound(): Promise<void> {
    if (!this.game || !this.config) return;

    let consecutiveFolds = 0;
    const maxIterations = 100; // Safety limit
    let iterations = 0;

    while (!this.game.isHandComplete() && iterations < maxIterations) {
      iterations++;
      const state = this.game.getState();
      const currentPlayer = this.game.getCurrentPlayer();

      if (!currentPlayer || !currentPlayer.isActive) {
        // Try to advance to next player if current player is invalid
        const activePlayers = state.players.filter(p => p.isActive && p.chips > 0);
        if (activePlayers.length === 0) {
          // No active players, hand is complete
          break;
        }
        // Try to find and set a valid current player
        const nextActivePlayer = activePlayers.find(p => p.id !== currentPlayer?.id) || activePlayers[0];
        const nextPlayerIndex = state.players.findIndex(p => p.id === nextActivePlayer.id);
        if (nextPlayerIndex !== -1 && this.game) {
          // Manually advance to next player
          (this.game as any).state.currentPlayerIndex = nextPlayerIndex;
          continue;
        }
        break;
      }

      const model = this.models.get(currentPlayer.name);
      if (!model) {
        break;
      }

      // Generate strategy chat from other models watching
      const otherPlayers = state.players.filter(p => p.isActive && p.id !== currentPlayer.id);
      otherPlayers.forEach(opponent => {
        const strategyMessage: ChatMessage = {
          modelName: opponent.name,
          timestamp: Date.now() - 100,
          phase: state.phase,
          action: 'observe',
          decision: 'Observing',
          emoji: '👁️',
          strategy: generateStrategyChat(opponent, currentPlayer, state, currentPlayer.lastAction || 'acting'),
          role: 'assistant',
        };
        chatHistory.addMessage(strategyMessage);
      });
      
      // Small delay before current player acts
      await new Promise(resolve => setTimeout(resolve, 800));

      // Get AI decision with prompt/response tracking
      const decisionResult = await this.getDecisionWithHistory(model, state, currentPlayer);
      let decision = decisionResult.decision;
      
      // Validate and fix decision before executing
      const canCheck = state.currentBet === currentPlayer.totalBetThisRound;
      const callAmount = state.currentBet - currentPlayer.totalBetThisRound;
      const activePlayers = state.players.filter(p => p.isActive && p.chips > 0);
      
      // If only 2 players remain, be more lenient with actions
      if (activePlayers.length === 2) {
        console.log(`[playRound] 🎯 Only 2 players remaining. Validating decision for ${currentPlayer.name}:`, {
          action: decision.action,
          amount: decision.amount,
          canCheck,
          callAmount,
          playerChips: currentPlayer.chips,
          currentBet: state.currentBet,
          playerTotalBet: currentPlayer.totalBetThisRound
        });
        
        // Fix invalid actions when only 2 players remain
        if (decision.action === 'check' && !canCheck) {
          // Can't check, must call or fold
          if (callAmount > 0 && callAmount <= currentPlayer.chips) {
            console.log(`[playRound] 🔧 Fixing invalid check: converting to call $${callAmount}`);
            decision = { action: 'call' };
          } else if (callAmount > currentPlayer.chips) {
            console.log(`[playRound] 🔧 Fixing invalid check: converting to all-in`);
            decision = { action: 'all-in' };
          } else {
            console.log(`[playRound] 🔧 Fixing invalid check: converting to fold`);
            decision = { action: 'fold' };
          }
        }
        
        // Validate raise amount
        if (decision.action === 'raise' && decision.amount) {
          const minRaise = state.currentBet - currentPlayer.totalBetThisRound + state.bigBlind;
          if (decision.amount < minRaise) {
            console.log(`[playRound] 🔧 Fixing invalid raise amount: ${decision.amount} -> ${minRaise}`);
            decision.amount = Math.min(minRaise, currentPlayer.chips);
          }
          if (decision.amount > currentPlayer.chips) {
            console.log(`[playRound] 🔧 Fixing raise amount exceeding chips: ${decision.amount} -> ${currentPlayer.chips}`);
            decision.amount = currentPlayer.chips;
            if (decision.amount === currentPlayer.chips && decision.amount > 0) {
              decision = { action: 'all-in' };
            }
          }
        }
      }
      
      // Add system message with prompt
      const systemMessage: ChatMessage = {
        modelName: currentPlayer.name,
        timestamp: Date.now(),
        phase: state.phase,
        action: 'system',
        decision: 'System Prompt',
        prompt: decisionResult.prompt,
        emoji: '🎯',
        role: 'system',
      };
      chatHistory.addMessage(systemMessage);
      
      // Record chat message with full conversation
      const chatMessage: ChatMessage = {
        modelName: currentPlayer.name,
        timestamp: Date.now() + 1,
        phase: state.phase,
        action: decision.action,
        decision: decision.action === 'raise' 
          ? `${decision.action.toUpperCase()} $${decision.amount || 0}`
          : decision.action.toUpperCase(),
        reasoning: this.generateReasoning(currentPlayer, state, decision),
        prompt: decisionResult.prompt,
        response: decisionResult.response,
        emoji: getActionEmoji(decision.action),
        role: 'assistant',
      };
      chatHistory.addMessage(chatMessage);
      
      // Record action
      this.evaluator.recordAction(currentPlayer.id, decision.action);

      // Execute action
      const stateBeforeAction = this.game.getState();
      const activePlayersBefore = stateBeforeAction.players.filter(p => p.isActive && p.chips > 0);
      console.log(`[playRound] Executing action for ${currentPlayer.name} (${currentPlayer.id}):`, {
        action: decision.action,
        amount: decision.amount,
        currentPlayerIndex: stateBeforeAction.currentPlayerIndex,
        expectedPlayerId: stateBeforeAction.players[stateBeforeAction.currentPlayerIndex]?.id,
        activePlayersCount: activePlayersBefore.length,
        activePlayers: activePlayersBefore.map(p => `${p.name} (${p.id})`),
        canCheck: stateBeforeAction.currentBet === currentPlayer.totalBetThisRound,
        currentBet: stateBeforeAction.currentBet,
        playerTotalBet: currentPlayer.totalBetThisRound,
        playerChips: currentPlayer.chips
      });
      
      const success = this.game.makeAction(
        currentPlayer.id,
        decision.action,
        decision.amount
      );

      if (!success) {
        console.error(`[playRound] ❌ Action failed for ${currentPlayer.name} (${currentPlayer.id}):`, {
          action: decision.action,
          amount: decision.amount,
          currentPlayerIndex: stateBeforeAction.currentPlayerIndex,
          expectedPlayerId: stateBeforeAction.players[stateBeforeAction.currentPlayerIndex]?.id,
          playerId: currentPlayer.id,
          isActive: currentPlayer.isActive,
          isAllIn: currentPlayer.isAllIn,
          chips: currentPlayer.chips,
          activePlayersCount: activePlayersBefore.length
        });
        
        // Try to understand why it failed before falling back to fold
        const stateAfterFailure = this.game.getState();
        const currentPlayerAfter = stateAfterFailure.players.find(p => p.id === currentPlayer.id);
        console.error(`[playRound] State after failure:`, {
          currentPlayerIndex: stateAfterFailure.currentPlayerIndex,
          expectedPlayerId: stateAfterFailure.players[stateAfterFailure.currentPlayerIndex]?.id,
          playerStillActive: currentPlayerAfter?.isActive,
          playerStillHasChips: (currentPlayerAfter?.chips || 0) > 0
        });
        
        // Only fold if the player is still active and has chips
        if (currentPlayerAfter && currentPlayerAfter.isActive && currentPlayerAfter.chips > 0) {
          console.log(`[playRound] ⚠️ Falling back to fold for ${currentPlayer.name}`);
          this.game.makeAction(currentPlayer.id, 'fold');
          this.evaluator.recordAction(currentPlayer.id, 'fold');
        } else {
          console.log(`[playRound] ⚠️ Cannot fold - player is no longer active or has no chips`);
        }
      } else {
        console.log(`[playRound] ✅ Action succeeded for ${currentPlayer.name}`);
      }
      
      // Save and emit game state after EVERY action for smooth real-time updates
      if (this.gameId) {
        this.saveGameStateToDB().catch(console.error);
      }
      
      // Check if game should end immediately after action (player won all chips)
      const stateAfterAction = this.game.getState();
      const playersWithChipsAfterAction = stateAfterAction.players.filter(p => p.chips > 0);
      if (playersWithChipsAfterAction.length <= 1) {
        this.isRunning = false;
        // Ensure winner gets any remaining pot
        if (playersWithChipsAfterAction.length === 1 && stateAfterAction.pot > 0) {
          playersWithChipsAfterAction[0].chips += stateAfterAction.pot;
        }
        // Save final state and update lobby status
        if (this.gameId) {
          await this.saveGameStateToDB().catch(console.error);
          // Update lobby status to finished
          try {
            const { query } = await import('@/lib/db/postgres');
            await query(
              `UPDATE lobbies SET status = 'finished', updated_at = NOW() WHERE game_id = $1`,
              [this.gameId]
            );
            // Broadcast lobby update via Supabase Realtime
            try {
              const { supabase } = await import('@/lib/supabase/server');
              const channel = supabase.channel('lobby-updates');
              await channel.send({
                type: 'broadcast',
                event: 'lobby-update',
                payload: {},
              });
            } catch (error) {
              console.error('Error broadcasting lobby update:', error);
            }
          } catch (error) {
            console.error('Error updating lobby status:', error);
          }
        }
        return; // Stop immediately, don't continue
      }
      
      // Add delay after action for better visualization
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (decision.action === 'fold') {
        consecutiveFolds++;
      } else {
        consecutiveFolds = 0;
      }

      // Check phase before action
      const phaseBeforeAction = this.game.getState().phase;
      
      // Delay for real-time visualization - slower for better UX
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check phase after action (makeAction may have advanced phase)
      const phaseAfterAction = this.game.getState().phase;
      
      // If phase changed, add emoji messages for card dealing
      if (phaseAfterAction !== phaseBeforeAction && phaseAfterAction !== 'showdown' && phaseAfterAction !== 'finished') {
        const phaseEmojis: Record<string, string> = {
          'flop': '🃏',
          'turn': '🂮',
          'river': '🂭',
        };
        
        const cardCount = phaseAfterAction === 'flop' ? 3 : 1;
        const dealMessage: ChatMessage = {
          modelName: 'System',
          timestamp: Date.now(),
          phase: phaseAfterAction,
          action: 'deal',
          decision: `Dealing ${cardCount} ${phaseAfterAction === 'flop' ? 'cards' : 'card'}...`,
          emoji: phaseEmojis[phaseAfterAction] || '🃏',
          role: 'system',
        };
        chatHistory.addMessage(dealMessage);
        
        // Generate strategy reactions from all models
        const state = this.game.getState();
        state.players.filter(p => p.isActive).forEach(player => {
          const strategyMessage: ChatMessage = {
            modelName: player.name,
            timestamp: Date.now() + 10,
            phase: phaseAfterAction,
            action: 'observe',
            decision: 'Analyzing new cards',
            emoji: '👁️',
            strategy: `"New ${phaseAfterAction} card${cardCount > 1 ? 's' : ''} revealed! Let me recalculate my odds..."`,
            role: 'assistant',
          };
          chatHistory.addMessage(strategyMessage);
        });
        
        // Save and emit game state after dealing cards
        if (this.gameId) {
          this.saveGameStateToDB().catch(console.error);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000)); // Delay for card dealing animation
      }
    }

    // Hand complete - evaluate results
    await this.evaluateHand();
    
    // Save game state to database after each hand
    if (this.gameId) {
      this.saveGameStateToDB().catch(console.error);
    }
    
    // Check if max hands reached - MUST check AFTER evaluateHand() increments handsPlayed
    console.log(`[playRound] 🔍 Checking maxHands: handsPlayed=${this.handsPlayed}, maxHands=${this.config?.maxHands}, condition=${this.handsPlayed >= (this.config?.maxHands || 0)}`);
    if (this.config?.maxHands && this.handsPlayed >= this.config.maxHands) {
      console.log(`[playRound] 🛑 MAX HANDS REACHED! Stopping game. handsPlayed=${this.handsPlayed}, maxHands=${this.config.maxHands}`);
      this.isRunning = false;
      
      const state = this.game.getState();
      // Find player with most chips
      const playersWithChips = state.players.filter(p => p.chips > 0);
      if (playersWithChips.length > 0) {
        // Sort by chips to find winner
        const sortedPlayers = [...state.players].sort((a, b) => b.chips - a.chips);
        const winner = sortedPlayers[0];
        
        // Distribute betting winnings on-chain
        if (this.gameId) {
          try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/betting/distribute`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                gameId: this.gameId,
                winnerName: winner.name,
              }),
            });
            if (response.ok) {
              const data = await response.json();
              console.log('✅ Betting winnings distributed:', data.transactions?.length || 0, 'transactions');
            }
          } catch (error) {
            console.error('Error distributing betting winnings (non-fatal):', error);
          }
        }
        
        // Ensure winner gets any remaining pot
        if (state.pot > 0) {
          winner.chips += state.pot;
        }
        
        // Add game end message
        const winnerMessage: ChatMessage = {
          modelName: 'System',
          timestamp: Date.now(),
          phase: 'finished',
          action: 'win',
          decision: `🏆 ${winner.name} wins the game with ${winner.chips} chips after ${this.handsPlayed} hands!`,
          emoji: '🏆',
          role: 'system',
        };
        chatHistory.addMessage(winnerMessage);
      }
      
      // Save final state and update lobby status
      if (this.gameId) {
        await this.saveGameStateToDB().catch(console.error);
        // Update lobby status to finished
        try {
          const { query } = await import('@/lib/db/postgres');
          await query(
            `UPDATE lobbies SET status = 'finished', updated_at = NOW() WHERE game_id = $1`,
            [this.gameId]
          );
          // Emit lobby update
          // Broadcast lobby update via Supabase Realtime (non-blocking)
          import('@/lib/supabase/server').then(({ supabase }) => {
            const channel = supabase.channel('lobby-updates');
            channel.send({
              type: 'broadcast',
              event: 'lobby-update',
              payload: {},
            }).catch((error) => {
              console.error('Error broadcasting lobby update:', error);
            });
          }).catch(() => {
            // Silently fail - lobby updates are not critical
          });
        } catch (error) {
          console.error('Error updating lobby status:', error);
        }
      }
      
      return; // STOP - max hands reached
    }
    
    // Check if game should end IMMEDIATELY (when only one player has chips, they win)
    // This check happens AFTER pot distribution, so if a player won all chips, stop now
    const state = this.game.getState();
    const playersWithChips = state.players.filter(p => p.chips > 0);
    if (playersWithChips.length <= 1) {
      this.isRunning = false;
      
      // Ensure winner gets any remaining pot
      if (playersWithChips.length === 1 && state.pot > 0) {
        playersWithChips[0].chips += state.pot;
      }
      
      // Save final state and update lobby status
      if (this.gameId) {
        await this.saveGameStateToDB().catch(console.error);
        // Update lobby status to finished
        try {
          const { query } = await import('@/lib/db/postgres');
          await query(
            `UPDATE lobbies SET status = 'finished', updated_at = NOW() WHERE game_id = $1`,
            [this.gameId]
          );
          // Emit lobby update
          // Broadcast lobby update via Supabase Realtime (non-blocking)
          import('@/lib/supabase/server').then(({ supabase }) => {
            const channel = supabase.channel('lobby-updates');
            channel.send({
              type: 'broadcast',
              event: 'lobby-update',
              payload: {},
            }).catch((error) => {
              console.error('Error broadcasting lobby update:', error);
            });
          }).catch(() => {
            // Silently fail - lobby updates are not critical
          });
        } catch (error) {
          console.error('Error updating lobby status:', error);
        }
      }
      
      // Add game end message
      if (playersWithChips.length === 1) {
        const winnerMessage: ChatMessage = {
          modelName: 'System',
          timestamp: Date.now(),
          phase: 'finished',
          action: 'win',
          decision: `🏆 ${playersWithChips[0].name} wins the game with all chips!`,
          emoji: '🏆',
          role: 'system',
        };
        chatHistory.addMessage(winnerMessage);
      }
      
      return; // STOP IMMEDIATELY - do not continue to next hand
    }
    
    // Continue to next hand only if game is still running AND multiple players have chips
    // Double-check maxHands before continuing
    if (this.isRunning) {
      // Check maxHands again before starting next hand (safety check)
      if (this.config?.maxHands && this.handsPlayed >= this.config.maxHands) {
        console.log(`[playRound] 🛑 Double-check: Max hands reached. Stopping before next hand.`);
        this.isRunning = false;
        return;
      }
      console.log(`[playRound] ✅ Continuing to next hand. handsPlayed=${this.handsPlayed}, maxHands=${this.config?.maxHands}`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      await this.playHand();
    } else {
      console.log(`[playRound] 🛑 Game stopped. Not continuing to next hand.`);
    }
  }

  private async evaluateHand(): Promise<void> {
    console.log('🔴🔴🔴 [evaluateHand] ========== EVALUATE HAND CALLED ==========');
    console.log('🔴 [evaluateHand] Game exists:', !!this.game);
    console.log('🔴 [evaluateHand] Config exists:', !!this.config);
    
    if (!this.game || !this.config) {
      console.log('🔴 [evaluateHand] ❌ EARLY RETURN - No game or config');
      return;
    }

    const state = this.game.getState();
    this.handsPlayed++;
    console.log(`🔴 [evaluateHand] Hands played incremented to: ${this.handsPlayed} (maxHands: ${this.config.maxHands})`);
    console.log(`🔴 [evaluateHand] Current phase: ${state.phase}`);
    console.log(`🔴 [evaluateHand] Pot: ${state.pot}`);
    console.log(`🔴 [evaluateHand] Players:`, state.players.map(p => `${p.name}: ${p.chips} chips, active: ${p.isActive}, bet: ${p.totalBetThisRound || 0}`));

    // Check if game should end (only one player with chips total, regardless of active status)
    const allPlayersWithChips = state.players.filter(p => p.chips > 0);
    if (allPlayersWithChips.length <= 1) {
      // Game ends - only one player has chips
      if (allPlayersWithChips.length === 1) {
        const winner = allPlayersWithChips[0];
        // Only evaluate hand if we have enough cards (at least 5 total)
        let handValue = 0;
        const totalCards = winner.hand.length + state.communityCards.length;
        if (totalCards >= 5) {
          try {
            handValue = evaluateHand([...winner.hand, ...state.communityCards]).value;
          } catch (error) {
            console.warn(`[evaluateHand] Could not evaluate winner hand: ${error}`);
            handValue = 0;
          }
        }
        this.evaluator.recordHandResult(winner.id, true, winner.chips, handValue);
        
        // Record losers
        state.players
          .filter(p => p.id !== winner.id)
          .forEach(loser => {
            this.evaluator.recordHandResult(loser.id, false, loser.chips);
          });
        
        // Process x402 payments even when game ends (final hand)
        try {
          const paymentService = getPaymentService();
          const potBeforeDistribution = state.pot;
          
          // Build winner/loser lists for final hand
          const winnerList = [{
            agentName: winner.name,
            chipsWon: potBeforeDistribution
          }];
          
          const loserList = state.players
            .filter(p => p.id !== winner.id && p.totalBetThisRound > 0)
            .map(p => ({
              agentName: p.name,
              chipsLost: p.totalBetThisRound || 0
            }));
          
          if (winnerList.length > 0 && loserList.length > 0 && potBeforeDistribution > 0) {
            console.log('[X402 Payment] 💰 Processing final hand payments:', {
              winners: winnerList,
              losers: loserList,
              pot: potBeforeDistribution,
              gameId: this.gameId,
              handNumber: this.handsPlayed
            });
            
            const payments = await paymentService.distributePot(winnerList, loserList, this.gameId || undefined, this.handsPlayed);
            console.log('[X402 Payment] ✅ Final hand payments processed:', payments.length, 'payments');
          }
        } catch (error) {
          console.error('[X402 Payment] ❌ Error processing final hand payments:', error);
        }
      }
      
      // Game ends immediately - one player has all chips
      this.isRunning = false;
      return;
    }

    // Determine winners and record stats for active players in this hand
    const activePlayers = state.players.filter(p => p.isActive && p.chips > 0);
    
    console.log(`🔴 [evaluateHand] Phase: ${state.phase}, Active players: ${activePlayers.length}`);
    console.log(`🔴 [evaluateHand] State pot: ${state.pot}`);
    console.log(`🔴 [evaluateHand] About to check phase...`);
    
    // ALWAYS process payments after hand finishes, regardless of phase
    // IMPORTANT: Use chips captured at HAND START (before any actions/pot distribution)
    // The pot may have already been distributed during playRound(), so we need chips from hand start
    console.log('🔴 [evaluateHand] ========== USING CHIPS FROM HAND START ==========');
    
    // Get chips captured at hand start (stored in playHand())
    let chipsBeforeDistribution = (this as any).chipsAtHandStart as Map<string, number> | undefined;
    
    if (!chipsBeforeDistribution) {
      // Fallback: capture chips now (pot might already be distributed, so this won't work well)
      console.log('🔴 [evaluateHand] ⚠️  No chips at hand start found! Pot may have been distributed already.');
      chipsBeforeDistribution = new Map<string, number>();
      state.players.forEach(p => {
        chipsBeforeDistribution!.set(p.id, p.chips);
      });
      console.log('🔴 [evaluateHand] ⚠️  Using current chips (may not show changes if pot already distributed)');
    } else {
      console.log('🔴 [evaluateHand] ✅ Using chips captured at HAND START (before any actions)');
    }
    
    console.log('🔴 [evaluateHand] Chips at HAND START:', Array.from(chipsBeforeDistribution.entries()).map(([id, chips]) => {
      const player = state.players.find(p => p.id === id);
      return `${player?.name || id}: ${chips} chips`;
    }));
    
    // Store pot before any distribution
    const potBeforeDistribution = state.pot;
    let winners: Array<{ player: any; evaluation: any }> = [];
    let evaluations: Array<{ player: any; evaluation: any }> = [];
    
    if (state.phase === 'showdown') {
      console.log(`🔴 [evaluateHand] Phase is 'showdown' - processing showdown`);
      // If only one active player, they win automatically (pot already distributed)
      if (activePlayers.length === 1) {
        const winner = activePlayers[0];
        // Try to evaluate hand if we have enough cards, otherwise use 0
        let handValue = 0;
        const totalCards = winner.hand.length + state.communityCards.length;
        if (totalCards >= 5) {
          try {
            handValue = evaluateHand([...winner.hand, ...state.communityCards]).value;
          } catch (error) {
            console.warn(`[evaluateHand] Could not evaluate winner hand: ${error}`);
          }
        }
        this.evaluator.recordHandResult(winner.id, true, winner.chips, handValue);
        
        // Record losers (players who folded)
        state.players
          .filter(p => p.id !== winner.id && !p.isActive)
          .forEach(loser => {
            this.evaluator.recordHandResult(loser.id, false, loser.chips);
          });
        
        // Process x402 payments even when only one player remains (others folded)
        try {
          const paymentService = getPaymentService();
          const potBeforeDistribution = state.pot;
          
          // Ensure wallets are registered
          for (const player of state.players) {
            await paymentService.registerAgentWallet(player.name);
          }
          
          const winnerList = [{
            agentName: winner.name,
            chipsWon: potBeforeDistribution
          }];
          
          const loserList = state.players
            .filter(p => p.id !== winner.id && p.totalBetThisRound > 0)
            .map(p => ({
              agentName: p.name,
              chipsLost: p.totalBetThisRound || 0
            }));
          
          if (winnerList.length > 0 && loserList.length > 0 && potBeforeDistribution > 0) {
            console.log('[X402 Payment] 💰 Processing payments (single winner):', {
              winners: winnerList,
              losers: loserList,
              pot: potBeforeDistribution,
              gameId: this.gameId,
              handNumber: this.handsPlayed
            });
            
            const payments = await paymentService.distributePot(winnerList, loserList, this.gameId || undefined, this.handsPlayed);
            console.log('[X402 Payment] ✅ Payments processed:', payments.length, 'payments');
            
            // Add payment messages to chat
            payments.forEach(payment => {
              if (payment.status === 'completed' && payment.amount > 0) {
                const paymentMessage: ChatMessage = {
                  modelName: 'System',
                  timestamp: Date.now(),
                  phase: 'finished',
                  action: 'payment',
                  decision: `💰 ${payment.fromAgent} → ${payment.toAgent}: ${payment.amount} chips (${payment.amountSol?.toFixed(6) || '0'} SOL) (x402)`,
                  emoji: '💰',
                  role: 'system',
                };
                chatHistory.addMessage(paymentMessage);
              }
            });
          }
        } catch (error) {
          console.error('[X402 Payment] ❌ Error processing payments (single winner):', error);
        }
        
        return;
      }
      
      // Evaluate all hands at showdown
      // Only evaluate if we have enough cards (at least 3 community cards + 2 hole cards = 5 total)
      const evaluations = activePlayers
        .filter(player => {
          const totalCards = player.hand.length + state.communityCards.length;
          if (totalCards < 5) {
            console.warn(`[evaluateHand] Skipping evaluation for ${player.name}: only ${totalCards} cards (hand: ${player.hand.length}, community: ${state.communityCards.length})`);
            return false;
          }
          return true;
        })
        .map(player => ({
          player,
          evaluation: evaluateHand([...player.hand, ...state.communityCards]),
        }));
      
      // If no valid evaluations (all players folded before flop), skip showdown evaluation
      if (evaluations.length === 0) {
        console.log('[evaluateHand] No valid hands to evaluate (all players folded before flop)');
        // Pot was already distributed to the last remaining player
        // Still attempt x402 payment processing
        try {
          const paymentService = getPaymentService();
          const potBeforeDistribution = state.pot;
          const lastPlayer = activePlayers[0]; // The one who didn't fold
          
          if (lastPlayer && potBeforeDistribution > 0) {
            // Ensure wallets are registered
            for (const player of state.players) {
              await paymentService.registerAgentWallet(player.name);
            }
            
            const winnerList = [{
              agentName: lastPlayer.name,
              chipsWon: potBeforeDistribution
            }];
            
            const loserList = state.players
              .filter(p => p.id !== lastPlayer.id && p.totalBetThisRound > 0)
              .map(p => ({
                agentName: p.name,
                chipsLost: p.totalBetThisRound || 0
              }));
            
            if (winnerList.length > 0 && loserList.length > 0 && potBeforeDistribution > 0) {
              console.log('[X402 Payment] 💰 Processing payments (all folded):', {
                winners: winnerList,
                losers: loserList,
                pot: potBeforeDistribution,
                gameId: this.gameId,
                handNumber: this.handsPlayed
              });
              
              const payments = await paymentService.distributePot(winnerList, loserList, this.gameId || undefined, this.handsPlayed);
              console.log('[X402 Payment] ✅ Payments processed (all folded):', payments.length, 'payments');
              
              // Add payment messages to chat
              payments.forEach(payment => {
                if (payment.status === 'completed' && payment.amount > 0) {
                  const paymentMessage: ChatMessage = {
                    modelName: 'System',
                    timestamp: Date.now(),
                    phase: 'finished',
                    action: 'payment',
                    decision: `💰 ${payment.fromAgent} → ${payment.toAgent}: ${payment.amount} chips (${payment.amountSol?.toFixed(6) || '0'} SOL) (x402)`,
                    emoji: '💰',
                    role: 'system',
                  };
                  chatHistory.addMessage(paymentMessage);
                }
              });
            }
          }
        } catch (error) {
          console.error('[X402 Payment] ❌ Error processing payments (all folded):', error);
        }
        return;
      }

      evaluations.sort((a, b) => b.evaluation.value - a.evaluation.value);
      const winningValue = evaluations[0].evaluation.value;
      winners = evaluations.filter(e => e.evaluation.value === winningValue);
      console.log(`🔴 [evaluateHand] Winners determined:`, winners.map(w => w.player.name));

      // Get pot amount before distribution for payment calculation
      const potBeforeDistribution = state.pot;
      const totalBets = activePlayers.reduce((sum, p) => sum + (p.totalBetThisRound || 0), 0);

      // Distribute pot first
      this.game.distributePot();

      // ALWAYS process x402 agent-to-agent payments after each hand finishes
      console.log('🔵 [X402 Payment] ========== STARTING PAYMENT PROCESS ==========');
      console.log('🔵 [X402 Payment] Hand finished, attempting payment processing...');
      console.log('🔵 [X402 Payment] Game ID:', this.gameId);
      console.log('🔵 [X402 Payment] Hand Number:', this.handsPlayed);
      console.log('🔵 [X402 Payment] Pot before distribution:', potBeforeDistribution);
      console.log('🔵 [X402 Payment] Active players:', activePlayers.map(p => ({ name: p.name, chips: p.chips, totalBet: p.totalBetThisRound })));
      console.log('🔵 [X402 Payment] Winners:', winners.map(w => w.player.name));
      
      try {
        console.log('🔵 [X402 Payment] Getting payment service...');
        const paymentService = getPaymentService();
        console.log('🔵 [X402 Payment] Payment service obtained:', !!paymentService);
        
        // Ensure all players have wallets registered
        console.log('🔵 [X402 Payment] Registering wallets for', activePlayers.length, 'players...');
        for (const player of activePlayers) {
          console.log(`🔵 [X402 Payment] Registering wallet for ${player.name}...`);
          const wallet = await paymentService.registerAgentWallet(player.name);
          console.log(`🔵 [X402 Payment] Wallet registered for ${player.name}: ${wallet}`);
        }
        console.log('🔵 [X402 Payment] All wallets registered');
        
        // Build winner list - players who won chips
        const winnerList = winners.map(({ player }) => ({
          agentName: player.name,
          chipsWon: Math.floor(potBeforeDistribution / winners.length)
        }));
        console.log('🔵 [X402 Payment] Winner list:', winnerList);
        
        // Build loser list - players who lost chips (bet but didn't win)
        const loserList = activePlayers
          .filter(p => !winners.some(w => w.player.id === p.id))
          .map(p => ({
            agentName: p.name,
            chipsLost: p.totalBetThisRound || 0
          }));
        console.log('🔵 [X402 Payment] Loser list:', loserList);

        // ALWAYS attempt payment processing when hand finishes
        console.log('🔵 [X402 Payment] Checking payment conditions...');
        console.log('🔵 [X402 Payment] Winners count:', winnerList.length);
        console.log('🔵 [X402 Payment] Losers count:', loserList.length);
        console.log('🔵 [X402 Payment] Pot amount:', potBeforeDistribution);
        
        // Process payments if we have valid winners and losers with a pot
        if (winnerList.length > 0 && loserList.length > 0 && potBeforeDistribution > 0) {
          console.log('🔵 [X402 Payment] ✅ Conditions met! Calling distributePot...');
          console.log('🔵 [X402 Payment] Winner list:', JSON.stringify(winnerList, null, 2));
          console.log('🔵 [X402 Payment] Loser list:', JSON.stringify(loserList, null, 2));
          
          const payments = await paymentService.distributePot(winnerList, loserList, this.gameId || undefined, this.handsPlayed);
          console.log('🔵 [X402 Payment] ✅ distributePot returned:', payments.length, 'payments');
          console.log('🔵 [X402 Payment] Payment details:', JSON.stringify(payments, null, 2));
          
          // Add payment messages to chat
          payments.forEach((payment, index) => {
            console.log(`🔵 [X402 Payment] Processing payment ${index + 1}/${payments.length}:`, payment);
            if (payment.status === 'completed' && payment.amount > 0) {
              console.log(`🔵 [X402 Payment] ✅ Payment ${index + 1} completed successfully`);
              const paymentMessage: ChatMessage = {
                modelName: 'System',
                timestamp: Date.now(),
                phase: 'finished',
                action: 'payment',
                decision: `💰 ${payment.fromAgent} → ${payment.toAgent}: ${payment.amount} chips (${payment.amountSol?.toFixed(6) || '0'} SOL) (x402)`,
                emoji: '💰',
                role: 'system',
              };
              chatHistory.addMessage(paymentMessage);
            } else if (payment.status === 'failed') {
              console.error(`🔵 [X402 Payment] ❌ Payment ${index + 1} failed:`, payment);
              const failedPaymentMessage: ChatMessage = {
                modelName: 'System',
                timestamp: Date.now(),
                phase: 'finished',
                action: 'payment',
                decision: `❌ Payment failed: ${payment.fromAgent} → ${payment.toAgent}: ${payment.amount} chips`,
                emoji: '❌',
                role: 'system',
              };
              chatHistory.addMessage(failedPaymentMessage);
            } else {
              console.log(`🔵 [X402 Payment] ⚠️  Payment ${index + 1} status:`, payment.status);
            }
          });
          
          console.log('🔵 [X402 Payment] ========== PAYMENT PROCESS COMPLETE ==========');
        } else {
          // Log why payments were skipped
          const skipReason = !winnerList.length ? 'no winners' : 
                           !loserList.length ? 'no losers' : 
                           potBeforeDistribution === 0 ? 'pot is zero' : 'unknown';
          
          console.log(`🔵 [X402 Payment] ⏭️  SKIPPING PAYMENTS: ${skipReason}`, {
            hasWinners: winnerList.length > 0,
            hasLosers: loserList.length > 0,
            pot: potBeforeDistribution,
            handNumber: this.handsPlayed
          });
          
          const skipMessage: ChatMessage = {
            modelName: 'System',
            timestamp: Date.now(),
            phase: 'finished',
            action: 'payment',
            decision: `⏭️  No x402 payment: ${skipReason} (Hand #${this.handsPlayed})`,
            emoji: '⏭️',
            role: 'system',
          };
          chatHistory.addMessage(skipMessage);
          console.log('🔵 [X402 Payment] ========== PAYMENT PROCESS SKIPPED ==========');
        }
      } catch (error) {
        console.error('🔵 [X402 Payment] ❌❌❌ ERROR IN PAYMENT PROCESS ❌❌❌');
        console.error('🔵 [X402 Payment] Error details:', error);
        console.error('🔵 [X402 Payment] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        console.error('[X402 Payment] ❌ Error processing agent payments:', error);
        
        const errorMessage: ChatMessage = {
          modelName: 'System',
          timestamp: Date.now(),
          phase: 'finished',
          action: 'payment',
          decision: `❌ Payment processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          emoji: '❌',
          role: 'system',
        };
        chatHistory.addMessage(errorMessage);
        console.log('🔵 [X402 Payment] ========== PAYMENT PROCESS ERROR ==========');
      }

      // Record winners
      winners.forEach(({ player, evaluation }) => {
        this.evaluator.recordHandResult(player.id, true, player.chips, evaluation.value);
      });

      // Record losers
      activePlayers
        .filter(p => !winners.some(w => w.player.id === p.id))
        .forEach(loser => {
          const evaluation = evaluations.find(e => e.player.id === loser.id);
          this.evaluator.recordHandResult(
            loser.id,
            false,
            loser.chips,
            evaluation?.evaluation.value
          );
        });
      
      // Check if a player now has all chips after pot distribution
      // Pot was distributed in PokerGame.distributePot(), check state now
      const stateAfterPotDistribution = this.game.getState();
      const playersWithChipsAfterPot = stateAfterPotDistribution.players.filter(p => p.chips > 0);
      
      console.log(`[evaluateHand] After pot distribution - Players with chips: ${playersWithChipsAfterPot.length}`,
        playersWithChipsAfterPot.map(p => `${p.name}: ${p.chips} chips`));
      
      if (playersWithChipsAfterPot.length <= 1) {
        console.log(`[evaluateHand] Game ending: Only ${playersWithChipsAfterPot.length} player(s) with chips after pot distribution`);
        // A player has won all chips - game ends immediately
        this.isRunning = false;
        // Don't return yet - process payments first!
      }
    } else {
      // Phase is NOT 'showdown' - but hand still finished
      console.log(`🔴 [evaluateHand] Phase is ${state.phase}, not 'showdown'`);
      // Distribute pot if not already done
      if (state.pot > 0) {
        this.game.distributePot();
      }
    }
    
    // ========== ALWAYS PROCESS PAYMENTS AT THE END (AFTER POT DISTRIBUTION) ==========
    // Calculate payments based on actual chip changes (winnings/losses)
    console.log('🔵 [X402 Payment] ========== STARTING PAYMENT PROCESS (AFTER POT DISTRIBUTION) ==========');
    console.log('🔵 [X402 Payment] Hand finished, calculating payments based on chip changes...');
    console.log('🔵 [X402 Payment] Game ID:', this.gameId);
    console.log('🔵 [X402 Payment] Hand Number:', this.handsPlayed);
    
    try {
      const paymentService = getPaymentService();
      console.log('🔵 [X402 Payment] Payment service obtained:', !!paymentService);
      
      // Ensure all players have wallets registered
      console.log('🔵 [X402 Payment] Registering wallets for', state.players.length, 'players...');
      for (const player of state.players) {
        await paymentService.registerAgentWallet(player.name);
      }
      console.log('🔵 [X402 Payment] All wallets registered');
      
      // Get state AFTER pot distribution to calculate actual chip changes
      const stateAfterDistribution = this.game.getState();
      
      console.log('🔵 [X402 Payment] ========== CALCULATING CHIP CHANGES ==========');
      console.log('🔵 [X402 Payment] Chips BEFORE distribution:', Array.from(chipsBeforeDistribution.entries()).map(([id, chips]) => {
        const player = state.players.find(p => p.id === id);
        return `${player?.name || id}: ${chips}`;
      }));
      console.log('🔵 [X402 Payment] Chips AFTER distribution:', stateAfterDistribution.players.map(p => `${p.name}: ${p.chips}`));
      
      // Calculate ACTUAL chip changes: compare before and after
      const chipChanges = new Map<string, number>(); // positive = gained, negative = lost
      stateAfterDistribution.players.forEach(player => {
        const chipsBefore = chipsBeforeDistribution.get(player.id) || 0;
        const chipsAfter = player.chips;
        const change = chipsAfter - chipsBefore;
        chipChanges.set(player.id, change);
        const changeStr = change > 0 ? `+${change}` : change < 0 ? `${change}` : '0';
        console.log(`🔵 [X402 Payment] ${player.name}: ${chipsBefore} → ${chipsAfter} (${changeStr})`);
      });
      
      // Build winner and loser lists based on ACTUAL chip changes
      // Winners = players who GAINED chips (positive change)
      // Losers = players who LOST chips (negative change)
      
      const winnerList: Array<{ agentName: string; chipsWon: number }> = [];
      const loserList: Array<{ agentName: string; chipsLost: number }> = [];
      
      console.log('🔵 [X402 Payment] ========== BUILDING WINNER/LOSER LISTS ==========');
      chipChanges.forEach((change, playerId) => {
        const player = stateAfterDistribution.players.find(p => p.id === playerId);
        if (!player) {
          console.log(`🔵 [X402 Payment] ⚠️  Player ${playerId} not found in stateAfterDistribution`);
          return;
        }
        
        if (change > 0) {
          // Player gained chips = winner
          console.log(`🔵 [X402 Payment] ✅ ${player.name} is a WINNER (gained ${change} chips)`);
          winnerList.push({
            agentName: player.name,
            chipsWon: change
          });
        } else if (change < 0) {
          // Player lost chips = loser
          console.log(`🔵 [X402 Payment] ❌ ${player.name} is a LOSER (lost ${Math.abs(change)} chips)`);
          loserList.push({
            agentName: player.name,
            chipsLost: Math.abs(change) // Make positive
          });
        } else {
          console.log(`🔵 [X402 Payment] ⏸️  ${player.name} has NO CHANGE (0 chips)`);
        }
      });
      
      console.log('🔵 [X402 Payment] ========== WINNER/LOSER LISTS BUILT ==========');
      console.log('🔵 [X402 Payment] Winners found:', winnerList.length);
      console.log('🔵 [X402 Payment] Losers found:', loserList.length);
      
      console.log('🔵 [X402 Payment] Winner list (based on chip gains):', JSON.stringify(winnerList, null, 2));
      console.log('🔵 [X402 Payment] Loser list (based on chip losses):', JSON.stringify(loserList, null, 2));
      
      // Calculate total chips gained and lost
      const totalChipsGained = winnerList.reduce((sum, w) => sum + w.chipsWon, 0);
      const totalChipsLost = loserList.reduce((sum, l) => sum + l.chipsLost, 0);
      
      console.log('🔵 [X402 Payment] Total chips gained:', totalChipsGained);
      console.log('🔵 [X402 Payment] Total chips lost:', totalChipsLost);
      console.log('🔵 [X402 Payment] Pot before distribution (for reference):', potBeforeDistribution);
      
      // Process payments if there are chip changes (winners and losers)
      // Condition: At least one player gained chips AND at least one player lost chips
      // We don't need pot > 0 - we use actual chip changes!
      if (winnerList.length > 0 && loserList.length > 0 && totalChipsGained > 0 && totalChipsLost > 0) {
        console.log('🔵 [X402 Payment] ✅✅✅ PAYMENT CONDITIONS MET (BASED ON CHIP CHANGES) ✅✅✅');
        console.log('🔵 [X402 Payment] Winners (gained chips):', winnerList.map(w => `${w.agentName} (+${w.chipsWon} chips)`).join(', '));
        console.log('🔵 [X402 Payment] Losers (lost chips):', loserList.map(l => `${l.agentName} (-${l.chipsLost} chips)`).join(', '));
        console.log('🔵 [X402 Payment] Total chips gained:', totalChipsGained);
        console.log('🔵 [X402 Payment] Total chips lost:', totalChipsLost);
        console.log('🔵 [X402 Payment] Calling distributePot NOW...');
        
        try {
          const payments = await paymentService.distributePot(winnerList, loserList, this.gameId || undefined, this.handsPlayed);
          console.log('🔵 [X402 Payment] ✅✅✅ distributePot RETURNED ✅✅✅');
          console.log('🔵 [X402 Payment] Number of payments:', payments.length);
          console.log('🔵 [X402 Payment] Payment details:', JSON.stringify(payments, null, 2));
          
          if (payments.length === 0) {
            console.error('🔵 [X402 Payment] ⚠️⚠️⚠️ WARNING: distributePot returned 0 payments! ⚠️⚠️⚠️');
          }
          
          // Add payment messages to chat
          let completedCount = 0;
          let failedCount = 0;
          
          payments.forEach((payment, index) => {
            console.log(`🔵 [X402 Payment] Payment ${index + 1}/${payments.length}:`, {
              from: payment.fromAgent,
              to: payment.toAgent,
              amount: payment.amount,
              status: payment.status,
              signature: payment.transactionSignature?.substring(0, 16) + '...' || 'none'
            });
            
            if (payment.status === 'completed' && payment.amount > 0) {
              completedCount++;
              console.log(`🔵 [X402 Payment] ✅ Payment ${index + 1} COMPLETED`);
              const paymentMessage: ChatMessage = {
                modelName: 'System',
                timestamp: Date.now(),
                phase: 'finished',
                action: 'payment',
                decision: `💰 ${payment.fromAgent} → ${payment.toAgent}: ${payment.amount} chips (${payment.amountSol?.toFixed(6) || '0'} SOL) (x402)`,
                emoji: '💰',
                role: 'system',
              };
              chatHistory.addMessage(paymentMessage);
            } else if (payment.status === 'failed') {
              failedCount++;
              console.error(`🔵 [X402 Payment] ❌ Payment ${index + 1} FAILED`);
              const failedMessage: ChatMessage = {
                modelName: 'System',
                timestamp: Date.now(),
                phase: 'finished',
                action: 'payment',
                decision: `❌ Payment failed: ${payment.fromAgent} → ${payment.toAgent}: ${payment.amount} chips`,
                emoji: '❌',
                role: 'system',
              };
              chatHistory.addMessage(failedMessage);
            } else {
              console.log(`🔵 [X402 Payment] ⚠️  Payment ${index + 1} status: ${payment.status}`);
            }
          });
          
          console.log(`🔵 [X402 Payment] Summary: ${completedCount} completed, ${failedCount} failed, ${payments.length - completedCount - failedCount} other`);
        } catch (error) {
          console.error('🔵 [X402 Payment] ❌❌❌ ERROR calling distributePot ❌❌❌');
          console.error('🔵 [X402 Payment] Error:', error);
          console.error('🔵 [X402 Payment] Stack:', error instanceof Error ? error.stack : 'No stack');
        }
      } else {
        console.log('🔵 [X402 Payment] ⏭️⏭️⏭️ CONDITIONS NOT MET - SKIPPING PAYMENTS ⏭️⏭️⏭️');
        console.log('🔵 [X402 Payment] ========== DIAGNOSTIC INFO ==========');
        
        // Detailed diagnostic
        const reason = 
          winnerList.length === 0 ? 'No players gained chips' :
          loserList.length === 0 ? 'No players lost chips' :
          totalChipsGained === 0 ? 'Total chips gained is 0' :
          totalChipsLost === 0 ? 'Total chips lost is 0' :
          'Unknown reason';
        
        console.log('🔵 [X402 Payment] ❌ Reason:', reason);
        console.log('🔵 [X402 Payment] Winners count:', winnerList.length);
        console.log('🔵 [X402 Payment] Losers count:', loserList.length);
        console.log('🔵 [X402 Payment] Total chips gained:', totalChipsGained);
        console.log('🔵 [X402 Payment] Total chips lost:', totalChipsLost);
        console.log('🔵 [X402 Payment] Pot before distribution:', potBeforeDistribution);
        
        // Show all chip changes
        console.log('🔵 [X402 Payment] All chip changes:');
        chipChanges.forEach((change, playerId) => {
          const player = stateAfterDistribution.players.find(p => p.id === playerId);
          const chipsBefore = chipsBeforeDistribution.get(playerId) || 0;
          const chipsAfter = player?.chips || 0;
          console.log(`🔵 [X402 Payment]   ${player?.name || playerId}: ${chipsBefore} → ${chipsAfter} (change: ${change > 0 ? '+' : ''}${change})`);
        });
        
        // Show winner/loser lists
        if (winnerList.length > 0) {
          console.log('🔵 [X402 Payment] Winners list:', JSON.stringify(winnerList, null, 2));
        } else {
          console.log('🔵 [X402 Payment] ❌ NO WINNERS - All players either lost chips or had no change');
        }
        
        if (loserList.length > 0) {
          console.log('🔵 [X402 Payment] Losers list:', JSON.stringify(loserList, null, 2));
        } else {
          console.log('🔵 [X402 Payment] ❌ NO LOSERS - All players either gained chips or had no change');
        }
        
        console.log('🔵 [X402 Payment] ========== END DIAGNOSTIC ==========');
      }
    } catch (error) {
      console.error('🔵 [X402 Payment] ❌❌❌ ERROR IN PAYMENT PROCESS ❌❌❌');
      console.error('🔵 [X402 Payment] Error:', error);
    }
    console.log('🔵 [X402 Payment] ========== PAYMENT PROCESS COMPLETE ==========');
  }

  getGameState(): GameState | null {
    return this.game?.getState() || null;
  }

  getStats() {
    return this.evaluator.getAllStats();
  }

  getRankings() {
    return this.evaluator.getRankings();
  }

  isGameRunning(): boolean {
    return this.isRunning;
  }

  stopGame(): void {
    this.isRunning = false;
    console.log('[GameManager] Game stopped via stopGame()');
  }

  getGameId(): string | null {
    return this.gameId;
  }

  async saveGameStateToDB(): Promise<void> {
    if (!this.gameId) return;

    try {
      // Check if DATABASE_URL is configured
      if (!process.env.DATABASE_URL) {
        // Broadcast via Supabase Realtime even without database (non-blocking)
        import('@/lib/supabase/server').then(({ supabase }) => {
          const gameData = {
            game_id: this.gameId,
            game_state: this.getGameState(),
            stats: this.getStats(),
            rankings: this.getRankings(),
            is_running: this.isRunning,
            chat_messages: chatHistory.getAllMessages(),
            simulator_status: getSimulatorStatus(),
          };
          const channel = supabase.channel(`game-${this.gameId}`);
          channel.send({
            type: 'broadcast',
            event: 'game-state',
            payload: gameData,
          }).catch((error) => {
            console.error('Error broadcasting game state via Supabase:', error);
          });
        }).catch((error) => {
          console.error('Error importing Supabase server:', error);
        });
        return;
      }

      const gameState = this.getGameState();
      const stats = this.getStats();
      const rankings = this.getRankings();
      const chatMessages = chatHistory.getAllMessages();
      const simulatorStatus = getSimulatorStatus();

      // Save directly to database
      await query(
        `INSERT INTO game_plays (game_id, game_state, stats, rankings, is_running, chat_messages, simulator_status, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (game_id) 
         DO UPDATE SET 
           game_state = EXCLUDED.game_state,
           stats = EXCLUDED.stats,
           rankings = EXCLUDED.rankings,
           is_running = EXCLUDED.is_running,
           chat_messages = EXCLUDED.chat_messages,
           simulator_status = EXCLUDED.simulator_status,
           updated_at = NOW()`,
        [
          this.gameId,
          JSON.stringify(gameState),
          JSON.stringify(stats || []),
          JSON.stringify(rankings || []),
          this.isRunning || false,
          JSON.stringify(chatMessages || []),
          JSON.stringify(simulatorStatus),
        ]
      );

      // Broadcast via Supabase Realtime for real-time updates (non-blocking for better performance)
      // Fire and forget - don't await to avoid blocking game execution
      import('@/lib/supabase/server').then(({ supabase }) => {
        const gameData = {
          game_id: this.gameId,
          game_state: gameState,
          stats: stats || [],
          rankings: rankings || [],
          is_running: this.isRunning || false,
          chat_messages: chatMessages || [],
          simulator_status: simulatorStatus,
        };
        const channel = supabase.channel(`game-${this.gameId}`);
        // Don't await - fire and forget for faster performance
        channel.send({
          type: 'broadcast',
          event: 'game-state',
          payload: gameData,
        }).catch((error) => {
          // Only log errors, don't block execution
          console.error('Error broadcasting game state via Supabase:', error);
        });
      }).catch((error) => {
        console.error('Error importing Supabase server:', error);
      });
    } catch (error) {
      console.error('Error saving game state to database:', error);
    }
  }

  private async getDecisionWithHistory(
    model: AIModel,
    state: GameState,
    player: any
  ): Promise<{ decision: AIDecision; prompt?: string; response?: string }> {
    const prompt = this.formatGameStatePrompt(state, player.id);
    
    // Get decision (models will handle their own prompt/response internally)
    const decision = await model.decideAction(state, player.id);
    
    // Try to get response from model if it stores it
    let response: string | undefined;
    if ('lastResponse' in model && (model as any).lastResponse) {
      response = (model as any).lastResponse;
    } else {
      // For simulator, generate a mock response
      response = this.generateMockResponse(decision);
    }
    
    return {
      decision,
      prompt,
      response,
    };
  }

  private generateMockResponse(decision: AIDecision): string {
    // Generate a mock JSON response for simulator mode
    if (decision.amount) {
      return JSON.stringify({ action: decision.action, amount: decision.amount }, null, 2);
    }
    return JSON.stringify({ action: decision.action }, null, 2);
  }

  private formatGameStatePrompt(gameState: GameState, playerId: string): string {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return '';

    const activePlayers = gameState.players.filter(p => p.isActive && p.chips > 0);
    const otherPlayers = activePlayers.filter(p => p.id !== playerId);

    let prompt = `You are playing Texas Hold'em poker. Here's the current game state:\n\n`;
    prompt += `**Your Hand:** ${this.formatCards(player.hand)}\n`;
    prompt += `**Your Chips:** $${player.chips}\n`;
    prompt += `**Your Current Bet This Round:** $${player.totalBetThisRound}\n`;
    prompt += `**Community Cards:** ${gameState.communityCards.length > 0 ? this.formatCards(gameState.communityCards) : 'None yet'}\n`;
    prompt += `**Pot:** $${gameState.pot}\n`;
    prompt += `**Current Bet to Match:** $${gameState.currentBet}\n`;
    prompt += `**Game Phase:** ${gameState.phase}\n\n`;

    prompt += `**Other Players:**\n`;
    otherPlayers.forEach((p) => {
      prompt += `- ${p.name}: $${p.chips} chips, bet: $${p.currentBet}${p.isAllIn ? ' (ALL-IN)' : ''}\n`;
    });

    const toCall = gameState.currentBet - player.totalBetThisRound;
    const canCheck = toCall === 0;

    prompt += `\n**Your Options:**\n`;
    if (canCheck) {
      prompt += `- CHECK (no bet required)\n`;
      prompt += `- RAISE (bet more than $${gameState.currentBet})\n`;
      prompt += `- FOLD (give up this hand)\n`;
    } else {
      prompt += `- CALL (match the bet of $${toCall})\n`;
      prompt += `- RAISE (bet more than $${gameState.currentBet})\n`;
      prompt += `- FOLD (give up this hand)\n`;
      if (player.chips > 0) {
        prompt += `- ALL-IN (bet all $${player.chips})\n`;
      }
    }

    prompt += `\nRespond with ONLY a JSON object in this exact format:\n`;
    prompt += `{"action": "fold|check|call|raise|all-in", "amount": <number if raise>}\n`;
    prompt += `Example: {"action": "call"} or {"action": "raise", "amount": 100}\n`;

    return prompt;
  }

  private formatCards(cards: any[]): string {
    return cards.map(c => `${c.rank}${c.suit[0].toUpperCase()}`).join(', ');
  }

  private generateReasoning(player: any, state: GameState, decision: AIDecision): string {
    const toCall = state.currentBet - player.totalBetThisRound;
    const potOdds = toCall > 0 ? (toCall / (state.pot + toCall)).toFixed(2) : '0';
    
    let reasoning = '';
    
    if (decision.action === 'fold') {
      reasoning = `Folding. Pot odds ${potOdds}, not worth the risk with current hand.`;
    } else if (decision.action === 'check') {
      reasoning = `Checking. No bet to match, waiting to see what others do.`;
    } else if (decision.action === 'call') {
      reasoning = `Calling $${toCall}. Pot odds ${potOdds} are acceptable.`;
    } else if (decision.action === 'raise') {
      reasoning = `Raising to $${decision.amount || state.currentBet * 1.5}. Strong hand, building the pot.`;
    } else if (decision.action === 'all-in') {
      reasoning = `Going all-in with $${player.chips}. High confidence in this hand.`;
    }
    
    return reasoning;
  }
}


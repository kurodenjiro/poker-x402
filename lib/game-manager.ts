import { PokerGame } from './poker/game';
import { GameState } from './poker/types';
import { AIModel, AIDecision } from './ai/types';
import { ModelEvaluator } from './ai/evaluator';
import { evaluateHand } from './poker/cards';
import { chatHistory, ChatMessage } from './ai/chat-history';
import { getActionEmoji, generateStrategyChat, getCardDealEmoji } from './ai/strategy-chat';
import { getSimulatorStatus } from './ai/simulator';
import { query } from './db/postgres';

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

    this.isRunning = true;
    
    // Save initial game state to database immediately so it can be fetched on refresh
    if (this.gameId) {
      await this.saveGameStateToDB().catch(console.error);
    }
    
    await this.playHand();
  }

  private async playHand(): Promise<void> {
    if (!this.game || !this.config) return;

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
          if (global.io) {
            global.io.emit('lobby-update');
          }
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
          if (global.io) {
            global.io.emit('lobby-update');
          }
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
      const decision = decisionResult.decision;
      
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
      const success = this.game.makeAction(
        currentPlayer.id,
        decision.action,
        decision.amount
      );

      if (!success) {
        // Fallback to fold if action failed
        this.game.makeAction(currentPlayer.id, 'fold');
        this.evaluator.recordAction(currentPlayer.id, 'fold');
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
            // Emit lobby update
            if (global.io) {
              global.io.emit('lobby-update');
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
    
    // Check if max hands reached
    if (this.config?.maxHands && this.handsPlayed >= this.config.maxHands) {
      this.isRunning = false;
      
      const state = this.game.getState();
      // Find player with most chips
      const playersWithChips = state.players.filter(p => p.chips > 0);
      if (playersWithChips.length > 0) {
        // Sort by chips to find winner
        const sortedPlayers = [...state.players].sort((a, b) => b.chips - a.chips);
        const winner = sortedPlayers[0];
        
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
          if (global.io) {
            global.io.emit('lobby-update');
          }
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
          if (global.io) {
            global.io.emit('lobby-update');
          }
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
    if (this.isRunning) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      await this.playHand();
    }
  }

  private async evaluateHand(): Promise<void> {
    if (!this.game || !this.config) return;

    const state = this.game.getState();
    this.handsPlayed++;

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
      }
      
      // Game ends immediately - one player has all chips
      this.isRunning = false;
      return;
    }

    // Determine winners and record stats for active players in this hand
    const activePlayers = state.players.filter(p => p.isActive && p.chips > 0);
    
    if (state.phase === 'showdown') {
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
        return;
      }

      evaluations.sort((a, b) => b.evaluation.value - a.evaluation.value);
      const winningValue = evaluations[0].evaluation.value;
      const winners = evaluations.filter(e => e.evaluation.value === winningValue);

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
        return;
      }
    }
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

  getGameId(): string | null {
    return this.gameId;
  }

  async saveGameStateToDB(): Promise<void> {
    if (!this.gameId) return;

    try {
      // Check if DATABASE_URL is configured
      if (!process.env.DATABASE_URL) {
        // Emit Socket.io event even without database
        if (global.io) {
          const gameData = {
            game_id: this.gameId,
            game_state: this.getGameState(),
            stats: this.getStats(),
            rankings: this.getRankings(),
            is_running: this.isRunning,
            chat_messages: chatHistory.getAllMessages(),
            simulator_status: getSimulatorStatus(),
          };
          global.io.to(`game-${this.gameId}`).emit('game-state', gameData);
        }
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

      // Emit Socket.io event for real-time updates
      if (global.io) {
        const gameData = {
          game_id: this.gameId,
          game_state: gameState,
          stats: stats || [],
          rankings: rankings || [],
          is_running: this.isRunning || false,
          chat_messages: chatMessages || [],
          simulator_status: simulatorStatus,
        };
        global.io.to(`game-${this.gameId}`).emit('game-state', gameData);
      }
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


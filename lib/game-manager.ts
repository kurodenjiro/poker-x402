import { PokerGame } from './poker/game';
import { GameState } from './poker/types';
import { AIModel, AIDecision } from './ai/types';
import { ModelEvaluator } from './ai/evaluator';
import { evaluateHand } from './poker/cards';
import { chatHistory, ChatMessage } from './ai/chat-history';
import { getActionEmoji, generateStrategyChat, getCardDealEmoji } from './ai/strategy-chat';

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

  constructor(models: AIModel[]) {
    models.forEach(model => {
      this.models.set(model.name, model);
    });
  }

  async startGame(config: GameConfig): Promise<void> {
    this.config = config;
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
    await this.playHand();
  }

  private async playHand(): Promise<void> {
    if (!this.game || !this.config) return;

    // Check if we should continue
    if (this.config.maxHands && this.handsPlayed >= this.config.maxHands) {
      this.isRunning = false;
      return;
    }

    // Check if game should end (only one player with chips)
    const state = this.game.getState();
    const playersWithChips = state.players.filter(p => p.chips > 0);
    if (playersWithChips.length <= 1) {
      this.isRunning = false;
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
        
        await new Promise(resolve => setTimeout(resolve, 2000)); // Delay for card dealing animation
      }
    }

    // Hand complete - evaluate results
    await this.evaluateHand();
    
    // Continue to next hand
    if (this.isRunning) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      await this.playHand();
    }
  }

  private async evaluateHand(): Promise<void> {
    if (!this.game || !this.config) return;

    const state = this.game.getState();
    this.handsPlayed++;

    // Determine winners and record stats
    const activePlayers = state.players.filter(p => p.isActive && p.chips > 0);
    
    if (activePlayers.length === 1) {
      // Only one player left - they win
      const winner = activePlayers[0];
      const handValue = state.communityCards.length >= 3
        ? evaluateHand([...winner.hand, ...state.communityCards]).value
        : 0;
      this.evaluator.recordHandResult(winner.id, true, winner.chips, handValue);
      
      // Record losers
      state.players
        .filter(p => p.id !== winner.id && p.chips === 0)
        .forEach(loser => {
          this.evaluator.recordHandResult(loser.id, false, loser.chips);
        });
    } else if (state.phase === 'showdown') {
      // Evaluate all hands at showdown
      const evaluations = activePlayers.map(player => ({
        player,
        evaluation: evaluateHand([...player.hand, ...state.communityCards]),
      }));

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

  stopGame(): void {
    this.isRunning = false;
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


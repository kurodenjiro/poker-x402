import { AIModel, AIDecision } from './types';
import { GameState, Player, Action, Card } from '../poker/types';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { SimulatorModel } from './simulator';

// Helper function to format game state for AI
function formatGameStateForAI(gameState: GameState, playerId: string): string {
  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return '';

  const activePlayers = gameState.players.filter(p => p.isActive && p.chips > 0);
  const playerIndex = activePlayers.findIndex(p => p.id === playerId);
  const otherPlayers = activePlayers.filter(p => p.id !== playerId);

  let prompt = `You are playing Texas Hold'em poker. Here's the current game state:\n\n`;
  prompt += `**Your Hand:** ${formatCards(player.hand)}\n`;
  prompt += `**Your Chips:** $${player.chips}\n`;
  prompt += `**Your Current Bet This Round:** $${player.totalBetThisRound}\n`;
  prompt += `**Community Cards:** ${gameState.communityCards.length > 0 ? formatCards(gameState.communityCards) : 'None yet'}\n`;
  prompt += `**Pot:** $${gameState.pot}\n`;
  prompt += `**Current Bet to Match:** $${gameState.currentBet}\n`;
  prompt += `**Game Phase:** ${gameState.phase}\n\n`;

  prompt += `**Other Players:**\n`;
  otherPlayers.forEach((p, idx) => {
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

function formatCards(cards: Card[]): string {
  return cards.map(c => `${c.rank}${c.suit[0].toUpperCase()}`).join(', ');
}

function parseAIResponse(response: string): AIDecision {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const action = parsed.action?.toLowerCase();
      if (['fold', 'check', 'call', 'raise', 'all-in'].includes(action)) {
        return {
          action: action as Action,
          amount: parsed.amount ? Number(parsed.amount) : undefined,
        };
      }
    }
  } catch (e) {
    console.error('Failed to parse AI response:', e);
  }

  // Fallback: try to infer from text
  const lower = response.toLowerCase();
  if (lower.includes('fold')) return { action: 'fold' };
  if (lower.includes('check')) return { action: 'check' };
  if (lower.includes('call')) return { action: 'call' };
  if (lower.includes('raise') || lower.includes('bet')) {
    const amountMatch = response.match(/\d+/);
    return { action: 'raise', amount: amountMatch ? Number(amountMatch[0]) : undefined };
  }
  if (lower.includes('all-in') || lower.includes('all in')) return { action: 'all-in' };

  // Default fallback
  return { action: 'fold' };
}

export class ChatGPTModel implements AIModel {
  name = 'ChatGPT';
  private simulator: SimulatorModel | null = null;
  public lastPrompt?: string;
  public lastResponse?: string;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      this.simulator = new SimulatorModel('ChatGPT', 'balanced');
    }
  }

  async decideAction(gameState: GameState, playerId: string): Promise<AIDecision> {
    if (this.simulator) {
      return this.simulator.decideAction(gameState, playerId);
    }

    try {
      const prompt = formatGameStateForAI(gameState, playerId);
      this.lastPrompt = prompt;
      
      const openai = createOpenAI();
      const { text } = await generateText({
        model: openai('gpt-4') as any,
        system: 'You are a professional poker player. Make optimal decisions based on the game state. Always respond with valid JSON only.',
        prompt,
        temperature: 0.7,
        maxTokens: 150,
      } as any);

      this.lastResponse = text;
      return parseAIResponse(text);
    } catch (error) {
      console.error('ChatGPT API error:', error);
      // Fallback to simulator on error
      if (!this.simulator) {
        this.simulator = new SimulatorModel('ChatGPT', 'balanced');
      }
      return this.simulator.decideAction(gameState, playerId);
    }
  }
}

export class GeminiModel implements AIModel {
  name = 'Gemini';
  private simulator: SimulatorModel | null = null;
  public lastPrompt?: string;
  public lastResponse?: string;

  constructor() {
    if (!process.env.GOOGLE_AI_API_KEY) {
      this.simulator = new SimulatorModel('Gemini', 'aggressive');
    }
  }

  async decideAction(gameState: GameState, playerId: string): Promise<AIDecision> {
    if (this.simulator) {
      return this.simulator.decideAction(gameState, playerId);
    }

    try {
      const prompt = formatGameStateForAI(gameState, playerId);
      this.lastPrompt = prompt;
      
      const google = createGoogleGenerativeAI();
      const { text } = await generateText({
        model: google('gemini-pro') as any,
        system: 'You are a professional poker player. Make optimal decisions based on the game state. Always respond with valid JSON only.',
        prompt,
        temperature: 0.7,
        maxTokens: 150,
      } as any);

      this.lastResponse = text;
      return parseAIResponse(text);
    } catch (error) {
      console.error('Gemini API error:', error);
      if (!this.simulator) {
        this.simulator = new SimulatorModel('Gemini', 'aggressive');
      }
      return this.simulator.decideAction(gameState, playerId);
    }
  }
}

export class GrokModel implements AIModel {
  name = 'Grok';
  private simulator: SimulatorModel | null = null;
  public lastPrompt?: string;
  public lastResponse?: string;

  constructor() {
    if (!process.env.GROK_API_KEY) {
      this.simulator = new SimulatorModel('Grok', 'random');
    }
  }

  async decideAction(gameState: GameState, playerId: string): Promise<AIDecision> {
    if (this.simulator) {
      return this.simulator.decideAction(gameState, playerId);
    }

    try {
      const prompt = formatGameStateForAI(gameState, playerId);
      this.lastPrompt = prompt;
      
      // Grok uses OpenAI-compatible API
      const grokProvider = createOpenAI({
        apiKey: process.env.GROK_API_KEY,
        baseURL: 'https://api.x.ai/v1',
      });
      
      const { text } = await generateText({
        model: grokProvider('grok-beta') as any,
        system: 'You are a professional poker player. Make optimal decisions based on the game state. Always respond with valid JSON only.',
        prompt,
        temperature: 0.7,
        maxTokens: 150,
      } as any);

      this.lastResponse = text;
      return parseAIResponse(text);
    } catch (error) {
      console.error('Grok API error:', error);
      if (!this.simulator) {
        this.simulator = new SimulatorModel('Grok', 'random');
      }
      return this.simulator.decideAction(gameState, playerId);
    }
  }
}

export class ClaudeModel implements AIModel {
  name = 'Claude Sonnet';
  private simulator: SimulatorModel | null = null;
  public lastPrompt?: string;
  public lastResponse?: string;

  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) {
      this.simulator = new SimulatorModel('Claude Sonnet', 'conservative');
    }
  }

  async decideAction(gameState: GameState, playerId: string): Promise<AIDecision> {
    if (this.simulator) {
      return this.simulator.decideAction(gameState, playerId);
    }

    try {
      const prompt = formatGameStateForAI(gameState, playerId);
      this.lastPrompt = prompt;
      
      const anthropic = createAnthropic();
      const { text } = await generateText({
        model: anthropic('claude-3-5-sonnet-20241022') as any,
        system: 'You are a professional poker player. Make optimal decisions based on the game state. Always respond with valid JSON only.',
        prompt,
        temperature: 0.7,
        maxTokens: 150,
      } as any);

      this.lastResponse = text;
      return parseAIResponse(text);
    } catch (error) {
      console.error('Claude API error:', error);
      if (!this.simulator) {
        this.simulator = new SimulatorModel('Claude Sonnet', 'conservative');
      }
      return this.simulator.decideAction(gameState, playerId);
    }
  }
}

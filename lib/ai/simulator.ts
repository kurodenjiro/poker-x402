import { AIModel, AIDecision } from './types';
import { GameState, Player, Action, Card } from '../poker/types';
import { ConservativeModel, AggressiveModel, BalancedModel, RandomModel } from './models';

// Simulator that uses strategy-based models when real AI APIs aren't configured
export class SimulatorModel implements AIModel {
  name: string;
  private strategyModel: AIModel;

  constructor(name: string, strategy: 'conservative' | 'aggressive' | 'balanced' | 'random' = 'balanced') {
    this.name = name;
    
    // Map model names to strategies
    const strategyMap: Record<string, 'conservative' | 'aggressive' | 'balanced' | 'random'> = {
      'ChatGPT': 'balanced',
      'Gemini': 'aggressive',
      'Grok': 'random',
      'Claude Sonnet': 'conservative',
    };

    const selectedStrategy = strategyMap[name] || strategy;

    switch (selectedStrategy) {
      case 'conservative':
        this.strategyModel = new ConservativeModel();
        this.strategyModel.name = name; // Preserve original name
        break;
      case 'aggressive':
        this.strategyModel = new AggressiveModel();
        this.strategyModel.name = name;
        break;
      case 'random':
        this.strategyModel = new RandomModel();
        this.strategyModel.name = name;
        break;
      case 'balanced':
      default:
        this.strategyModel = new BalancedModel();
        this.strategyModel.name = name;
        break;
    }
  }

  async decideAction(gameState: GameState, playerId: string): Promise<AIDecision> {
    // Add a small delay to simulate API call time
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
    
    return this.strategyModel.decideAction(gameState, playerId);
  }
}

// Check if API keys are configured
export function hasApiKeys(): boolean {
  return !!(
    process.env.OPENAI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GROK_API_KEY ||
    process.env.ANTHROPIC_API_KEY
  );
}

// Get simulator status message
export function getSimulatorStatus(): { isSimulator: boolean; message: string } {
  const hasKeys = hasApiKeys();
  
  if (!hasKeys) {
    return {
      isSimulator: true,
      message: 'Simulator Mode: No API keys configured. Using strategy-based AI models.',
    };
  }
  
  // Check which models have keys
  const configuredModels: string[] = [];
  if (process.env.OPENAI_API_KEY) configuredModels.push('ChatGPT');
  if (process.env.GOOGLE_AI_API_KEY) configuredModels.push('Gemini');
  if (process.env.GROK_API_KEY) configuredModels.push('Grok');
  if (process.env.ANTHROPIC_API_KEY) configuredModels.push('Claude Sonnet');
  
  if (configuredModels.length === 0) {
    return {
      isSimulator: true,
      message: 'Simulator Mode: No API keys configured.',
    };
  }
  
  if (configuredModels.length < 4) {
    return {
      isSimulator: true,
      message: `Hybrid Mode: ${configuredModels.join(', ')} using real APIs. Others using simulator.`,
    };
  }
  
  return {
    isSimulator: false,
    message: 'All models using real AI APIs.',
  };
}


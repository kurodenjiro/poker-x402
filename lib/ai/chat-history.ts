export interface ChatMessage {
  modelName: string;
  timestamp: number;
  phase: string;
  action: string;
  reasoning?: string;
  handStrength?: number;
  potOdds?: number;
  decision: string;
  prompt?: string;
  response?: string;
  role?: 'system' | 'user' | 'assistant';
  emoji?: string;
  strategy?: string;
}

class ChatHistoryManager {
  private messages: ChatMessage[] = [];
  private maxMessages = 100;

  addMessage(message: ChatMessage): void {
    this.messages.push(message);
    // Keep only recent messages
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }
  }

  getMessagesForModel(modelName: string): ChatMessage[] {
    return this.messages.filter(m => m.modelName === modelName);
  }

  getAllMessages(): ChatMessage[] {
    return [...this.messages];
  }

  getRecentMessages(limit: number = 20): ChatMessage[] {
    return this.messages.slice(-limit);
  }

  clear(): void {
    this.messages = [];
  }
}

export const chatHistory = new ChatHistoryManager();


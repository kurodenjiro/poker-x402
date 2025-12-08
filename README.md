# Poker X402 - AI Model Evaluation Game

A competitive poker game where real AI models (ChatGPT, Gemini, Grok, Claude Sonnet) face off against each other in Texas Hold'em poker. Watch them play in real-time on a beautiful poker table visualization!

## Features

- **Real AI Models**: ChatGPT (GPT-4), Google Gemini, xAI Grok, and Anthropic Claude Sonnet
- **Real-time Poker Table**: Beautiful circular poker table with players positioned around it
- **Live Gameplay**: Watch AI models make decisions in real-time with action animations
- **Texas Hold'em Engine**: Full poker game engine with betting rounds, community cards, and hand evaluation
- **Performance Tracking**: Detailed statistics and rankings for each AI model
- **Real-time Updates**: Game state updates every 300ms during active gameplay

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

This will install:
- `ai` - Vercel AI SDK core
- `@ai-sdk/openai` - OpenAI provider (for ChatGPT)
- `@ai-sdk/google` - Google provider (for Gemini)
- `@ai-sdk/anthropic` - Anthropic provider (for Claude)

### 2. Configure API Keys

Create a `.env.local` file in the root directory:

```env
OPENAI_API_KEY=your_openai_api_key_here
GOOGLE_AI_API_KEY=your_google_ai_api_key_here
GROK_API_KEY=your_grok_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

Get your API keys from:
- **OpenAI (ChatGPT)**: https://platform.openai.com/api-keys
- **Google (Gemini)**: https://makersuite.google.com/app/apikey
- **xAI (Grok)**: https://x.ai/api
- **Anthropic (Claude)**: https://console.anthropic.com/

### 3. Run the Application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the game.

## How It Works

1. **Select AI Models**: Choose 2-4 AI models to compete (ChatGPT, Gemini, Grok, Claude Sonnet)
2. **Configure Settings**: Set starting chips, blinds, and maximum hands
3. **Watch Live**: See AI models play poker in real-time on a beautiful poker table
4. **Track Performance**: View real-time statistics, rankings, and detailed metrics

## Game Features

- **Real-time Visualization**: Players positioned around a circular poker table
- **Action Animations**: See each AI's decisions with animated notifications
- **Community Cards**: Watch the flop, turn, and river cards appear
- **Betting Rounds**: Full pre-flop, flop, turn, and river betting
- **Hand Evaluation**: Automatic hand ranking and winner determination
- **Statistics Dashboard**: Win rates, chip counts, action breakdowns, and more

## Notes

- AI models make decisions based on their hand, community cards, pot odds, and game state
- Each model receives the same information and makes independent decisions
- Games run automatically with a 1.5 second delay between actions for visualization
- Models without API keys will default to folding (you can still test with available models)


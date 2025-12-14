# Poker X402 - Project Description

## Overview

Poker X402 is a cutting-edge web3 poker platform that combines AI-powered gameplay with Solana blockchain technology. The platform enables AI models (ChatGPT, Gemini, Grok, Claude Sonnet) to compete in Texas Hold'em poker games while allowing users to place bets on players using Solana smart contracts. The system features automatic micropayments between AI agents using the x402 protocol, creating a fully autonomous and decentralized gaming experience.

## Core Features

### 1. AI-Powered Poker Gameplay
- **Multiple AI Models**: Supports ChatGPT (GPT-4), Google Gemini, xAI Grok, and Anthropic Claude Sonnet
- **Real-time Decision Making**: AI models make strategic decisions based on hand strength, pot odds, and game state
- **Full Texas Hold'em Rules**: Complete implementation with pre-flop, flop, turn, and river betting rounds
- **Hand Evaluation**: Automatic hand ranking and winner determination
- **Simulator Mode**: Strategy-based AI models when API keys aren't configured

### 2. Real-time Game Experience
- **Live Visualization**: Beautiful circular poker table with players positioned around it
- **Supabase Realtime**: Instant game state updates via WebSocket connections
- **Action Animations**: Visual feedback for each player's decisions
- **Community Cards**: Animated flop, turn, and river card reveals
- **Chip Animations**: Smooth counting animations for bet amounts and pot distribution

### 3. Solana Blockchain Integration

#### Smart Contract Betting
- **On-chain Lobbies**: Create betting lobbies stored on Solana blockchain
- **Escrow System**: Secure bet management through smart contract escrow
- **Automatic Payouts**: Winners receive payouts automatically after game completion
- **Bet Tracking**: Real-time bet display and history

#### x402 Micropayments
- **Agent-to-Agent Payments**: AI agents automatically pay each other using x402 protocol
- **Chip-to-SOL Conversion**: Automatic conversion of game chips to SOL
- **Transaction History**: Complete record of all x402 payments
- **Real-time Updates**: Live transaction feed in the game interface

### 4. User Interface

#### Game Board
- **Circular Poker Table**: Intuitive visual representation of the game
- **Player Cards**: Individual player positions with chips, cards, and status
- **Community Cards**: Central card display for flop, turn, and river
- **Pot Display**: Real-time pot amount with distribution animations
- **Action Indicators**: Visual feedback for player actions (fold, call, raise)

#### Betting Interface
- **Player Selection**: Choose which AI player to bet on
- **Bet Amount**: Set custom bet amounts in SOL
- **Wallet Integration**: Connect Phantom or other Solana wallets
- **Bet History**: View all active and completed bets
- **Live Updates**: Real-time bet totals and status

#### Statistics & Analytics
- **Player Statistics**: Win rates, chip counts, and performance metrics
- **Game History**: Complete record of all hands and outcomes
- **Rankings**: Leaderboard showing player standings
- **Transaction Log**: Full x402 payment history

### 5. Technical Architecture

#### Frontend
- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Modern, responsive styling
- **Real-time Updates**: Supabase Realtime for WebSocket connections
- **Wallet Integration**: Solana Wallet Adapter for seamless wallet connections

#### Backend
- **API Routes**: Next.js API routes for server-side logic
- **PostgreSQL Database**: Persistent storage for game state, transactions, and user data
- **Supabase**: Database and real-time infrastructure
- **Game Manager**: Centralized game logic and state management

#### Blockchain
- **Solana Smart Contracts**: Anchor framework for on-chain betting logic
- **x402 Protocol**: Micropayment system for agent transactions
- **Program Derived Addresses (PDAs)**: Secure account management
- **Transaction Management**: Robust error handling and retry logic

## Game Flow

1. **Lobby Creation**
   - User creates a game lobby with selected AI models
   - Payment required via x402 (1$ = 1000 chips per player)
   - Smart contract lobby created on-chain
   - Funds distributed to agent wallets

2. **Game Start**
   - AI models are initialized with their wallets
   - Starting chips allocated to each player
   - Game begins with automatic hand progression

3. **Hand Progression**
   - Pre-flop: Initial betting round
   - Flop: Three community cards revealed
   - Turn: Fourth community card revealed
   - River: Final community card revealed
   - Showdown: Hand evaluation and winner determination

4. **Betting (During Game)**
   - Users can place bets on players via smart contract
   - Bets are stored in escrow
   - Real-time bet totals displayed

5. **Hand Completion**
   - Winners and losers determined
   - Chips distributed to winners
   - x402 payments triggered automatically between agents
   - Transaction recorded in database

6. **Game Completion**
   - Game ends when max hands reached or one player has all chips
   - Final winner declared
   - Smart contract distributes winnings to bettors
   - Summary modal displays final statistics

## Technology Stack

### Frontend
- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- Solana Wallet Adapter

### Backend
- Next.js API Routes
- PostgreSQL
- Supabase (Database + Realtime)
- Node.js

### Blockchain
- Solana (Devnet/Testnet)
- Anchor Framework 0.32.1
- x402 Protocol
- @solana/web3.js

### AI Integration
- Vercel AI SDK
- OpenAI API (ChatGPT)
- Google AI API (Gemini)
- xAI API (Grok)
- Anthropic API (Claude)

## Key Innovations

1. **Autonomous Agent Payments**: First poker platform where AI agents automatically handle payments using blockchain technology
2. **Real-time Web3 Betting**: Live betting on AI players with on-chain escrow and automatic payouts
3. **Hybrid AI System**: Seamless integration of real AI APIs with strategy-based simulators
4. **Micropayment Integration**: x402 protocol enables efficient small-value transactions between agents
5. **Full Game Lifecycle**: Complete implementation from lobby creation to final payout distribution

## Use Cases

- **AI Model Evaluation**: Compare performance of different AI models in strategic gameplay
- **Web3 Gaming**: Demonstrate blockchain integration in gaming applications
- **Micropayment Research**: Showcase x402 protocol for automated payments
- **Real-time Applications**: Example of Supabase Realtime for live updates
- **Smart Contract Development**: Reference implementation for Solana betting contracts

## Future Enhancements

- Multi-table tournaments
- Custom AI model integration
- NFT rewards for winners
- Cross-chain support
- Mobile app version
- Advanced analytics dashboard
- Social features and leaderboards


import { GameState, Player, Card, Action, GamePhase, HandEvaluation } from './types';
import { createDeck, evaluateHand, compareHands } from './cards';

export class PokerGame {
  private state: GameState;

  constructor(
    playerNames: string[],
    startingChips: number = 1000,
    smallBlind: number = 10,
    bigBlind: number = 20
  ) {
    if (playerNames.length < 2) {
      throw new Error('Need at least 2 players');
    }

    this.state = {
      phase: 'pre-flop',
      players: playerNames.map((name, index) => ({
        id: `player-${index}`,
        name,
        chips: startingChips,
        hand: [],
        isActive: true,
        isAllIn: false,
        currentBet: 0,
        totalBetThisRound: 0,
      })),
      communityCards: [],
      pot: 0,
      currentBet: 0,
      dealerIndex: 0,
      currentPlayerIndex: 0,
      round: 1,
      smallBlind,
      bigBlind,
      deck: [],
    };
  }

  getState(): GameState {
    return JSON.parse(JSON.stringify(this.state));
  }

  startHand(): void {
    // Reset for new hand
    this.state.deck = createDeck();
    this.state.communityCards = [];
    this.state.pot = 0;
    this.state.currentBet = 0;
    this.state.phase = 'pre-flop';

    // Reactivate all players who have chips (they may have folded in previous hand)
    this.state.players.forEach(player => {
      if (player.chips > 0) {
        player.isActive = true;
      }
    });

    // Deal cards to active players
    const activePlayers = this.getActivePlayers();
    activePlayers.forEach(player => {
      player.hand = [this.dealCard(), this.dealCard()];
      player.currentBet = 0;
      player.totalBetThisRound = 0;
      player.isAllIn = false;
      player.lastAction = undefined;
    });

    // Post blinds
    this.postBlinds();

    // Set current player (first to act after big blind)
    // Find the actual player index in the full players array
    if (activePlayers.length < 2) return;
    
    const bigBlindIndexInActive = (this.state.dealerIndex + 2) % activePlayers.length;
    const nextPlayerIndexInActive = (bigBlindIndexInActive + 1) % activePlayers.length;
    const nextPlayer = activePlayers[nextPlayerIndexInActive];
    
    // Find the index of this player in the full players array
    this.state.currentPlayerIndex = this.state.players.findIndex(p => p.id === nextPlayer.id);
    
    // Ensure we have a valid current player
    if (this.state.currentPlayerIndex === -1 || !this.state.players[this.state.currentPlayerIndex].isActive) {
      // Fallback: find first active player
      const firstActive = this.state.players.findIndex(p => p.isActive && p.chips > 0);
      if (firstActive !== -1) {
        this.state.currentPlayerIndex = firstActive;
      }
    }
  }

  private dealCard(): Card {
    if (this.state.deck.length === 0) {
      throw new Error('Deck is empty');
    }
    return this.state.deck.pop()!;
  }

  private postBlinds(): void {
    const activePlayers = this.getActivePlayers();
    if (activePlayers.length < 2) return;

    const smallBlindIndex = (this.state.dealerIndex + 1) % activePlayers.length;
    const bigBlindIndex = (this.state.dealerIndex + 2) % activePlayers.length;

    const smallBlindPlayer = activePlayers[smallBlindIndex];
    const bigBlindPlayer = activePlayers[bigBlindIndex];

    const smallBlindAmount = Math.min(this.state.smallBlind, smallBlindPlayer.chips);
    const bigBlindAmount = Math.min(this.state.bigBlind, bigBlindPlayer.chips);

    smallBlindPlayer.chips -= smallBlindAmount;
    smallBlindPlayer.currentBet = smallBlindAmount;
    smallBlindPlayer.totalBetThisRound = smallBlindAmount;
    this.state.pot += smallBlindAmount;

    bigBlindPlayer.chips -= bigBlindAmount;
    bigBlindPlayer.currentBet = bigBlindAmount;
    bigBlindPlayer.totalBetThisRound = bigBlindAmount;
    this.state.pot += bigBlindAmount;

    this.state.currentBet = bigBlindAmount;
  }

  makeAction(playerId: string, action: Action, amount?: number): boolean {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player || !player.isActive || player.isAllIn) {
      console.log(`[makeAction] ❌ Invalid player:`, {
        playerId,
        playerFound: !!player,
        isActive: player?.isActive,
        isAllIn: player?.isAllIn,
        chips: player?.chips
      });
      return false;
    }

    const expectedPlayerId = this.state.players[this.state.currentPlayerIndex]?.id;
    if (expectedPlayerId !== playerId) {
      console.log(`[makeAction] ❌ Wrong turn:`, {
        playerId,
        expectedPlayerId,
        currentPlayerIndex: this.state.currentPlayerIndex,
        expectedPlayerName: this.state.players[this.state.currentPlayerIndex]?.name,
        requestedPlayerName: player.name
      });
      return false;
    }

    const activePlayers = this.getActivePlayers();
    const canCheck = this.state.currentBet === player.totalBetThisRound;

    switch (action) {
      case 'fold':
        player.isActive = false;
        break;

      case 'check':
        if (!canCheck) {
          return false;
        }
        break;

      case 'call':
        const callAmount = Math.min(
          this.state.currentBet - player.totalBetThisRound,
          player.chips
        );
        player.chips -= callAmount;
        player.currentBet += callAmount;
        player.totalBetThisRound += callAmount;
        this.state.pot += callAmount;
        if (player.chips === 0) {
          player.isAllIn = true;
          // Mark as inactive for future hands (but can still win current hand)
        }
        break;

      case 'raise':
        if (!amount || amount <= this.state.currentBet - player.totalBetThisRound) {
          return false;
        }
        const raiseAmount = Math.min(amount, player.chips);
        const totalNeeded = this.state.currentBet - player.totalBetThisRound + raiseAmount;
        if (totalNeeded > player.chips) {
          return false;
        }
        player.chips -= totalNeeded;
        player.currentBet += totalNeeded;
        player.totalBetThisRound += totalNeeded;
        this.state.pot += totalNeeded;
        this.state.currentBet = player.totalBetThisRound;
        if (player.chips === 0) {
          player.isAllIn = true;
          // Mark as inactive for future hands (but can still win current hand)
        }
        break;

      case 'all-in':
        const allInAmount = player.chips;
        player.chips = 0;
        player.currentBet += allInAmount;
        player.totalBetThisRound += allInAmount;
        this.state.pot += allInAmount;
        player.isAllIn = true;
        if (player.totalBetThisRound > this.state.currentBet) {
          this.state.currentBet = player.totalBetThisRound;
        }
        break;
    }

    player.lastAction = action;

    // Move to next player
    this.moveToNextPlayer();

    // Check if betting round is complete
    if (this.isBettingRoundComplete()) {
      this.advancePhase();
    }

    return true;
  }

  private moveToNextPlayer(): void {
    const activePlayers = this.getActivePlayers();
    if (activePlayers.length <= 1) {
      this.advancePhase();
      return;
    }

    // Prevent infinite loop - track how many players we've checked
    let attempts = 0;
    const maxAttempts = this.state.players.length;
    const startIndex = this.state.currentPlayerIndex;
    
    do {
      this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.state.players.length;
      attempts++;
      
      // Safety check: if we've checked all players and none are valid, break
      if (attempts >= maxAttempts) {
        console.error(`[moveToNextPlayer] ⚠️ Could not find valid next player after ${attempts} attempts. Active players:`, 
          activePlayers.map(p => `${p.name} (${p.id})`));
        // Try to find any active player
        const firstActive = this.state.players.findIndex(p => p.isActive && !p.isAllIn && p.chips > 0);
        if (firstActive !== -1) {
          this.state.currentPlayerIndex = firstActive;
        }
        break;
      }
    } while (
      !this.state.players[this.state.currentPlayerIndex].isActive ||
      this.state.players[this.state.currentPlayerIndex].isAllIn ||
      this.state.players[this.state.currentPlayerIndex].chips === 0
    );
    
    console.log(`[moveToNextPlayer] Moved from index ${startIndex} to ${this.state.currentPlayerIndex} (${this.state.players[this.state.currentPlayerIndex]?.name})`);
  }

  private isBettingRoundComplete(): boolean {
    const activePlayers = this.getActivePlayers();
    if (activePlayers.length <= 1) return true;

    // Check if all active players have bet the same amount (or are all-in)
    const allInPlayers = activePlayers.filter(p => p.isAllIn);
    const nonAllInPlayers = activePlayers.filter(p => !p.isAllIn);

    if (nonAllInPlayers.length === 0) return true;
    if (nonAllInPlayers.length === 1) {
      // Only one non-all-in player, check if they've acted
      return nonAllInPlayers[0].lastAction !== undefined;
    }

    // All non-all-in players must have the same total bet
    const firstBet = nonAllInPlayers[0].totalBetThisRound;
    const allSameBet = nonAllInPlayers.every(p => p.totalBetThisRound === firstBet);

    // Check if all non-all-in players have acted (have a lastAction)
    const allHaveActed = nonAllInPlayers.every(p => p.lastAction !== undefined);

    return allSameBet && allHaveActed;
  }

  private advancePhase(): void {
    // Reset betting for new phase
    this.state.players.forEach(p => {
      p.currentBet = 0;
      p.totalBetThisRound = 0;
      p.lastAction = undefined;
    });
    this.state.currentBet = 0;

    const activePlayers = this.getActivePlayers();
    if (activePlayers.length <= 1) {
      this.state.phase = 'showdown';
      this.distributePot();
      return;
    }

    switch (this.state.phase) {
      case 'pre-flop':
        this.state.phase = 'flop';
        this.dealCommunityCards(3);
        break;
      case 'flop':
        this.state.phase = 'turn';
        this.dealCommunityCards(1);
        break;
      case 'turn':
        this.state.phase = 'river';
        this.dealCommunityCards(1);
        break;
      case 'river':
        this.state.phase = 'showdown';
        this.distributePot();
        return;
    }

    // Set current player to first active player after dealer
    this.state.currentPlayerIndex = (this.state.dealerIndex + 1) % this.state.players.length;
    while (
      this.state.currentPlayerIndex < this.state.players.length &&
      (!this.state.players[this.state.currentPlayerIndex].isActive ||
      this.state.players[this.state.currentPlayerIndex].isAllIn ||
      this.state.players[this.state.currentPlayerIndex].chips === 0)
    ) {
      this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.state.players.length;
    }
  }

  private dealCommunityCards(count: number): void {
    for (let i = 0; i < count; i++) {
      this.state.communityCards.push(this.dealCard());
    }
  }

  private distributePot(): void {
    const activePlayers = this.getActivePlayers();
    if (activePlayers.length === 0) {
      // No active players - still increment round and move dealer button
      this.state.dealerIndex = (this.state.dealerIndex + 1) % this.state.players.length;
      this.state.round++;
      
      // Clear all hands and community cards after pot distribution (prepare for next hand)
      this.state.players.forEach(player => {
        player.hand = [];
      });
      this.state.communityCards = [];
      this.state.phase = 'finished'; // Set phase to finished to hide cards
      return;
    }

    if (activePlayers.length === 1) {
      // Only one active player - they win the pot
      activePlayers[0].chips += this.state.pot;
      this.state.pot = 0;
      
      // Mark players with 0 chips as inactive for future hands
      this.state.players.forEach(player => {
        if (player.chips === 0) {
          player.isActive = false;
          player.isAllIn = false;
        }
      });

      // Move dealer button and increment round
      this.state.dealerIndex = (this.state.dealerIndex + 1) % this.state.players.length;
      this.state.round++;
      
      // Clear all hands and community cards after pot distribution (prepare for next hand)
      this.state.players.forEach(player => {
        player.hand = [];
      });
      this.state.communityCards = [];
      this.state.phase = 'finished'; // Set phase to finished to hide cards
      return;
    }

    // Evaluate all hands
    const evaluations = activePlayers.map(player => ({
      player,
      evaluation: evaluateHand([...player.hand, ...this.state.communityCards]),
    }));

    // Find winner(s)
    evaluations.sort((a, b) => compareHands(b.evaluation, a.evaluation));
    const winningValue = evaluations[0].evaluation.value;
    const winners = evaluations.filter(e => e.evaluation.value === winningValue);

    // Distribute pot evenly, handling remainder
    const potPerWinner = Math.floor(this.state.pot / winners.length);
    const remainder = this.state.pot % winners.length;
    
    winners.forEach((winner, index) => {
      // First winner gets any remainder chips
      const chipsToAdd = potPerWinner + (index === 0 ? remainder : 0);
      winner.player.chips += chipsToAdd;
    });
    this.state.pot = 0;

    // Mark players with 0 chips as inactive for future hands
    this.state.players.forEach(player => {
      if (player.chips === 0) {
        player.isActive = false;
        player.isAllIn = false;
      }
    });

    // Move dealer button
    this.state.dealerIndex = (this.state.dealerIndex + 1) % this.state.players.length;
    this.state.round++;
    
    // Clear all hands and community cards after pot distribution (prepare for next hand)
    this.state.players.forEach(player => {
      player.hand = [];
    });
    this.state.communityCards = [];
    this.state.phase = 'finished'; // Set phase to finished to hide cards
  }

  private getActivePlayers(): Player[] {
    return this.state.players.filter(p => p.isActive && p.chips > 0);
  }

  getCurrentPlayer(): Player | null {
    return this.state.players[this.state.currentPlayerIndex] || null;
  }

  isHandComplete(): boolean {
    return this.state.phase === 'showdown' || this.state.phase === 'finished';
  }
}


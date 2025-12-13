const { Connection, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

// Import the PokerBettingContract class
const { PokerBettingContract } = require('../lib/solana/betting-contract.ts');

// Simple Wallet implementation
class NodeWallet {
    constructor(payer) {
        this.payer = payer;
    }

    get publicKey() {
        return this.payer.publicKey;
    }

    async signTransaction(tx) {
        tx.partialSign(this.payer);
        return tx;
    }

    async signAllTransactions(txs) {
        return txs.map((t) => {
            t.partialSign(this.payer);
            return t;
        });
    }
}

async function main() {
    const gameId = process.argv[2];

    if (!gameId) {
        console.error('Usage: node test-place-bet.js <game-id>');
        console.error('Example: node test-place-bet.js anchor-cpi-fix-1765667782');
        process.exit(1);
    }

    // Load deployer wallet
    const deployerKeypairPath = path.join(__dirname, '../contracts/target/deploy/poker_betting-keypair.json');
    const deployerKeypair = Keypair.fromSecretKey(
        Buffer.from(JSON.parse(fs.readFileSync(deployerKeypairPath, 'utf-8')))
    );

    console.log('Testing Place Bet...');
    console.log('Game ID:', gameId);
    console.log('Bettor:', deployerKeypair.publicKey.toString());

    // Connect to devnet
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const wallet = new NodeWallet(deployerKeypair);

    // Create contract instance
    const contract = new PokerBettingContract(connection, wallet);

    // Check lobby exists
    try {
        const lobby = await contract.getLobby(gameId);
        if (!lobby) {
            console.error('\\n❌ Lobby not found. Please initialize it first.');
            process.exit(1);
        }
        console.log('\\n✅ Lobby found!');
        console.log('Players:', lobby.modelNames);
        console.log('Status:', Object.keys(lobby.status)[0]);
    } catch (error) {
        console.error('\\n❌ Error fetching lobby:', error.message);
        process.exit(1);
    }

    // Place bet
    const betAmount = 0.001; // 0.001 SOL
    const playerName = 'ChatGPT'; // Betting on ChatGPT

    console.log('\\n🎲 Placing bet...');
    console.log('Player:', playerName);
    console.log('Amount:', betAmount, 'SOL');

    try {
        const tx = await contract.placeBet(gameId, playerName, betAmount);

        console.log('\\n✅ Bet placed successfully!');
        console.log('Transaction:', tx);
        console.log('View on Solscan: https://solscan.io/tx/' + tx + '?cluster=devnet');

        // Get bets to verify
        const bets = await contract.getBets(gameId);
        console.log('\\nTotal bets on this lobby:', bets.length);
        const myBet = bets.find(b => b.bettor.toString() === deployerKeypair.publicKey.toString());
        if (myBet) {
            console.log('Your bet:');
            console.log('- Player:', myBet.playerName);
            console.log('- Amount:', myBet.amount, 'SOL');
            console.log('- Status:', myBet.status);
        }

    } catch (error) {
        console.error('\\n❌ Failed to place bet:', error.message);
        if (error.logs) {
            console.error('Logs:', error.logs);
        }
        process.exit(1);
    }
}

main().catch(console.error);

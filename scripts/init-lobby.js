const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } = require('@solana/web3.js');
const { AnchorProvider, Program, BN } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROGRAM_ID = new PublicKey('85kCu1ahjWTXMmgbpmrXgKNL2DxrrWusYrTYWwA68NMq');

// Minimal PokerBettingContract for initialization
class PokerBettingContract {
    constructor(connection, wallet) {
        this.connection = connection;
        this.provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

        // Load IDL
        const idlPath = path.join(process.cwd(), 'contracts', 'target', 'idl', 'poker_betting.json');
        if (!fs.existsSync(idlPath)) {
            throw new Error(`IDL not found at ${idlPath}`);
        }
        const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

        // Ensure address is set
        if (!idl.address) {
            idl.address = '85kCu1ahjWTXMmgbpmrXgKNL2DxrrWusYrTYWwA68NMq';
        }

        this.program = new Program(idl, this.provider);
    }

    async createLobby(config) {
        const [lobbyPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('lobby'), Buffer.from(config.gameId)],
            this.program.programId
        );

        const [escrowPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('escrow'), lobbyPda.toBuffer()],
            this.program.programId
        );

        console.log(`Creating lobby for Game ID: ${config.gameId}`);
        console.log(`Lobby PDA: ${lobbyPda.toString()}`);

        const tx = await this.program.methods
            .createLobby(
                config.gameId,
                config.modelNames,
                new BN(config.startingChips),
                new BN(config.smallBlind),
                new BN(config.bigBlind),
                new BN(config.maxHands)
            )
            .accounts({
                lobby: lobbyPda,
                owner: this.provider.wallet.publicKey,
                escrow: escrowPda,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        return tx;
    }
}

// Helper to load wallet
function loadWallet(keypairPath) {
    const loaded = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf8')))
    );
    return {
        publicKey: loaded.publicKey,
        signTransaction: async (tx) => { tx.partialSign(loaded); return tx; },
        signAllTransactions: async (txs) => { txs.forEach(t => t.partialSign(loaded)); return txs; }
    };
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.error('Usage: node scripts/init-lobby.js <gameId>');
        process.exit(1);
    }
    const gameId = args[0];

    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

    // Load deployer wallet
    const walletPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
    const wallet = loadWallet(walletPath);

    console.log(`Initializing Lobby "${gameId}"...`);
    console.log(`Program ID: ${PROGRAM_ID.toString()}`);
    console.log(`Wallet: ${wallet.publicKey.toString()}`);

    const contract = new PokerBettingContract(connection, wallet);

    try {
        const sig = await contract.createLobby({
            gameId,
            modelNames: ['Player1', 'Player2', 'Player3'],
            startingChips: 1000,
            smallBlind: 10,
            bigBlind: 20,
            maxHands: 100
        });
        console.log(`Success! Lobby initialized.`);
        console.log(`Signature: ${sig}`);
    } catch (err) {
        console.error('Error creating lobby:', err);
    }
}

main();

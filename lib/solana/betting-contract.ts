import { Program, AnchorProvider, BN, Idl } from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, Transaction, TransactionInstruction } from '@solana/web3.js';
import { createHash } from 'crypto';
import { Buffer } from 'buffer';

// Define Wallet interface for compatibility
interface Wallet {
  publicKey: PublicKey;
  signTransaction: (tx: any) => Promise<any>;
  signAllTransactions: (txs: any[]) => Promise<any[]>;
}

/**
 * Generate account discriminator (8-byte array) from account name
 * Anchor uses SHA256('account:' + name) and takes first 8 bytes
 */
function generateAccountDiscriminator(name: string): number[] {
  const preimage = 'account:' + name;
  const hash = createHash('sha256').update(preimage).digest();
  return Array.from(hash.slice(0, 8));
}

// Debug Deployment
export const PROGRAM_ID = new PublicKey('85kCu1ahjWTXMmgbpmrXgKNL2DxrrWusYrTYWwA68NMq');

// IDL will be generated after building the Anchor program
// For now, we'll use a dynamic import or fetch
async function getIdl(): Promise<Idl | null> {
  try {
    // Try to load from generated IDL
    // Use require for Node.js environments, dynamic import for browser
    if (typeof window === 'undefined') {
      // Server-side: use require with path resolution
      const path = require('path');
      const fs = require('fs');
      const idlPath = path.join(process.cwd(), 'contracts', 'target', 'idl', 'poker_betting.json');
      if (fs.existsSync(idlPath)) {
        const idlContent = fs.readFileSync(idlPath, 'utf-8');
        return JSON.parse(idlContent) as Idl;
      }
      return null;
    } else {
      // Client-side: use fetch from public/idl symlink
      const response = await fetch('/idl/poker_betting.json');
      if (response.ok) {
        return await response.json() as Idl;
      }
      return null;
    }
  } catch (error) {
    // IDL not found - will need to build the program first
    console.warn('IDL not found. Build the Anchor program first: anchor build', error);
    return null;
  }
}

export interface LobbyConfig {
  gameId: string;
  modelNames: string[];
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  maxHands: number;
}

export interface BetInfo {
  bettor: PublicKey;
  playerName: string;
  amount: number;
  placedAt: number;
  status: 'Active' | 'Paid' | 'Refunded';
}

export class PokerBettingContract {
  private program: Program;
  private connection: Connection;
  // Expose program for debugging (read-only access)
  get programInstance(): Program {
    return this.program;
  }
  private provider: AnchorProvider;

  constructor(connection: Connection, wallet: Wallet, programIdl?: Idl) {
    this.connection = connection;
    this.provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    });

    // Use provided IDL or try to load it
    if (programIdl) {
      try {
        // Clean and validate IDL before using it
        const cleanedIdl = this.cleanIdl(programIdl);

        // Ensure metadata.address is a string, not undefined
        if (!cleanedIdl.metadata || !cleanedIdl.metadata.address) {
          cleanedIdl.metadata = { address: PROGRAM_ID.toString() };
        }

        // If IDL has metadata.address, use it; otherwise use PROGRAM_ID
        // CRITICAL: programId MUST be a PublicKey object, not a string or undefined
        let programId: PublicKey = PROGRAM_ID;
        const metadataAddress = (cleanedIdl.metadata as any)?.address;
        if (metadataAddress && typeof metadataAddress === 'string' && metadataAddress.length > 0) {
          try {
            const idlAddress = new PublicKey(metadataAddress);
            // Verify it matches our PROGRAM_ID
            if (!idlAddress.equals(PROGRAM_ID)) {
              console.warn(`[PokerBettingContract] IDL address (${idlAddress.toString()}) does not match PROGRAM_ID (${PROGRAM_ID.toString()})`);
            }
            programId = idlAddress;
          } catch (error) {
            console.warn('[PokerBettingContract] Failed to parse IDL metadata address, using PROGRAM_ID');
            programId = PROGRAM_ID; // Ensure it's set
          }
        }

        // Final validation: programId MUST be a PublicKey instance
        if (!(programId instanceof PublicKey)) {
          console.error('[PokerBettingContract] programId is not a PublicKey instance:', typeof programId, programId);
          programId = PROGRAM_ID;
        }

        // Log the cleaned IDL structure for debugging
        console.log('[PokerBettingContract] Creating Program with:', {
          hasMetadata: !!cleanedIdl.metadata,
          metadataAddress: cleanedIdl.metadata?.address,
          programId: programId.toString(),
          programIdType: programId instanceof PublicKey ? 'PublicKey' : typeof programId,
          instructionsCount: cleanedIdl.instructions?.length,
          accountsCount: cleanedIdl.accounts?.length,
        });

        // Program constructor: Program(idl, programId, provider)
        // Anchor 0.32.1 requires explicit programId as second parameter
        // The issue is that Anchor's translateAddress tries to process undefined addresses
        // We need to ensure the IDL is completely clean before passing it
        try {
          // Create a completely sanitized IDL copy
          const sanitizedIdl = JSON.parse(JSON.stringify(cleanedIdl));

          // CRITICAL FIX: Always use the hardcoded PROGRAM_ID to prevent stale IDL cache issues
          // Anchor 0.32.1 uses idl.address for the program ID
          sanitizedIdl.address = PROGRAM_ID.toString();

          // Update metadata address as well to be consistent
          if (!sanitizedIdl.metadata) {
            sanitizedIdl.metadata = {};
          }
          sanitizedIdl.metadata.address = PROGRAM_ID.toString();

          // Also ensure metadata.address exists for compatibility
          if (!sanitizedIdl.metadata) {
            sanitizedIdl.metadata = {};
          }
          if (!sanitizedIdl.metadata.address || typeof sanitizedIdl.metadata.address !== 'string') {
            sanitizedIdl.metadata.address = programId.toString();
          }

          // Remove any potential address fields from account definitions that might cause issues
          // Anchor's translateAddress will fail if it encounters undefined addresses
          // CRITICAL: Preserve instruction structure completely - Anchor needs all fields
          if (sanitizedIdl.instructions && Array.isArray(sanitizedIdl.instructions)) {
            sanitizedIdl.instructions = sanitizedIdl.instructions.map((ix: any) => {
              // Start with a copy of the original instruction to preserve all fields
              const cleanedIx: any = JSON.parse(JSON.stringify(ix));

              // Only clean accounts - remove address fields
              if (cleanedIx.accounts && Array.isArray(cleanedIx.accounts)) {
                cleanedIx.accounts = cleanedIx.accounts.map((acc: any) => {
                  // Remove address field if it exists - Anchor will resolve it
                  const cleaned = { ...acc };
                  delete cleaned.address;
                  // Ensure only valid fields remain
                  return {
                    name: cleaned.name || '',
                    isMut: cleaned.isMut !== undefined ? cleaned.isMut : false,
                    isSigner: cleaned.isSigner !== undefined ? cleaned.isSigner : false,
                  };
                });
              }

              // CRITICAL: Preserve args exactly as they are - don't modify them at all
              // Anchor's encoder needs the exact structure from the IDL
              // Just ensure args array exists (even if empty)
              if (!cleanedIx.args) {
                cleanedIx.args = [];
              }

              // Validate args structure but don't modify
              if (cleanedIx.args && Array.isArray(cleanedIx.args)) {
                cleanedIx.args.forEach((arg: any, idx: number) => {
                  if (!arg || typeof arg !== 'object') {
                    console.error(`[PokerBettingContract] Invalid arg at index ${idx} in instruction ${ix.name}:`, arg);
                    throw new Error(`Invalid argument at index ${idx} in instruction ${ix.name}: ${JSON.stringify(arg)}`);
                  }
                  if (!arg.name) {
                    console.error(`[PokerBettingContract] Missing name for arg at index ${idx} in instruction ${ix.name}`);
                    throw new Error(`Missing name for argument at index ${idx} in instruction ${ix.name}`);
                  }
                  if (arg.type === undefined || arg.type === null) {
                    console.error(`[PokerBettingContract] Missing type for arg ${arg.name} in instruction ${ix.name}`);
                    throw new Error(`Missing type for argument ${arg.name} in instruction ${ix.name}`);
                  }
                });
              }

              return cleanedIx;
            });
          }

          // Also clean account type definitions - remove any address fields from nested types
          // CRITICAL: Anchor 0.32.1's BorshAccountsCoder looks for account types in the types array
          // So we need to add account structs to the types array
          // CRITICAL: Accounts need discriminators for Anchor to work
          if (sanitizedIdl.accounts && Array.isArray(sanitizedIdl.accounts)) {
            sanitizedIdl.accounts = sanitizedIdl.accounts.map((acc: any) => {
              const cleaned = JSON.parse(JSON.stringify(acc));
              // Add discriminator if missing (required by Anchor)
              if (!cleaned.discriminator && cleaned.name) {
                cleaned.discriminator = generateAccountDiscriminator(cleaned.name);
              }
              // Recursively remove address fields from type definitions
              const removeAddresses = (obj: any): any => {
                if (Array.isArray(obj)) {
                  return obj.map(removeAddresses);
                } else if (obj && typeof obj === 'object') {
                  const result: any = {};
                  for (const key in obj) {
                    if (key !== 'address') {
                      result[key] = removeAddresses(obj[key]);
                    }
                  }
                  return result;
                }
                return obj;
              };
              if (cleaned.type) {
                cleaned.type = removeAddresses(cleaned.type);
              }
              return cleaned;
            });

            // CRITICAL FIX: Add account structs to types array (Anchor 0.32.1 requirement)
            // BorshAccountsCoder looks for account types in the types array, not just accounts array
            // CRITICAL: Normalize enum types first, then add account types
            // This ensures enum types are available when processing account types
            if (!sanitizedIdl.types) {
              sanitizedIdl.types = [];
            }
            // First, normalize existing enum types
            const normalizedEnumTypes = sanitizedIdl.types.map((t: any) => ({
              name: t.name,
              type: this.normalizeType(JSON.parse(JSON.stringify(t.type || t)))
            }));
            sanitizedIdl.types = [...normalizedEnumTypes];

            // Then add account types to types array if they don't already exist
            sanitizedIdl.accounts.forEach((acc: any) => {
              const typeExists = sanitizedIdl.types.some((t: any) => t.name === acc.name);
              if (!typeExists && acc.type) {
                // Deep clone and normalize the type (publicKey -> pubkey, defined string -> defined object)
                const normalizedType = this.normalizeType(JSON.parse(JSON.stringify(acc.type)));
                sanitizedIdl.types.push({
                  name: acc.name,
                  type: normalizedType,
                  discriminator: acc.discriminator // Include discriminator in type definition
                });
              }
            });
          }

          // Clean types array as well
          if (sanitizedIdl.types && Array.isArray(sanitizedIdl.types)) {
            sanitizedIdl.types = sanitizedIdl.types.map((type: any) => {
              const cleaned = JSON.parse(JSON.stringify(type));
              // Recursively remove address fields
              const removeAddresses = (obj: any): any => {
                if (Array.isArray(obj)) {
                  return obj.map(removeAddresses);
                } else if (obj && typeof obj === 'object') {
                  const result: any = {};
                  for (const key in obj) {
                    if (key !== 'address') {
                      result[key] = removeAddresses(obj[key]);
                    }
                  }
                  return result;
                }
                return obj;
              };
              return removeAddresses(cleaned);
            });
          }

          // Final check: ensure programId is valid before creating Program
          if (!programId || !(programId instanceof PublicKey)) {
            throw new Error('Invalid programId: must be a PublicKey instance');
          }

          // Debug: Log placeBet instruction structure before creating Program
          const placeBetIxBefore = sanitizedIdl.instructions?.find((ix: any) => ix.name === 'placeBet');
          console.log('[PokerBettingContract] placeBet instruction BEFORE Program creation:', {
            exists: !!placeBetIxBefore,
            name: placeBetIxBefore?.name,
            argsCount: placeBetIxBefore?.args?.length,
            args: placeBetIxBefore?.args?.map((arg: any) => ({
              name: arg.name,
              type: arg.type,
              typeString: typeof arg.type === 'string' ? arg.type : JSON.stringify(arg.type),
            })),
          });

          console.log('[PokerBettingContract] Attempting to create Program with sanitized IDL');
          console.log('[PokerBettingContract] Program ID validation:', {
            programIdString: programId.toString(),
            idlAddress: sanitizedIdl.address,
            addressesMatch: sanitizedIdl.address === programId.toString(),
          });

          // CRITICAL: Anchor 0.32.1 constructor is Program(idl, provider)
          // Anchor derives programId from idl.address, NOT from a parameter
          // So we MUST ensure idl.address is set correctly
          // NOTE: There's a known bug in Anchor 0.32.1 with enum types in instruction args
          // that causes "Type not found: status" error. We'll proactively remove the problematic instruction.
          // PROACTIVE WORKAROUND: Remove updateLobbyStatus before creating Program
          // This instruction has an enum type argument that causes Anchor 0.32.1 to fail
          const hasUpdateLobbyStatus = sanitizedIdl.instructions?.some((ix: any) => ix.name === 'updateLobbyStatus');
          if (hasUpdateLobbyStatus) {
            console.warn('[PokerBettingContract] Proactively removing updateLobbyStatus to avoid Anchor 0.32.1 enum type bug');
            sanitizedIdl.instructions = sanitizedIdl.instructions.filter(
              (ix: any) => ix.name !== 'updateLobbyStatus'
            );
          }

          try {
            this.program = new Program(sanitizedIdl as any, this.provider);
            console.log('[PokerBettingContract] ✅ Successfully created Program');
            console.log('[PokerBettingContract] Program ID:', this.program.programId?.toString());
            console.log('[PokerBettingContract] Program methods:', this.program.methods ? Object.keys(this.program.methods) : 'methods not available');
            console.log('[PokerBettingContract] IDL instructions:', sanitizedIdl.instructions?.map((ix: any) => ix.name));

            // Debug: Log placeBet instruction structure AFTER Program creation
            const programIdl = (this.program as any).idl;
            const placeBetIxAfter = programIdl?.instructions?.find((ix: any) => ix.name === 'placeBet');
            console.log('[PokerBettingContract] placeBet instruction AFTER Program creation:', {
              exists: !!placeBetIxAfter,
              name: placeBetIxAfter?.name,
              argsCount: placeBetIxAfter?.args?.length,
              args: placeBetIxAfter?.args?.map((arg: any) => ({
                name: arg.name,
                type: arg.type,
                typeString: typeof arg.type === 'string' ? arg.type : JSON.stringify(arg.type),
              })),
            });

            // Validate programId is set
            if (!this.program.programId) {
              console.error('[PokerBettingContract] ❌ Program ID is undefined after Program creation');
              console.error('[PokerBettingContract] IDL address:', sanitizedIdl.address);
              throw new Error('Program ID is undefined. The IDL address may not be set correctly.');
            }
          } catch (programError: any) {
            // Fallback: Check if it's the enum type bug (in case proactive removal didn't work)
            const errorMessage = programError.message || String(programError);
            if (errorMessage.includes('Type not found') || errorMessage.includes('status')) {
              console.warn('[PokerBettingContract] Anchor 0.32.1 enum type bug detected. Using workaround...');
              // Workaround: Create a modified IDL that removes the problematic instruction
              const workaroundIdl = JSON.parse(JSON.stringify(sanitizedIdl));
              workaroundIdl.instructions = workaroundIdl.instructions.filter(
                (ix: any) => ix.name !== 'updateLobbyStatus'
              );
              this.program = new Program(workaroundIdl as any, this.provider);
              console.log('[PokerBettingContract] Created Program with workaround (updateLobbyStatus removed)');
            } else {
              throw programError;
            }
          }
        } catch (error1: any) {
          console.error('[PokerBettingContract] Failed to create Program:', error1.message);
          console.error('[PokerBettingContract] Error details:', {
            message: error1.message,
            stack: error1.stack?.substring(0, 500),
          });

          // Last resort: try with minimal IDL structure
          try {
            const minimalIdl = {
              version: cleanedIdl.version || '0.1.0',
              name: cleanedIdl.name || 'poker_betting',
              address: programId.toString(), // CRITICAL: Anchor 0.32.1 requires top-level address
              metadata: { address: programId.toString() },
              instructions: cleanedIdl.instructions || [],
              accounts: cleanedIdl.accounts || [],
              types: [
                // CRITICAL: Normalize enum types first, then add account types
                // This ensures enum types are available when processing account types
                // Preserve enum structure, only normalize nested field types
                ...(cleanedIdl.types || []).map((t: any) => {
                  const cloned = JSON.parse(JSON.stringify(t));
                  // Only normalize if it's a struct with fields that might have publicKey
                  if (cloned.type && cloned.type.kind === 'struct' && cloned.type.fields) {
                    cloned.type.fields = cloned.type.fields.map((f: any) => ({
                      ...f,
                      type: this.normalizeType(f.type)
                    }));
                  }
                  // For enums, preserve the structure
                  return cloned;
                }),
                // Then add account structs to types array (Anchor 0.32.1 requirement)
                // Normalize types (publicKey -> pubkey, defined string -> defined object)
                // CRITICAL: Add discriminators to account types
                ...(cleanedIdl.accounts || []).map((acc: any) => {
                  const discriminator = acc.discriminator || generateAccountDiscriminator(acc.name);
                  return {
                    name: acc.name,
                    type: this.normalizeType(JSON.parse(JSON.stringify(acc.type))),
                    discriminator
                  };
                })
              ],
            };
            console.log('[PokerBettingContract] Trying with minimal IDL structure');
            // Anchor 0.32.1: Program(idl, provider) - programId comes from idl.address
            // PROACTIVE WORKAROUND: Remove updateLobbyStatus before creating Program
            const hasUpdateLobbyStatusMinimal = minimalIdl.instructions?.some((ix: any) => ix.name === 'updateLobbyStatus');
            if (hasUpdateLobbyStatusMinimal) {
              console.warn('[PokerBettingContract] Proactively removing updateLobbyStatus from minimal IDL');
              minimalIdl.instructions = minimalIdl.instructions.filter(
                (ix: any) => ix.name !== 'updateLobbyStatus'
              );
            }

            try {
              this.program = new Program(minimalIdl as any, this.provider);
              console.log('[PokerBettingContract] Successfully created Program with minimal IDL');
            } catch (minimalError: any) {
              // Fallback workaround
              const errorMessage = minimalError.message || String(minimalError);
              if (errorMessage.includes('Type not found') || errorMessage.includes('status')) {
                console.warn('[PokerBettingContract] Anchor 0.32.1 enum type bug in minimal IDL. Applying workaround...');
                const workaroundMinimalIdl = JSON.parse(JSON.stringify(minimalIdl));
                workaroundMinimalIdl.instructions = workaroundMinimalIdl.instructions.filter(
                  (ix: any) => ix.name !== 'updateLobbyStatus'
                );
                this.program = new Program(workaroundMinimalIdl as any, this.provider);
                console.log('[PokerBettingContract] Created Program with minimal IDL workaround');
              } else {
                throw minimalError;
              }
            }
          } catch (error2: any) {
            console.error('[PokerBettingContract] All attempts failed:', error2.message);
            throw new Error(`Failed to create Program after all attempts: ${error2.message}`);
          }
        }
      } catch (error: any) {
        console.error('[PokerBettingContract] Failed to create Program with provided IDL:', error);
        console.error('[PokerBettingContract] Error stack:', error.stack);
        throw new Error(`Failed to create Program: ${error.message}`);
      }
    } else {
      // Try to load IDL synchronously first (server-side)
      let loadedIdl: Idl | null = null;
      if (typeof window === 'undefined') {
        try {
          const path = require('path');
          const fs = require('fs');
          const idlPath = path.join(process.cwd(), 'contracts', 'target', 'idl', 'poker_betting.json');
          if (fs.existsSync(idlPath)) {
            const idlContent = fs.readFileSync(idlPath, 'utf-8');
            loadedIdl = JSON.parse(idlContent) as Idl;
          }
        } catch (error) {
          // Ignore errors, will use placeholder
          console.warn('[PokerBettingContract] Failed to load IDL:', error);
        }
      }

      if (loadedIdl) {
        try {
          // Use IDL metadata address if available
          let programId = PROGRAM_ID;
          if (loadedIdl.metadata && (loadedIdl.metadata as any).address) {
            try {
              programId = new PublicKey((loadedIdl.metadata as any).address);
            } catch (error) {
              console.warn('[PokerBettingContract] Failed to parse IDL metadata address, using PROGRAM_ID');
            }
          }
          // Ensure loadedIdl has top-level address field
          if (!loadedIdl.address || typeof loadedIdl.address !== 'string') {
            loadedIdl.address = programId.toString();
          }
          // CRITICAL FIX: Add account structs to types array (Anchor 0.32.1 requirement)
          // CRITICAL: Normalize enum types first, then add account types
          if (loadedIdl.accounts && Array.isArray(loadedIdl.accounts)) {
            if (!loadedIdl.types) {
              loadedIdl.types = [];
            }
            // First, normalize existing enum types
            // CRITICAL: Preserve the exact structure of enum types, only normalize nested field types
            const normalizedEnumTypes = loadedIdl.types.map((t: any) => {
              const cloned = JSON.parse(JSON.stringify(t));
              // Only normalize if it's a struct with fields that might have publicKey
              if (cloned.type && cloned.type.kind === 'struct' && cloned.type.fields) {
                cloned.type.fields = cloned.type.fields.map((f: any) => ({
                  ...f,
                  type: this.normalizeType(f.type)
                }));
              }
              // For enums, don't normalize the enum structure itself
              return cloned;
            });
            loadedIdl.types = [...normalizedEnumTypes];

            // Then add account types
            loadedIdl.accounts.forEach((acc: any) => {
              const typeExists = (loadedIdl.types || []).some((t: any) => t.name === acc.name);
              if (!typeExists && acc.type) {
                // Normalize type (publicKey -> pubkey, defined string -> defined object)
                const normalizedType = this.normalizeType(JSON.parse(JSON.stringify(acc.type)));
                if (!loadedIdl.types) {
                  loadedIdl.types = [];
                }
                loadedIdl.types.push({
                  name: acc.name,
                  type: normalizedType
                });
              }
            });
          }
          // Anchor 0.32.1: Program(idl, provider)
          // PROACTIVE WORKAROUND: Remove updateLobbyStatus before creating Program
          const hasUpdateLobbyStatusLoaded = loadedIdl.instructions?.some((ix: any) => ix.name === 'updateLobbyStatus');
          if (hasUpdateLobbyStatusLoaded) {
            console.warn('[PokerBettingContract] Proactively removing updateLobbyStatus from loaded IDL');
            loadedIdl.instructions = loadedIdl.instructions.filter(
              (ix: any) => ix.name !== 'updateLobbyStatus'
            );
          }

          try {
            this.program = new Program(loadedIdl as any, this.provider);
          } catch (programError: any) {
            // Fallback workaround
            const errorMessage = programError.message || String(programError);
            if (errorMessage.includes('Type not found') || errorMessage.includes('status')) {
              console.warn('[PokerBettingContract] Anchor 0.32.1 enum type bug detected. Using workaround...');
              const workaroundIdl = JSON.parse(JSON.stringify(loadedIdl));
              workaroundIdl.instructions = workaroundIdl.instructions.filter(
                (ix: any) => ix.name !== 'updateLobbyStatus'
              );
              this.program = new Program(workaroundIdl as any, this.provider);
              console.log('[PokerBettingContract] Created Program with workaround (updateLobbyStatus removed)');
            } else {
              throw programError;
            }
          }
        } catch (error: any) {
          console.error('[PokerBettingContract] Failed to create Program with loaded IDL:', error);
          throw new Error(`Failed to create Program: ${error.message}`);
        }
      } else {
        // IDL not found - throw error for server-side, try async load for client-side
        if (typeof window === 'undefined') {
          throw new Error('IDL not found. Please build the Anchor program: anchor build');
        } else {
          // Client-side: IDL must be provided explicitly
          // Do NOT use placeholder - it causes "placeBet is not a function" errors
          throw new Error('IDL must be provided on client-side. Please load the IDL first (e.g., via fetch) and pass it to the constructor.');

          // OLD CODE: async loading with placeholder (removed - causes issues)
          /*
          const placeholderIdl: Idl = {
            version: '0.1.0',
            name: 'poker_betting',
            instructions: [],
            accounts: [],
            types: [],
          };
          placeholderIdl.address = PROGRAM_ID.toString();
          this.program = new Program(placeholderIdl as any, this.provider);
          
          getIdl().then(idl => {
            if (idl) {
              try {
                let programId = PROGRAM_ID;
                if (idl.metadata && (idl.metadata as any).address) {
                  programId = new PublicKey((idl.metadata as any).address);
                }
                // Ensure async-loaded IDL has top-level address
                if (!idl.address || typeof idl.address !== 'string') {
                  idl.address = programId.toString();
                }
                // CRITICAL FIX: Add account structs to types array (Anchor 0.32.1 requirement)
                // CRITICAL: Normalize enum types first, then add account types
                // CRITICAL: Accounts need discriminators
                if (idl.accounts && Array.isArray(idl.accounts)) {
                  if (!idl.types) {
                    idl.types = [];
                  }
                  // First, normalize existing enum types
                  // CRITICAL: Preserve the exact structure of enum types, only normalize nested field types
                  const normalizedEnumTypes = (idl.types || []).map((t: any) => {
                    const cloned = JSON.parse(JSON.stringify(t));
                    // Only normalize if it's a struct with fields that might have publicKey
                    if (cloned.type && cloned.type.kind === 'struct' && cloned.type.fields) {
                      cloned.type.fields = cloned.type.fields.map((f: any) => ({
                        ...f,
                        type: this.normalizeType(f.type)
                      }));
                    }
                    // For enums, don't normalize the enum structure itself
                    return cloned;
                  });
                  idl.types = [...normalizedEnumTypes];
                  
                  // Add discriminators to accounts if missing
                  idl.accounts = idl.accounts.map((acc: any) => {
                    if (!acc.discriminator && acc.name) {
                      acc.discriminator = generateAccountDiscriminator(acc.name);
                    }
                    return acc;
                  });
                  
                  // Then add account types
                  idl.accounts.forEach((acc: any) => {
                    const typeExists = (idl.types || []).some((t: any) => t.name === acc.name);
                    if (!typeExists && acc.type) {
                      // Normalize type (publicKey -> pubkey, defined string -> defined object)
                      const normalizedType = this.normalizeType(JSON.parse(JSON.stringify(acc.type)));
                      if (!idl.types) {
                        idl.types = [];
                      }
                      idl.types.push({
                        name: acc.name,
                        type: normalizedType,
                        discriminator: acc.discriminator
                      });
                    }
                  });
                }
                // PROACTIVE WORKAROUND: Remove updateLobbyStatus before creating Program
                const hasUpdateLobbyStatusAsync = idl.instructions?.some((ix: any) => ix.name === 'updateLobbyStatus');
                if (hasUpdateLobbyStatusAsync) {
                  console.warn('[PokerBettingContract] Proactively removing updateLobbyStatus from async IDL');
                  idl.instructions = idl.instructions.filter(
                    (ix: any) => ix.name !== 'updateLobbyStatus'
                  );
                }
                // Anchor 0.32.1: Program(idl, provider)
                try {
                  this.program = new Program(idl as any, this.provider);
                } catch (asyncError: any) {
                  // Fallback workaround
                  const errorMessage = asyncError.message || String(asyncError);
                  if (errorMessage.includes('Type not found') || errorMessage.includes('status')) {
                    console.warn('[PokerBettingContract] Anchor 0.32.1 enum type bug in async IDL. Applying workaround...');
                    const workaroundAsyncIdl = JSON.parse(JSON.stringify(idl));
                    workaroundAsyncIdl.instructions = workaroundAsyncIdl.instructions.filter(
                      (ix: any) => ix.name !== 'updateLobbyStatus'
                    );
                    this.program = new Program(workaroundAsyncIdl as any, this.provider);
                    console.log('[PokerBettingContract] Created Program with async IDL workaround');
                  } else {
                    console.error('[PokerBettingContract] Failed to create Program with async-loaded IDL:', asyncError);
                  }
                }
              } catch (error) {
                console.error('[PokerBettingContract] Failed to create Program with async-loaded IDL:', error);
              }
            }
          }).catch(() => {
            // Ignore errors
          });
          */
        }
      }
    }
  }

  /**
   * Normalize type definitions to match Anchor's expectations
   * Converts "publicKey" to "pubkey" as Anchor expects
   * Converts { defined: "TypeName" } to { defined: { name: "TypeName" } } as Anchor 0.32.1 expects
   * IMPORTANT: Simple types like "string", "u64", "i64", etc. should be left as-is
   */
  private normalizeType(type: any): any {
    if (typeof type === 'string') {
      // Anchor expects "pubkey" not "publicKey"
      if (type === 'publicKey') return 'pubkey';
      // For simple types (string, u64, i64, bool, etc.), return as-is
      // These don't need normalization
      return type;
    }
    if (typeof type === 'object' && type !== null) {
      if (Array.isArray(type)) {
        return type.map((t: any) => this.normalizeType(t));
      }
      const normalized: any = {};
      for (const key in type) {
        // CRITICAL FIX: Anchor 0.32.1 expects defined types as { defined: { name: "TypeName" } }
        // but IDL has { defined: "TypeName" } (string)
        if (key === 'defined' && typeof type[key] === 'string') {
          normalized[key] = { name: type[key] };
        } else {
          normalized[key] = this.normalizeType(type[key]);
        }
      }
      return normalized;
    }
    return type;
  }

  /**
   * Clean IDL to remove any undefined values that might cause issues
   */
  private cleanIdl(idl: any): any {
    // Deep clone to avoid mutating the original
    const cleaned = JSON.parse(JSON.stringify(idl));

    // CRITICAL: Anchor 0.32.1 requires a top-level `address` field in the IDL
    // The Program constructor does: `this._programId = translateAddress(idl.address);`
    // So we MUST have `idl.address`, not just `idl.metadata.address`
    if (!cleaned.address || typeof cleaned.address !== 'string') {
      // Try to get it from metadata.address first
      const addressFromMetadata = cleaned.metadata?.address;
      if (addressFromMetadata && typeof addressFromMetadata === 'string') {
        cleaned.address = addressFromMetadata;
      } else {
        cleaned.address = PROGRAM_ID.toString();
      }
    }

    // Also ensure metadata.address exists for compatibility
    if (!cleaned.metadata) {
      cleaned.metadata = { address: cleaned.address || PROGRAM_ID.toString() };
    } else {
      if (!cleaned.metadata.address || typeof cleaned.metadata.address !== 'string') {
        cleaned.metadata.address = cleaned.address || PROGRAM_ID.toString();
      }
    }

    // Clean instructions - remove any undefined/null accounts and ensure all fields are valid
    if (cleaned.instructions && Array.isArray(cleaned.instructions)) {
      cleaned.instructions = cleaned.instructions.map((ix: any) => {
        if (!ix || typeof ix !== 'object') return null;

        // Ensure name exists
        if (!ix.name || typeof ix.name !== 'string') return null;

        // Clean accounts array - remove address fields that cause Anchor's translateAddress to fail
        if (ix.accounts && Array.isArray(ix.accounts)) {
          ix.accounts = ix.accounts
            .filter((acc: any) => acc != null && acc !== undefined && typeof acc === 'object')
            .map((acc: any) => {
              // Create a clean account object with only required fields
              // Explicitly exclude 'address' field to prevent Anchor's translateAddress from failing
              const cleaned: any = {
                name: acc.name || '',
                isMut: acc.isMut !== undefined ? acc.isMut : false,
                isSigner: acc.isSigner !== undefined ? acc.isSigner : false,
              };
              // Only include other fields if they're not undefined
              if (acc.pda !== undefined) cleaned.pda = acc.pda;
              if (acc.relations !== undefined) cleaned.relations = acc.relations;
              return cleaned;
            });
        } else {
          ix.accounts = [];
        }

        // Clean args if they exist - preserve all args with their type definitions
        // CRITICAL: Normalize argument types (publicKey -> pubkey, defined string -> defined object)
        // CRITICAL: Do NOT filter out args - Anchor needs all args in the correct order
        if (ix.args && Array.isArray(ix.args)) {
          ix.args = ix.args.map((arg: any) => {
            if (!arg || typeof arg !== 'object') {
              console.error(`[cleanIdl] Invalid arg in instruction ${ix.name}:`, arg);
              throw new Error(`Invalid argument in instruction ${ix.name}: ${JSON.stringify(arg)}`);
            }

            // Preserve the arg structure, especially type definitions
            // Clone the arg to avoid mutating original
            const cleanedArg: any = JSON.parse(JSON.stringify(arg));

            // CRITICAL: Normalize type field - this is critical for Anchor's type resolution
            // Anchor expects types to be normalized (publicKey -> pubkey, etc.)
            if (cleanedArg.type !== undefined && cleanedArg.type !== null) {
              cleanedArg.type = this.normalizeType(cleanedArg.type);
            } else {
              // If type is missing, this will cause encoding errors
              console.error(`[cleanIdl] Instruction ${ix.name} argument ${cleanedArg.name || 'unknown'} is missing type field`);
              throw new Error(`Instruction ${ix.name} argument ${cleanedArg.name || 'unknown'} is missing type field`);
            }

            return cleanedArg;
          });
        } else if (!ix.args) {
          // If args is missing, initialize as empty array
          ix.args = [];
        }

        return ix;
      }).filter((ix: any) => ix != null);
    }

    // Clean accounts - preserve type definitions for fields
    // CRITICAL: Accounts need discriminators for Anchor to work
    if (cleaned.accounts && Array.isArray(cleaned.accounts)) {
      cleaned.accounts = cleaned.accounts
        .filter((acc: any) => acc != null && acc.name && typeof acc.name === 'string')
        .map((acc: any) => {
          // Deep clone to preserve structure
          const cleanedAcc = JSON.parse(JSON.stringify(acc));
          // Add discriminator if missing (required by Anchor)
          if (!cleanedAcc.discriminator && cleanedAcc.name) {
            cleanedAcc.discriminator = generateAccountDiscriminator(cleanedAcc.name);
          }
          // Ensure type field exists and is valid
          if (!cleanedAcc.type || typeof cleanedAcc.type !== 'object') {
            cleanedAcc.type = { kind: 'struct', fields: [] };
          } else if (cleanedAcc.type.fields && Array.isArray(cleanedAcc.type.fields)) {
            // Preserve all field definitions, especially type references
            // CRITICAL: Normalize field types (publicKey -> pubkey, defined string -> defined object)
            cleanedAcc.type.fields = cleanedAcc.type.fields.map((field: any) => {
              const cleanedField: any = {
                name: field.name || '',
              };
              // CRITICAL: Normalize type definitions (including defined types like LobbyStatus)
              if (field.type) {
                cleanedField.type = this.normalizeType(field.type);
              }
              return cleanedField;
            });
          }
          return cleanedAcc;
        });
    }

    // Clean types - CRITICAL: preserve all type definitions exactly as they are
    // Anchor needs these to resolve types like LobbyStatus and BetStatus
    if (cleaned.types && Array.isArray(cleaned.types)) {
      cleaned.types = cleaned.types
        .filter((type: any) => type != null && type.name && typeof type.name === 'string')
        .map((type: any) => {
          // Deep clone to preserve the entire type structure
          const cleanedType = JSON.parse(JSON.stringify(type));
          // Ensure name exists
          if (!cleanedType.name) {
            cleanedType.name = type.name;
          }
          // Preserve type field structure (for enums, structs, etc.)
          if (!cleanedType.type && type.type) {
            cleanedType.type = type.type;
          }
          return cleanedType;
        });
    } else if (!cleaned.types) {
      // If types array is missing, initialize it
      cleaned.types = [];
    }

    // Ensure version and name exist
    if (!cleaned.version) cleaned.version = '0.1.0';
    if (!cleaned.name) cleaned.name = 'poker_betting';

    return cleaned;
  }

  /**
   * Create a new lobby on-chain
   * @param config Lobby configuration
   * @returns Transaction signature
   */
  async createLobby(config: LobbyConfig): Promise<string> {
    const [lobbyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lobby'), Buffer.from(config.gameId)],
      this.program.programId
    );

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
        owner: (this.provider as AnchorProvider).wallet.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();

    return tx;
  }

  /**
   * Place a bet on a player
   * @param gameId Game ID
   * @param playerName Player to bet on
   * @param amount Amount in SOL (will be converted to lamports)
   * @returns Transaction signature
   */
  async placeBet(gameId: string, playerName: string, amount: number): Promise<string> {
    // Validate program is initialized
    if (!this.program) {
      throw new Error('Program is not initialized. Please ensure the IDL was loaded correctly.');
    }

    // Validate placeBet method exists
    if (!this.program.methods || !this.program.methods.placeBet) {
      console.error('[PokerBettingContract] Available methods:', this.program.methods ? Object.keys(this.program.methods) : 'methods not available');
      throw new Error('placeBet method is not available. The contract may not be fully initialized. Please ensure the IDL includes the placeBet instruction.');
    }

    // Validate inputs
    if (!gameId || typeof gameId !== 'string') {
      throw new Error(`Invalid gameId: ${gameId}. Must be a non-empty string.`);
    }
    if (!playerName || typeof playerName !== 'string') {
      throw new Error(`Invalid playerName: ${playerName}. Must be a non-empty string.`);
    }
    if (typeof amount !== 'number' || amount <= 0) {
      throw new Error(`Invalid amount: ${amount}. Must be a positive number.`);
    }

    // Validate programId
    if (!this.program.programId) {
      throw new Error('Program ID is not set. The Program may not have been initialized correctly.');
    }

    // Validate wallet
    const wallet = (this.provider as AnchorProvider).wallet;
    if (!wallet || !wallet.publicKey) {
      throw new Error('Wallet is not connected. Please connect your wallet before placing a bet.');
    }

    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

    // Debug logging
    console.log('[PokerBettingContract.placeBet] Inputs:', {
      gameId,
      gameIdType: typeof gameId,
      playerName,
      amount,
      lamports,
      programId: this.program.programId?.toString(),
      programIdType: typeof this.program.programId,
    });

    // Validate programId before using it
    if (!this.program.programId) {
      throw new Error('Program ID is undefined. Cannot create PDAs.');
    }

    const [lobbyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lobby'), Buffer.from(gameId)],
      this.program.programId
    );

    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), lobbyPda.toBuffer()],
      this.program.programId
    );

    const bettor = wallet.publicKey;
    if (!bettor) {
      throw new Error('Bettor public key is undefined. Wallet may not be properly connected.');
    }

    // NOTE: The Rust code uses seeds: [b"bet", lobby.key().as_ref(), bettor.key().as_ref()]
    // No timestamp is used in the Rust seeds, so we should match that
    // However, this means only one bet per bettor per lobby is allowed
    // If we want multiple bets, we'd need to modify the Rust code to include a timestamp
    const [betPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('bet'),
        lobbyPda.toBuffer(),
        bettor.toBuffer(),
      ],
      this.program.programId
    );

    // Validate all values before calling the method
    console.log('[PokerBettingContract.placeBet] Pre-transaction validation:', {
      playerName,
      playerNameType: typeof playerName,
      playerNameLength: playerName?.length,
      lamports,
      lobbyPda: lobbyPda.toString(),
      betPda: betPda.toString(),
      bettor: bettor.toString(),
      escrowPda: escrowPda.toString(),
      systemProgram: SystemProgram.programId.toString(),
    });

    if (!playerName || typeof playerName !== 'string') {
      throw new Error(`Invalid playerName: ${playerName}. Must be a non-empty string.`);
    }

    if (!SystemProgram.programId) {
      throw new Error('SystemProgram.programId is undefined.');
    }

    try {
      // Check the IDL structure for placeBet instruction
      const programIdl = (this.program as any).idl;
      const placeBetInstruction = programIdl?.instructions?.find((ix: any) => ix.name === 'placeBet');

      console.log('[PokerBettingContract.placeBet] Full IDL check:', {
        hasIdl: !!programIdl,
        hasInstructions: !!programIdl?.instructions,
        instructionsCount: programIdl?.instructions?.length,
        placeBetInstruction: placeBetInstruction ? {
          name: placeBetInstruction.name,
          args: placeBetInstruction.args,
          argsCount: placeBetInstruction.args?.length,
          argsDetails: placeBetInstruction.args?.map((arg: any) => ({
            name: arg.name,
            type: arg.type,
            typeString: JSON.stringify(arg.type),
          })),
        } : null,
      });

      // Validate IDL instruction structure
      if (!placeBetInstruction) {
        throw new Error('placeBet instruction not found in IDL');
      }
      if (!placeBetInstruction.args || placeBetInstruction.args.length !== 2) {
        throw new Error(`Invalid placeBet instruction args: expected 2, got ${placeBetInstruction.args?.length || 0}`);
      }
      if (!placeBetInstruction.args[0]?.type) {
        throw new Error('placeBet instruction first argument (playerName) is missing type');
      }
      if (!placeBetInstruction.args[1]?.type) {
        throw new Error('placeBet instruction second argument (amount) is missing type');
      }

      console.log('[PokerBettingContract.placeBet] Method exists:', !!this.program.methods.placeBet);

      // Ensure playerName is a string and not undefined
      const safePlayerName = String(playerName || '');
      if (!safePlayerName) {
        throw new Error('playerName cannot be empty');
      }

      // Ensure lamports is a valid number
      const safeLamports = Number(lamports);
      if (isNaN(safeLamports) || safeLamports <= 0) {
        throw new Error(`Invalid lamports: ${lamports}`);
      }

      // Create BN instance and validate
      const amountBN = new BN(safeLamports);
      if (!amountBN || amountBN.isZero()) {
        throw new Error(`Invalid BN amount: ${safeLamports}`);
      }

      console.log('[PokerBettingContract.placeBet] Final arguments:', {
        playerName: safePlayerName,
        playerNameType: typeof safePlayerName,
        playerNameLength: safePlayerName.length,
        amount: amountBN.toString(),
        amountType: amountBN.constructor.name,
        amountIsBN: amountBN instanceof BN,
        amountIsZero: amountBN.isZero(),
      });

      // Validate accounts
      const accounts = {
        lobby: lobbyPda,
        bet: betPda,
        bettor: bettor,
        escrow: escrowPda,
        systemProgram: SystemProgram.programId,
      };

      console.log('[PokerBettingContract.placeBet] Accounts validation:', {
        lobby: accounts.lobby?.toString(),
        bet: accounts.bet?.toString(),
        bettor: accounts.bettor?.toString(),
        escrow: accounts.escrow?.toString(),
        systemProgram: accounts.systemProgram?.toString(),
        allDefined: Object.values(accounts).every(acc => acc !== undefined && acc !== null),
      });

      // Final validation: ensure method exists and is callable
      if (typeof this.program.methods.placeBet !== 'function') {
        throw new Error('placeBet is not a function. Program may not be initialized correctly.');
      }

      // Try to build the instruction manually first to catch encoding errors early
      try {
        console.log('[PokerBettingContract.placeBet] Building instruction...');
        const instructionBuilder = this.program.methods.placeBet(safePlayerName, amountBN);
        console.log('[PokerBettingContract.placeBet] Instruction builder created');

        const instruction = await instructionBuilder.accounts(accounts).instruction();
        console.log('[PokerBettingContract.placeBet] Instruction built successfully:', {
          programId: instruction.programId.toString(),
          keysCount: instruction.keys.length,
          dataLength: instruction.data.length,
        });
      } catch (buildError: any) {
        console.warn('[PokerBettingContract.placeBet] Auto-encoding failed, falling back to manual instruction construction...', buildError);

        try {
          // Manual fallback: construct instruction buffer manually
          // 1. Discriminator: sha256("global:placeBet")[0..8]
          const discriminator = createHash('sha256').update('global:placeBet').digest().slice(0, 8);

          // 2. Arguments
          // playerName (String): 4 bytes length (LE) + bytes
          const nameBuffer = Buffer.from(safePlayerName, 'utf8');
          const nameLenBuffer = Buffer.alloc(4);
          nameLenBuffer.writeUInt32LE(nameBuffer.length, 0);

          // amount (u64): 8 bytes (LE)
          const amountBuffer = amountBN.toArrayLike(Buffer, 'le', 8);

          // Combine data
          const data = Buffer.concat([
            Buffer.from(discriminator),
            nameLenBuffer,
            nameBuffer,
            amountBuffer
          ]);

          console.log('[PokerBettingContract.placeBet] Manual data constructed:', {
            discriminator: discriminator.toString('hex'),
            name: safePlayerName,
            amount: amountBN.toString(),
            dataLength: data.length
          });

          // Define keys in order
          const keys = [
            { pubkey: accounts.lobby, isSigner: false, isWritable: true },
            { pubkey: accounts.bet, isSigner: false, isWritable: true },
            { pubkey: accounts.bettor, isSigner: true, isWritable: true },
            { pubkey: accounts.escrow, isSigner: false, isWritable: true },
            { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
          ];

          const ix = new TransactionInstruction({
            keys,
            programId: this.program.programId,
            data
          });

          const transaction = new Transaction().add(ix);
          console.log('[PokerBettingContract.placeBet] Sending manual transaction...');

          // Use provider to sign and send
          const signature = await this.provider.sendAndConfirm(transaction);
          console.log('[PokerBettingContract.placeBet] Manual transaction successful:', signature);
          return signature;

        } catch (manualError: any) {
          console.error('[PokerBettingContract.placeBet] Manual fallback failed:', manualError);

          let detailedError = manualError.message;
          if (manualError.logs) {
            detailedError += `\nLogs:\n${manualError.logs.join('\n')}`;
          }

          throw new Error(`Failed to build instruction (auto): ${buildError.message} | Manual fallback: ${detailedError}`);
        }
      }

      const tx = await this.program.methods
        .placeBet(safePlayerName, amountBN)
        .accounts(accounts)
        .signers([])
        .rpc();
      console.log('[PokerBettingContract.placeBet] Transaction successful:', tx);
      return tx;
    } catch (error: any) {
      console.error('[PokerBettingContract.placeBet] Error calling placeBet:', error);
      console.error('[PokerBettingContract.placeBet] Error details:', {
        message: error.message,
        stack: error.stack,
        playerName,
        lamports,
        accounts: {
          lobby: lobbyPda?.toString(),
          bet: betPda?.toString(),
          bettor: bettor?.toString(),
          escrow: escrowPda?.toString(),
          systemProgram: SystemProgram.programId?.toString(),
        },
      });
      throw error;
    }
  }

  /**
   * Update lobby status
   * @param gameId Game ID
   * @param status New status ('Waiting' | 'Running' | 'Finished')
   * @returns Transaction signature
   */
  async updateLobbyStatus(
    gameId: string,
    status: 'Waiting' | 'Running' | 'Finished'
  ): Promise<string> {
    // Check if updateLobbyStatus method exists (it might be removed due to Anchor 0.32.1 bug)
    if (!this.program.methods.updateLobbyStatus) {
      throw new Error('updateLobbyStatus is not available due to Anchor 0.32.1 enum type bug. Please use a different Anchor version or manually construct the transaction.');
    }

    const [lobbyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lobby'), Buffer.from(gameId)],
      this.program.programId
    );

    const statusEnum = { [status.toLowerCase()]: {} };

    const tx = await this.program.methods
      .updateLobbyStatus(statusEnum)
      .accounts({
        lobby: lobbyPda,
        owner: (this.provider as AnchorProvider).wallet.publicKey,
      })
      .rpc();

    return tx;
  }

  /**
   * Distribute winnings to a single bettor
   * Call this for each winning bet
   * @param gameId Game ID
   * @param winnerName Name of the winning player
   * @param betPubkey Public key of the bet account
   * @returns Transaction signature
   */
  async distributeSingleWinning(
    gameId: string,
    winnerName: string,
    betPubkey: PublicKey
  ): Promise<string> {
    const [lobbyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lobby'), Buffer.from(gameId)],
      this.program.programId
    );

    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), lobbyPda.toBuffer()],
      this.program.programId
    );

    // Fetch bet account to get bettor address
    const bet = await (this.program.account as any).bet.fetch(betPubkey);

    const tx = await this.program.methods
      .distributeSingleWinning(winnerName)
      .accounts({
        lobby: lobbyPda,
        bet: betPubkey,
        owner: (this.provider as AnchorProvider).wallet.publicKey,
        escrow: escrowPda,
        bettor: bet.bettor,
      } as any)
      .rpc();

    return tx;
  }

  /**
   * Distribute winnings to all winners
   * Helper function that calls distributeSingleWinning for each winning bet
   * @param gameId Game ID
   * @param winnerName Name of the winning player
   * @returns Array of transaction signatures
   */
  async distributeAllWinnings(
    gameId: string,
    winnerName: string
  ): Promise<string[]> {
    const [lobbyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lobby'), Buffer.from(gameId)],
      this.program.programId
    );

    // Get all bets for this lobby
    const allBets = await (this.program.account as any).bet.all([
      {
        memcmp: {
          offset: 8 + 32, // Skip discriminator and bettor, get to lobby
          bytes: lobbyPda.toBase58(),
        },
      },
    ]);

    const winningBets = allBets.filter((b: any) => {
      const status = b.account.status;
      const isActive = status && typeof status === 'object' && 'active' in status;
      return b.account.playerName === winnerName && isActive;
    });

    const signatures: string[] = [];
    for (const betAccount of winningBets) {
      try {
        const sig = await this.distributeSingleWinning(
          gameId,
          winnerName,
          betAccount.publicKey
        );
        signatures.push(sig);
      } catch (error) {
        console.error(`Failed to distribute to bet ${betAccount.publicKey}:`, error);
      }
    }

    return signatures;
  }

  /**
   * Get lobby data
   * @param gameId Game ID
   * @returns Lobby account data
   */
  async getLobby(gameId: string) {
    const [lobbyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lobby'), Buffer.from(gameId)],
      this.program.programId
    );

    try {
      const lobby = await (this.program.account as any).lobby.fetch(lobbyPda);
      return lobby;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get all bets for a lobby
   * @param gameId Game ID
   * @returns Array of bet accounts
   */
  async getBets(gameId: string): Promise<BetInfo[]> {
    const [lobbyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lobby'), Buffer.from(gameId)],
      this.program.programId
    );

    const bets = await (this.program.account as any).bet.all([
      {
        memcmp: {
          offset: 8 + 32, // Skip discriminator and bettor
          bytes: lobbyPda.toBase58(),
        },
      },
    ]);

    return bets.map((bet: any) => {
      let status: 'Active' | 'Paid' | 'Refunded' = 'Active';
      const betStatus = bet.account.status;
      if (betStatus && typeof betStatus === 'object') {
        if ('active' in betStatus) {
          status = 'Active';
        } else if ('paid' in betStatus) {
          status = 'Paid';
        } else if ('refunded' in betStatus) {
          status = 'Refunded';
        }
      }

      return {
        bettor: new PublicKey(bet.account.bettor),
        playerName: bet.account.playerName as string,
        amount: (bet.account.amount?.toNumber?.() || bet.account.amount || 0) / LAMPORTS_PER_SOL,
        placedAt: (bet.account.placedAt?.toNumber?.() || bet.account.placedAt || 0),
        status,
      };
    });
  }
}


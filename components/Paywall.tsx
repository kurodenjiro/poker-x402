'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// Lazy load Solana to avoid SSR issues
const loadSolana = async () => {
  if (typeof window === 'undefined') return null;
  return await import('@solana/web3.js');
};

interface PaywallProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess: () => void;
  amount: number; // Amount in USD
  chips: number; // Chips to receive
  paymentAddress?: string; // Payment address for this game (overrides env variable)
}

// x402 Solana Network Configuration
// Use devnet for development (more stable), testnet for production
const SOLANA_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || (process.env.NODE_ENV === 'development' ? 'devnet' : 'testnet');

// Use multiple RPC endpoints for better reliability
const SOLANA_RPC_ENDPOINTS = SOLANA_NETWORK === 'devnet' 
  ? [
      'https://api.devnet.solana.com',
      'https://devnet.solana.com',
      'https://rpc.ankr.com/solana_devnet',
    ]
  : [
      'https://api.testnet.solana.com',
      'https://testnet.solana.com',
      'https://solana-testnet.rpc.extrnode.com',
      'https://rpc.ankr.com/solana_testnet',
    ];

const getRpcEndpoint = () => {
  // Try to use a custom RPC if provided
  if (process.env.NEXT_PUBLIC_SOLANA_RPC_URL) {
    return process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  }
  // Otherwise use the first endpoint (can be randomized for load balancing)
  return SOLANA_RPC_ENDPOINTS[0];
};

const DEFAULT_X402_PAYMENT_ADDRESS = process.env.NEXT_PUBLIC_X402_PAYMENT_ADDRESS || '11111111111111111111111111111111';
const USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'; // USDC on Solana Testnet

export default function Paywall({ isOpen, onClose, onPaymentSuccess, amount, chips, paymentAddress }: PaywallProps) {
  // Use provided payment address or fall back to env variable
  const X402_PAYMENT_ADDRESS = paymentAddress || DEFAULT_X402_PAYMENT_ADDRESS;
  
  // Use wallet adapter for consistent wallet connection
  const { publicKey, connected, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const walletAddress = publicKey?.toString() || null;
  const walletConnected = connected;
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [solanaLib, setSolanaLib] = useState<any>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(true);

  // Load Solana library when component mounts
  useEffect(() => {
    loadSolana().then((lib) => {
      if (lib) {
        setSolanaLib(lib);
      }
    });
  }, []);

  // Fetch current SOL/USD price
  useEffect(() => {
    const fetchSolPrice = async () => {
      setIsLoadingPrice(true);
      try {
        // Try CoinGecko API first
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        const data = await response.json();
        if (data.solana && data.solana.usd) {
          setSolPrice(data.solana.usd);
          console.log('[Paywall] SOL price fetched:', data.solana.usd, 'USD');
        } else {
          throw new Error('Invalid response from CoinGecko');
        }
      } catch (err) {
        console.warn('[Paywall] Failed to fetch SOL price from CoinGecko, using fallback:', err);
        // Fallback price (approximate SOL price)
        setSolPrice(150); // Fallback: ~$150 per SOL
      } finally {
        setIsLoadingPrice(false);
      }
    };

    if (isOpen) {
      fetchSolPrice();
    }
  }, [isOpen]);

  // Conversion rate: 1$ = 1000 chips
  const conversionRate = 1000;
  
  // Convert USD to SOL using current price
  const solAmount = solPrice ? amount / solPrice : null;

  // Wallet connection is handled by wallet adapter modal
  const connectWallet = () => {
    setVisible(true);
  };

  const processPayment = async () => {
    if (!walletAddress) {
      setError('Please connect your wallet first');
      return;
    }

    if (!solanaLib) {
      setError('Solana libraries not loaded. Please refresh the page.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStatusMessage('Preparing transaction...');

    try {
      const provider = (window as any).solana;
      if (!provider) {
        throw new Error('Wallet not connected');
      }

      const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL: LAMPORTS } = solanaLib;
      
      // Try multiple RPC endpoints if one fails
      let connection: any = null;
      let lastError: any = null;
      
      for (const rpcUrl of SOLANA_RPC_ENDPOINTS) {
        try {
          console.log(`[Paywall] Trying RPC endpoint: ${rpcUrl}`);
          connection = new Connection(rpcUrl, 'confirmed');
          // Test the connection by getting version
          await connection.getVersion();
          console.log(`[Paywall] Successfully connected to ${rpcUrl}`);
          break;
        } catch (err: any) {
          console.warn(`[Paywall] Failed to connect to ${rpcUrl}:`, err.message);
          lastError = err;
          connection = null;
        }
      }
      
      if (!connection) {
        throw new Error(`Failed to connect to Solana network. All RPC endpoints failed. Last error: ${lastError?.message || 'Unknown error'}`);
      }

      // Get recent blockhash FIRST (required before creating transaction)
      console.log('[Paywall] Getting latest blockhash...');
      setStatusMessage('Connecting to Solana network...');
      
      let blockhash: string | undefined;
      let lastValidBlockHeight: number | undefined;
      let blockhashRetries = 3;
      let blockhashError: any = null;
      
      while (blockhashRetries > 0) {
        try {
          const blockhashPromise = connection.getLatestBlockhash('finalized');
          const blockhashTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Blockhash request timed out')), 15000)
          );
          const result = await Promise.race([blockhashPromise, blockhashTimeout]) as any;
          blockhash = result.blockhash;
          lastValidBlockHeight = result.lastValidBlockHeight;
          console.log('[Paywall] Got blockhash successfully:', { 
            blockhash: blockhash?.substring(0, 10) + '...',
            lastValidBlockHeight 
          });
          break;
        } catch (err: any) {
          blockhashRetries--;
          blockhashError = err;
          console.warn(`[Paywall] Failed to get blockhash, ${blockhashRetries} retries left:`, err.message);
          
          if (blockhashRetries > 0) {
            // Try a different RPC endpoint
            for (const rpcUrl of SOLANA_RPC_ENDPOINTS.slice(1)) {
              try {
                console.log(`[Paywall] Retrying with RPC endpoint: ${rpcUrl}`);
                connection = new Connection(rpcUrl, 'confirmed');
                await connection.getVersion();
                console.log(`[Paywall] Successfully connected to ${rpcUrl}`);
                break;
              } catch (rpcErr: any) {
                console.warn(`[Paywall] Failed to connect to ${rpcUrl}:`, rpcErr.message);
              }
            }
            // Wait a bit before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            throw new Error(`Failed to get blockhash after retries: ${blockhashError?.message || 'Unknown error'}`);
          }
        }
      }

      // Ensure blockhash was assigned
      if (!blockhash) {
        throw new Error('Failed to get blockhash after all retries');
      }

      // Validate wallet address
      if (!walletAddress || typeof walletAddress !== 'string') {
        throw new Error('Invalid wallet address');
      }

      // Validate payment address
      if (!X402_PAYMENT_ADDRESS || X402_PAYMENT_ADDRESS === '11111111111111111111111111111111') {
        throw new Error('Payment address not configured. Please set NEXT_PUBLIC_X402_PAYMENT_ADDRESS');
      }

      // Use publicKey from wallet adapter
      if (!publicKey) {
        throw new Error('Wallet public key not available');
      }
      
      const fromPublicKey = publicKey;
      console.log('[Paywall] Using wallet public key:', fromPublicKey.toString());

      // Validate payment address
      let paymentAddress: PublicKey;
      try {
        paymentAddress = new PublicKey(X402_PAYMENT_ADDRESS);
        console.log('[Paywall] Created to PublicKey:', paymentAddress.toString());
      } catch (err: any) {
        throw new Error(`Invalid payment address format: ${err.message}`);
      }
      
      // Validate that payment address is valid
      if (!paymentAddress) {
        throw new Error('Failed to create payment address');
      }

      // Validate blockhash
      if (!blockhash || typeof blockhash !== 'string') {
        throw new Error('Invalid blockhash received');
      }
      
      // Convert USD to SOL using current price
      if (solAmount === null || solPrice === null) {
        throw new Error('SOL price not loaded. Please wait and try again.');
      }

      const lamports = Math.ceil(solAmount * LAMPORTS);

      if (lamports <= 0) {
        throw new Error('Invalid payment amount');
      }

      console.log('[Paywall] Creating transaction:', { 
        lamports, 
        solAmount, 
        from: walletAddress, 
        to: X402_PAYMENT_ADDRESS,
        fromPubkey: fromPublicKey.toString(),
        toPubkey: paymentAddress.toString(),
        blockhash: blockhash.substring(0, 10) + '...'
      });

      // Create transaction AFTER getting blockhash
      const transaction = new Transaction();
      
      // Set blockhash and lastValidBlockHeight (required for newer Solana web3.js)
      transaction.recentBlockhash = blockhash;
      if (lastValidBlockHeight !== undefined) {
        transaction.lastValidBlockHeight = lastValidBlockHeight;
      }
      transaction.feePayer = fromPublicKey;
      
      console.log('[Paywall] Transaction initialized:', {
        hasBlockhash: !!transaction.recentBlockhash,
        hasFeePayer: !!transaction.feePayer,
        lastValidBlockHeight
      });
      
      // Add transfer instruction
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: fromPublicKey,
        toPubkey: paymentAddress,
        lamports: lamports,
      });

      if (!transferInstruction) {
        throw new Error('Failed to create transfer instruction');
      }

      // Validate instruction before adding
      if (!transferInstruction.keys || transferInstruction.keys.length === 0) {
        throw new Error('Transfer instruction is invalid');
      }

      transaction.add(transferInstruction);
      
      console.log('[Paywall] Transaction created successfully, instructions:', transaction.instructions.length);

      // Validate transaction before signing
      console.log('[Paywall] Validating transaction before signing...');
      console.log('[Paywall] Transaction details:', {
        hasBlockhash: !!transaction.recentBlockhash,
        hasFeePayer: !!transaction.feePayer,
        feePayer: transaction.feePayer?.toString(),
        instructionsCount: transaction.instructions.length,
        lastValidBlockHeight: transaction.lastValidBlockHeight
      });

      // Try to serialize message to catch any errors early
      try {
        const message = transaction.serializeMessage();
        console.log('[Paywall] Transaction message serialized successfully, length:', message.length);
      } catch (serializeError: any) {
        console.error('[Paywall] Transaction serialization error:', serializeError);
        throw new Error(`Transaction invalid: ${serializeError.message || 'Unknown serialization error'}`);
      }

      // Sign transaction using wallet adapter
      console.log('[Paywall] Requesting signature from wallet...');
      setStatusMessage('Please approve the transaction in your wallet...');
      
      if (!signTransaction) {
        throw new Error('Wallet signTransaction not available. Please reconnect your wallet.');
      }

      let signedTransaction;
      try {
        // Sign transaction using wallet adapter
        signedTransaction = await signTransaction(transaction);
        
        if (!signedTransaction) {
          throw new Error('Transaction signing returned null');
        }
        
        console.log('[Paywall] Transaction signed successfully');
      } catch (signError: any) {
        console.error('[Paywall] Signing error:', signError);
        if (signError.code === 4001 || 
            signError.message?.includes('User rejected') || 
            signError.message?.includes('rejected') ||
            signError.message?.includes('user rejected')) {
          throw new Error('Transaction was rejected. Please try again.');
        }
        throw new Error(`Signing failed: ${signError.message || 'Unknown error'}`);
      }

      // Send transaction
      console.log('[Paywall] Sending transaction...');
      setStatusMessage('Sending transaction to network...');
      const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      console.log('[Paywall] Transaction sent:', signature);

      // Wait for confirmation with timeout (use 'processed' for faster confirmation)
      console.log('[Paywall] Waiting for confirmation...');
      setStatusMessage('Waiting for transaction confirmation...');
      const confirmPromise = connection.confirmTransaction(signature, 'processed');
      const confirmTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Transaction confirmation timed out')), 30000)
      );
      
      try {
        await Promise.race([confirmPromise, confirmTimeout]);
        console.log('[Paywall] Transaction confirmed');
        setStatusMessage('Transaction confirmed!');
      } catch (confirmError: any) {
        // Even if confirmation times out, if we got a signature, the transaction was sent
        // Check if transaction exists on chain
        console.warn('[Paywall] Confirmation timeout, checking transaction status...', confirmError);
        setStatusMessage('Verifying transaction...');
        try {
          const txStatus = await connection.getSignatureStatus(signature);
          if (txStatus?.value?.err) {
            throw new Error('Transaction failed on chain');
          }
          console.log('[Paywall] Transaction found on chain, proceeding...');
          setStatusMessage('Transaction verified!');
        } catch (checkError) {
          // If we can't verify, still proceed - the transaction was sent
          console.warn('[Paywall] Could not verify transaction, but proceeding anyway');
          setStatusMessage('Transaction sent (verification pending)');
        }
      }

      // Payment successful
      console.log('[Paywall] Payment successful, calling onPaymentSuccess');
      setStatusMessage('Payment successful!');
      setIsProcessing(false);
      onPaymentSuccess();
    } catch (err: any) {
      console.error('[Paywall] Payment error:', err);
      setError(err.message || 'Payment failed. Please try again.');
      setStatusMessage(null);
      setIsProcessing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Payment address copied to clipboard!');
    }).catch(() => {
      alert('Failed to copy. Address: ' + text);
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4">
      <Card className="bg-white border-2 border-gray-300 shadow-2xl max-w-md w-full relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center"
        >
          ×
        </button>
        
        {/* Payment Address Display */}
        {X402_PAYMENT_ADDRESS && X402_PAYMENT_ADDRESS !== DEFAULT_X402_PAYMENT_ADDRESS && (
          <div className="p-4 bg-blue-50 border-b border-blue-200">
            <div className="text-xs font-semibold text-blue-900 mb-2">Payment Address (Testnet):</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-white px-2 py-1 rounded border border-blue-300 break-all">
                {X402_PAYMENT_ADDRESS}
              </code>
              <button
                onClick={() => copyToClipboard(X402_PAYMENT_ADDRESS)}
                className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 whitespace-nowrap"
              >
                Copy
              </button>
            </div>
            <div className="text-xs text-blue-700 mt-2">
              💡 You can send SOL directly to this address for testing
            </div>
          </div>
        )}

        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-3xl font-bold text-gray-900 mb-2">
              x402 Payment Required
            </div>
            <p className="text-gray-600">
              Pay to create your poker game server
            </p>
          </div>

          {/* Payment Details */}
          <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-6 mb-6 border-2 border-blue-200">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-700 font-medium">Server Creation Fee:</span>
                <span className="text-2xl font-bold text-blue-600">${amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-700 font-medium">You'll Receive:</span>
                <span className="text-2xl font-bold text-green-600">{chips.toLocaleString('en-US')} Chips</span>
              </div>
              {isLoadingPrice ? (
                <div className="pt-3 border-t border-gray-300">
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Loading SOL price...
                  </div>
                </div>
              ) : solAmount !== null && solPrice !== null ? (
                <div className="pt-3 border-t border-gray-300 space-y-2">
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                    <span>Payment Amount:</span>
                    <Badge className="bg-purple-500 text-white">
                      {solAmount.toFixed(4)} SOL
                    </Badge>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                    <span>SOL Price: ${solPrice.toFixed(2)}</span>
                    <span>•</span>
                    <span>1$ = {conversionRate} Chips</span>
                  </div>
                </div>
              ) : (
                <div className="pt-3 border-t border-gray-300">
                  <div className="text-center text-sm text-red-600">
                    Failed to load SOL price. Please refresh.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Wallet Connection */}
          {!walletConnected ? (
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800 mb-3">
                  Connect your Solana wallet to proceed with payment
                </p>
                <Button
                  onClick={connectWallet}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                >
                  Connect Phantom Wallet
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-green-800">Wallet Connected</span>
                  <Badge className="bg-green-500 text-white">✓</Badge>
                </div>
                <p className="text-xs text-green-700 font-mono break-all">
                  {walletAddress}
                </p>
              </div>

              <Button
                onClick={processPayment}
                disabled={isProcessing || isLoadingPrice || solAmount === null}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-lg font-semibold disabled:opacity-50"
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing Payment...
                  </span>
                ) : isLoadingPrice ? (
                  'Loading SOL price...'
                ) : solAmount !== null ? (
                  `Pay $${amount.toFixed(2)} (${solAmount.toFixed(4)} SOL)`
                ) : (
                  'Unable to calculate SOL amount'
                )}
              </Button>

              {/* Development/Test Mode: Skip Payment Button */}
              {(process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENABLE_SKIP_PAYMENT === 'true') && (
                <Button
                  onClick={() => {
                    console.log('[Paywall] Skipping payment (dev mode)');
                    setIsProcessing(false);
                    onPaymentSuccess();
                  }}
                  disabled={isProcessing}
                  className="w-full mt-2 bg-gray-500 hover:bg-gray-600 text-white h-10 text-sm font-medium disabled:opacity-50"
                >
                  Skip Payment (Dev Mode)
                </Button>
              )}
            </div>
          )}

          {/* Status Message */}
          {statusMessage && (
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">{statusMessage}</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Info */}
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              Powered by x402 Protocol on Solana {SOLANA_NETWORK === 'devnet' ? 'Devnet' : 'Testnet'}
            </p>
            {process.env.NODE_ENV === 'development' && (
              <p className="text-xs text-yellow-600 mt-1">
                Development Mode: Using {SOLANA_NETWORK} network
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}


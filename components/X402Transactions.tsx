'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface X402Transaction {
  id: string;
  gameId: string;
  handNumber: number | null;
  fromAgent: string;
  toAgent: string;
  amountChips: number;
  amountSol: number | null;
  transactionSignature: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

interface X402TransactionsProps {
  gameId: string;
}

export default function X402Transactions({ gameId }: X402TransactionsProps) {
  const [transactions, setTransactions] = useState<X402Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    if (!gameId) return;

    const fetchTransactions = async () => {
      // Only show loading on initial load
      if (isInitialLoad) {
        setIsLoading(true);
      }
      setError(null);
      try {
        const response = await fetch(`/api/x402-transactions/${gameId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch transactions');
        }
        const data = await response.json();
        const newTransactions = data.transactions || [];
        
        // Merge new transactions with existing ones
        // Update existing transactions and add new ones
        setTransactions(prev => {
          const transactionMap = new Map<string, X402Transaction>();
          
          // Add existing transactions to map
          prev.forEach(tx => {
            transactionMap.set(tx.id, tx);
          });
          
          // Update or add new transactions
          newTransactions.forEach((tx: X402Transaction) => {
            transactionMap.set(tx.id, tx);
          });
          
          // Convert back to array and sort by created_at DESC
          return Array.from(transactionMap.values()).sort((a, b) => {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });
        });
      } catch (err: any) {
        console.error('Error fetching x402 transactions:', err);
        setError(err.message || 'Failed to load transactions');
      } finally {
        if (isInitialLoad) {
          setIsLoading(false);
          setIsInitialLoad(false);
        }
      }
    };

    fetchTransactions();

    // Poll for new transactions every 5 seconds
    const interval = setInterval(fetchTransactions, 5000);

    return () => clearInterval(interval);
  }, [gameId, isInitialLoad]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'processing':
        return 'bg-yellow-500';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  if (isLoading) {
    return (
      <Card className="p-4 bg-gray-50">
        <div className="flex items-center justify-center py-4">
          <svg className="animate-spin h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="ml-2 text-gray-600">Loading x402 transactions...</span>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-4 bg-red-50 border-red-200">
        <p className="text-red-800 text-sm">Error: {error}</p>
      </Card>
    );
  }

  if (transactions.length === 0) {
    return (
      <Card className="p-4 bg-gray-50">
        <div className="text-center py-4">
          <p className="text-gray-500 text-sm">No x402 transactions yet</p>
          <p className="text-gray-400 text-xs mt-1">Agent-to-agent payments will appear here</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <span>💸</span>
          <span>x402 Transactions</span>
        </h3>
        <Badge className="bg-purple-500 text-white">
          {transactions.length} {transactions.length === 1 ? 'payment' : 'payments'}
        </Badge>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {transactions.map((tx) => (
          <div
            key={tx.id}
            className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-900">{tx.fromAgent}</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-semibold text-green-600">{tx.toAgent}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <span className="font-medium">
                    ${tx.amountChips.toLocaleString('en-US')} chips
                  </span>
                  {tx.amountSol && (
                    <>
                      <span>•</span>
                      <span className="font-medium text-purple-600">
                        {tx.amountSol.toFixed(6)} SOL
                      </span>
                    </>
                  )}
                  {tx.handNumber && (
                    <>
                      <span>•</span>
                      <span>Hand #{tx.handNumber}</span>
                    </>
                  )}
                </div>
              </div>
              <Badge className={`${getStatusColor(tx.status)} text-white text-xs`}>
                {tx.status}
              </Badge>
            </div>

            {tx.transactionSignature && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Transaction:</span>
                  <a
                    href={`https://solscan.io/tx/${tx.transactionSignature}?cluster=${process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet'}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-purple-600 hover:text-purple-800 font-mono truncate max-w-[200px]"
                    title={tx.transactionSignature}
                  >
                    {tx.transactionSignature.substring(0, 8)}...
                  </a>
                </div>
              </div>
            )}

            <div className="mt-2 text-xs text-gray-400">
              {formatDate(tx.createdAt)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}


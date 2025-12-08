'use client';

import { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '@/lib/ai/chat-history';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatPlaygroundProps {
  messages: ChatMessage[];
  modelNames: string[];
}

export default function ChatPlayground({ messages, modelNames }: ChatPlaygroundProps) {
  const [selectedModel, setSelectedModel] = useState<string | null>(modelNames[0] || null);
  const [showFullPrompt, setShowFullPrompt] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const modelMessages = selectedModel
    ? messages.filter(m => m.modelName === selectedModel)
    : [];

  const allMessages = messages.slice(-50); // Show last 50 messages across all models

  // Auto-scroll to bottom when new messages arrive (only within chat container)
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, selectedModel]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Chat Playground</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFullPrompt(!showFullPrompt)}
            className="text-xs"
          >
            {showFullPrompt ? 'Hide' : 'Show'} Prompts
          </Button>
        </div>
      </div>

      {/* Model Selector */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <Button
          variant={selectedModel === null ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedModel(null)}
          className="text-xs"
        >
          All Models
        </Button>
        {modelNames.map((name) => (
          <Button
            key={name}
            variant={selectedModel === name ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedModel(name)}
            className="text-xs"
          >
            {name}
          </Button>
        ))}
      </div>

      {/* Chat Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto space-y-4 pr-2">
        {(selectedModel ? modelMessages : allMessages).map((message, index) => (
          <div
            key={index}
            className={cn(
              'rounded-lg p-4 border-2 transition-all',
              message.role === 'system' && 'bg-blue-50 border-blue-200',
              message.role === 'user' && 'bg-gray-50 border-gray-200',
              message.role === 'assistant' && 'bg-green-50 border-green-200',
              !message.role && 'bg-white border-gray-200'
            )}
          >
            {/* Message Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {message.emoji && (
                  <span className="text-2xl animate-bounce">{message.emoji}</span>
                )}
                <Badge
                  className={cn(
                    'text-xs font-semibold',
                    message.modelName === 'ChatGPT' && 'bg-green-500 text-white',
                    message.modelName === 'Gemini' && 'bg-blue-500 text-white',
                    message.modelName === 'Grok' && 'bg-purple-500 text-white',
                    message.modelName === 'Claude Sonnet' && 'bg-orange-500 text-white'
                  )}
                >
                  {message.modelName}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {message.phase.replace('-', ' ').toUpperCase()}
                </Badge>
                <Badge
                  className={cn(
                    'text-xs',
                    message.action === 'fold' && 'bg-gray-300 text-gray-700',
                    message.action === 'check' && 'bg-gray-400 text-white',
                    message.action === 'call' && 'bg-yellow-400 text-yellow-900',
                    message.action === 'raise' && 'bg-green-400 text-green-900',
                    message.action === 'all-in' && 'bg-red-500 text-white'
                  )}
                >
                  {message.action.toUpperCase()}
                </Badge>
              </div>
              <span className="text-xs text-gray-500">
                {new Date(message.timestamp).toLocaleTimeString()}
              </span>
            </div>

            {/* System Prompt (if available) */}
            {showFullPrompt && message.prompt && (
              <div className="mb-3 p-3 bg-blue-100 rounded border border-blue-300">
                <div className="text-xs font-semibold text-blue-900 mb-1">System Prompt:</div>
                <pre className="text-xs text-blue-800 whitespace-pre-wrap font-mono">
                  {message.prompt}
                </pre>
              </div>
            )}

            {/* AI Response (if available) */}
            {message.response && (
              <div className="mb-3 p-3 bg-green-100 rounded border border-green-300">
                <div className="text-xs font-semibold text-green-900 mb-1">AI Response:</div>
                <pre className="text-xs text-green-800 whitespace-pre-wrap font-mono">
                  {message.response}
                </pre>
              </div>
            )}

            {/* Decision */}
            <div className="font-semibold text-sm text-gray-900 mb-1">
              Decision: {message.decision}
            </div>

            {/* Strategy Chat */}
            {message.strategy && (
              <div className="text-sm text-gray-700 mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                <span className="font-semibold">💭 Strategy:</span> {message.strategy}
              </div>
            )}

            {/* Reasoning */}
            {message.reasoning && (
              <div className="text-sm text-gray-700 italic mt-2 p-2 bg-gray-100 rounded">
                "{message.reasoning}"
              </div>
            )}
          </div>
        ))}

        {((selectedModel ? modelMessages : allMessages).length === 0) && (
          <div className="text-center py-12 text-gray-500">
            <p>No messages yet. Start a game to see AI conversations!</p>
          </div>
        )}
        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}


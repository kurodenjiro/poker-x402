'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface GameControlsProps {
  onStart: (config: any) => void;
  onStop: () => void;
  isRunning: boolean;
  isLoading: boolean;
}

const AVAILABLE_MODELS = ['ChatGPT', 'Gemini', 'Grok', 'Claude Sonnet'];

export default function GameControls({ onStart, onStop, isRunning, isLoading }: GameControlsProps) {
  const [selectedModels, setSelectedModels] = useState<string[]>(AVAILABLE_MODELS);
  const [startingChips, setStartingChips] = useState(1000);
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);
  const [maxHands, setMaxHands] = useState(10);

  const toggleModel = (model: string) => {
    if (selectedModels.includes(model)) {
      if (selectedModels.length > 2) {
        setSelectedModels(selectedModels.filter(m => m !== model));
      }
    } else {
      setSelectedModels([...selectedModels, model]);
    }
  };

  const handleStart = () => {
    onStart({
      modelNames: selectedModels,
      startingChips,
      smallBlind,
      bigBlind,
      maxHands,
    });
  };

  return (
    <Card className="p-6 bg-gray-50 border-gray-200">
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Game Settings</h3>
      
      <div className="space-y-4">
        {/* Model Selection */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            Select AI Models
          </label>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_MODELS.map(model => (
              <Badge
                key={model}
                variant={selectedModels.includes(model) ? 'default' : 'outline'}
                className={cn(
                  'cursor-pointer px-3 py-1',
                  selectedModels.includes(model)
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                )}
                onClick={() => !isRunning && toggleModel(model)}
              >
                {model}
              </Badge>
            ))}
          </div>
        </div>

        {/* Settings */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Starting Chips
            </label>
            <input
              type="number"
              value={startingChips}
              onChange={(e) => setStartingChips(Number(e.target.value))}
              disabled={isRunning}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              min={100}
              step={100}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Small Blind
            </label>
            <input
              type="number"
              value={smallBlind}
              onChange={(e) => setSmallBlind(Number(e.target.value))}
              disabled={isRunning}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              min={1}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Big Blind
            </label>
            <input
              type="number"
              value={bigBlind}
              onChange={(e) => setBigBlind(Number(e.target.value))}
              disabled={isRunning}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              min={1}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Max Hands
            </label>
            <input
              type="number"
              value={maxHands}
              onChange={(e) => setMaxHands(Number(e.target.value))}
              disabled={isRunning}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              min={1}
            />
          </div>
        </div>

        {/* Start Button */}
        <div className="pt-2">
          <Button
            onClick={handleStart}
            disabled={isLoading || selectedModels.length < 2 || isRunning}
            className="bg-green-500 text-white hover:bg-green-600"
          >
            {isLoading ? 'Starting...' : 'Start Game'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

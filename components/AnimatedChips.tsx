'use client';

import { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';

interface AnimatedChipsProps {
  value: number;
  isAnimating?: boolean;
  className?: string;
}

export default function AnimatedChips({ value, isAnimating = false, className }: AnimatedChipsProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isCounting, setIsCounting] = useState(false);
  const prevValueRef = useRef(value);
  const shouldAnimateRef = useRef(false);

  // Update shouldAnimate flag when isAnimating prop changes
  useEffect(() => {
    if (isAnimating) {
      shouldAnimateRef.current = true;
    }
  }, [isAnimating]);

  useEffect(() => {
    // Only animate if value actually changed and we should animate
    if (value !== prevValueRef.current) {
      if (shouldAnimateRef.current) {
        setIsCounting(true);
        const startValue = prevValueRef.current;
        const endValue = value;
        const difference = endValue - startValue;
        const duration = 800; // 800ms animation
        const steps = 30; // 30 steps for smooth animation
        const stepValue = difference / steps;
        const stepDuration = duration / steps;

        let currentStep = 0;
        const interval = setInterval(() => {
          currentStep++;
          const newValue = Math.round(startValue + (stepValue * currentStep));
          
          // Ensure we don't overshoot
          if ((difference > 0 && newValue >= endValue) || (difference < 0 && newValue <= endValue)) {
            setDisplayValue(endValue);
            prevValueRef.current = endValue;
            clearInterval(interval);
            setIsCounting(false);
            shouldAnimateRef.current = false;
          } else {
            setDisplayValue(newValue);
          }
        }, stepDuration);

        return () => clearInterval(interval);
      } else {
        // Update immediately without animation
        setDisplayValue(value);
        prevValueRef.current = value;
      }
    } else {
      // Update display value if it's the same (no animation needed)
      setDisplayValue(value);
    }
  }, [value]);

  const isIncrease = value > displayValue;
  const isDecrease = value < displayValue;

  return (
    <span
      className={cn(
        'transition-all duration-300',
        isCounting && (isIncrease ? 'text-green-600 scale-110' : isDecrease ? 'text-red-600 scale-110' : ''),
        isAnimating && 'animate-pulse',
        className
      )}
    >
      ${displayValue.toLocaleString()}
    </span>
  );
}


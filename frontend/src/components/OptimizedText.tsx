import React, { useMemo, useState, useLayoutEffect, useRef } from 'react';
import { prepare, layout } from '@chenglou/pretext';

interface OptimizedTextProps {
  text: string;
  font?: string;
  lineHeight?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * OptimizedText Component
 * Uses @chenglou/pretext for efficient text measurement in Canvas.
 * This prevents layout thrashing by calculating text height before rendering to the DOM.
 */
export const OptimizedText: React.FC<OptimizedTextProps> = ({
  text,
  font = '15.2px "Inter", system-ui, -apple-system, sans-serif',
  lineHeight = 24.32, // 1.6 * 15.2px
  className,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(0);

  // 1. Prepare (Heavy analysis) - Only run if text or font changes
  const preparedHandle = useMemo(() => {
    return prepare(text, font);
  }, [text, font]);

  // 2. Track width changes efficiently
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        // We use Math.floor to be safe with sub-pixel measurements
        setWidth(Math.floor(entry.contentRect.width));
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // 3. Layout (Fast calculation) - Only run when width or handle changes
  const { height } = useMemo(() => {
    if (width === 0) return { height: 0 };
    // Pretext layout returns the calculated dimensions
    return layout(preparedHandle, width, lineHeight);
  }, [preparedHandle, width, lineHeight]);

  return (
    <div 
      ref={containerRef} 
      className={className}
      style={{ 
        ...style, 
        height: height > 0 ? `${height}px` : 'auto',
        overflow: 'hidden',
        transition: 'height 0.2s ease-out', // Smooth height transitions if text changes
      }}
    >
      {text}
    </div>
  );
};

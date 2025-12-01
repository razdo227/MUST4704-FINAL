'use client';

// Rotary dial component that mimics hardware synth knobs
// Drag up/down to adjust the value
import React, { useState, useRef, useEffect } from 'react';

type DialProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  unit?: string;  // Display unit like "ms", "%", "st", etc.
};

export function Dial({ label, value, min, max, step = 1, onChange, unit = '' }: DialProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dialRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);        // Track starting Y position when drag begins
  const startValueRef = useRef(0);    // Track starting value when drag begins

  // Calculate rotation angle for the indicator line
  // Maps value range to 270 degrees of rotation (-135° to +135°)
  const percentage = (value - min) / (max - min);
  const rotation = -135 + percentage * 270;

  // When user clicks on the dial, start dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startYRef.current = e.clientY;
    startValueRef.current = value;
  };

  // While dragging, update the value based on vertical mouse movement
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Dragging up increases value, dragging down decreases
      const deltaY = startYRef.current - e.clientY;
      const range = max - min;
      const sensitivity = 0.5;  // Controls how fast the dial responds to mouse movement

      // Calculate new value based on how far the mouse moved
      const newValue = startValueRef.current + (deltaY * range * sensitivity) / 100;

      // Clamp to min/max bounds
      const clampedValue = Math.max(min, Math.min(max, newValue));

      // Snap to nearest step value
      const steppedValue = Math.round(clampedValue / step) * step;

      onChange(steppedValue);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    // Attach listeners to document so dragging works even if cursor leaves the dial
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, min, max, step, onChange]);

  // Format display value: 2 decimals for fractional steps, 0 decimals for integers
  const displayValue = value.toFixed(step < 1 ? 2 : 0);

  return (
    <div className="dial-container">
      <div
        ref={dialRef}
        className="dial"
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div className="dial-track">
          <div
            className="dial-indicator"
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        </div>
      </div>
      <div className="dial-label">{label}</div>
      <div className="dial-value">
        {displayValue}
        {unit}
      </div>
    </div>
  );
}

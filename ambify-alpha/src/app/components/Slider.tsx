'use client';

// Simple slider component for controlling parameters
import React from "react";

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
};

export function Slider({ label, value, min, max, step = 1, onChange }: SliderProps) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label>
        {label}: {value.toFixed(2)}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

'use client';

// Simple play/stop buttons for the granular engine
import React from "react";

type TransportProps = {
  isPlaying: boolean;
  onStart: () => void;
  onStop: () => void;
};

export function TransportControls({ isPlaying, onStart, onStop }: TransportProps) {
  return (
    <div style={{ marginBottom: 12 }}>
      <button onClick={onStart} disabled={isPlaying}>
        Play (start grains)
      </button>
      <button onClick={onStop} disabled={!isPlaying}>
        Stop
      </button>
    </div>
  );
}

'use client';

// Transport controls with icon buttons
import React from "react";

type TransportProps = {
  isPlaying: boolean;
  onStart: () => void;
  onStop: () => void;
};

export function TransportControls({ isPlaying, onStart, onStop }: TransportProps) {
  return (
    <div className="transport-controls">
      <button
        className="transport-button"
        onClick={onStart}
        disabled={isPlaying}
        aria-label="Play"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M8 5v14l11-7z" fill="currentColor"/>
        </svg>
      </button>
      <button
        className="transport-button"
        onClick={onStop}
        disabled={!isPlaying}
        aria-label="Stop"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="6" y="6" width="12" height="12" fill="currentColor"/>
        </svg>
      </button>
    </div>
  );
}

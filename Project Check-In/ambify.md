# ambify

ambify is a **browser-based granular synthesis engine** built with **TypeScript** and the **Web Audio API**. It takes any uploaded audio file and transforms it into an **infinitely sustaining pad texture** using continuous granular playback.

## Features

- Built with TypeScript + Web Audio API
- Upload any audio file and turn it into a pad
- Real-time grain generation with envelopes, density, and drift
- Dark-themed, responsive UI
- Preset system with import/export
- Optional effects and export rendering

## Tech Stack

- TypeScript for all source code
- Web Audio API for granular synthesis
- Vite or Next.js for build tooling
- UI with Vanilla TS + CSS or React
- LocalStorage or IndexedDB for presets

## Granular Engine

### Grain Engine Basics
- Uses `AudioBufferSourceNode` to spawn grains
- Overlapping envelopes (Hann, Hamming, Sine)
- Static or drifting grain positions
- Micro-scheduling for smooth playback

### Adjustable Parameters
- Grain size (1–250 ms)
- Overlap
- Density
- Playback rate
- Pitch shift / detune
- Position jitter
- Envelope shape
- Stereo spread
- Freeze mode (lock grain position)

### Infinite Pad Behavior
- Artifact-free looping
- Smooth crossfading
- Optional "evolution mode"
- All DSP stays within realtime limits

## Audio Input

### Audio Upload
- Drag-and-drop and file picker
- Formats: WAV, AIFF, MP3, FLAC
- Optional waveform display (Canvas or Wavesurfer.js)

### Audio Decoding
- Uses `audioContext.decodeAudioData`
- Handles files up to ~10 minutes

## User Interface

### UI Components
- Waveform viewer with movable playhead
- Sliders and knobs for parameters
- Envelope dropdown
- Freeze and evolution toggles
- Optional CPU meter

### Presets
- Save/load via LocalStorage or IndexedDB
- Import/export JSON presets
- Includes factory preset library

### Aesthetic
- Minimal dark-themed UI
- Smooth micro-animations
- Fully responsive

## Audio Output

### Real-Time Output
- Continuous granular audio
- Volume control
- Optional FX:
  - Convolution reverb
  - Feedback delay

### Export (Optional Phase 2)
- Render pads via `OfflineAudioContext`
- Export WAV using Blobs

## Performance

- Single shared `AudioContext`
- Optimized grain scheduling with look-ahead
- UI updated via `requestAnimationFrame`
- Handles:
  - High grain densities
  - Large audio buffers
  - Stereo DSP

## Roadmap

1. Build granular DSP engine
2. Build UI + waveform viewer
3. Add preset system
4. Add export rendering
5. Add effects section
6. Mobile optimization

## Deliverables

- Granular DSP engine (TypeScript)
- UI components
- Waveform viewer
- Preset engine
- Documentation
- Production-ready web build

'use client';

// This page wires the super simple granular engine into a handful of sliders.
// Everything is intentionally straightforward and heavily commented (college style).
// Only native Web Audio is used here.

import { useEffect, useRef, useState } from "react";
import { Slider } from "./components/Slider";
import { TransportControls } from "./components/TransportControls";
import { GranularParams, useGranularEngine } from "./hooks/useGranularEngine";

// Default parameter values for the engine.
const DEFAULT_PARAMS: GranularParams = {
  grainSizeMs: 120,
  density: 8,
  playbackRate: 1,
  detuneSemitones: 0,
  startPoint: 0,
  endPoint: 1,
  attackMs: 10,
  releaseMs: 30,
  reverbWet: 0.25,
  reverbDecay: 2.5,
};

export default function Page() {
  // Mirror the params in React state so sliders can show live values.
  const [grainSizeMs, setGrainSizeMs] = useState(DEFAULT_PARAMS.grainSizeMs);
  const [density, setDensity] = useState(DEFAULT_PARAMS.density);
  const [playbackRate, setPlaybackRate] = useState(DEFAULT_PARAMS.playbackRate);
  const [detuneSemitones, setDetuneSemitones] = useState(DEFAULT_PARAMS.detuneSemitones);
  const [startPoint, setStartPoint] = useState(DEFAULT_PARAMS.startPoint);
  const [endPoint, setEndPoint] = useState(DEFAULT_PARAMS.endPoint);
  const [attackMs, setAttackMs] = useState(DEFAULT_PARAMS.attackMs);
  const [releaseMs, setReleaseMs] = useState(DEFAULT_PARAMS.releaseMs);
  const [reverbWet, setReverbWet] = useState(DEFAULT_PARAMS.reverbWet * 100); // UI in %
  const [reverbDecay, setReverbDecay] = useState(DEFAULT_PARAMS.reverbDecay);
  const [exportSeconds, setExportSeconds] = useState(5);

  // Keep track of how long the decoded buffer is, to bound the sliders.
  const [bufferDuration, setBufferDuration] = useState(1);

  // Basic file input ref so a button can trigger it.
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Hook that owns the AudioContext and grain scheduling.
  const { isPlaying, loadFile, start, stop, updateParams, renderLoop } = useGranularEngine(DEFAULT_PARAMS);

  // If density changes while playing, restart the interval so it takes effect.
  useEffect(() => {
    if (!isPlaying) return;
    void start();
  }, [density, isPlaying, start]);

  // Handle file selection: decode and push into the engine.
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const newDuration = await loadFile(file);
    // Sync UI sliders to the decoded buffer bounds.
    setBufferDuration(newDuration);
    setStartPoint(0);
    setEndPoint(newDuration);
    updateParams({ startPoint: 0, endPoint: newDuration });
  };

  // When a slider changes, update both the UI state and the engine params.
  const handleGrainSizeChange = (next: number) => {
    setGrainSizeMs(next);
    updateParams({ grainSizeMs: next });
  };

  const handleDensityChange = (next: number) => {
    setDensity(next);
    updateParams({ density: next });
  };

  const handlePlaybackRateChange = (next: number) => {
    setPlaybackRate(next);
    updateParams({ playbackRate: next });
  };

  const handleDetuneChange = (next: number) => {
    setDetuneSemitones(next);
    updateParams({ detuneSemitones: next });
  };

  const handleAttackChange = (next: number) => {
    setAttackMs(next);
    updateParams({ attackMs: next });
  };

  const handleReleaseChange = (next: number) => {
    setReleaseMs(next);
    updateParams({ releaseMs: next });
  };

  const handleReverbWetChange = (next: number) => {
    const wet = next / 100;
    setReverbWet(next);
    updateParams({ reverbWet: wet });
  };

  const handleReverbDecayChange = (next: number) => {
    setReverbDecay(next);
    updateParams({ reverbDecay: next });
  };

  const handleStartPointChange = (next: number) => {
    // Clamp so start is always before end.
    const clamped = Math.min(next, endPoint - 0.01);
    setStartPoint(clamped);
    updateParams({ startPoint: clamped });
  };

  const handleEndPointChange = (next: number) => {
    // Clamp so end is always after start.
    const clamped = Math.max(next, startPoint + 0.01);
    setEndPoint(clamped);
    updateParams({ endPoint: clamped });
  };

  // Render a short loop offline and trigger a WAV download.
  const handleExport = async () => {
    const rendered = await renderLoop(exportSeconds);
    if (!rendered) return;
    const wavBuffer = audioBufferToWav(rendered);
    const blob = new Blob([wavBuffer], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ambify-loop.wav";
    link.click();
    URL.revokeObjectURL(url);
  };

  const detuneMultiplier = Math.pow(2, detuneSemitones / 12);

  return (
    <main>
      <h1>ambify-alpha</h1>

      <div className="block">
        <h2>1) Audio source</h2>
        <button onClick={() => fileInputRef.current?.click()}>Upload audio file</button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <p>Loaded file duration: {bufferDuration.toFixed(2)} sec</p>
      </div>

      <div className="block">
        <h2>2) Transport</h2>
        <TransportControls
          isPlaying={isPlaying}
          onStart={() => void start()}
          onStop={() => stop()}
        />
      </div>

      <div className="block">
        <h2>3) Region (in/out points)</h2>
        <Slider
          label="Start point (seconds)"
          value={startPoint}
          min={0}
          max={bufferDuration}
          step={0.01}
          onChange={handleStartPointChange}
        />
        <Slider
          label="End point (seconds)"
          value={endPoint}
          min={0}
          max={bufferDuration}
          step={0.01}
          onChange={handleEndPointChange}
        />
      </div>

      <div className="block">
        <h2>4) Granular parameters</h2>
        <div className="row">
          <div className="column">
            <Slider
              label="Grain size (ms)"
              value={grainSizeMs}
              min={10}
              max={500}
              step={1}
              onChange={handleGrainSizeChange}
            />
            <Slider
              label="Density (grains/sec)"
              value={density}
              min={1}
              max={40}
              step={1}
              onChange={handleDensityChange}
            />
          </div>
          <div className="column">
            <Slider
              label="Playback rate"
              value={playbackRate}
              min={0.25}
              max={2}
              step={0.01}
              onChange={handlePlaybackRateChange}
            />
            <Slider
              label="Detune (semitones)"
              value={detuneSemitones}
              min={-12}
              max={12}
              step={0.1}
              onChange={handleDetuneChange}
            />
            <Slider
              label="Attack (ms)"
              value={attackMs}
              min={1}
              max={200}
              step={1}
              onChange={handleAttackChange}
            />
            <Slider
              label="Release (ms)"
              value={releaseMs}
              min={5}
              max={400}
              step={1}
              onChange={handleReleaseChange}
            />
          </div>
        </div>
        <p>
          Effective rate = playbackRate * 2^(detune/12) = {(playbackRate * detuneMultiplier).toFixed(2)}x
        </p>
      </div>

      <div className="block">
        <h2>5) Reverb</h2>
        <div className="row">
          <div className="column">
            <Slider
              label="Reverb mix (%)"
              value={reverbWet}
              min={0}
              max={100}
              step={1}
              onChange={handleReverbWetChange}
            />
          </div>
          <div className="column">
            <Slider
              label="Reverb decay (sec)"
              value={reverbDecay}
              min={0.1}
              max={10}
              step={0.1}
              onChange={handleReverbDecayChange}
            />
          </div>
        </div>
      </div>

      <div className="block">
        <h2>6) Export loop (offline render)</h2>
        <Slider
          label="Export length (sec)"
          value={exportSeconds}
          min={1}
          max={15}
          step={0.5}
          onChange={setExportSeconds}
        />
        <button onClick={() => void handleExport()}>Export WAV</button>
      </div>
    </main>
  );
}

// Small helper to turn an AudioBuffer into a WAV ArrayBuffer (16-bit PCM).
// This is hand-rolled using the standard RIFF/WAVE header layout.
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const numFrames = buffer.length;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const bufferSize = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");

  // fmt chunk
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true); // bits per sample

  // data chunk
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave and clamp samples to 16-bit PCM
  let offset = 44;
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

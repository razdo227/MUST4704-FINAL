'use client';

// Main page component for ambify granular synthesizer
// Features a viewport-fitted UI with waveform viewer and rotary controls
import { useEffect, useRef, useState } from "react";
import { Dial } from "./components/Dial";
import { TransportControls } from "./components/TransportControls";
import { WaveformViewer } from "./components/WaveformViewer";
import { GranularParams, useGranularEngine } from "./hooks/useGranularEngine";
import { audioBufferToWav } from "./utils/audio";

// Default starting values for the granular engine
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
  // UI state for all parameters
  // We keep these in React state so the dials and sliders show current values
  const [grainSizeMs, setGrainSizeMs] = useState(DEFAULT_PARAMS.grainSizeMs);
  const [density, setDensity] = useState(DEFAULT_PARAMS.density);
  const [playbackRate, setPlaybackRate] = useState(DEFAULT_PARAMS.playbackRate);
  const [detuneSemitones, setDetuneSemitones] = useState(DEFAULT_PARAMS.detuneSemitones);
  const [startPoint, setStartPoint] = useState(DEFAULT_PARAMS.startPoint);
  const [endPoint, setEndPoint] = useState(DEFAULT_PARAMS.endPoint);
  const [attackMs, setAttackMs] = useState(DEFAULT_PARAMS.attackMs);
  const [releaseMs, setReleaseMs] = useState(DEFAULT_PARAMS.releaseMs);
  const [reverbWet, setReverbWet] = useState(DEFAULT_PARAMS.reverbWet * 100);  // UI uses 0-100
  const [reverbDecay, setReverbDecay] = useState(DEFAULT_PARAMS.reverbDecay);
  const [exportSeconds, setExportSeconds] = useState(5);
  const [volume, setVolume] = useState(100); // 0-100

  // Reference to hidden file input for triggering file selection
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // The granular engine hook - handles all Web Audio API operations
  const { isPlaying, audioBuffer, loadFile, start, stop, updateParams, renderLoop, setMasterVolume } = useGranularEngine(DEFAULT_PARAMS);

  // Restart playback when density changes (need new interval timing)
  useEffect(() => {
    if (!isPlaying) return;
    void start();
  }, [density, isPlaying, start]);

  // Load and decode audio file
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const newDuration = await loadFile(file);
    // Set region to 4 seconds (or full file if shorter)
    const initialEnd = Math.min(4, newDuration);
    setStartPoint(0);
    setEndPoint(initialEnd);
    updateParams({ startPoint: 0, endPoint: initialEnd });
  };

  // Generic parameter handler
  const handleParamChange = (setter: (v: number) => void, paramKey: keyof GranularParams, value: number) => {
    setter(value);
    updateParams({ [paramKey]: value });
  };

  // Special handlers for values that need conversion
  const handleReverbWetChange = (value: number) => {
    setReverbWet(value);
    updateParams({ reverbWet: value / 100 });
  };

  const handleVolumeChange = (value: number) => {
    setVolume(value);
    setMasterVolume(value / 100);
  };

  // Handle region marker changes - ensure start is always before end
  const handleRegionChange = (newStart: number, newEnd: number) => {
    setStartPoint(newStart);
    setEndPoint(newEnd);
    updateParams({ startPoint: newStart, endPoint: newEnd });
  };

  // Render a loop offline and export as WAV file
  const handleExport = async () => {
    const rendered = await renderLoop(exportSeconds);
    if (!rendered) return;
    // Convert AudioBuffer to WAV format
    const wavBuffer = audioBufferToWav(rendered);
    const blob = new Blob([wavBuffer], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    // Trigger download
    const link = document.createElement("a");
    link.href = url;
    link.download = "ambify-loop.wav";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>ambify</h1>
        <div className="header-controls">
          <button className="upload-button" onClick={() => fileInputRef.current?.click()}>
            Load Audio
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <div className="volume-control">
            <label>Master</label>
            <input
              type="range"
              value={volume}
              min={0}
              max={100}
              step={1}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
            />
            <span>{volume}%</span>
          </div>
          <TransportControls
            isPlaying={isPlaying}
            onStart={() => void start()}
            onStop={() => stop()}
          />
        </div>
      </header>

      <div className="main-content">
        <div className="waveform-section">
          <WaveformViewer
            audioBuffer={audioBuffer}
            startPoint={startPoint}
            endPoint={endPoint}
            onRegionChange={handleRegionChange}
          />
        </div>

        <div className="controls-section">
          <div className="controls-panel">
            {/* Grain Module */}
            <div className="control-module">
              <h2>Grain Engine</h2>
              <div className="dials-row">
                <Dial
                  label="Size"
                  value={grainSizeMs}
                  min={10}
                  max={500}
                  step={1}
                  onChange={(v) => handleParamChange(setGrainSizeMs, 'grainSizeMs', v)}
                  unit="ms"
                />
                <Dial
                  label="Density"
                  value={density}
                  min={1}
                  max={40}
                  step={1}
                  onChange={(v) => handleParamChange(setDensity, 'density', v)}
                  unit="/s"
                />
              </div>
            </div>

            {/* Envelope Module */}
            <div className="control-module">
              <h2>Envelope</h2>
              <div className="dials-row">
                <Dial
                  label="Attack"
                  value={attackMs}
                  min={1}
                  max={200}
                  step={1}
                  onChange={(v) => handleParamChange(setAttackMs, 'attackMs', v)}
                  unit="ms"
                />
                <Dial
                  label="Release"
                  value={releaseMs}
                  min={5}
                  max={400}
                  step={1}
                  onChange={(v) => handleParamChange(setReleaseMs, 'releaseMs', v)}
                  unit="ms"
                />
              </div>
            </div>

            {/* Pitch Module */}
            <div className="control-module">
              <h2>Pitch / Time</h2>
              <div className="dials-row">
                <Dial
                  label="Rate"
                  value={playbackRate}
                  min={0.25}
                  max={2}
                  step={0.01}
                  onChange={(v) => handleParamChange(setPlaybackRate, 'playbackRate', v)}
                  unit="x"
                />
                <Dial
                  label="Detune"
                  value={detuneSemitones}
                  min={-12}
                  max={12}
                  step={0.1}
                  onChange={(v) => handleParamChange(setDetuneSemitones, 'detuneSemitones', v)}
                  unit="st"
                />
              </div>
            </div>

            {/* Effects Module */}
            <div className="control-module">
              <h2>Space</h2>
              <div className="dials-row">
                <Dial
                  label="Mix"
                  value={reverbWet}
                  min={0}
                  max={100}
                  step={1}
                  onChange={handleReverbWetChange}
                  unit="%"
                />
                <Dial
                  label="Decay"
                  value={reverbDecay}
                  min={0.1}
                  max={10}
                  step={0.1}
                  onChange={(v) => handleParamChange(setReverbDecay, 'reverbDecay', v)}
                  unit="s"
                />
              </div>
            </div>

            {/* Export Module */}
            <div className="control-module export-module">
              <h2>Export</h2>
              <div className="export-controls-vertical">
                <div className="export-slider-compact">
                  <label>Length: {exportSeconds.toFixed(1)}s</label>
                  <input
                    type="range"
                    value={exportSeconds}
                    min={1}
                    max={15}
                    step={0.5}
                    onChange={(e) => setExportSeconds(Number(e.target.value))}
                  />
                </div>
                <button className="export-button" onClick={() => void handleExport()}>
                  SAVE WAV
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

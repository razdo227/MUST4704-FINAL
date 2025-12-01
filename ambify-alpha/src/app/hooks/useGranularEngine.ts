'use client';

// Custom React hook for granular synthesis engine
// This is the brain of the whole app - it handles all the audio processing
//
// What is granular synthesis?
// Instead of playing audio normally, we chop it into tiny "grains" (like 50-200ms chunks)
// and play them back with effects. This creates cool ambient/glitchy textures.
//
// How it works:
// - setInterval spawns new grains at a fixed rate (density = grains per second)
// - each grain is a BufferSourceNode with a fade in/out envelope to avoid clicks
// - we pick random positions inside the in/out points for variation
// - built-in convolver reverb for that spacey sound (works both live and offline)

import { useCallback, useEffect, useRef, useState } from "react";

// Type definition for all the parameters our granular engine needs
export type GranularParams = {
  grainSizeMs: number;       // how long each grain lasts (in milliseconds)
  density: number;           // how many grains per second
  playbackRate: number;      // speed multiplier (1 = normal, 2 = double speed)
  detuneSemitones: number;   // pitch shift in semitones (-12 to +12)
  startPoint: number;        // where in the audio file to start grabbing grains (seconds)
  endPoint: number;          // where to stop grabbing grains (seconds)
  attackMs: number;          // fade-in time to avoid clicks (milliseconds)
  releaseMs: number;         // fade-out time to avoid clicks (milliseconds)
  reverbWet: number;         // reverb mix amount (0 = dry, 1 = full wet)
  reverbDecay: number;       // how long the reverb tail lasts (seconds)
};

export function useGranularEngine(initial: GranularParams) {
  // Using refs instead of state because we don't want re-renders when these change
  // Refs persist across renders but don't trigger updates
  const audioCtxRef = useRef<AudioContext | null>(null);        // Web Audio API context
  const bufferRef = useRef<AudioBuffer | null>(null);           // decoded audio data
  const paramsRef = useRef<GranularParams>(initial);            // current parameter values
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);  // grain scheduler
  const dryGainRef = useRef<GainNode | null>(null);             // dry signal volume
  const wetGainRef = useRef<GainNode | null>(null);             // wet (reverb) signal volume
  const reverbRef = useRef<ConvolverNode | null>(null);         // convolver for reverb effect

  // State that DOES trigger re-renders (for UI updates)
  const [duration, setDuration] = useState(1);       // how long the loaded audio file is
  const [isPlaying, setIsPlaying] = useState(false); // whether grains are currently playing

  // Initialize the Web Audio context and reverb graph
  // This only runs once and reuses the same context afterwards
  const ensureContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;

    // Set up the audio routing graph: dry signal and wet (reverb) signal
    // This only happens once when the context is first created
    if (!dryGainRef.current) {
      // Dry path goes straight to speakers - this is the unaffected signal
      dryGainRef.current = ctx.createGain();
      dryGainRef.current.connect(ctx.destination);
    }
    if (!wetGainRef.current) {
      // Wet gain controls how much reverb we hear
      wetGainRef.current = ctx.createGain();
    }
    if (!reverbRef.current) {
      // Create a fake reverb using a ConvolverNode
      // Convolution reverb works by multiplying the audio with an "impulse response"
      // We're making a simple fake impulse here instead of loading a real one

      const makeImpulse = (decaySec: number) => {
        // Calculate how many samples we need for the decay time
        const length = Math.max(Math.floor(decaySec * ctx.sampleRate), 1);
        // Create a stereo buffer (2 channels)
        const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

        for (let ch = 0; ch < 2; ch++) {
          const data = impulse.getChannelData(ch);
          for (let i = 0; i < length; i++) {
            // Fill with random noise that decays over time
            // Math.pow(1 - i/length, 2) creates an exponential decay curve
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
          }
        }
        return impulse;
      };

      reverbRef.current = ctx.createConvolver();
      reverbRef.current.buffer = makeImpulse(paramsRef.current.reverbDecay);
      // Route wet gain into the convolver, then to destination.
      if (wetGainRef.current) {
        wetGainRef.current.connect(reverbRef.current);
      }
      reverbRef.current.connect(ctx.destination);
    }

    return ctx;
  }, []);

  // Load and decode a file. Returns the decoded duration.
  const loadFile = useCallback(async (file: File) => {
    const ctx = ensureContext();
    const arrayBuffer = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    bufferRef.current = decoded;
    setDuration(decoded.duration);

    // Reset in/out window to the full file.
    paramsRef.current = {
      ...paramsRef.current,
      startPoint: 0,
      endPoint: decoded.duration,
    };

    return decoded.duration;
  }, [ensureContext]);

  // Update any subset of parameters. We keep them in a ref so the
  // scheduler sees the latest values without re-binding listeners.
  const updateParams = useCallback((partial: Partial<GranularParams>) => {
    paramsRef.current = { ...paramsRef.current, ...partial };
    // Keep the live reverb in sync with UI.
    if (partial.reverbWet !== undefined && wetGainRef.current) {
      wetGainRef.current.gain.value = partial.reverbWet;
    }
    if (partial.reverbDecay !== undefined && reverbRef.current && audioCtxRef.current) {
      // Rebuild the impulse when decay changes.
      const ctx = audioCtxRef.current;
      const makeImpulse = (decaySec: number) => {
        const length = Math.max(Math.floor(decaySec * ctx.sampleRate), 1);
        const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const data = impulse.getChannelData(ch);
          for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
          }
        }
        return impulse;
      };
      reverbRef.current.buffer = makeImpulse(partial.reverbDecay);
    }
  }, []);

  // Clear the current grain interval if it exists.
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // This is where the magic happens - spawn a single grain!
  // Called repeatedly by setInterval to create the granular texture
  const spawnGrain = useCallback(() => {
    const ctx = audioCtxRef.current;
    const buffer = bufferRef.current;
    const params = paramsRef.current;
    if (!ctx || !buffer) return;  // bail if audio isn't loaded yet
    if (params.endPoint <= params.startPoint) return;  // invalid range

    // Convert grain size from milliseconds to seconds (Web Audio uses seconds)
    const grainDuration = params.grainSizeMs / 1000;

    // Figure out how much audio we can grab grains from (the "window")
    const windowLength = Math.max(params.endPoint - params.startPoint, 0.05);

    // We need some room to fit the grain, so calculate the valid range
    const offsetRange = Math.max(windowLength - grainDuration, 0);

    // Pick a random starting point for this grain within the window
    // This randomness is what makes granular synthesis sound interesting!
    const randomOffset = Math.random() * offsetRange;
    const offset = params.startPoint + randomOffset;

    // Create a new audio source for this grain
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Calculate pitch shift using the equal temperament formula
    // 2^(semitones/12) converts semitones to frequency ratio
    const detuneMultiplier = Math.pow(2, params.detuneSemitones / 12);
    source.playbackRate.value = params.playbackRate * detuneMultiplier;

    const now = ctx.currentTime;

    // Create an envelope (fade in/out) to avoid clicking sounds
    // Without this, starting/stopping audio abruptly creates ugly pops
    const maxEnvelope = Math.max(grainDuration - 0.005, 0.005);
    const attackSec = Math.min(params.attackMs / 1000, maxEnvelope);
    const releaseSec = Math.min(params.releaseMs / 1000, maxEnvelope - attackSec);
    const releaseStart = now + Math.max(grainDuration - releaseSec, attackSec);

    // Set up the gain envelope
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);  // start silent
    gain.gain.linearRampToValueAtTime(1, now + attackSec);  // fade in
    gain.gain.linearRampToValueAtTime(0.0001, releaseStart + releaseSec);  // fade out

    const dryGain = dryGainRef.current;
    const wetGain = wetGainRef.current;

    // Connect this grain to both dry and wet paths (parallel routing)
    // This lets us control dry/wet mix
    if (dryGain) gain.connect(dryGain);
    if (wetGain) gain.connect(wetGain);
    if (!dryGain && !wetGain) gain.connect(ctx.destination);  // fallback

    source.connect(gain);

    // Start playing the grain at the calculated offset
    source.start(now, offset, grainDuration);
    // Schedule it to stop (with a tiny bit of extra time for the envelope)
    source.stop(now + grainDuration + 0.05);
  }, []);

  // Start scheduling grains based on the current density.
  const start = useCallback(async () => {
    const ctx = ensureContext();
    await ctx.resume(); // required on some browsers after user gesture
    if (!bufferRef.current) {
      alert("Load an audio file first.");
      return;
    }
    clearTimer();
    const intervalMs = 1000 / Math.max(paramsRef.current.density, 1);
    timerRef.current = setInterval(spawnGrain, intervalMs);
    setIsPlaying(true);
  }, [clearTimer, ensureContext, spawnGrain]);

  // Stop scheduling new grains.
  const stop = useCallback(() => {
    clearTimer();
    setIsPlaying(false);
  }, [clearTimer]);

  // Offline render: render a short loop to an OfflineAudioContext, then return the buffer.
  const renderLoop = useCallback(async (durationSec: number) => {
    const buffer = bufferRef.current;
    if (!buffer) {
      alert("Load an audio file first.");
      return null;
    }

    const params = paramsRef.current;
    // Build an OfflineAudioContext and mirror the live graph with dry/wet + convolver.
    const liveCtx = ensureContext();
    const sampleRate = liveCtx.sampleRate;
    const channels = buffer.numberOfChannels;
    const totalFrames = Math.ceil(durationSec * sampleRate);
    const offlineCtx = new OfflineAudioContext(channels, totalFrames, sampleRate);

    // Simple reverb IR builder reused for offline path.
    const makeImpulse = (decaySec: number) => {
      const length = Math.max(Math.floor(decaySec * offlineCtx.sampleRate), 1);
      const impulse = offlineCtx.createBuffer(2, length, offlineCtx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = impulse.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
        }
      }
      return impulse;
    };

    const dry = offlineCtx.createGain();
    const wet = offlineCtx.createGain();
    dry.connect(offlineCtx.destination);

    const convolver = offlineCtx.createConvolver();
    convolver.buffer = makeImpulse(params.reverbDecay);
    wet.connect(convolver).connect(offlineCtx.destination);
    wet.gain.value = params.reverbWet;
    dry.gain.value = 1;

    const grainDuration = params.grainSizeMs / 1000;
    const step = 1 / Math.max(params.density, 1); // seconds between grains

    // Schedule grains across the offline timeline.
    for (let t = 0; t < durationSec; t += step) {
      const windowLength = Math.max(params.endPoint - params.startPoint, 0.05);
      const offsetRange = Math.max(windowLength - grainDuration, 0);
      const randomOffset = Math.random() * offsetRange;
      const offset = params.startPoint + randomOffset;

      const source = offlineCtx.createBufferSource();
      source.buffer = buffer;
      const detuneMultiplier = Math.pow(2, params.detuneSemitones / 12);
      source.playbackRate.value = params.playbackRate * detuneMultiplier;

      const gain = offlineCtx.createGain();

      // Envelope, clamped to the grain duration.
      const maxEnvelope = Math.max(grainDuration - 0.005, 0.005);
      const attackSec = Math.min(params.attackMs / 1000, maxEnvelope);
      const releaseSec = Math.min(params.releaseMs / 1000, maxEnvelope - attackSec);
      const releaseStart = t + Math.max(grainDuration - releaseSec, attackSec);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1, t + attackSec);
      gain.gain.linearRampToValueAtTime(0.0001, releaseStart + releaseSec);

      gain.connect(dry);
      gain.connect(wet);
      source.connect(gain);
      source.start(t, offset, grainDuration);
      source.stop(t + grainDuration + 0.05);
    }

    const rendered = await offlineCtx.startRendering();

    return rendered;
  }, [ensureContext]);

  // Clean up when the component using this hook unmounts.
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return {
    duration,
    isPlaying,
    loadFile,
    start,
    stop,
    updateParams,
    renderLoop,
  };
}

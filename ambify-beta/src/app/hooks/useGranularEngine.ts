'use client';

// Granular synthesis engine
// Chops audio into tiny "grains" (50-200ms chunks) and plays them back with effects
// Creates ambient/glitchy textures by spawning grains at random positions

import { useCallback, useEffect, useRef, useState } from "react";

export type GranularParams = {
  grainSizeMs: number;
  density: number;
  playbackRate: number;
  detuneSemitones: number;
  startPoint: number;
  endPoint: number;
  attackMs: number;
  releaseMs: number;
  reverbWet: number;
  reverbDecay: number;
};

export function useGranularEngine(initial: GranularParams) {
  // Refs for audio nodes and state (no re-renders)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const paramsRef = useRef<GranularParams>(initial);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const reverbRef = useRef<ConvolverNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);

  // UI state (triggers re-renders)
  const [duration, setDuration] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);

  // Initialize audio context and routing graph
  const ensureContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;

    // Create master gain if needed
    if (!masterGainRef.current) {
      masterGainRef.current = ctx.createGain();
      masterGainRef.current.gain.value = 1.0;
      masterGainRef.current.connect(ctx.destination);
    }

    // Create dry and wet paths
    if (!dryGainRef.current) {
      dryGainRef.current = ctx.createGain();
      dryGainRef.current.connect(masterGainRef.current);
    }
    if (!wetGainRef.current) {
      wetGainRef.current = ctx.createGain();
    }

    // Create convolver reverb with fake impulse response
    if (!reverbRef.current) {
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

      reverbRef.current = ctx.createConvolver();
      reverbRef.current.buffer = makeImpulse(paramsRef.current.reverbDecay);
      if (wetGainRef.current) {
        wetGainRef.current.connect(reverbRef.current);
      }
      reverbRef.current.connect(masterGainRef.current);
    }

    return ctx;
  }, []);

  // Load and decode audio file
  const loadFile = useCallback(async (file: File) => {
    const ctx = ensureContext();
    const arrayBuffer = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    bufferRef.current = decoded;
    setDuration(decoded.duration);
    paramsRef.current = {
      ...paramsRef.current,
      startPoint: 0,
      endPoint: decoded.duration,
    };
    return decoded.duration;
  }, [ensureContext]);

  // Update parameters and sync with audio nodes
  const updateParams = useCallback((partial: Partial<GranularParams>) => {
    paramsRef.current = { ...paramsRef.current, ...partial };
    if (partial.reverbWet !== undefined && wetGainRef.current) {
      wetGainRef.current.gain.value = partial.reverbWet;
    }
    if (partial.reverbDecay !== undefined && reverbRef.current && audioCtxRef.current) {
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

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Spawn a single grain - called by setInterval
  const spawnGrain = useCallback(() => {
    const ctx = audioCtxRef.current;
    const buffer = bufferRef.current;
    const params = paramsRef.current;
    if (!ctx || !buffer) return;
    if (params.endPoint <= params.startPoint) return;

    const grainDuration = params.grainSizeMs / 1000;
    const windowLength = Math.max(params.endPoint - params.startPoint, 0.05);
    const offsetRange = Math.max(windowLength - grainDuration, 0);
    const randomOffset = Math.random() * offsetRange;
    const offset = params.startPoint + randomOffset;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const detuneMultiplier = Math.pow(2, params.detuneSemitones / 12);
    source.playbackRate.value = params.playbackRate * detuneMultiplier;

    const now = ctx.currentTime;

    // Create envelope to avoid clicks
    const maxEnvelope = Math.max(grainDuration - 0.005, 0.005);
    const attackSec = Math.min(params.attackMs / 1000, maxEnvelope);
    const releaseSec = Math.min(params.releaseMs / 1000, maxEnvelope - attackSec);
    const releaseStart = now + Math.max(grainDuration - releaseSec, attackSec);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + attackSec);
    gain.gain.linearRampToValueAtTime(0.0001, releaseStart + releaseSec);

    const dryGain = dryGainRef.current;
    const wetGain = wetGainRef.current;

    if (dryGain) gain.connect(dryGain);
    if (wetGain) gain.connect(wetGain);
    if (!dryGain && !wetGain) gain.connect(ctx.destination);

    source.connect(gain);
    source.start(now, offset, grainDuration);
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

  // Update master volume (0-1 range)
  const setMasterVolume = useCallback((volume: number) => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = Math.max(0, Math.min(1, volume));
    }
  }, []);

  // Clean up when the component using this hook unmounts.
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return {
    duration,
    isPlaying,
    audioBuffer: bufferRef.current,
    loadFile,
    start,
    stop,
    updateParams,
    renderLoop,
    setMasterVolume,
  };
}

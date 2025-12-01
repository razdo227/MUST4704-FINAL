'use client';

// Waveform viewer using wavesurfer.js
// Provides zoom, scroll, draggable region markers, minimap, and timeline
import React, { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin, { type Region } from 'wavesurfer.js/dist/plugins/regions.js';
import MinimapPlugin from 'wavesurfer.js/dist/plugins/minimap.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.js';
import { audioBufferToBlob } from '../utils/audio';

type WaveformViewerProps = {
  audioBuffer: AudioBuffer | null;
  startPoint: number;
  endPoint: number;
  onRegionChange: (start: number, end: number) => void;
};

export function WaveformViewer({
  audioBuffer,
  startPoint,
  endPoint,
  onRegionChange,
}: WaveformViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<RegionsPlugin | null>(null);
  const [zoom, setZoom] = React.useState(50); // pixels per second
  const isUserDraggingRef = useRef(false); // Track if user is actively dragging

  // Store callback in ref to avoid recreating wavesurfer on every render
  const onRegionChangeRef = useRef(onRegionChange);

  // Update ref when callback changes
  useEffect(() => {
    onRegionChangeRef.current = onRegionChange;
  }, [onRegionChange]);

  // Initialize wavesurfer once
  useEffect(() => {
    if (!containerRef.current) return;
    if (wavesurferRef.current) return; // Already initialized

    // Create plugins
    const regions = RegionsPlugin.create();
    regionsPluginRef.current = regions;

    const minimap = MinimapPlugin.create({
      height: 30,
      waveColor: '#333',
      progressColor: '#666',
      backgroundColor: '#000',
      cursorWidth: 0,
    });

    const timeline = TimelinePlugin.create({
      height: 20,
      timeInterval: 1,
      primaryLabelInterval: 5,
      style: {
        fontSize: '10px',
        color: '#666',
        fontFamily: 'Courier New, monospace',
      },
    });

    // Create wavesurfer instance with smooth waveform style
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#333',
      progressColor: '#fff',
      cursorColor: '#fff',
      cursorWidth: 1,
      height: 128,
      normalize: true,
      fillParent: true,
      minPxPerSec: 50,
      hideScrollbar: false,
      autoScroll: false,
      autoCenter: false,
      // No barWidth/barGap = smooth continuous waveform
      plugins: [timeline, regions, minimap],
    });

    wavesurferRef.current = ws;

    // Track when user starts and stops dragging/resizing regions
    // `region-update` fires while dragging; `region-updated` fires once the drag ends
    const offRegionUpdate = regions.on('region-update', () => {
      isUserDraggingRef.current = true;
    });

    const offRegionUpdated = regions.on('region-updated', (region: Region) => {
      isUserDraggingRef.current = false;
      if (region.id === 'playback-region') {
        onRegionChangeRef.current(region.start, region.end);
      }
    });

    // Cleanup
    return () => {
      offRegionUpdate();
      offRegionUpdated();
      ws.destroy();
      wavesurferRef.current = null;
    };
  }, []); // Empty deps - only initialize once

  // Load audio when buffer changes
  useEffect(() => {
    if (!audioBuffer || !wavesurferRef.current) return;

    const ws = wavesurferRef.current;

    // Convert AudioBuffer to Blob
    const blob = audioBufferToBlob(audioBuffer);

    // Load the blob
    ws.loadBlob(blob);

    // When ready, create the region
    const handleReady = () => {
      const regions = regionsPluginRef.current;
      if (!regions) return;

      // Clear any existing regions
      regions.clearRegions();

      // Add the playback region
      regions.addRegion({
        id: 'playback-region',
        start: startPoint,
        end: endPoint,
        color: 'rgba(255, 255, 255, 0.1)',
        drag: true,
        resize: true,
      });
    };

    ws.once('ready', handleReady);

    return () => {
      ws.un('ready', handleReady);
    };
  }, [audioBuffer]);

  // Update region when startPoint/endPoint change from parent (but not during user drag)
  useEffect(() => {
    if (!wavesurferRef.current || !regionsPluginRef.current) return;
    if (isUserDraggingRef.current) return; // Don't update while user is dragging

    const regions = regionsPluginRef.current;
    const existingRegion = regions.getRegions().find((region) => region.id === 'playback-region');

    if (existingRegion) {
      // Update existing region instead of recreating
      existingRegion.setOptions({
        start: startPoint,
        end: endPoint,
      });
    }
  }, [startPoint, endPoint]);

  // Handle zoom changes
  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom);
    if (wavesurferRef.current) {
      wavesurferRef.current.zoom(newZoom);
    }
  };

  return (
    <div className="waveform-container">
      <div className="waveform-controls">
        <label className="zoom-label">Zoom</label>
        <input
          type="range"
          className="zoom-slider"
          value={zoom}
          min={10}
          max={200}
          step={5}
          onChange={(e) => handleZoomChange(Number(e.target.value))}
        />
        <span className="zoom-value">{zoom} px/s</span>
      </div>
      <div className="waveform-content" ref={containerRef} />
      {!audioBuffer && (
        <div className="waveform-placeholder">
          <p>LOAD AUDIO FILE</p>
        </div>
      )}
    </div>
  );
}

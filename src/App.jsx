import React, { useState, useEffect } from 'react';
import Toolbar from './components/Toolbar.jsx';
import Preview from './components/Preview.jsx';
import Timeline from './components/Timeline.jsx';

function App() {
  const [clips, setClips] = useState([]);
  const [currentClip, setCurrentClip] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadPosition, setPlayheadPosition] = useState(0);

  const handleImportVideo = async () => {
    try {
      const filePath = await window.electronAPI.openVideoFile();
      if (!filePath) return;

      // Get video duration
      const duration = await window.electronAPI.getVideoDuration(filePath);
      
      // Generate thumbnail
      const thumbnailPath = await window.electronAPI.generateThumbnail(filePath);

      const newClip = {
        id: Date.now(),
        filePath,
        duration,
        thumbnailPath,
        startTime: 0,
        endTime: duration,
        trimStart: 0,
        trimEnd: duration,
        position: playheadPosition // Place at current playhead
      };

      setClips([...clips, newClip]);
      setCurrentClip(newClip);
    } catch (error) {
      console.error('Error importing video:', error);
      alert('Failed to import video: ' + error.message);
    }
  };

  const handleExport = async () => {
    if (clips.length === 0) {
      alert('No clips to export');
      return;
    }

    try {
      // For now, export the first clip (single clip MVP)
      const clip = clips[0];
      const outputPath = await window.electronAPI.showSaveDialog();
      
      if (!outputPath) return;

      // Listen for progress updates
      const progressListener = (progress) => {
        console.log('Export progress:', progress);
        // You can update UI here
      };

      window.electronAPI.onExportProgress(progressListener);

      await window.electronAPI.exportVideo({
        inputPath: clip.filePath,
        outputPath,
        startTime: clip.trimStart,
        endTime: clip.trimEnd,
        scaleTo1080p: true
      });

      alert('Export completed successfully!');
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed: ' + error.message);
    }
  };

  const handleTimeUpdate = (currentTime) => {
    setPlayheadPosition(currentTime);
  };

  const handlePlay = () => {
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleTimelineSeek = (time) => {
    setPlayheadPosition(time);
    // Update video current time
  };

  return (
    <div className="app">
      <Toolbar
        onImport={handleImportVideo}
        onExport={handleExport}
        canExport={clips.length > 0}
      />
      <div className="main-content">
        <Preview
          clip={currentClip}
          isPlaying={isPlaying}
          onPlay={handlePlay}
          onPause={handlePause}
          playheadPosition={playheadPosition}
          onTimeUpdate={handleTimeUpdate}
          onSeek={handleTimelineSeek}
        />
      </div>
      <Timeline
        clips={clips}
        setClips={setClips}
        currentClip={currentClip}
        setCurrentClip={setCurrentClip}
        playheadPosition={playheadPosition}
        onSeek={handleTimelineSeek}
      />
    </div>
  );
}

export default App;


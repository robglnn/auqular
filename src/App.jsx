import React, { useState, useEffect } from 'react';
import Toolbar from './components/Toolbar.jsx';
import Preview from './components/Preview.jsx';
import Timeline from './components/Timeline.jsx';
import WebcamRecorder from './components/WebcamRecorder.jsx';

function App() {
  const [clips, setClips] = useState([]);
  const [currentClip, setCurrentClip] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadPosition, setPlayheadPosition] = useState(0);
  const [showRecordingPanel, setShowRecordingPanel] = useState(false);

  const handleImportVideo = async () => {
    try {
      const { ipcRenderer } = window.require('electron');
      const filePath = await ipcRenderer.invoke('open-video-file');
      if (!filePath) return;

      // Get video duration
      const duration = await ipcRenderer.invoke('get-video-duration', filePath);
      
      // Generate thumbnail
      const thumbnailPath = await ipcRenderer.invoke('generate-thumbnail', filePath);

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
      const { ipcRenderer } = window.require('electron');
      const outputPath = await ipcRenderer.invoke('show-save-dialog');
      
      if (!outputPath) return;

      // Listen for progress updates
      const progressListener = (progress) => {
        console.log('Export progress:', progress);
        // You can update UI here
      };

      ipcRenderer.on('export-progress', (event, progress) => progressListener(progress));

      await ipcRenderer.invoke('export-video', {
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

  const handleRecordingComplete = async (filePath) => {
    try {
      // Automatically import the recorded video
      const { ipcRenderer } = window.require('electron');
      const duration = await ipcRenderer.invoke('get-video-duration', filePath);
      const thumbnailPath = await ipcRenderer.invoke('generate-thumbnail', filePath);

      const newClip = {
        id: Date.now(),
        filePath,
        duration,
        thumbnailPath,
        startTime: 0,
        endTime: duration,
        trimStart: 0,
        trimEnd: duration,
        position: playheadPosition
      };

      setClips([...clips, newClip]);
      setCurrentClip(newClip);
      setShowRecordingPanel(false);
      
      alert('Recording imported successfully!');
    } catch (error) {
      console.error('Error importing recording:', error);
      alert('Failed to import recording: ' + error.message);
    }
  };

  return (
    <div className="app">
      <Toolbar
        onImport={handleImportVideo}
        onExport={handleExport}
        canExport={clips.length > 0}
        onRecord={() => setShowRecordingPanel(!showRecordingPanel)}
      />
      <div className="main-content">
        {showRecordingPanel && (
          <WebcamRecorder onRecordingComplete={handleRecordingComplete} />
        )}
        {!showRecordingPanel && (
          <Preview
            clip={currentClip}
            isPlaying={isPlaying}
            onPlay={handlePlay}
            onPause={handlePause}
            playheadPosition={playheadPosition}
            onTimeUpdate={handleTimeUpdate}
            onSeek={handleTimelineSeek}
          />
        )}
      </div>
      {!showRecordingPanel && (
        <Timeline
          clips={clips}
          setClips={setClips}
          currentClip={currentClip}
          setCurrentClip={setCurrentClip}
          playheadPosition={playheadPosition}
          onSeek={handleTimelineSeek}
        />
      )}
    </div>
  );
}

export default App;


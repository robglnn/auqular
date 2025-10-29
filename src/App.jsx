import React, { useState, useEffect, useRef } from 'react';
import Toolbar from './components/Toolbar.jsx';
import Preview from './components/Preview.jsx';
import MultiLaneTimeline from './components/MultiLaneTimeline.jsx';
import WebcamRecorder from './components/WebcamRecorder.jsx';
import ScreenRecorder from './components/ScreenRecorder.jsx';
import SimultaneousRecorder from './components/SimultaneousRecorder.jsx';

function App() {
  const [clips, setClips] = useState([]);
  const [currentClip, setCurrentClip] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadPosition, setPlayheadPosition] = useState(0);
  const [showRecordingPanel, setShowRecordingPanel] = useState(false);
  const [recordingType, setRecordingType] = useState('webcam'); // 'webcam', 'screen', or 'simultaneous'

  const playbackStateRef = useRef({
    animationId: null,
    position: 0,
    timestamp: null
  });

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
        position: playheadPosition, // Place at current playhead
        lane: 'video' // Default to video lane
      };

      setClips([...clips, newClip]);
      setCurrentClip(newClip);
    } catch (error) {
      console.error('Error importing video:', error);
      alert('Failed to import video: ' + error.message);
    }
  };

  const handleExport = async () => {
    // Get visible clips from timeline
    const visibleClips = window.visibleClips || clips;
    
    if (visibleClips.length === 0) {
      alert('No visible clips to export');
      return;
    }

    try {
      // For now, export the first visible clip (single clip MVP)
      const clip = visibleClips[0];
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

  // Get the clip at a specific timeline position
  const getClipAtPosition = (timelinePosition) => {
    const visibleClips = window.visibleClips || clips;
    
    for (const clip of visibleClips) {
      const clipStart = clip.position;
      const clipEnd = clip.position + (clip.trimEnd - clip.trimStart);
      
      if (timelinePosition >= clipStart && timelinePosition < clipEnd) {
        return clip;
      }
    }
    return null;
  };

  const handleTimeUpdate = (clipTime) => {
    // No need to handle time updates - the useEffect will handle playhead advancement
  };

  // Effect to continuously advance playhead when playing
  useEffect(() => {
    if (!isPlaying) return;
    
    playbackStateRef.current.position = playheadPosition;
    playbackStateRef.current.timestamp = Date.now();
    
    const updatePlayhead = () => {
      const elapsed = (Date.now() - playbackStateRef.current.timestamp) / 1000;
      const newPos = playbackStateRef.current.position + elapsed;
      
      setPlayheadPosition(newPos);
      
      // Find clip at new position
      const allClips = window.visibleClips || clips;
      for (const clip of allClips) {
        const clipStart = clip.position;
        const clipEnd = clip.position + (clip.trimEnd - clip.trimStart);
        
        if (newPos >= clipStart && newPos < clipEnd) {
          setCurrentClip(clip);
          break;
        }
      }
      
      // Check if we've reached the end of all clips
      if (allClips.length > 0) {
        const maxEnd = Math.max(...allClips.map(clip => 
          clip.position + (clip.trimEnd - clip.trimStart)
        ));
        if (newPos >= maxEnd) {
          setIsPlaying(false);
          return;
        }
      }
      
      playbackStateRef.current.animationId = requestAnimationFrame(updatePlayhead);
    };
    
    playbackStateRef.current.animationId = requestAnimationFrame(updatePlayhead);
    
    return () => {
      if (playbackStateRef.current.animationId) {
        cancelAnimationFrame(playbackStateRef.current.animationId);
      }
    };
  }, [isPlaying, playheadPosition]);

  const handlePlay = () => {
    // Find the clip at the current playhead position
    const clipAtPlayhead = getClipAtPosition(playheadPosition);
    if (clipAtPlayhead) {
      setCurrentClip(clipAtPlayhead);
    }
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
    if (playbackStateRef.current.animationId) {
      cancelAnimationFrame(playbackStateRef.current.animationId);
      playbackStateRef.current.animationId = null;
    }
  };

  const handleTimelineSeek = (time) => {
    setPlayheadPosition(time);
    // Find and set the clip at this position
    const clipAtPosition = getClipAtPosition(time);
    if (clipAtPosition) {
      setCurrentClip(clipAtPosition);
    }
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
        position: playheadPosition,
        lane: 'video'
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
          <div className="recording-container">
            <div className="recording-options">
              <label>
                <input
                  type="radio"
                  name="recordingType"
                  checked={recordingType === 'webcam'}
                  onChange={() => setRecordingType('webcam')}
                />
                Webcam Only
              </label>
              <label>
                <input
                  type="radio"
                  name="recordingType"
                  checked={recordingType === 'screen'}
                  onChange={() => setRecordingType('screen')}
                />
                Screen Only
              </label>
              <label>
                <input
                  type="radio"
                  name="recordingType"
                  checked={recordingType === 'simultaneous'}
                  onChange={() => setRecordingType('simultaneous')}
                />
                Screen + Webcam (Loom Style)
              </label>
            </div>
            {recordingType === 'webcam' ? (
              <WebcamRecorder onRecordingComplete={handleRecordingComplete} />
            ) : recordingType === 'screen' ? (
              <ScreenRecorder onRecordingComplete={handleRecordingComplete} />
            ) : (
              <SimultaneousRecorder onRecordingComplete={handleRecordingComplete} />
            )}
          </div>
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
        <MultiLaneTimeline
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
import React, { useState, useEffect, useRef } from 'react';
import Toolbar from './components/Toolbar.jsx';
import Preview from './components/Preview.jsx';
import MultiLaneTimeline from './components/MultiLaneTimeline.jsx';
import WebcamRecorder from './components/WebcamRecorder.jsx';
import SimultaneousRecorder from './components/SimultaneousRecorder.jsx';
import ScreenRecorder from './components/ScreenRecorder.jsx';
import MediaLibrary from './components/MediaLibrary.jsx';

function App() {
  const [clips, setClips] = useState([]);
  const [lanes, setLanes] = useState([
    { id: 'video1', name: 'Video 1', type: 'video', visible: true },
    { id: 'audio1', name: 'Audio 1', type: 'audio', visible: true },
    { id: 'audio2', name: 'Audio 2', type: 'audio', visible: true }
  ]);
  const [visibleClips, setVisibleClips] = useState([]);
  const [currentClip, setCurrentClip] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadPosition, setPlayheadPosition] = useState(0);
  const [showRecordingPanel, setShowRecordingPanel] = useState(false);
  const [recordingType, setRecordingType] = useState('webcam'); // 'webcam', 'screen', or 'simultaneous'
  const [exportProgress, setExportProgress] = useState(null); // null or 0-100
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);

  const playbackStateRef = useRef({
    animationId: null,
    position: 0,
    timestamp: null
  });

  // Compute visible clips whenever clips or lanes change
  useEffect(() => {
    const visibleLaneIds = lanes.filter(lane => lane.visible).map(lane => lane.id);
    const filteredClips = clips.filter(clip => visibleLaneIds.includes(clip.lane));
    setVisibleClips(filteredClips);
    window.visibleClips = filteredClips; // For timeline access if needed
  }, [clips, lanes]);

  // Listen to export progress events
  useEffect(() => {
    let ipcRenderer;
    try {
      ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
    } catch (e) {
      console.error('Failed to get ipcRenderer:', e);
      return;
    }

    if (!ipcRenderer) return;

    const handleProgress = (event, progress) => {
      let progressNum;
      if (typeof progress === 'number') {
        progressNum = progress;
      } else if (typeof progress === 'string') {
        progressNum = parseFloat(progress);
      } else {
        return;
      }

      if (isNaN(progressNum)) return;

      setExportProgress(Math.round(progressNum));
    };

    ipcRenderer.on('export-progress', handleProgress);

    return () => {
      ipcRenderer.removeListener('export-progress', handleProgress);
    };
  }, []);

  // Update handleLaneVisibilityToggle to update lanes state
  const handleLaneVisibilityToggle = (laneId) => {
    setLanes(prevLanes => 
      prevLanes.map(lane => 
        lane.id === laneId ? { ...lane, visible: !lane.visible } : lane
      )
    );
  };

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
        position: clips.length === 0 ? playheadPosition : getLastClipEndPosition(), // Place at end of last clip
        lane: 'video1', // Default to video lane
        type: 'video' // Explicit type
      };

      setClips([...clips, newClip]);
      setCurrentClip(newClip);
    } catch (error) {
      console.error('Error importing video:', error);
      alert('Failed to import video: ' + error.message);
    }
  };

  const handleImportAudio = async () => {
    try {
      const { ipcRenderer } = window.require('electron');
      const filePath = await ipcRenderer.invoke('open-audio-file');
      
      if (filePath) {
        const duration = await ipcRenderer.invoke('get-audio-duration', filePath);
        
        // Find next available audio lane
        const audioLanes = lanes.filter(l => l.type === 'audio');
        const targetLane = audioLanes[audioLanes.length - 1] || { id: 'audio1' };
        
        // Extract filename from path (works on both Windows and Unix paths)
        const fileName = filePath.split(/[\\/]/).pop() || filePath;
        
        const newClip = {
          id: Date.now(),
          filePath,
          duration,
          thumbnailPath: null, // No thumbnail for audio
        trimStart: 0,
        trimEnd: duration,
        position: clips.length === 0 ? playheadPosition : getLastClipEndPosition(), // Place at end of last clip
        lane: targetLane.id,
        type: 'audio',
        label: fileName
      };
        
        setClips([...clips, newClip]);
      }
    } catch (error) {
      console.error('Error importing audio:', error);
    }
  };

  const handleExport = async (scaleResolution = null) => {
    let ipcRenderer;
    try {
      ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
    } catch (e) {
      alert('Export functionality unavailable - electron API not loaded');
      return;
    }

    if (!ipcRenderer) {
      alert('Export functionality unavailable');
      return;
    }

    const outputPath = await ipcRenderer.invoke('show-save-dialog');

    if (outputPath) {
      setExportProgress(0);
      
      // Collect visible clips
      const visibleLanes = lanes.filter(lane => lane.visible);
      const videoClips = [];
      const audioClips = [];
      
      // Collect clips with their timeline positions (not just trim points)
      clips.forEach(clip => {
        if (visibleLanes.some(lane => lane.id === clip.lane)) {
          // Calculate absolute timeline times
          const clipStart = clip.position;
          const clipEnd = clip.position + (clip.trimEnd - clip.trimStart);
          
          if (clip.type === 'video') {
            videoClips.push({
              inputPath: clip.filePath,
              startTime: clip.trimStart, // Source file trim start (for file seeking)
              endTime: clip.trimEnd,     // Source file trim end (for file seeking)
              timelineStart: clipStart,   // Timeline position (for duration calculation)
              timelineEnd: clipEnd,       // Timeline end position (for export duration)
              lane: clip.lane            // Lane ID for grouping sequential clips
            });
          } else if (clip.type === 'audio') {
            // For audio, we need to account for timeline position when it starts before video
            const audioStartInFile = clip.trimStart;
            const audioDuration = clip.trimEnd - clip.trimStart;
            
            audioClips.push({
              inputPath: clip.filePath,
              startTime: audioStartInFile, // Source file trim start
              endTime: clip.trimEnd,        // Source file trim end
              timelineStart: clipStart,     // Timeline position
              timelineEnd: clipEnd,        // Timeline end position
              lane: clip.lane,             // Lane ID for grouping sequential clips
              // Offset from timeline start (if audio starts before video timeline 0)
              timelineOffset: clipStart < 0 ? Math.abs(clipStart) : 0
            });
          }
        }
      });
      
      try {
        const result = await ipcRenderer.invoke('export-multi-lane', {
          outputPath,
          videoClips,
          audioClips,
          scaleResolution // null = source, 720 = 720p, 1080 = 1080p
        });
        setExportProgress(null);
        alert(`Export successful: ${result}`);
      } catch (error) {
        setExportProgress(null);
        alert(`Export failed: ${error.message}`);
      }
    } else {
      setExportProgress(null);
    }
  };

  // Export handlers for different resolutions
  const handleExportSource = () => handleExport(null);
  const handleExport720p = () => handleExport(720);
  const handleExport1080p = () => handleExport(1080);

  // Get ALL clips at a specific timeline position (for simultaneous playback)
  const getClipsAtPosition = (timelinePosition) => {
    const visibleClips = window.visibleClips || clips;
    const clipsAtPos = [];
    
    for (const clip of visibleClips) {
      const clipStart = clip.position;
      const clipEnd = clip.position + (clip.trimEnd - clip.trimStart);
      
      if (timelinePosition >= clipStart && timelinePosition < clipEnd) {
        clipsAtPos.push(clip);
      }
    }
    
    // Sort: video first (for preview priority), then audio
    clipsAtPos.sort((a, b) => {
      if (a.type === 'video' && b.type !== 'video') return -1;
      if (b.type === 'video' && a.type !== 'video') return 1;
      return a.position - b.position;
    });
    
    return clipsAtPos;
  };
  
  // Get the PRIMARY clip at position (video takes priority for preview)
  const getClipAtPosition = (timelinePosition) => {
    const clipsAtPos = getClipsAtPosition(timelinePosition);
    return clipsAtPos.length > 0 ? clipsAtPos[0] : null;
  };

  // Get the end position of the last clip (for sequential imports)
  const getLastClipEndPosition = () => {
    const visibleClips = window.visibleClips || clips;
    if (visibleClips.length === 0) return 0;
    
    // Find the maximum end position of all clips
    const maxEnd = Math.max(...visibleClips.map(clip => 
      clip.position + (clip.trimEnd - clip.trimStart)
    ));
    
    return maxEnd;
  };

  const handleTimeUpdate = (timelinePosition) => {
    // Video is playing and driving the playhead - update it from video's currentTime
    if (isPlaying) {
      setPlayheadPosition(timelinePosition);
      playbackStateRef.current.position = timelinePosition;
      playbackStateRef.current.timestamp = Date.now();
      
      // Find clip at new position
      // IMPORTANT: Only update currentClip if it's actually different to prevent reload loops
      const clipAtPosition = getClipAtPosition(timelinePosition);
      if (clipAtPosition) {
        // Only update if clip ID changed OR if we don't have a current clip
        if (!currentClip || currentClip.id !== clipAtPosition.id) {
          setCurrentClip(clipAtPosition);
        }
        // Don't update if it's the same clip - prevents unnecessary re-renders
      }
    }
  };

  // Effect to continuously advance playhead when playing
  useEffect(() => {
    if (!isPlaying) return;
    
    // Check if we have a video clip playing - if so, video drives playhead via handleTimeUpdate
    const clipAtPos = getClipAtPosition(playheadPosition);
    if (clipAtPos && clipAtPos.type === 'video') {
      // Video is playing - it will drive playhead via handleTimeUpdate
      // Don't run this fallback timer
      return;
    }
    
    // Fallback: Use timer for audio-only clips or gaps
    playbackStateRef.current.position = playheadPosition;
    playbackStateRef.current.timestamp = Date.now();
    
    const updatePlayhead = () => {
      const elapsed = (Date.now() - playbackStateRef.current.timestamp) / 1000;
      const newPos = playbackStateRef.current.position + elapsed;
      
      setPlayheadPosition(newPos);
      
      // Find clip at new position (handles gaps - will return null between clips)
      const clipAtPosition = getClipAtPosition(newPos);
      
      // Only update currentClip if we found one (handles gaps by not changing clip during gap)
      if (clipAtPosition) {
        // Only change clip if it's different (prevents unnecessary reloads)
        if (!currentClip || currentClip.id !== clipAtPosition.id) {
          setCurrentClip(clipAtPosition);
        }
      }
      
      // Check if we've reached the end of all clips (including gaps after last clip)
      const allClips = window.visibleClips || clips;
      if (allClips.length > 0) {
        const maxEnd = Math.max(...allClips.map(clip => 
          clip.position + (clip.trimEnd - clip.trimStart)
        ));
        if (newPos >= maxEnd) {
          // LOOP: Reset to beginning instead of stopping
          setPlayheadPosition(0);
          playbackStateRef.current.position = 0;
          playbackStateRef.current.timestamp = Date.now();
          // Find clip at start position
          const startClip = getClipAtPosition(0);
          setCurrentClip(startClip);
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
    const allClips = window.visibleClips || clips;
    
    // Find the clip that contains this time, or the next clip after this time
    let targetClip = getClipAtPosition(time);
    let targetTime = time;
    
    // If no clip at this position, find the next clip
    if (!targetClip && allClips.length > 0) {
      // Sort clips by position
      const sortedClips = [...allClips].sort((a, b) => a.position - b.position);
      
      // Find next clip after this time
      const nextClip = sortedClips.find(clip => clip.position > time);
      
      if (nextClip) {
        targetClip = nextClip;
        targetTime = nextClip.position; // Start at beginning of next clip
      } else {
        // No next clip - loop back to start (00:00:00) if playing
        if (isPlaying) {
          const firstClip = sortedClips[0];
          if (firstClip) {
            targetClip = firstClip;
            targetTime = 0;
          }
        }
      }
    }
    
    // If we're at the end of the last clip and playing, loop back to start
    if (isPlaying && allClips.length > 0) {
      const maxEnd = Math.max(...allClips.map(clip => 
        clip.position + (clip.trimEnd - clip.trimStart)
      ));
      
      if (time >= maxEnd) {
        // Loop back to start and continue playing
        const sortedClips = [...allClips].sort((a, b) => a.position - b.position);
        const firstClip = sortedClips[0];
        if (firstClip) {
          targetClip = firstClip;
          targetTime = 0;
        }
      }
    }
    
    setPlayheadPosition(targetTime);
    if (targetClip) {
      setCurrentClip(targetClip);
    }
  };

  // Split clip at playhead position
  const handleSplitClip = () => {
    if (!currentClip || isPlaying) return;
    
    const clipStart = currentClip.position;
    const clipEnd = currentClip.position + (currentClip.trimEnd - currentClip.trimStart);
    
    // Check if playhead is within clip bounds
    if (playheadPosition >= clipStart && playheadPosition < clipEnd) {
      const splitTime = playheadPosition - clipStart + currentClip.trimStart;
      
      // Create second clip (everything after split)
      const newClip = {
        ...currentClip,
        id: Date.now(),
        trimStart: splitTime,
        position: playheadPosition
      };
      
      // Update first clip (everything before split)
      setClips(clips.map(clip => {
        if (clip.id === currentClip.id) {
          return {
            ...clip,
            trimEnd: splitTime
          };
        }
        return clip;
      }).concat([newClip]));
      
      setCurrentClip(newClip);
    }
  };

  // Delete selected clip
  const handleDeleteClip = () => {
    if (!currentClip || isPlaying) return;
    setClips(clips.filter(clip => clip.id !== currentClip.id));
    setCurrentClip(null);
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      if ((e.key === 's' || e.key === 'S') && currentClip && !isPlaying) {
        e.preventDefault();
        handleSplitClip();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && currentClip && !isPlaying) {
        e.preventDefault();
        handleDeleteClip();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentClip, playheadPosition, isPlaying, clips]);

  // Listen for file drops from main process (main process intercepts OS-level drops)
  useEffect(() => {
    let ipcRenderer;
    try {
      ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
    } catch (e) {
      console.warn('IPC not available for file drop handling');
      return;
    }

    if (!ipcRenderer) {
      console.warn('No IPC renderer available');
      return;
    }

    const handleFileDrop = async (event, droppedFiles) => {
      console.log('📥 Files dropped from main process:', droppedFiles);
      
      for (const fileData of droppedFiles) {
        const { path: filePath, name, type } = fileData;
        
        console.log('📄 Processing dropped file:', { name, path: filePath, type });
        
        if (!filePath) {
          console.warn('❌ No file path provided for:', name);
          continue;
        }
        
        const ext = filePath.toLowerCase().split('.').pop();
        console.log('🔍 File extension:', ext);
        
        if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
          console.log('✅ Importing as video:', filePath);
          await handleImportVideoFile(filePath);
        } else if (['wav', 'mp3', 'aac', 'ogg'].includes(ext)) {
          console.log('✅ Importing as audio:', filePath);
          await handleImportAudioFile(filePath);
        } else {
          console.warn('⚠️ Unsupported file type:', ext, 'for file:', name);
          alert(`Unsupported file type: ${ext}\n\nSupported formats:\nVideo: MP4, MOV, AVI, MKV, WebM\nAudio: WAV, MP3, AAC, OGG`);
        }
      }
    };

    console.log('🎯 Setting up IPC listener for file-dropped events');
    ipcRenderer.on('file-dropped', handleFileDrop);
    
    return () => {
      console.log('🧹 Cleaning up IPC listener for file-dropped events');
      ipcRenderer.removeListener('file-dropped', handleFileDrop);
    };
  }, [handleImportVideoFile, handleImportAudioFile]);

  // Helper to import video file by path
  const handleImportVideoFile = async (filePath) => {
    try {
      const { ipcRenderer } = window.require('electron');
      const duration = await ipcRenderer.invoke('get-video-duration', filePath);
      const thumbnailPath = await ipcRenderer.invoke('generate-thumbnail', filePath);
      
      // Get video resolution
      let resolution = { width: null, height: null };
      try {
        resolution = await ipcRenderer.invoke('get-video-resolution', filePath);
      } catch (e) {
        console.warn('Could not get video resolution:', e);
      }
      
      // Get file size
      const fs = window.require('fs');
      let fileSize = null;
      try {
        const stats = fs.statSync(filePath);
        fileSize = stats.size;
      } catch (e) {
        console.warn('Could not get file size:', e);
      }
      
      // Calculate position: place at end of last clip, or at playhead if no clips exist
      const lastClipEnd = getLastClipEndPosition();
      const newPosition = clips.length === 0 ? playheadPosition : lastClipEnd;
      
      const newClip = {
        id: Date.now(),
        filePath,
        duration,
        thumbnailPath,
        width: resolution.width,
        height: resolution.height,
        fileSize,
        trimStart: 0,
        trimEnd: duration,
        position: newPosition,
        lane: 'video1',
        type: 'video'
      };
      
      setClips([...clips, newClip]);
      setCurrentClip(newClip);
    } catch (error) {
      console.error('Error importing video:', error);
    }
  };

  // Helper to import audio file by path
  const handleImportAudioFile = async (filePath) => {
    try {
      const { ipcRenderer } = window.require('electron');
      const duration = await ipcRenderer.invoke('get-audio-duration', filePath);
      
      // Get file size
      const fs = window.require('fs');
      let fileSize = null;
      try {
        const stats = fs.statSync(filePath);
        fileSize = stats.size;
      } catch (e) {
        console.warn('Could not get file size:', e);
      }
      
      const audioLanes = lanes.filter(l => l.type === 'audio');
      const targetLane = audioLanes[audioLanes.length - 1] || { id: 'audio1' };
      const fileName = filePath.split(/[\\/]/).pop() || filePath;
      
      const newClip = {
        id: Date.now(),
        filePath,
        duration,
        thumbnailPath: null,
        fileSize,
        trimStart: 0,
        trimEnd: duration,
        position: clips.length === 0 ? playheadPosition : getLastClipEndPosition(), // Place at end of last clip
        lane: targetLane.id,
        type: 'audio',
        label: fileName
      };
      
      setClips([...clips, newClip]);
    } catch (error) {
      console.error('Error importing audio:', error);
    }
  };

  const handleRecordingComplete = async (recordingData) => {
    try {
      const { ipcRenderer } = window.require('electron');
      const newClips = [];
      
      // Handle both old format (string path) and new format (object with videoPath)
      let videoPath = typeof recordingData === 'string' ? recordingData : recordingData.videoPath;
      
      // Import video (audio is now embedded in the video file)
      if (videoPath) {
        const duration = await ipcRenderer.invoke('get-video-duration', videoPath);
        const thumbnailPath = await ipcRenderer.invoke('generate-thumbnail', videoPath);
        
        // Get video resolution
        let resolution = { width: null, height: null };
        try {
          resolution = await ipcRenderer.invoke('get-video-resolution', videoPath);
        } catch (e) {
          console.warn('Could not get video resolution:', e);
        }
        
        // Get file size
        const fs = window.require('fs');
        let fileSize = null;
        try {
          const stats = fs.statSync(videoPath);
          fileSize = stats.size;
        } catch (e) {
          console.warn('Could not get file size:', e);
        }
        
        newClips.push({
          id: Date.now(),
          filePath: videoPath,
          duration,
          thumbnailPath,
          width: resolution.width,
          height: resolution.height,
          fileSize,
          trimStart: 0,
          trimEnd: duration,
          position: clips.length === 0 ? 0 : getLastClipEndPosition(), // Place at end of last clip
          lane: 'video1',
          type: 'video'
        });
      }
      
      // Note: Audio is now embedded in the video file, so no separate audio imports needed
      // For backwards compatibility, still check for audioFiles but don't import them
      if (recordingData.audioFiles && recordingData.audioFiles.length > 0) {
        console.log('Note: Audio files provided but audio is already embedded in video:', recordingData.audioFiles);
      }
      
      setClips(prev => [...prev, ...newClips]);
    } catch (error) {
      console.error('Error importing recording:', error);
    }
  };

  // HOMERUN FIX: File picker (Windows UIPI blocks drag/drop)
  const handleDropZoneClick = async () => {
    try {
      const { ipcRenderer } = window.require('electron');
      const filePaths = await ipcRenderer.invoke('open-file-dialog');
      
      console.log('📁 Files selected via picker:', filePaths);
      
      for (const filePath of filePaths) {
        const ext = filePath.toLowerCase().split('.').pop();
        
        if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
          console.log('✅ Importing video:', filePath);
          await handleImportVideoFile(filePath);
        } else if (['wav', 'mp3', 'aac', 'ogg'].includes(ext)) {
          console.log('✅ Importing audio:', filePath);
          await handleImportAudioFile(filePath);
        }
      }
    } catch (err) {
      console.error('Error opening file dialog:', err);
      alert('Failed to open file picker: ' + err.message);
    }
  };

  return (
    <div className="app">
      <Toolbar
        onImport={handleImportVideo}
        onImportAudio={handleImportAudio}
        onExportSource={handleExportSource}
        onExport720p={handleExport720p}
        onExport1080p={handleExport1080p}
        canExport={clips.length > 0}
        exportProgress={exportProgress}
        onDropZoneClick={handleDropZoneClick}
        onMediaLibrary={() => setShowMediaLibrary(true)}
        onRecord={() => {
          // CRITICAL: Stop playback before showing recording panel (releases camera/mic on Windows)
          if (isPlaying) {
            setIsPlaying(false);
          }
          setShowRecordingPanel(!showRecordingPanel);
        }}
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
            ) : recordingType === 'simultaneous' ? (
              <SimultaneousRecorder onRecordingComplete={handleRecordingComplete} />
            ) : (
              <WebcamRecorder onRecordingComplete={handleRecordingComplete} />
            )}
          </div>
        )}
        {!showRecordingPanel && (
          <Preview
            clip={currentClip}
            allClipsAtPosition={getClipsAtPosition(playheadPosition)}
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
          setPlayheadPosition={setPlayheadPosition}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          lanes={lanes}
          setLanes={setLanes}
          onToggleVisibility={handleLaneVisibilityToggle}
          onSplitClip={handleSplitClip}
          onDeleteClip={handleDeleteClip}
        />
      )}
      {showMediaLibrary && (
        <MediaLibrary
          clips={clips}
          onSelectClip={(clip) => {
            setCurrentClip(clip);
            setPlayheadPosition(clip.position || 0);
            setShowMediaLibrary(false);
          }}
          onClose={() => setShowMediaLibrary(false)}
        />
      )}
    </div>
  );
}

export default App;
# System Patterns: Auqular

## Architecture Overview

### Process Separation
- **Main Process**: Handles file operations, FFmpeg commands, IPC handlers
- **Renderer Process**: React UI, timeline interactions, preview display

### IPC Communication Flow
```
Renderer → IPC → Main Process → FFmpeg → File System
         ← IPC ←                          ← Results
```

## Design Patterns in Use

### 1. Context Isolation Pattern
**Implementation**: preload.js uses contextBridge to expose secure API  
**Why**: Prevents direct access to Node.js from renderer (security best practice)

**Example**:
```javascript
// preload.js
contextBridge.exposeInMainWorld('electronAPI', {
  openVideoFile: () => ipcRenderer.invoke('open-video-file'),
  // ... other methods
});
```

### 2. Component State Management
**Pattern**: React hooks (useState, useEffect) for local state  
**Why**: Simple state management without Redux for MVP

**Example**:
```javascript
// App.jsx
const [clips, setClips] = useState([]);
const [currentClip, setCurrentClip] = useState(null);
const [playheadPosition, setPlayheadPosition] = useState(0);
```

### 3. Event-Driven UI Updates
**Pattern**: Event handlers trigger state updates  
**Why**: Decouples UI from logic, enables React re-renders

### 4. Canvas-Based Timeline
**Pattern**: Konva.js for draggable/resizable timeline clips  
**Why**: Performance for 10+ clips, responsive interactions

**Components**:
- `Stage` - Canvas container
- `Layer` - Rendering layer
- `Group` - Grouped elements (clips)
- `Rect` - Clip rectangles with drag handlers
- `Line` - Playhead and grid lines

## Key Technical Decisions

### File Structure
```
auqular/
├── main.js              # Electron main process
├── preload.js           # IPC context bridge
├── webpack.config.js    # Build configuration
├── .babelrc             # Babel configuration
├── src/
│   ├── App.jsx          # Main app component
│   ├── index.jsx        # React entry point
│   ├── components/
│   │   ├── Toolbar.jsx  # Import/Export buttons
│   │   ├── Preview.jsx  # Video player
│   │   └── Timeline.jsx # Konva timeline canvas
│   └── styles.css       # Dark theme styling
└── dist/                # Webpack output
    ├── index.html
    └── bundle.js
```

### Component Relationships
```
App.jsx
├── Toolbar (import/export handlers)
├── Preview (video playback, time sync)
└── Timeline (clip management, seek to position)
```

## Known Architecture Patterns to Implement

### 1. Export Resolution Scaling Pattern ✅ IMPLEMENTED
**Need**: Apply video scaling during export without breaking complex filter chain
**Pattern**: Simple video filter applied AFTER complex filter processing
**Implementation**:
```javascript
// Apply complex filters first (overlays, padding, audio mixing)
if (filters.length > 0) {
  command = command.complexFilter(filters.join(';'));
}

// THEN apply simple video filter for scaling (separate from complex filter)
const scaleNum = scaleResolution ? parseInt(scaleResolution, 10) : null;
if (scaleNum === 720) {
  command = command.videoFilters('scale=1280:720');
} else if (scaleNum === 1080) {
  command = command.videoFilters('scale=1920:1080');
}
// null = source resolution (no scaling)
```
**Why This Works**: Complex filters and simple video filters are separate FFmpeg concepts. Mixing them causes the simple filter to be ignored. Apply complex filter via `.complexFilter()`, then apply simple video filter via `.videoFilters()`.

### 2. Progress Updates Pattern ✅ IMPLEMENTED
**Need**: Export progress from FFmpeg to UI  
**Pattern**: IPC events from main process  
**Implementation**:
```javascript
// main.js
.on('progress', (progress) => {
  event.sender.send('export-progress', progress.percent);
})

// App.jsx
useEffect(() => {
  const listener = (progress) => updateUI(progress);
  window.electronAPI.onExportProgress(listener);
  return () => window.electronAPI.removeListener(listener);
}, []);
```

### 3. Sequential Clip Export Pattern ✅ IMPLEMENTED
**Need**: Export clips on same lane sequentially (back-to-back), clips on different lanes overlay  
**Pattern**: Lane-based grouping + conditional processing (concat vs overlay)  
**Implementation**:
```javascript
// Group clips by lane
const videoLanes = {};
videoClips.forEach(clip => {
  const lane = clip.lane || 'default';
  if (!videoLanes[lane]) videoLanes[lane] = [];
  videoLanes[lane].push(clip);
});

// Sort by timelineStart within each lane
Object.keys(videoLanes).forEach(lane => {
  videoLanes[lane].sort((a, b) => (a.timelineStart || 0) - (b.timelineStart || 0));
});

// Process: Concat same-lane, overlay different-lane
if (needsConcat && !needsOverlay) {
  // Use FFmpeg concat demuxer for sequential clips
} else if (needsOverlay) {
  // Use overlay filter for different lanes
}
```
**Why This Works**: Lanes represent logical groupings. Same lane = sequential content, different lanes = simultaneous overlay.

### 4. Audio Embedding Pattern ✅ IMPLEMENTED
**Need**: Embed audio directly in video files during recording (not separate files)  
**Pattern**: Merge audio tracks into video during frame-to-video conversion  
**Implementation**:
```javascript
// convert-frames-to-video handler
if (audioFiles.length > 0) {
  audioFiles.forEach((audioFile, index) => {
    command = command.input(audioFile);
    audioInputLabels.push(`[${index + 1}:a]`);
  });
  
  // Mix all audio tracks
  if (audioInputLabels.length > 1) {
    audioFilters.push(`${audioInputLabels.join('')}amix=inputs=${audioInputLabels.length}:duration=longest[a]`);
  }
  
  command = command.complexFilter(audioFilters.join(';'));
  command = command.outputOptions('-map', '0:v');
  command = command.outputOptions('-map', '[a]');
}

// Clean up temporary audio files after merging
audioFiles.forEach(audioFile => fs.unlinkSync(audioFile));
```
**Why This Works**: Single video file with embedded audio simplifies import/export workflow, ensures audio stays synchronized with video.

### 5. Video Audio Extraction Pattern ✅ IMPLEMENTED
**Need**: Extract audio from video clips during export (videos may have embedded audio)  
**Pattern**: Probe for audio, extract from video inputs, apply timeline delays, mix with standalone audio  
**Implementation**:
```javascript
// Probe video clips for audio
const videoClipsWithAudio = await Promise.all(videoClips.map(async (clip) => ({
  ...clip,
  hasAudio: await hasAudio(clip.inputPath)
})));

// Extract audio from video inputs based on composition type
if (needsConcat) {
  // Extract from [0:a] (concat result)
  audioFilters.push(`[0:a]adelay=${delay}ms[a_video]`);
} else if (needsOverlay) {
  // Extract from each video input [0:a], [1:a], etc.
  audioFilters.push(`[${videoInputIndex}:a]adelay=${delay}ms[a_video_${i}]`);
} else {
  // Single clip: extract from [0:a]
  audioFilters.push(`[0:a]adelay=${delay}ms[a_video]`);
}

// Mix video audio with standalone audio clips
allAudioTracks = [...videoAudioTracks, ...standaloneAudioTracks];
audioFilters.push(`${allAudioTracks.join('')}amix=inputs=${allAudioTracks.length}:duration=longest[a]`);
```
**Why This Works**: Ensures exported videos include audio from recorded clips, maintains timeline positioning, mixes multiple audio sources correctly.

### 6. Continuous Playback Pattern ✅ IMPLEMENTED (Enhanced)
**Need**: Play clips continuously, transitioning from one to the next, looping at end without interruption  
**Pattern**: Video-driven playhead + timer-based fallback + seamless boundary transitions  
**Implementation**:
```javascript
// Track when video stops at trimEnd
const videoStopTimeRef = useRef(null);

// Video element drives playhead when playing
video.addEventListener('timeupdate', () => {
  if (isPlaying) {
    const videoAtEnd = video.currentTime >= clipTrimEnd - 0.05;
    
    if (videoAtEnd) {
      // Video reached end - switch to timer-based advancement
      if (!videoStopTimeRef.current) {
        const clipEndPosition = clipPosition + (clipTrimEnd - clipTrimStart);
        videoStopTimeRef.current = {
          stopTime: Date.now(),
          clipEndPosition
        };
      }
      
      // Calculate overshoot time since video stopped
      const elapsedSinceStop = (Date.now() - videoStopTimeRef.current.stopTime) / 1000;
      const timelinePosition = videoStopTimeRef.current.clipEndPosition + elapsedSinceStop;
      
      // Continue advancing playhead past clip end
      onTimeUpdate(timelinePosition);
      return;
    } else {
      // Video still advancing - normal playback
      videoStopTimeRef.current = null;
      const timelinePosition = clipPosition + (video.currentTime - clipTrimStart);
      onTimeUpdate(timelinePosition);
    }
  }
});

// Handle video ended event
video.addEventListener('ended', () => {
  if (isPlaying) {
    // Mark stop time - playhead continues via timer
    const clipEndPosition = clipPosition + (clipTrimEnd - clipTrimStart);
    videoStopTimeRef.current = {
      stopTime: Date.now(),
      clipEndPosition
    };
    video.currentTime = clipTrimEnd; // Keep at end
  }
});

// App playhead advancement with fallback
useEffect(() => {
  const clipAtPos = getClipAtPosition(playheadPosition);
  if (clipAtPos && clipAtPos.type === 'video') {
    const clipEnd = clipAtPos.position + (clipAtPos.trimEnd - clipAtPos.trimStart);
    
    // If playhead moved past clip end, use timer fallback
    if (playheadPosition >= clipEnd) {
      // Fall through to timer logic
    } else {
      // Video drives playhead - return early
      return;
    }
  }
  
  // Timer-based advancement for gaps and past-clip-end positions
  const updatePlayhead = () => {
    const elapsed = (Date.now() - playbackStateRef.current.timestamp) / 1000;
    let newPos = playbackStateRef.current.position + elapsed;
    
    // Loop check
    if (maxEnd > 0 && newPos >= maxEnd) {
      newPos = 0;
    }
    
    setPlayheadPosition(newPos);
    // Find clip at new position - naturally transitions to next clip
  };
});
```
**Why This Works**: Video element drives playhead during normal playback. When video reaches `trimEnd` and stops, timer-based advancement seamlessly takes over, allowing playhead to continue moving past clip boundaries. When playhead enters next clip, that clip becomes active and video resumes driving playhead. This creates uninterrupted continuous playback.

### 7. Sequential Import Positioning Pattern ✅ IMPLEMENTED
**Need**: Import clips sequentially (each new clip after the last) instead of all at 00:00:00  
**Pattern**: Calculate end of last clip, place new clip at that position  
**Implementation**:
```javascript
// Calculate end of timeline
const getLastClipEndPosition = () => {
  const visibleClips = window.visibleClips || clips;
  if (visibleClips.length === 0) return 0;
  
  const maxEnd = Math.max(...visibleClips.map(clip => 
    clip.position + (clip.trimEnd - clip.trimStart)
  ));
  
  return maxEnd;
};

// Use for all imports
const newPosition = clips.length === 0 ? playheadPosition : getLastClipEndPosition();
```
**Why This Works**: Provides intuitive workflow where clips line up end-to-end automatically, no manual positioning needed.

### 8. Clip State Management (In Progress)
**Pattern**: Single source of truth for clip data  
**State Structure**:
```javascript
{
  id: number,
  filePath: string,
  duration: number,
  thumbnailPath: string,
  trimStart: number,
  trimEnd: number,
  position: number,
  lane: string,  // Lane ID for grouping
  type: 'video' | 'audio'  // Clip type
}
```

## Best Practices Being Followed

1. **Secure IPC**: contextBridge pattern instead of nodeIntegration: true
2. **Resource Cleanup**: useEffect cleanup functions for event listeners
3. **Error Handling**: Try-catch blocks in IPC handlers
4. **Separation of Concerns**: Main process for I/O, renderer for UI
5. **Performance**: Konva canvas for complex timeline interactions


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

### 3. Clip State Management (In Progress)
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
  position: number
}
```

## Best Practices Being Followed

1. **Secure IPC**: contextBridge pattern instead of nodeIntegration: true
2. **Resource Cleanup**: useEffect cleanup functions for event listeners
3. **Error Handling**: Try-catch blocks in IPC handlers
4. **Separation of Concerns**: Main process for I/O, renderer for UI
5. **Performance**: Konva canvas for complex timeline interactions


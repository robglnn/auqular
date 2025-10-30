# Technical Context: Auqular

## Technology Stack

### Frontend (Renderer Process)
- **React** v18.3.1 - Component-based UI with hooks
- **react-konva** v18.2.14 - React bindings for Konva
- **Konva** v10.0.8 - Canvas-based multi-lane timeline interactions
- **use-image** - Async image loading for thumbnails
- **HTML5 Video** - Preview playback
- CSS for styling (dark theme)

### Backend (Main Process)
- **Electron** v39.0.0 - Desktop app framework
- **fluent-ffmpeg** v2.1.3 - FFmpeg wrapper for Node.js
- **ffmpeg-static** v5.2.0, **ffprobe-static** v3.1.0 - Bundled FFmpeg/FFprobe binaries
- **mic** v2.1.2 - Microphone audio recording
- **node-record-lpcm16** v1.0.1 - System audio recording fallback
- **sox-audio** v0.3.0 - Enhanced audio processing (optional)
- **SoX** (bundled binary) - System audio capture (tabled)
- **Node.js** - File system operations, IPC, canvas frame capture

### Build Tools
- **Webpack** v5.102.1 - Bundling
- **Babel** (via babel-loader v9) - JSX/ES6 transpilation
- **electron-builder** - Windows EXE packaging

## Development Setup

### Key Files
- `main.js` - Electron main process with IPC handlers
- `preload.js` - Context bridge for secure IPC communication
- `webpack.config.js` - Webpack build configuration
- `.babelrc` - Babel configuration for JSX
- `package.json` - Dependencies and scripts

### Build Process
```bash
npm run build    # Webpack production build
npm run dev      # Development mode with webpack watch
npm start        # Launch Electron app
npm run dist     # Build Windows EXE with electron-builder
```

### Package Size Optimization
**Strategy**: Exclude pre-bundled dependencies from electron-builder package
- Webpack already bundles React, Konva, and all frontend libraries into `bundle.js`
- electron-builder configuration excludes all `node_modules` by default
- Only runtime-required dependencies explicitly included:
  - `fluent-ffmpeg` - FFmpeg command wrapper
  - `mic` / `node-record-lpcm16` - Native audio recording binaries
- **Result**: Reduced exe size from ~2GB to ~200-300MB (85-90% reduction)
- FFmpeg/FFprobe binaries copied separately via `extraResources`
- Assets folder (icons) included via files list

### IPC Communication
Renderer → Main (via ipcRenderer.invoke):
- `openVideoFile()` - Open file picker
- `getVideoDuration(path)` - Get video metadata
- `generateThumbnail(path)` - Create thumbnail
- `exportVideo({inputPath, outputPath, startTime, endTime, scaleResolution})` - Export (scaleResolution: null=source, 720, 1080)
- `export-multi-lane({outputPath, videoClips, audioClips, scaleResolution})` - Multi-lane export with scaling
- `showSaveDialog()` - Save dialog

## Technical Constraints

### Windows-Only Focus
- No internet access required post-build
- Native Windows EXE output
- win32/64 compatibility target

### Performance Targets
- 30+ FPS preview playback
- Launch time < 5 seconds
- No memory leaks in 15+ min sessions
- Responsive timeline with 10+ clips

### Stability Requirements
- Battle-tested libraries (React, Electron, FFmpeg)
- Resource cleanup (revokeObjectURLs, stop streams)
- Error handling and user-friendly alerts
- Throttle/debounce UI events

## Dependencies

### Runtime Dependencies
- react@18.3.1, react-dom@18.3.1
- react-konva@18.2.14, konva@10.0.8
- fluent-ffmpeg@2.1.3, ffmpeg-static@5.2.0, ffprobe-static@3.1.0
- use-image (for async thumbnail loading)
- mic@2.1.2, node-record-lpcm16@1.0.1, sox-audio@0.3.0 (for audio recording)

### Development Dependencies
- electron@39.0.0
- webpack@5.102.1, babel-loader@9
- @babel/core, @babel/preset-env, @babel/preset-react
- electron-builder@26.0.12

## Recent Technical Implementations

### Export Resolution Scaling System
**Architecture**: Simple video filter applied AFTER complex filter processing for resolution scaling
- Export supports three resolution presets: Source (null), 720p (1280x720), 1080p (1920x1080)
- `scaleResolution` parameter passed from renderer through IPC to main process
- Scaling applied using `.videoFilters('scale=WIDTH:HEIGHT')` method on FFmpeg command
- Critical implementation detail: Scaling must be applied as simple filter, NOT in complex filter array
**Technical Approach**:
- `handleExport(scaleResolution)` accepts null/720/1080 parameter
- Three wrapper functions: `handleExportSource()`, `handleExport720p()`, `handleExport1080p()`
- Main process converts to number: `const scaleNum = scaleResolution ? parseInt(scaleResolution, 10) : null`
- Applied after complex filter setup but before `.save()`: `command = command.videoFilters('scale=1280:720')`
- Implemented in both `export-multi-lane` and `export-video` IPC handlers
**UI Implementation**:
- Three buttons in Toolbar: "Export MP4" (source), "720p", "1080p"
- Minimal spacing between buttons (2px) to visually group them as export settings
- Each button passes appropriate resolution parameter to export handler

### Multi-Track Audio Playback System
**Architecture**: Dynamic creation of hidden HTML5 audio elements for simultaneous playback
- Each overlapping audio/video clip gets its own audio element
- Audio elements stored in `audioElementsRef.current` Map keyed by clip ID
- Video clips automatically extract audio and create separate audio element
- Elements cleaned up when clips no longer overlap at playhead position
**Technical Approach**:
- Uses `document.createElement('audio')` for each track
- Elements are `display: 'none'` and appended to document.body
- Synchronized to playhead position and play/pause state
- Respects trim boundaries (`trimStart`/`trimEnd`) for each clip

### Loop Playback Implementation
- Auto-reset to position 0 when playhead exceeds max clip end
- Preserves play state during reset (continues playing)
- Finds clip at start position for seamless loop transition

### Export Timeline Syncing Challenges
- Export attempts to use `timelineStart`/`timelineEnd` for accurate positioning
- FFmpeg filter chain complexity for black frame padding:
  - `tpad` filter for padding before video (`start_mode=clone`)
  - `tpad` filter for padding after video (`stop_mode=clone`)
- Filter output mapping must correctly chain: `[0:v]` → `[v_start]` → `[v_final]`
- Current issues suggest filter chain may not be correctly applied or mapped

## Known Technical Issues & Solutions

### FFmpeg Path Setup ✅ RESOLVED
**Issue**: `Cannot find ffprobe` error when using fluent-ffmpeg  
**Solution**: Configure both ffmpeg and ffprobe paths in main.js with environment detection:
```javascript
// Set FFmpeg paths
if (app.isPackaged) {
  // In packaged app, binaries are in resources folder
  const ffmpegPath = path.join(process.resourcesPath, 'ffmpeg.exe');
  const ffprobePath = path.join(process.resourcesPath, 'ffprobe.exe');
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);
} else {
  // In development, use the static packages
  const ffmpegStatic = require('ffmpeg-static');
  const ffprobeStatic = require('ffprobe-static');
  if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
  }
  if (ffprobeStatic) {
    ffmpeg.setFfprobePath(ffprobeStatic.path);
  }
}
```

### Electron Builder Configuration ✅ RESOLVED
**Issue**: FFmpeg binaries not included in packaged EXE  
**Solution**: Updated package.json build configuration to use `extraResources`:
```json
"build": {
  "win": {
    "icon": "assets/icons/Auqular256.ico"
  },
  "files": [
    "dist/**/*",
    "main.js",
    "preload.js",
    "package.json",
    "assets/**/*",
    "!node_modules/**/*",
    "node_modules/fluent-ffmpeg/**/*",
    "node_modules/mic/**/*",
    "node_modules/node-record-lpcm16/**/*"
  ],
  "extraResources": [
    {
      "from": "node_modules/ffmpeg-static/ffmpeg.exe",
      "to": "ffmpeg.exe"
    },
    {
      "from": "node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe",
      "to": "ffprobe.exe"
    },
    {
      "from": "bin/sox/",
      "to": "sox/"
    }
  ]
}
```

### React Import Errors (RESOLVED)
**Issue**: Webpack couldn't parse ES6 imports  
**Solution**: 
- Renamed all .js files to .jsx
- Created .babelrc configuration
- Updated webpack.config.js entry to './src/index.jsx'

### Event Parameter Bug (RESOLVED)
**Issue**: Undefined `event` in Preview.jsx  
**Solution**: Changed `handleVideoClick = () =>` to `handleVideoClick = (event) =>`

### SoX Bundling ✅ IMPLEMENTED
- Bundled SoX exe and DLLs in bin/sox/ folder
- extraResources copies to resources/sox/
- main.js spawns with path detection

### Drag and Drop Event Handling ⚠️ RESEARCH NEEDED
**Issue**: Drop events not being captured despite comprehensive event handlers
**Current Implementation**:
- Event listeners on window, document, body with `{ passive: false, capture: true }`
- `preventDefault()`, `stopPropagation()`, `stopImmediatePropagation()` in all handlers
- Comprehensive logging for debugging
- `dataTransfer.dropEffect = 'copy'` and `effectAllowed = 'copy'` set
**Hypotheses**:
- May need Electron main process drag/drop handler
- May require different event capture approach
- Could be Electron security settings blocking file drops
**Research Direction**: Investigate Electron-specific drag/drop APIs, IPC-based file handling alternatives

### Video Element Rendering ⚠️ INVESTIGATION NEEDED
**Issue**: Video element shows black screen during playback but correct frame on pause
**Current Implementation**:
- HTML5 `<video>` element with `preload="auto"`, `playsInline`, explicit display styles
- `video.style.display = 'block'`, `visibility: 'visible'`, `opacity: '1'` set during play
- Video loads successfully (console logs confirm)
- Video audio plays correctly (extracted and mixed)
**Hypotheses**:
- CSS z-index/layering issue hiding video behind other elements
- Video element state management issue (src changes interfering with playback)
- Electron Chromium video playback quirk
- React re-render causing video element to reset
**Investigation Steps**: Check CSS hierarchy, video element lifecycle, React component re-render patterns


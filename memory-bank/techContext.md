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
- **node-record-lpcm16** v1.0.1 - System audio recording
- **sox-audio** v0.3.0 - Enhanced audio processing (optional)
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

### IPC Communication
Renderer → Main (via ipcRenderer.invoke):
- `openVideoFile()` - Open file picker
- `getVideoDuration(path)` - Get video metadata
- `generateThumbnail(path)` - Create thumbnail
- `exportVideo({inputPath, outputPath, startTime, endTime, scaleTo1080p})` - Export
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

## Known Technical Issues & Solutions

### FFmpeg Path Setup ✅ RESOLVED
**Issue**: `Cannot find ffprobe` error when using fluent-ffmpeg  
**Solution**: Configure both ffmpeg and ffprobe paths in main.js:
```javascript
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}
if (ffprobeStatic) {
  ffmpeg.setFfprobePath(ffprobeStatic.path);
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


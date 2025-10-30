# Auqular - Desktop Video Editor for Windows

A lightweight desktop video editor built with Electron, React, and Konva.js. Inspired by Final Cut Pro, CapCut, and Clipchamp.

## ✨ Features

### Core Editing
- **Video Import**: Import MP4/MOV/AVI/MKV/WEBM files via file picker or drag-and-drop
- **Multi-Lane Timeline**: Final Cut Pro-style timeline with unlimited video and audio lanes
- **Video Thumbnails**: First/last frame previews on each clip for easy identification
- **Clip Trimming**: Drag handles to set in/out points with real-time preview
- **Drag & Drop**: Reposition clips on timeline, move between lanes
- **Auto-Snap Positioning**: Clips snap to nearby clips within 20px threshold
- **Timeline Zoom**: Ctrl+Mouse Wheel to zoom in/out
- **Clip Splitting**: Split clips at playhead position (S key)
- **Clip Deletion**: Delete selected clips (Delete/Backspace key)

### Playback & Preview
- **Continuous Playback**: Smooth, uninterrupted playback across all clips without stopping at boundaries
- **Sequential Playback**: Clips play continuously one after another
- **Loop Playback**: Auto-restart from beginning when reaching end
- **Seamless Transitions**: Playhead continues moving smoothly when transitioning between clips
- **Multi-Track Audio**: Simultaneous playback of overlapping audio tracks
- **Preview Player**: HTML5 video player with play/pause controls
- **Timeline Sync**: Click timeline to seek, playhead tracks current position

### Recording (Advanced)
- **Webcam Recording**: Record from webcam with Canvas frame capture
- **Screen Recording**: Record screen with desktopCapturer API
- **Simultaneous Recording**: Loom-style screen + webcam PiP + microphone audio
- **Automatic Import**: Recorded videos automatically added to timeline

### Export
- **Multiple Resolutions**: Export at source resolution, 720p (1280x720), or 1080p (1920x1080)
- **Export Progress Indicator**: Real-time progress display (XX%) during export
- **Multi-Lane Export**: Merges visible video and audio lanes into single MP4
- **Audio Mixing**: Combines multiple audio tracks with proper timeline positioning
- **Lane Visibility**: Toggle lane visibility (eyeball icon) to control what's exported

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- Windows 10/11

### Installation
```bash
npm install
```

### Development
```bash
npm run dev    # Development mode with hot reload
npm start      # Launch app
npm run build  # Build for production
```

### Build Windows EXE
```bash
npm run dist   # Creates installer in dist/
```

## 📦 Project Structure

```
auqular/
├── main.js                          # Electron main process
├── preload.js                       # IPC context bridge
├── src/
│   ├── App.jsx                      # Main app component
│   ├── components/
│   │   ├── Toolbar.jsx              # Import/Export/Record buttons
│   │   ├── Preview.jsx              # Video player
│   │   ├── MultiLaneTimeline.jsx   # Final Cut Pro-style timeline
│   │   ├── WebcamRecorder.jsx       # Webcam recording
│   │   ├── ScreenRecorder.jsx       # Screen recording
│   │   └── SimultaneousRecorder.jsx # Loom-style recording
│   └── styles.css                   # Dark theme styles
└── memory-bank/                     # Project documentation
```

## 🎯 Usage

### Basic Editing Workflow
1. **Import**: Click "Import Video" button or drag files into the app
2. **Import Audio**: Click "Import Audio" to add audio tracks
3. **Arrange**: Drag clips on timeline to reposition, move between lanes
4. **Trim**: Drag handles on clips to set start/end points
5. **Split**: Press **S** to split clip at playhead position
6. **Delete**: Press **Delete** or **Backspace** to remove selected clip
7. **Preview**: Click Play button or timeline to watch your edit
8. **Export**: Choose resolution and click to export:
   - **Export MP4** - Source resolution (no scaling)
   - **720p** - Export at 1280x720
   - **1080p** - Export at 1920x1080

### Recording Workflow
1. Click **Record** button in toolbar
2. Choose recording mode:
   - **Webcam** - Record from camera
   - **Screen** - Record screen capture
   - **Simultaneous** - Loom-style screen + webcam PiP
3. Click **Start Recording**
4. Click **Stop Recording** when done
5. Video automatically imports to timeline

### Timeline Navigation
- **Zoom**: Ctrl + Mouse Wheel
- **Scroll**: Mouse Wheel (vertical), Shift + Mouse Wheel (horizontal)
- **Seek**: Click anywhere on timeline
- **Play**: Spacebar or Play button
- **Lane Visibility**: Click eyeball icon to hide/show lanes

## 🔧 Technical Stack

- **Electron** v39 - Desktop framework
- **React** v18 - UI framework
- **Konva.js** - Timeline canvas interactions
- **fluent-ffmpeg** - Video processing
- **ffmpeg-static** - Bundled FFmpeg binary
- **Webpack** - Build bundling
- **Babel** - JSX/ES6 transpilation

## 🐛 Known Issues

### Minor (Non-Blocking)
- **Drag-and-Drop Import**: Files dragged from Windows Explorer show red X cursor and drop fails (file picker works as alternative)

### Non-Critical
- GPU cache errors in console (harmless, Windows Electron issue)
- Bundle size warning (acceptable for desktop app)
- Horizontal scrollbar positioning needs refinement
- System audio recording tabled (microphone recording works perfectly)

## 📝 Development Status

**Status**: MVP Complete + Advanced Features Implemented! 🎉

### Core Features ✅
- ✅ Video/audio import with thumbnails
- ✅ Multi-lane timeline (Final Cut Pro-style)
- ✅ Video thumbnails on clips
- ✅ Drag/drop clip positioning
- ✅ Auto-snap positioning
- ✅ Trim handles with real-time feedback
- ✅ Clip splitting (S key)
- ✅ Clip deletion (Delete/Backspace)
- ✅ Timeline zoom (Ctrl+Wheel)
- ✅ Lane visibility toggles

### Playback & Preview ✅
- ✅ Continuous playback without interruption at clip boundaries
- ✅ Sequential playback through clips
- ✅ Loop playback (auto-restart)
- ✅ Seamless transitions between clips
- ✅ Multi-track simultaneous audio
- ✅ Preview player with controls
- ✅ Timeline sync and seeking

### Recording Features ✅
- ✅ Webcam recording (Canvas + FFmpeg)
- ✅ Screen recording (desktopCapturer)
- ✅ Simultaneous recording (Loom-style)
- ✅ Automatic import to timeline

### Export Features ✅
- ✅ Multi-resolution export (Source/720p/1080p)
- ✅ Real-time export progress indicator
- ✅ Multi-lane merging
- ✅ Audio track mixing
- ✅ Timeline position accuracy
- ✅ Lane visibility support

### Packaging ✅
- ✅ Windows EXE built and tested
- ✅ FFmpeg binaries properly bundled
- ✅ Portable executable ready

## 📄 License

ISC

## 🎯 Project Goals

### MVP Goals ✅ COMPLETE
- ✅ Launch on Windows without errors
- ✅ Import and display videos
- ✅ Multi-lane timeline with thumbnails
- ✅ Trim, split, and delete clips
- ✅ Continuous playback with seamless transitions and looping
- ✅ Export to MP4 with multiple resolutions
- ✅ Stability and reliability

### Stretch Goals ✅ COMPLETE
- ✅ Screen recording
- ✅ Webcam recording
- ✅ Simultaneous recording (Loom-style)
- ✅ Multi-track audio playback
- ✅ Export progress indicator
- ✅ Timeline zoom and navigation

## 🎬 FFmpeg Integration

Auqular uses bundled FFmpeg binaries for:
- Video duration extraction
- Thumbnail generation (first/last frames)
- Video trimming and export
- Resolution scaling (720p/1080p)
- Audio mixing and synchronization
- Black frame padding for timeline gaps
- Recording frame-to-video conversion

## ⚙️ Technical Implementation Highlights

- **Canvas Frame Capture**: MediaRecorder API incompatible with Electron, using Canvas capture at 30 FPS instead
- **Multi-Track Audio**: Dynamic creation of hidden HTML5 audio elements for simultaneous playback
- **Export Resolution**: Simple video filters applied AFTER complex filter processing for proper scaling
- **Timeline Architecture**: Konva.js canvas for performance with 10+ clips
- **IPC Communication**: Secure context bridge pattern for main/renderer process communication

## 📚 Documentation

See the `memory-bank/` directory for comprehensive project documentation:
- **projectbrief.md** - Project goals and scope
- **activeContext.md** - Current work and recent changes
- **progress.md** - Feature completion status
- **techContext.md** - Technology stack and solutions
- **systemPatterns.md** - Architecture patterns


# Auqular - Desktop Video Editor for Windows

A lightweight desktop video editor built with Electron, React, and Konva.js. Inspired by CapCut and Clipchamp.

## ✨ Features

- **Video Import**: Import MP4/MOV/AVI/MKV/WEBM files
- **Timeline Editing**: Drag and drop clips on timeline
- **Trimming**: Drag handles to set in/out points
- **Preview**: Playback controls with timeline sync
- **Export**: Export trimmed video to MP4 (1080p or source resolution)

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
├── main.js              # Electron main process
├── preload.js           # IPC context bridge
├── src/
│   ├── App.jsx         # Main app component
│   ├── components/
│   │   ├── Toolbar.jsx # Import/Export buttons
│   │   ├── Preview.jsx # Video player
│   │   └── Timeline.jsx# Konva timeline canvas
│   └── styles.css      # Dark theme styles
└── memory-bank/         # Project documentation
```

## 🎯 Usage

1. **Import**: Click "Import Video" button, select a file
2. **Arrange**: Drag clips on timeline to reposition
3. **Trim**: Drag green handles to set start/end points
4. **Preview**: Click timeline or video to seek, use Play button
5. **Export**: Click "Export MP4" to save trimmed video

## 🔧 Technical Stack

- **Electron** v39 - Desktop framework
- **React** v18 - UI framework
- **Konva.js** - Timeline canvas interactions
- **fluent-ffmpeg** - Video processing
- **ffmpeg-static** - Bundled FFmpeg binary
- **Webpack** - Build bundling
- **Babel** - JSX/ES6 transpilation

## 🐛 Known Issues

- GPU cache errors in console (harmless, Windows Electron issue)
- Bundle size warning (acceptable for desktop app)
- No file drag/drop yet (only file picker)

## 📝 Development Status

Core features complete:
- ✅ Video import with thumbnails
- ✅ Timeline with drag/drop
- ✅ Trim handles functional
- ✅ Preview player with controls
- ✅ Export ready for testing

## 📄 License

ISC

## 🎯 MVP Goals

- Launch on Windows without errors
- Import and display videos
- Basic trim functionality
- Export to MP4
- Stability and reliability


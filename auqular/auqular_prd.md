## Product Requirements Document (PRD) for Auqular MVP

## Overview
Auqular is a desktop video editor inspired by CapCut, Clipchamp, and Veed, built using Electron for Windows. The MVP focuses on core functionality to meet the Tuesday, October 28th, 2025, 10:59 PM CT deadline: a launchable app with video import, simple timeline, preview, basic trim, and MP4 export. Emphasis is on stability, reliability, and fast deployment to avoid crashes, memory leaks, and incompatibilities. The app must pass all specified testing scenarios and performance targets with 100/100 score.

Key principles:
- **Stability/Reliability**: Use battle-tested libraries and patterns. Stick to Electron's mature ecosystem for desktop integration. Thoroughly test for memory leaks (e.g., via Chrome DevTools and process monitoring). Implement error handling, resource cleanup (e.g., stop media streams, release blobs), and debounce UI events.
- **Speed of Deployment**: Prioritize simplicity—use React for frontend (familiar ecosystem, quick prototyping with hooks/components), Konva.js for timeline (canvas-based for performant dragging/trimming with 10+ clips), desktopCapturer and getUserMedia for recording, and fluent-ffmpeg with ffmpeg-static for media processing (bundled binary avoids install issues).
- **Expert Recommendation for FFmpeg Integration**: To build quickly yet stably, use fluent-ffmpeg Node.js library with ffmpeg-static for a bundled FFmpeg binary. This is reliable in Electron (runs in Node context, isolated from renderer to prevent crashes), performant for video editing, and avoids dependencies pitfalls. Handle events for progress, use temp files for input/output to manage memory, and ensure process cleanup on errors to prevent leaks. Test exports early with small clips.

## Scope
- **Platform**: Windows-only (focus on win32/64 compatibility).
- **MVP Features** (Core Loop: Import → Display → Trim → Export):
  - App launches as a native Windows executable (not dev mode).
  - Video import: Drag & drop or file picker for MP4/MOV files.
  - Simple timeline: View imported clips as draggable/resizable elements.
  - Video preview: HTML5 <video> player that plays selected/ timeline clips.
  - Basic trim: Set in/out points on a single clip via sliders or drag handles.
  - Export: To MP4 with source resolution or 1080p option; use FFmpeg to trim/export single clip initially.
- **Stretch for Full Submission** (If time allows post-MVP): Add recording (screen via desktopCapturer + getUserMedia, webcam via getUserMedia), multi-clip arrangement, split, delete, multiple tracks, zoom/snap, real-time preview scrubbing, audio sync.
- **Non-Features**: No text overlays, transitions, effects, cloud upload, auto-save, undo/redo for MVP.
- **Dependencies**:
  - Electron (for desktop app framework, with ipcMain/ipcRenderer for main/renderer communication).
  - Frontend: React (state management with hooks/Redux if needed for timeline).
  - Timeline: Konva.js (canvas for responsive UI with 10+ clips).
  - Media: HTML5 video; fluent-ffmpeg with ffmpeg-static for processing.
  - Others: Avoid heavy deps; use lodash for utils if needed, but minimize. Use electron's fs, dialog, etc., for file operations.
- **Performance Targets** (Must Achieve 100/100):
  - Timeline responsive with 10+ clips (use virtual rendering in Konva if needed).
  - Preview at 30+ FPS (optimize by loading low-res proxies if clips are large).
  - Export without crashes (progress bar, error handling).
  - Launch <5s (minimize bundle size, lazy load components).
  - No memory leaks in 15+ min sessions (monitor via Task Manager; cleanup event listeners, blobs, streams).
  - Exported file quality: Reasonable size (use FFmpeg presets like -crf 23 for balance).
- **Testing Scenarios** (Must Pass All):
  - 30s screen recording to timeline.
  - Import/arrange 3 clips.
  - Trim/split at points.
  - Export 2-min multi-clip video.
  - Webcam overlay on screen recording.
  - Cross-test on Mac/Windows (emulate Mac via CI if needed, but primary Windows).

## User Stories
- As a user, I can launch the app on Windows without errors.
- As a user, I can import MP4/MOV via drag/drop or picker, seeing thumbnails in timeline.
- As a user, I can preview imported clips smoothly.
- As a user, I can trim a clip by adjusting start/end, updating preview.
- As a user, I can export trimmed clip to MP4 (source/1080p), with progress and no crashes.

## Technical Architecture
- **Framework**: Electron (main process for Node.js modules like FFmpeg, renderer for WebView UI).
- **Frontend**: React app in renderer process.
- **Media Pipeline**: 
  - Import: Use Electron's dialog/fs to read files, generate thumbnails via fluent-ffmpeg (extract frame).
  - Preview: <video> tag with src from file paths or blobs.
  - Trim: Update clip metadata (start/end timestamps); preview seeks accordingly.
  - Export: In main process, use fluent-ffmpeg with commands like `ffmpeg -i input.mp4 -ss start -to end -c copy output.mp4` for simple trim (fast, no re-encode); for 1080p, add `-vf scale=1920:1080`.
- **Recording**:
  - **Screen**: In renderer, use desktopCapturer.getSources({types: ['window', 'screen']}) to list and select screens/windows, then navigator.mediaDevices.getUserMedia({audio: false, video: {mandatory: {chromeMediaSource: 'desktop', chromeMediaSourceId: source.id}}}) for video stream. Add audio via separate getUserMedia({audio: true}) if needed, merge streams.
  - **Webcam**: Use navigator.mediaDevices.getUserMedia({video: true}) in renderer, record with MediaRecorder to blob (MP4), save to file via ipc to main fs.writeFile.
  - **Simultaneous**: Renderer button gets screen and webcam streams, combines (e.g., via canvas for PiP) or records separately; on stop, saves blobs/files and adds to timeline (webcam on overlay track for PiP preview).
- **Error Handling**: Global try-catch, user-friendly alerts; log to console for debugging.
- **Build/Packaging**: Use electron-builder for Windows EXE; bundle ffmpeg-static in app resources.

## Risks & Mitigations
- **FFmpeg Issues**: Test fluent-ffmpeg early; fallback to basic copy if encoding fails.
- **Memory Leaks**: Use React's useEffect for cleanup; revokeObjectURLs after use.
- **Perf Bottlenecks**: Profile with Chrome DevTools; optimize timeline renders. Note Electron's larger bundle may impact launch time—minimize via code splitting.
- **Incompatibilities**: Pin dep versions; test on Windows 10/11.
- **Recording Permissions**: Handle browser-like prompts; error if denied.

## Timeline
- Today (Oct 28, 2025): Setup, import, preview, timeline, trim, export; package MVP.
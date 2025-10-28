## Tasks Markdown for LLM Engineers

## Setup & Boilerplate 
- [ ] Initialize Electron project: Use electron-forge with React template (`npx create-electron-app auqular --template=webpack` or similar, integrate React).
- [ ] Configure package.json for Windows target, add dev dependencies like electron-builder for packaging.
- [ ] Setup React app structure: Components for App, Timeline, Preview, ImportButton.
- [ ] Install deps: `npm i konva react-konva lodash fluent-ffmpeg ffmpeg-static` (for utils and media processing).
- [ ] Configure FFmpeg: Set fluent-ffmpeg path to ffmpeg-static binary for bundled execution.

## Import & Media Management 
- [ ] Implement drag/drop and file picker: Use React DnD or native events; read files via Electron's dialog or fs module (require in preload).
- [ ] Generate thumbnails: Use fluent-ffmpeg to extract frame `-i file -ss 0 -vframes 1 thumb.jpg`.
- [ ] Store clips in state: Array of {id, path, duration, thumbnail, start:0, end:duration}.
- [ ] Display media library panel with thumbnails.

## Timeline Editor 
- [ ] Build timeline with Konva.js: Stage with layers for clips (rectangles with text/duration).
- [ ] Make clips draggable/resizable: Use Konva transformers for trim handles.
- [ ] Add playhead: Vertical line, draggable for scrubbing.
- [ ] Implement basic arrangement: Drag to position, snap to edges.
- [ ] Ensure responsiveness: Limit redraws, test with 10 clips.

## Preview & Playback 
- [ ] Setup <video> player: Src from current clip path or blob.
- [ ] Sync with timeline: On play, update playhead; on scrub, seek video.
- [ ] Handle trim preview: Use video.currentTime = start; play to end.
- [ ] Test smoothness: Ensure 30+ FPS by avoiding heavy ops in render loop.

## Trim Functionality 
- [ ] Add in/out sliders or drag handles on clip in timeline.
- [ ] Update clip state on change, reflect in preview.
- [ ] Basic split: At playhead, duplicate clip and adjust start/end.

## Export & Sharing 
- [ ] Export button: Collect timeline clips, process with fluent-ffmpeg.
- [ ] For single clip MVP: fluent-ffmpeg command equivalent to `-i path -ss start -to end -vf scale=1920:1080 -crf 23 out.mp4` (or source res).
- [ ] Progress: Listen to ffmpeg events for updates, show in UI.
- [ ] Save to FS via Electron dialog.showSaveDialog.
- [ ] Test no crashes: Handle large files with temp dirs.

## Recording 
- [ ] Screen (Frontend): Use desktopCapturer.getSources({types: ['window', 'screen']}) to list available screens/windows, present selection UI, then getUserMedia({video: {mandatory: {chromeMediaSource: 'desktop', chromeMediaSourceId: source.id}}}) for stream.
- [ ] Add audio: Include audio: true in getUserMedia for system/mic audio (prompt user permissions).
- [ ] Webcam (Frontend): navigator.mediaDevices.getUserMedia({video: true}) for webcam stream.
- [ ] Record: Use MediaRecorder on the stream, start recording, on stop save blob as MP4, add to timeline.
- [ ] Simultaneous: Combine screen and webcam streams (e.g., via canvas composition or separate tracks), record merged or add separately to timeline (webcam on overlay for PiP).
- [ ] Handle PiP preview: In timeline, overlay track shows webcam video synced.

## Testing & Polish 
- [ ] Unit tests: For components (Jest).
- [ ] E2E: Manual run through scenarios; monitor memory in Task Manager.
- [ ] Perf optimizations: Debounce drags, revoke URLs, stop streams.
- [ ] Package: `electron-builder` for Windows EXE; test launch <5s, no leaks in 15min session.
- [ ] Debug: Add logging, error toasts.

Assign tasks to engineers based on expertise; parallelize UI vs. backend. Aim for iterative commits, test early.
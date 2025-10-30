# Active Context: Auqular Development

## Current Focus
🎯 **CRITICAL PRIORITY: Video Preview Rendering During Playback** - Video shows correctly on pause but displays black screen during active playback. This blocks core editing workflow.

## Recent Changes (Current Session)

### Export Resolution Options ✅ COMPLETE!
- **Three export quality presets** - Source resolution (no scaling), 720p (1280x720), and 1080p (1920x1080)
- **UI implementation** - Small resolution buttons (720p, 1080p) positioned directly to the right of Export MP4 button with minimal spacing (2px)
- **Export MP4 button** - Exports at source resolution (no scaling applied)
- **Technical implementation** - Applied scaling as simple video filter AFTER complex filter processing using `.videoFilters()` method
- **Critical fix** - Moved scaling from complex filter array (which wasn't being applied) to simple video filter for proper FFmpeg processing
- **Both handlers updated** - Implemented scaling in both `export-multi-lane` and `export-video` IPC handlers

### Multi-Track Simultaneous Audio Playback Implementation ✅ COMPLETE!
- **Simultaneous audio mixing** - Multiple overlapping audio/video clips now play audio simultaneously
- **Audio extraction from video** - Video clips automatically extract audio and play alongside standalone audio tracks
- **Dynamic audio element management** - Creates/manages multiple hidden audio elements for each overlapping clip
- **Trim boundary enforcement** - Each audio track respects its clip's trimStart/trimEnd boundaries
- **State synchronization** - All audio tracks sync to playhead position and play/pause state

### Sequential Playback Through Gaps ✅ ENHANCED!
- **Enhanced getClipsAtPosition** - Now returns ALL clips at timeline position, not just one
- **Gap handling** - Seamlessly transitions through empty spaces between clips
- **Priority system** - Video clips prioritized over audio for preview display

### Loop Playback ✅ COMPLETE!
- **Auto-restart on end** - When playhead reaches end of all clips, automatically resets to beginning
- **Continuous playback** - Playback continues indefinitely without manual restart
- **State preservation** - Play/pause state maintained through loop transition

### Timeline Features ✅ COMPLETE!
- **Clip splitting** - Split clips at playhead position (S key)
- **Clip deletion** - Delete selected clip (Delete/Backspace key)
- **Timeline zoom** - Ctrl+Mouse Wheel to zoom timeline in/out
- **Drag-and-drop import** - File import via drag from file explorer (needs fix)
- **Horizontal scrollbar** - Draggable scrollbar at bottom of timeline (buggy, needs refinement)

### Export Timeline Syncing ✅ COMPLETE
- **Timeline position tracking** - Export now tracks timelineStart/timelineEnd for all clips
- **Black frame padding** - Adds black frames before/after video when audio extends beyond
- **Audio positioning** - Uses adelay filters to position audio correctly relative to timeline start
- **Fixed**: Audio now properly positioned even if starting before/after video
- **Fixed**: Export duration now matches longest clip with proper padding
- **Fixed**: Handles cases where inputs have no audio streams

### SoX Bundling for System Audio ✅ COMPLETE (But Tabled for Now)
- Bundled SoX Windows binary and DLLs in `bin/sox/` folder
- Updated package.json extraResources to include the folder
- Modified main.js to spawn bundled SoX for system audio capture
- Added fallback to node-record-lpcm16 if SoX fails
- System audio capture tabled temporarily due to default device configuration issues
- Microphone capture working reliably via web MediaRecorder

### Multi-Lane Export Merging ✅ COMPLETE
- Added 'export-multi-lane' IPC handler in main.js to merge visible video and audio tracks into single MP4
- Updated App.jsx handleExport to collect visible clips and invoke new handler
- Supports merging microphone audio with screen+webcam video
- Handles PiP overlay if multiple videos present

### FFmpeg Packaging Fix ✅ COMPLETE!
- **Fixed Windows EXE FFmpeg error** - "Failed to import video: Error invoking remote method 'get-video-duration': Error: spawn ffprobe.exe ENOENT"
- **Updated electron-builder configuration** - Changed from `files` to `extraResources` for proper binary packaging
- **Enhanced main.js path handling** - Added `app.isPackaged` detection for development vs production environments
- **Verified binary inclusion** - FFmpeg binaries now properly included in `dist\win-unpacked\resources\`
- **EXE rebuild successful** - New portable executable ready with working video import

### Sequential Playback Implementation ✅ COMPLETE!
- **Continuous playhead advancement** - Real-time playhead movement using `requestAnimationFrame`
- **Seamless clip transitions** - Automatic switching between clips as playhead advances
- **Gap handling** - Playhead continues through empty spaces between clips
- **End-of-timeline detection** - Stops only when reaching the end of all clips
- **Independent preview** - Shows clip at current playhead position, not just selected clip
- **Final Cut Pro behavior** - Playhead controls playback, clips play in timeline order
- **Multi-lane support** - Works with visible lanes and lane visibility toggles
- **Performance optimized** - Efficient animation loop with proper cleanup

### Multi-Lane Timeline Implementation ✅ COMPLETE!
- **Created MultiLaneTimeline.jsx** - New timeline component replacing old single-lane Timeline.jsx
- **Implemented lane system** - 3 default lanes (Video + 2 Audio) with dynamic lane creation
- **Added video thumbnails** - Using `use-image` package for first/last frame previews
- **Implemented auto-snap positioning** - Clips snap to nearby clips within 20px threshold
- **Added lane visibility toggles** - Eyeball icon to hide/show lanes from preview/export
- **Lane toolbar** - Small toolbar on left of each lane with 3 button slots
- **Visual feedback** - Hidden lanes greyed out at 30% opacity
- **Export integration** - Only visible lanes included in export
- **Vertical scrolling** - Mouse wheel support for 3+ lanes
- **Fixed handleWheel bug** - Restored missing function that caused blank screen

### Export Functionality Fix ✅ COMPLETE
- Added dynamic audio stream probing using ffprobe
- Only include audio in FFmpeg mix if streams exist
- Wrapped probing in async IIFE to enable await in CommonJS
- Confirmed export works without errors even if inputs lack audio

## Recent Changes (Previous Session)

### Recording Feature Development ✅ COMPLETE!
- **Added WebcamRecorder component** with Canvas frame capture approach
- **Added ScreenRecorder component** using desktopCapturer API + getUserMedia
- **Added SimultaneousRecorder component** with Loom-style PiP overlay
- **Configured Electron permissions** for camera/microphone/screen access
- **Attempted MediaRecorder API** but discovered fundamental incompatibility with Electron v39
- **✅ IMPLEMENTED WORKAROUND**: Canvas frame capture + FFmpeg conversion for all types
- **✅ FIXED CRITICAL BUGS**: Frame capture synchronization + FFmpeg codec/container mismatch
- **✅ TESTED END-TO-END**: All recording types → Saving → Import → Timeline integration working perfectly

### Known Issues to Address Later
- **SoX Integration**: sox-audio package API mismatch (`sox.version` and `sox.record` not functions as expected)
  - System audio recording falls back to node-record-lpcm16
  - Will need to investigate alternative npm package or direct SoX binary integration
  - Microphone recording working correctly
- **Current Timeline Limitations**: Clips stack vertically (one per row) without proper lane management
  - Need multi-lane architecture similar to Final Cut Pro
  - Need video thumbnail previews on each clip
  - Need automatic clip positioning and visual continuation

### Critical Discovery: MediaRecorder Incompatibility 🚨 → SOLVED ✅
**Issue**: MediaRecorder in Electron v39 does not work properly with getUserMedia/getDisplayMedia
**Symptoms**: 
- MediaRecorder state remains 'inactive' even after calling `start()`
- Stream becomes inactive immediately after MediaRecorder creation
- No data chunks are collected (0 bytes)
- Permission prompts appear to be triggered but may not be properly handled

**Root Cause**: MediaRecorder API has known bugs in Electron's Chromium implementation

**✅ SOLUTION IMPLEMENTED**: Canvas frame capture approach
- Capture video frames to Canvas at 30 FPS
- Save frames as image blobs to temp directory
- Convert frame sequence to video using FFmpeg
- **RESULT**: Webcam recording now works perfectly!

### Additional Critical Fixes Applied ✅
**Frame Capture Loop Synchronization Issue**:
- **Problem**: Frame capture loop started before `isRecording` state updated (async)
- **Symptoms**: "No frames captured" error despite recording timer running
- **Solution**: Used `recordingActiveRef` instead of async `isRecording` state
- **Result**: Frame capture now works immediately

**FFmpeg Codec/Container Mismatch**:
- **Problem**: H.264 codec (`libx264`) incompatible with WebM container
- **Symptoms**: "ffmpeg exited with code 1: Conversion failed!"
- **Solution**: Changed output format from WebM to MP4, added `-movflags +faststart`
- **Result**: Video conversion now works perfectly

**Screen Recording Implementation**:
- **Problem**: getDisplayMedia API not working in Electron
- **Solution**: Used desktopCapturer API to list screens, then getUserMedia with Electron-specific constraints
- **Implementation**: ScreenRecorder component with desktopCapturer.getSources() + getUserMedia with chromeMediaSource: 'desktop'
- **Result**: Screen recording now works perfectly!

### Recent Changes (October 28, 2025)

### Build System Setup ✅
- Configured webpack for production builds
- Created .babelrc for JSX transpilation
- Renamed all .js files to .jsx for proper Babel processing
- Fixed webpack entry point to './src/index.jsx'
- Successfully generating bundle.js (428KB)

### Bug Fixes ✅
- **Fixed undefined event parameter** in `src/components/Preview.jsx`
  - Changed `handleVideoClick = () =>` to `handleVideoClick = (event) =>`
- **Resolved React v19 compatibility issues** by downgrading to React v18
- **Configured Babel** with proper presets for ES6/JSX compilation

### Current State
- ✅ Electron app structure complete
- ✅ FFmpeg IPC handlers implemented in main.js
- ✅ React components created (Toolbar, Preview, Timeline)
- ✅ Konva.js timeline fully functional
- ✅ Webpack build successful
- ✅ **Video import working**: File picker, thumbnail generation, duration extraction
- ✅ **Timeline interactions working**: Drag clips, trim handles, seek
- ✅ **Preview player working**: Play/pause, click to seek, sync with timeline
- ✅ **Clip trimming working**: Real-time trim handles, visual feedback
- ✅ **Export functionality working**: Tested and functional
- ✅ **Windows EXE built**: Portable executable created successfully

## Active Decisions

### FFmpeg Configuration ✅ RESOLVED
**Issue Discovered**: Error "Cannot find ffprobe" when using FFmpeg  
**Solution**: Installed ffprobe-static and configured path in main.js  
**Status**: Fixed by adding `ffmpeg.setFfprobePath(ffprobeStatic.path)`

### Component Architecture
**Decision**: Using React hooks for state management (no Redux)  
**Rationale**: Keeps MVP simple, add Redux later if needed for complex state

### Timeline Implementation
**Decision**: Using Konva.js for canvas-based timeline  
**Rationale**: Better performance for 10+ clips vs DOM manipulation

## Next Steps

### Immediate (In Progress)
1. Fix FFmpeg/ffprobe path configuration
2. Connect import button to IPC handler
3. Test video file import workflow
4. Verify thumbnail generation

### Short-term (Today)
5. Implement timeline clip interactions
6. Connect preview to timeline seek
7. Add trim handle functionality
8. Wire up export button

### Testing Required
- Launch app and verify Electron window appears
- Import test video file
- Verify thumbnails generate correctly
- Test timeline interactions (drag, trim)
- Test export functionality end-to-end
- Memory leak testing (15+ min session)

## Current Blockers

### Video Preview Rendering 🚨 CRITICAL PRIORITY
**Issue**: Video element shows black screen during active playback, but displays correctly when paused
**Symptoms**:
- Video appears correctly on pause
- Black screen during playback
- Sometimes shows video frame briefly when rapidly clicking play/pause
- Video audio plays correctly (extracted and mixed)
**Impact**: Blocks core editing workflow - cannot see video content while editing
**Technical Notes**:
- Video element has `preload="auto"`, `playsInline`, and explicit display styles
- `video.style.display = 'block'` and `visibility = 'visible'` set during play
- Video loads successfully (logs show "✅ Video playback started")
- May be related to CSS layering, z-index, or video element state management

### Drag and Drop File Import 🚨 HIGH PRIORITY
**Issue**: Files dragged from Windows Explorer show red X cursor and drop fails
**Symptoms**:
- Red "not allowed" cursor appears when dragging files
- No drop event triggered in console logs
- preventDefault/stopPropagation handlers added but not preventing default behavior
- Event listeners attached to window, document, and body with capture:true
**Impact**: Users cannot import files via drag/drop, must use file picker button
**Technical Notes**:
- Comprehensive logging added for debugging (dragover, dragenter, dragleave, drop events)
- Event handlers use `{ passive: false, capture: true }` options
- May require Electron-specific drag/drop handling in main process
- Research needed: Best practices for Electron file drag/drop (IPC handlers vs renderer events)

### Export Timeline Positioning ⚠️ MEDIUM PRIORITY
**Issue**: Export doesn't respect timeline positions correctly, especially for audio starting before video
**Symptoms**:
- Audio clips positioned before video start get forced to video start in export
- Export length locked to video duration, ignoring audio that extends past video end
- Black frame padding logic exists but may have filter chain issues
**Impact**: Exported video doesn't match timeline arrangement
**Technical Notes**:
- Export uses `timelineStart` and `timelineEnd` properties
- FFmpeg filter chain: `tpad` for padding before/after video
- Need to verify filter syntax and output mapping

### Timeline Navigation ⚠️ LOW PRIORITY
**Issue**: Horizontal scrolling buggy (both scrollbar and Shift+Wheel)
**Symptoms**:
- Horizontal scrollbar appears and works but has positioning/threshold bugs
- Shift+Mouse Wheel sometimes doesn't scroll horizontally
- Scroll calculation may have issues with delta scaling
**Impact**: Users can navigate but experience is inconsistent
**Status**: Functional but needs refinement

### Recording Implementation ✅ FULLY RESOLVED!
**Status**: Both webcam and screen recording now work perfectly using Canvas + FFmpeg approach
**Solution Implemented**: 
1. ✅ Created WebcamRecorder.jsx with canvas frame capture
2. ✅ Created ScreenRecorder.jsx using desktopCapturer API
3. ✅ Fixed frame capture loop synchronization bug
4. ✅ Fixed FFmpeg codec/container mismatch (WebM → MP4)
5. ✅ Added FFmpeg conversion of frames to video
6. ✅ Tested end-to-end recording workflow successfully for both types
7. ✅ Automatic import of recorded videos into timeline
8. ✅ Added UI toggle between webcam and screen recording

### FFmpeg Path Issue ✅ RESOLVED
**Status**: Fixed by adding ffprobe-static and configuring path in main.js

## Environment
- OS: Windows 10.0.26100
- Working Directory: C:\Users\H\projects\auqular
- Node: Installed (version not checked)
- npm: Available


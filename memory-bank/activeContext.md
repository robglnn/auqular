# Active Context: Auqular Development

## Current Focus
✅ **SEQUENTIAL PLAYBACK COMPLETE** - Final Cut Pro-style continuous playhead advancement with seamless clip transitions, gap handling, and end-of-timeline detection fully implemented and working!

## Recent Changes (Current Session)

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


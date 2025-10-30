# Product Context: Auqular

## Why This Project Exists
Auqular aims to provide a lightweight, stable video editor for Windows users who need basic editing capabilities without the complexity of professional tools.

## Problems It Solves
1. **Quick Video Editing**: Fast import, trim, and export workflow
2. **No Installation Hassles**: Bundled FFmpeg means no external dependencies
3. **Stability First**: Emphasis on reliability over features
4. **Windows Native**: Optimized for Windows users

## How It Should Work

### User Experience Flow
1. User launches the app (< 5s startup)
2. User drags video files or clicks "Import Video"
3. Video appears in timeline with thumbnail
4. User can:
   - Click timeline to seek through video
   - Drag clips to reposition
   - Drag trim handles to set in/out points
   - Click play to preview
5. User clicks "Export MP4" (source resolution), "720p", or "1080p" to save trimmed video
6. Export shows progress and completes without crashes

### Core User Stories
- "I can launch the app on Windows without errors"
- "I can import MP4/MOV via drag/drop or picker, seeing thumbnails in timeline"
- "I can preview imported clips smoothly"
- "I can trim a clip by adjusting start/end, updating preview"
- "I can export trimmed clip to MP4 (source/720p/1080p), with progress and no crashes"

## User Experience Goals
- **Intuitive**: Clear toolbar buttons, visible timeline, responsive preview
- **Fast**: Minimal loading times, smooth 30+ FPS preview
- **Reliable**: No crashes, handles errors gracefully
- **Professional**: Dark theme UI similar to CapCut/Clipchamp


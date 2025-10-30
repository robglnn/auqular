const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, session, protocol } = require('electron');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const fs = require('fs');
const { spawn } = require('child_process');
const record = require('node-record-lpcm16');
const mic = require('mic');

// SOLUTION 2: NUCLEAR OPTION - Disable ALL Chromium security restrictions
console.log('🔓 DISABLING ALL SECURITY RESTRICTIONS FOR FILE DROP');

app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('allow-file-access-from-files');
app.commandLine.appendSwitch('allow-file-access');
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-setuid-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

console.log('✅ Security restrictions disabled');

// Set FFmpeg paths
if (app.isPackaged) {
  // In packaged app, binaries are in resources folder
  const ffmpegPath = path.join(process.resourcesPath, 'ffmpeg.exe');
  const ffprobePath = path.join(process.resourcesPath, 'ffprobe.exe');
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);
} else {
  // In development, use the static packages
  if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
  }
  if (ffprobeStatic) {
    ffmpeg.setFfprobePath(ffprobeStatic.path);
  }
}

// Set SoX path
let soxPath;
if (app.isPackaged) {
  soxPath = path.join(process.resourcesPath, 'sox', 'sox.exe');
} else {
  soxPath = path.join(__dirname, 'bin', 'sox', 'sox.exe');
}

let mainWindow;

app.on('ready', () => {
  const originalGetSources = desktopCapturer.getSources;
  desktopCapturer.getSources = (options) => originalGetSources({ ...options, fetchWindowIcons: false });
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, 'assets', 'icons', 'Auqular256.ico'),
    webPreferences: {
      nodeIntegration: true,              // Full Node.js access
      contextIsolation: false,            // No isolation
      enableRemoteModule: true,           // Enable remote (deprecated but we don't care)
      webSecurity: false,                 // Disable web security
      allowRunningInsecureContent: true,  // Allow insecure content
      experimentalFeatures: true,         // Enable experimental features
      nativeWindowOpen: true,             // Native window.open
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  // Prevent popup windows from opening (e.g., when files are dropped)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('🔍 [Window Handler] Blocked window open:', url);
    
    // If it's a file:// URL, handle it as a file drop instead
    if (url.startsWith('file://')) {
      // Extract file path and handle like Layer 1
      let filePath = url.replace(/^file:\/\//, '');
      filePath = decodeURIComponent(filePath);
      
      if (process.platform === 'win32') {
        filePath = filePath.replace(/^\/+/, '').replace(/^([A-Z])\|/, '$1:').replace(/\//g, '\\');
      }
      
      if (fs.existsSync(filePath)) {
        const fileName = path.basename(filePath);
        const fileExt = path.extname(filePath).toLowerCase();
        const stats = fs.statSync(filePath);
        
        const mimeTypes = {
          '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
          '.mkv': 'video/x-matroska', '.webm': 'video/webm',
          '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.aac': 'audio/aac', '.ogg': 'audio/ogg'
        };
        
        const fileData = [{
          path: filePath,
          name: fileName,
          type: mimeTypes[fileExt] || 'application/octet-stream',
          size: stats.size
        }];
        
        console.log('📤 [Window Handler] Sending dropped file to renderer:', fileData);
        mainWindow.webContents.send('file-dropped', fileData);
      }
    }
    
    // Always prevent window opening
    return { action: 'deny' };
  });
  
  // MULTI-LAYERED FILE DROP INTERCEPTION
  
  // Layer 1: Intercept navigation attempts (handles file:// drops from Windows Explorer)
  // This is the PRIMARY handler for Windows Explorer drag/drop
  mainWindow.webContents.on('will-navigate', (event, url) => {
    console.log('🔍 [Layer 1] Navigation intercepted:', url);
    
    // Check if this is a file drop (file:// protocol)
    if (url.startsWith('file://') && !url.includes('/dist/index.html')) {
      console.log('📁 [Layer 1] File drop detected via navigation!');
      event.preventDefault();
      
      // Extract file path from file:// URL
      // Windows: file:///C:/path/to/file.mp4 -> C:\path\to\file.mp4
      // Handle URL encoding and path normalization
      let filePath = url.replace(/^file:\/\//, ''); // Remove file:// prefix
      filePath = decodeURIComponent(filePath);
      
      // Handle Windows paths
      if (process.platform === 'win32') {
        // file:///C:/... or file:///C|/... -> C:\...
        // Remove leading slashes
        filePath = filePath.replace(/^\/+/, '');
        // Handle C| notation (some Windows paths use | instead of :)
        filePath = filePath.replace(/^([A-Z])\|/, '$1:');
        // Convert forward slashes to backslashes
        filePath = filePath.replace(/\//g, '\\');
      }
      
      console.log('✅ [Layer 1] Extracted absolute path:', filePath);
      
      // Verify file exists
      if (!fs.existsSync(filePath)) {
        console.error('❌ [Layer 1] File does not exist:', filePath);
        return;
      }
      
      // Get file info
      const fileName = path.basename(filePath);
      const fileExt = path.extname(filePath).toLowerCase();
      const stats = fs.statSync(filePath);
      
      const mimeTypes = {
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.webm': 'video/webm',
        '.wav': 'audio/wav',
        '.mp3': 'audio/mpeg',
        '.aac': 'audio/aac',
        '.ogg': 'audio/ogg'
      };
      
      const fileData = [{
        path: filePath,
        name: fileName,
        type: mimeTypes[fileExt] || 'application/octet-stream',
        size: stats.size
      }];
      
      console.log('📤 [Layer 1] Sending to renderer:', fileData);
      mainWindow.webContents.send('file-dropped', fileData);
    } else if (!url.startsWith('devtools://') && !url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
      event.preventDefault();
      console.log('🚫 [Layer 1] Blocked navigation to:', url);
    }
  });
  
  // Layer 2: Aggressive DOM injection after page load
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('📡 [Layer 2] Page loaded - injecting aggressive file drop handler');
    
    mainWindow.webContents.executeJavaScript(`
      (function() {
        console.log('🎬 [Layer 2] Aggressive file drop handler injected');
        
        // Override ALL drag/drop events with maximum priority
        const handleDragOver = (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy';
            e.dataTransfer.effectAllowed = 'all';
          }
          return false;
        };
        
        const handleDrop = async (e) => {
          // ALWAYS prevent default to avoid popup window
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          
          console.log('🎯 [Layer 2] DROP intercepted!', e.dataTransfer.files.length);
          
          if (e.dataTransfer.files.length > 0) {
            const files = Array.from(e.dataTransfer.files);
            
            // Get file paths - try file.path first, then webUtils.getPathForFile() (Electron v32+)
            const { webUtils, ipcRenderer } = window.require('electron');
            
            const fileDataPromises = files.map(async (file) => {
              let filePath = file.path;
              
              // If path is null (Electron v32+), try webUtils.getPathForFile()
              if (!filePath && webUtils && webUtils.getPathForFile) {
                try {
                  filePath = webUtils.getPathForFile(file);
                  console.log('📄 [Layer 2] Got path via webUtils:', file.name, '→', filePath);
                } catch (err) {
                  console.warn('⚠️ [Layer 2] webUtils.getPathForFile failed:', err);
                  // If webUtils fails, try IPC handler as fallback
                  try {
                    filePath = await ipcRenderer.invoke('get-file-path', file);
                    if (filePath) {
                      console.log('📄 [Layer 2] Got path via IPC:', file.name, '→', filePath);
                    }
                  } catch (err2) {
                    console.warn('⚠️ [Layer 2] IPC get-file-path also failed:', err2);
                  }
                }
              }
              
              return {
                path: filePath,
                name: file.name,
                type: file.type || 'application/octet-stream',
                size: file.size || 0
              };
            });
            
            const fileData = await Promise.all(fileDataPromises);
            const filesWithPaths = fileData.filter(f => f.path);
            
            if (filesWithPaths.length > 0) {
              console.log('✅ [Layer 2] Sending', filesWithPaths.length, 'file(s) with paths');
              ipcRenderer.send('files-dropped-layer2', filesWithPaths);
            } else {
              console.warn('❌ [Layer 2] No valid file paths found - Layer 1 or Window Handler should catch this');
            }
          }
          
          return false;
        };
        
        // Remove ALL existing drag/drop listeners
        document.removeEventListener('dragover', handleDragOver);
        document.removeEventListener('drop', handleDrop);
        
        // Add with capture and NO passive
        document.addEventListener('dragover', handleDragOver, { capture: true, passive: false });
        document.addEventListener('drop', handleDrop, { capture: true, passive: false });
        
        // Also add to window
        window.addEventListener('dragover', handleDragOver, { capture: true, passive: false });
        window.addEventListener('drop', handleDrop, { capture: true, passive: false });
        
        console.log('✅ [Layer 2] Handlers attached to document and window');
      })();
    `).then(() => {
      console.log('✅ [Layer 2] Injection complete');
    }).catch(err => {
      console.error('❌ [Layer 2] Injection failed:', err);
    });
  });

  mainWindow.loadFile('dist/index.html');

  // Open DevTools in development
  if (process.env.NODE_ENV !== 'production') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  // CRITICAL: Configure session handlers BEFORE creating window
  // This ensures getDisplayMedia requests are properly handled

  // GRANT ALL PERMISSIONS - NO EXCEPTIONS
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    console.log(`✅ [Layer 3] AUTO-GRANTING permission: '${permission}'`);
    callback(true); // Grant EVERYTHING
  });
  
  // Allow ALL permissions without asking
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    console.log(`✅ [Layer 3] Permission check passed: '${permission}'`);
    return true; // Always allow
  });

  // CRITICAL: Set display media request handler for getDisplayMedia to work
  // This is REQUIRED for getDisplayMedia API in Electron
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    console.log('🚨 DISPLAY MEDIA REQUEST RECEIVED');
    console.log('Video requested:', request.videoRequested);
    console.log('Audio requested:', request.audioRequested);
    console.log('Security origin:', request.securityOrigin);
    console.log('User gesture:', request.userGesture);
    console.log('Frame:', request.frame ? 'present' : 'null');
    
    // Use desktopCapturer to get screen sources
    desktopCapturer.getSources({ 
      types: ['screen', 'window'],
      thumbnailSize: { width: 150, height: 150 },
      fetchWindowIcons: false
    }).then((sources) => {
      console.log(`📺 Found ${sources.length} desktop sources`);
      sources.forEach((source, index) => {
        console.log(`  Source ${index}: id=${source.id}, name=${source.name}, type=${source.id.startsWith('screen:') ? 'screen' : 'window'}`);
      });
      
      // Find first screen source (not window)
      const screenSource = sources.find(source => source.id.startsWith('screen:'));
      
      if (screenSource && request.videoRequested) {
        console.log('✅ Granting screen capture access:', screenSource.name);
        console.log('   Screen source ID:', screenSource.id);
        
        // Grant video from screen source - use the DesktopCapturerSource object directly
        const result = {
          video: screenSource  // Pass the entire DesktopCapturerSource object
        };
        
        // Grant audio if requested (system audio loopback on Windows)
        if (request.audioRequested && process.platform === 'win32') {
          result.audio = 'loopback'; // System audio capture (Windows only)
          console.log('   Granting system audio capture (loopback)');
        }
        
        console.log('📤 Calling callback with result:', JSON.stringify({
          video: { id: result.video.id, name: result.video.name },
          audio: result.audio
        }));
        callback(result);
      } else {
        console.warn('⚠️ No screen source found or video not requested');
        console.warn(`   Screen source: ${screenSource ? 'found' : 'NOT found'}`);
        console.warn(`   Video requested: ${request.videoRequested}`);
        
        // Grant first available source or deny
        if (sources.length > 0 && request.videoRequested) {
          console.log('✅ Granting first available source as fallback:', sources[0].name);
          callback({ video: sources[0] });
        } else {
          console.error('❌ Cannot grant display media - no sources available');
          callback({}); // Deny access
        }
      }
    }).catch((error) => {
      console.error('❌ Error getting desktop sources:', error);
      console.error('   Error stack:', error.stack);
      callback({}); // Deny access on error
    });
  }, { 
    useSystemPicker: false // Disable system picker to ensure our handler is called
  });
  
  console.log('✅ Display media request handler configured');
  
  // NOW create window after handlers are configured
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Force cleanup of all audio processes (called before recording starts)
ipcMain.handle('force-stop-all-audio', async () => {
  try {
    console.log('🔧 Force stopping all audio processes...');
    
    if (systemAudioRecorder) {
      console.log('Force killing system audio recorder...');
      try {
        if (systemAudioRecorder.kill) {
          systemAudioRecorder.kill('SIGKILL'); // Force kill
        } else if (typeof systemAudioRecorder.stop === 'function') {
          systemAudioRecorder.stop();
        }
      } catch (e) {
        console.warn('Error force-killing system recorder:', e);
      }
      systemAudioRecorder = null;
    }
    
    if (microphoneRecorder) {
      console.log('Force stopping microphone recorder...');
      try {
        microphoneRecorder.stop();
      } catch (e) {
        console.warn('Error force-stopping microphone:', e);
      }
      microphoneRecorder = null;
    }
    
    // Clear audio data
    audioData.systemAudio = [];
    audioData.microphone = [];
    
    console.log('✅ All audio processes force-stopped');
    return { success: true };
  } catch (error) {
    console.error('Error force-stopping audio:', error);
    return { success: false, error: error.message };
  }
});

// Cleanup on app quit
app.on('before-quit', () => {
  console.log('🧹 App quitting - cleaning up audio processes...');
  if (systemAudioRecorder) {
    try {
      if (systemAudioRecorder.kill) {
        systemAudioRecorder.kill('SIGTERM');
      } else if (typeof systemAudioRecorder.stop === 'function') {
        systemAudioRecorder.stop();
      }
    } catch (e) {}
    systemAudioRecorder = null;
  }
  if (microphoneRecorder) {
    try {
      microphoneRecorder.stop();
    } catch (e) {}
    microphoneRecorder = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers
ipcMain.handle('open-video-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('open-audio-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Audio Files', extensions: ['wav', 'mp3', 'aac', 'ogg'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('get-video-duration', async (event, filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        resolve(metadata.format.duration);
      }
    });
  });
});

ipcMain.handle('get-video-resolution', async (event, filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (videoStream) {
          resolve({
            width: videoStream.width,
            height: videoStream.height
          });
        } else {
          reject(new Error('No video stream found'));
        }
      }
    });
  });
});

ipcMain.handle('get-audio-duration', async (event, filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        resolve(metadata.format.duration);
      }
    });
  });
});

// IPC handler to read audio file as base64 blob (for playback)
ipcMain.handle('read-audio-file', async (event, filePath) => {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const base64 = fileBuffer.toString('base64');
    // Detect MIME type from extension
    const ext = path.extname(filePath).toLowerCase();
    let mimeType = 'audio/wav';
    if (ext === '.mp3') mimeType = 'audio/mpeg';
    else if (ext === '.ogg') mimeType = 'audio/ogg';
    else if (ext === '.aac') mimeType = 'audio/aac';
    
    return { 
      success: true, 
      data: base64, 
      mimeType: mimeType,
      size: fileBuffer.length 
    };
  } catch (error) {
    console.error('Error reading audio file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('generate-thumbnail', async (event, filePath) => {
  return new Promise((resolve, reject) => {
    const thumbnailPath = path.join(app.getPath('temp'), `thumb_${Date.now()}.jpg`);
    
    ffmpeg(filePath)
      .screenshots({
        timestamps: ['00:00:01'],
        filename: path.basename(thumbnailPath),
        folder: path.dirname(thumbnailPath)
      })
      .on('end', () => {
        resolve(thumbnailPath);
      })
      .on('error', (err) => {
        reject(err);
      });
  });
});

ipcMain.handle('export-video', async (event, { inputPath, outputPath, startTime, endTime, scaleTo1080p = false }) => {
  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath);

    if (startTime || endTime) {
      command = command.seekInput(startTime);
      if (endTime) {
        command = command.duration(endTime - startTime);
      }
    }

    command
      .videoCodec('libx264')
      .audioCodec('aac');

    const scaleNum = scaleResolution ? parseInt(scaleResolution, 10) : null;
    
    if (scaleNum === 720) {
      command = command.videoFilters('scale=1280:720');
    } else if (scaleNum === 1080) {
      command = command.videoFilters('scale=1920:1080');
    }
    // scaleResolution = null means source resolution (no scaling)

    command
      .outputOptions('-crf', '23') // Quality preset
      .save(outputPath)
      .on('progress', (progress) => {
        const progressPercent = progress.percent;
        if (progressPercent !== undefined && progressPercent !== null) {
          event.sender.send('export-progress', progressPercent);
        }
      })
      .on('end', () => {
        resolve(outputPath);
      })
      .on('error', (err) => {
        reject(err);
      });

    command.run();
  });
});

ipcMain.handle('export-multi-lane', async (event, { outputPath, videoClips, audioClips, scaleResolution = null }) => {
  return new Promise((resolve, reject) => {
    try {
      if (videoClips.length === 0 && audioClips.length === 0) {
        reject(new Error('No video or audio clips to export'));
        return;
      }

      console.log('Export starting - video clips:', videoClips.length, 'audio clips:', audioClips.length);
      console.log('Video clips:', videoClips.map(c => ({ path: c.inputPath, lane: c.lane, timelineStart: c.timelineStart, timelineEnd: c.timelineEnd })));
      console.log('Audio clips:', audioClips.map(c => ({ path: c.inputPath, lane: c.lane, timelineStart: c.timelineStart, timelineEnd: c.timelineEnd })));

      if (videoClips.length === 0) {
        reject(new Error('No video clips to export'));
        return;
      }

      // Calculate timeline bounds
      const allTimelineStarts = [
        ...videoClips.map(c => c.timelineStart || 0),
        ...audioClips.map(c => c.timelineStart || 0)
      ];
      const allTimelineEnds = [
        ...videoClips.map(c => c.timelineEnd || (c.timelineStart || 0) + (c.endTime || 0) - (c.startTime || 0)),
        ...audioClips.map(c => c.timelineEnd || (c.timelineStart || 0) + (c.endTime || 0) - (c.startTime || 0))
      ];
      
      const timelineStart = Math.min(...allTimelineStarts, 0);
      const timelineEnd = Math.max(...allTimelineEnds, 0);
      const maxDuration = timelineEnd - timelineStart;
      
      console.log('Timeline bounds:', { start: timelineStart, end: timelineEnd, duration: maxDuration });

      // Helper to probe if file has audio stream
      const hasAudio = async (filePath) => {
        return new Promise((resolve) => {
          ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
              console.warn(`Probe error for ${filePath}:`, err);
              resolve(false);
            } else {
              const hasAudioStream = metadata.streams.some(stream => stream.codec_type === 'audio');
              resolve(hasAudioStream);
            }
          });
        });
      };

      (async () => {  // Wrap in async IIFE
        // Probe audio status for all clips
        const videoClipsWithAudio = await Promise.all(videoClips.map(async (clip) => ({
          ...clip,
          hasAudio: await hasAudio(clip.inputPath)
        })));

        const audioClipsWithAudio = await Promise.all(audioClips.map(async (clip) => ({
          ...clip,
          hasAudio: await hasAudio(clip.inputPath)
        })));

        // Group video clips by lane
        const videoLanes = {};
        videoClipsWithAudio.forEach(clip => {
          const lane = clip.lane || 'default';
          if (!videoLanes[lane]) {
            videoLanes[lane] = [];
          }
          videoLanes[lane].push(clip);
        });

        // Sort clips within each lane by timelineStart
        Object.keys(videoLanes).forEach(lane => {
          videoLanes[lane].sort((a, b) => (a.timelineStart || 0) - (b.timelineStart || 0));
        });

        console.log('Video lanes:', Object.keys(videoLanes).map(lane => ({
          lane,
          clips: videoLanes[lane].length,
          timeline: videoLanes[lane].map(c => ({ start: c.timelineStart, end: c.timelineEnd }))
        })));

        // Determine if we need concat (multiple clips on same lane) or overlay (different lanes)
        const laneIds = Object.keys(videoLanes);
        const needsConcat = laneIds.some(lane => videoLanes[lane].length > 1);
        const needsOverlay = laneIds.length > 1;

        let command;
        const tempDir = require('os').tmpdir();
        const tempFiles = [];
        const overlayFilters = []; // Declare here for scope

        // Helper to create trimmed intermediate file for a clip
        const createTrimmedClip = async (clip, index) => {
          const tempPath = path.join(tempDir, `clip_${index}_${Date.now()}.mp4`);
          tempFiles.push(tempPath);
          
          return new Promise((resolve, reject) => {
            let clipCmd = ffmpeg(clip.inputPath);
            
            if (clip.startTime > 0) {
              clipCmd = clipCmd.seekInput(clip.startTime);
            }
            if (clip.endTime && clip.endTime > clip.startTime) {
              const duration = clip.endTime - clip.startTime;
              clipCmd = clipCmd.duration(duration);
            }
            
            clipCmd
              .videoCodec('libx264')
              .outputOptions('-preset', 'fast')
              .outputOptions('-crf', '23')
              .outputOptions('-pix_fmt', 'yuv420p');
            
            // Only encode audio if the source clip has audio
            if (clip.hasAudio) {
              clipCmd = clipCmd.audioCodec('aac');
            } else {
              // Explicitly disable audio encoding if source has no audio
              clipCmd = clipCmd.outputOptions('-an'); // No audio
            }
            
            clipCmd
              .save(tempPath)
              .on('end', () => resolve(tempPath))
              .on('error', (err) => reject(err))
              .run();
          });
        };

        // If we have sequential clips on same lane, use concat demuxer
        if (needsConcat && !needsOverlay) {
          // Single lane with multiple clips - concatenate them
          const laneId = laneIds[0];
          const clips = videoLanes[laneId];
          
          console.log(`Concat mode: ${clips.length} clips on lane ${laneId}`);
          
          // Create trimmed intermediate files
          const trimmedPaths = [];
          for (let i = 0; i < clips.length; i++) {
            const trimmedPath = await createTrimmedClip(clips[i], i);
            trimmedPaths.push(trimmedPath);
          }
          
          // Create concat file
          const concatPath = path.join(tempDir, `concat_${Date.now()}.txt`);
          tempFiles.push(concatPath);
          const concatContent = trimmedPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
          fs.writeFileSync(concatPath, concatContent);
          
          // Use concat demuxer
          command = ffmpeg();
          command = command.input(concatPath);
          command = command.inputOptions(['-f', 'concat', '-safe', '0']);
          
        } else if (needsOverlay) {
          // Multiple lanes - need to overlay or concat then overlay
          // For now, simple approach: concat clips on each lane, then overlay lanes
          // TODO: More sophisticated handling for overlapping vs sequential
          
          // For simplicity, take first lane as base, overlay others
          const baseLane = laneIds[0];
          const baseClips = videoLanes[baseLane];
          
          // If base lane has multiple clips, concat them first
          if (baseClips.length > 1) {
            const trimmedPaths = [];
            for (let i = 0; i < baseClips.length; i++) {
              const trimmedPath = await createTrimmedClip(baseClips[i], i);
              trimmedPaths.push(trimmedPath);
            }
            
            const concatPath = path.join(tempDir, `concat_base_${Date.now()}.txt`);
            tempFiles.push(concatPath);
            const concatContent = trimmedPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
            fs.writeFileSync(concatPath, concatContent);
            
            command = ffmpeg();
            command = command.input(concatPath);
            command = command.inputOptions(['-f', 'concat', '-safe', '0']);
          } else {
            // Single clip on base lane
            command = ffmpeg(baseClips[0].inputPath);
            if (baseClips[0].startTime > 0) {
              command = command.seekInput(baseClips[0].startTime);
            }
            if (baseClips[0].endTime && baseClips[0].endTime > baseClips[0].startTime) {
              const duration = baseClips[0].endTime - baseClips[0].startTime;
              command = command.duration(duration);
            }
          }
          
          // Overlay other lanes (for now, just take first clip from each other lane)
          // TODO: Handle multiple clips on overlay lanes
          let videoInputIndex = 1;
          let currentOutput = '[0:v]';
          
          for (let i = 1; i < laneIds.length; i++) {
            const overlayLane = laneIds[i];
            const overlayClips = videoLanes[overlayLane];
            if (overlayClips.length > 0) {
              const overlayClip = overlayClips[0]; // Take first clip for now
              command = command.input(overlayClip.inputPath);
              if (overlayClip.startTime > 0) {
                command = command.inputOptions([`-ss ${overlayClip.startTime}`]);
              }
              if (overlayClip.endTime && overlayClip.endTime > overlayClip.startTime) {
                const duration = overlayClip.endTime - overlayClip.startTime;
                command = command.inputOptions([`-t ${duration}`]);
              }
              
              const nextOutput = `[v${i}]`;
              overlayFilters.push(`${currentOutput}[${videoInputIndex}:v]overlay=main_w-overlay_w-20:main_h-overlay_h-20${nextOutput}`);
              currentOutput = nextOutput;
              videoInputIndex++;
            }
          }
          
          // Store overlay filters for later combination with audio filters
          if (overlayFilters.length > 0) {
            // Will combine with audio filters below
          }
          
        } else {
          // Single clip, simple case
          const clip = videoClipsWithAudio[0];
          command = ffmpeg(clip.inputPath);
          if (clip.startTime > 0) {
            command = command.seekInput(clip.startTime);
          }
          if (clip.endTime && clip.endTime > clip.startTime) {
            const duration = clip.endTime - clip.startTime;
            command = command.duration(duration);
          }
        }

        // Handle audio - group by lane and process
        const audioLanes = {};
        audioClipsWithAudio.forEach(clip => {
          const lane = clip.lane || 'default';
          if (!audioLanes[lane]) {
            audioLanes[lane] = [];
          }
          audioLanes[lane].push(clip);
        });

        // Sort audio clips within each lane by timelineStart
        Object.keys(audioLanes).forEach(lane => {
          audioLanes[lane].sort((a, b) => (a.timelineStart || 0) - (b.timelineStart || 0));
        });

        // Build audio processing
        const audioInputs = [];
        let audioInputIndex = 0;
        
        // Calculate base input index (depends on video composition)
        // - Concat demuxer: 1 input (the concat file)
        // - Overlay: multiple video inputs
        // - Single clip: 1 input
        let baseVideoInputCount = 1;
        if (needsConcat && !needsOverlay) {
          baseVideoInputCount = 1; // Concat file is input 0
        } else if (needsOverlay) {
          // Count video inputs: base + overlay lanes
          baseVideoInputCount = 1; // Base video or concat
          for (let i = 1; i < laneIds.length; i++) {
            baseVideoInputCount++; // Each overlay lane adds an input
          }
        }

        // Process video audio from concatenated/composed video
        // TODO: Extract audio from concatenated video streams
        
        // Process standalone audio clips with delays
        Object.keys(audioLanes).forEach(lane => {
          const laneAudioClips = audioLanes[lane];
          laneAudioClips.forEach((audioClip, clipIndex) => {
            if (audioClip.hasAudio) {
              command = command.input(audioClip.inputPath);
              
              // Apply trim
              if (audioClip.startTime > 0 || audioClip.endTime) {
                const inputOptions = [];
                if (audioClip.startTime > 0) {
                  inputOptions.push(`-ss ${audioClip.startTime}`);
                }
                if (audioClip.endTime && audioClip.endTime > audioClip.startTime) {
                  const duration = audioClip.endTime - audioClip.startTime;
                  inputOptions.push(`-t ${duration}`);
                }
                if (inputOptions.length > 0) {
                  command = command.inputOptions(inputOptions);
                }
              }
              
              // Delay audio to match timeline position
              const delay = Math.max(0, (audioClip.timelineStart - timelineStart) * 1000);
              const delayedLabel = `[a_delayed${audioInputIndex}]`;
              audioInputs.push({
                label: delayedLabel,
                inputIndex: baseVideoInputCount + audioInputIndex, // Offset by video input count
                delay: delay
              });
              audioInputIndex++;
            }
          });
        });

        // Build audio filters
        const audioFilters = [];
        const delayedAudioLabels = [];
        
        // Extract audio from video clips (videos may have embedded audio from simultaneous recording)
        if (needsConcat && !needsOverlay) {
          // Concat mode: Audio from concatenated video (input 0)
          // Check if ALL clips being concatenated have audio (concat demuxer needs all clips to have audio)
          const laneId = laneIds[0];
          const clips = videoLanes[laneId];
          const clipsWithAudio = clips.filter(c => c.hasAudio);
          
          // Only extract audio if ALL clips have audio (concat demuxer preserves audio only if all inputs have it)
          if (clipsWithAudio.length > 0 && clipsWithAudio.length === clips.length) {
            // All clips have audio - concat demuxer will preserve audio
            // Extract audio from input 0 (the concat result)
            // Delay based on first clip's timelineStart
            const firstClipDelay = Math.max(0, (clips[0].timelineStart - timelineStart) * 1000);
            const videoAudioLabel = `[a_video_concat]`;
            audioFilters.push(`[0:a]adelay=${Math.round(firstClipDelay)}|${Math.round(firstClipDelay)}${videoAudioLabel}`);
            delayedAudioLabels.push(videoAudioLabel);
            console.log(`🎵 Extracting audio from concatenated video (input 0) with delay ${firstClipDelay}ms`);
          } else if (clipsWithAudio.length > 0 && clipsWithAudio.length < clips.length) {
            console.warn(`⚠️ Some clips have audio but not all - skipping audio extraction from concat result (${clipsWithAudio.length}/${clips.length} clips have audio)`);
          }
        } else if (needsOverlay) {
          // Overlay mode: Extract audio from each video input
          let videoInputIndex = 0;
          
          // Base lane audio
          const baseLane = laneIds[0];
          const baseClips = videoLanes[baseLane];
          if (baseClips.length > 0 && baseClips[0].hasAudio) {
            const baseDelay = Math.max(0, (baseClips[0].timelineStart - timelineStart) * 1000);
            const baseAudioLabel = `[a_video_base]`;
            audioFilters.push(`[${videoInputIndex}:a]adelay=${Math.round(baseDelay)}|${Math.round(baseDelay)}${baseAudioLabel}`);
            delayedAudioLabels.push(baseAudioLabel);
            console.log(`🎵 Extracting audio from base video (input ${videoInputIndex}) with delay ${baseDelay}ms`);
          }
          videoInputIndex++;
          
          // Overlay lanes audio
          for (let i = 1; i < laneIds.length; i++) {
            const overlayLane = laneIds[i];
            const overlayClips = videoLanes[overlayLane];
            if (overlayClips.length > 0 && overlayClips[0].hasAudio) {
              const overlayDelay = Math.max(0, (overlayClips[0].timelineStart - timelineStart) * 1000);
              const overlayAudioLabel = `[a_video_overlay${i}]`;
              audioFilters.push(`[${videoInputIndex}:a]adelay=${Math.round(overlayDelay)}|${Math.round(overlayDelay)}${overlayAudioLabel}`);
              delayedAudioLabels.push(overlayAudioLabel);
              console.log(`🎵 Extracting audio from overlay video ${i} (input ${videoInputIndex}) with delay ${overlayDelay}ms`);
            }
            videoInputIndex++;
          }
        } else {
          // Single clip mode: Extract audio from input 0
          const clip = videoClipsWithAudio[0];
          if (clip.hasAudio) {
            const clipDelay = Math.max(0, (clip.timelineStart - timelineStart) * 1000);
            const videoAudioLabel = `[a_video_single]`;
            audioFilters.push(`[0:a]adelay=${Math.round(clipDelay)}|${Math.round(clipDelay)}${videoAudioLabel}`);
            delayedAudioLabels.push(videoAudioLabel);
            console.log(`🎵 Extracting audio from single video clip (input 0) with delay ${clipDelay}ms`);
          }
        }
        
        // Apply delays to standalone audio clip inputs
        audioInputs.forEach((audioInput, index) => {
          const delayedLabel = `[a_delayed${index}]`;
          audioFilters.push(`[${audioInput.inputIndex}:a]adelay=${Math.round(audioInput.delay)}|${Math.round(audioInput.delay)}${delayedLabel}`);
          delayedAudioLabels.push(delayedLabel);
        });

        // Mix all audio tracks (video audio + standalone audio clips)
        if (delayedAudioLabels.length > 0) {
          if (delayedAudioLabels.length > 1) {
            audioFilters.push(`${delayedAudioLabels.join('')}amix=inputs=${delayedAudioLabels.length}:duration=longest[a]`);
            console.log(`🎵 Mixing ${delayedAudioLabels.length} audio tracks together (video + standalone)`);
          } else {
            audioFilters.push(`${delayedAudioLabels[0]}acopy[a]`);
            console.log(`🎵 Using single audio track`);
          }
        } else {
          console.warn(`⚠️ No audio tracks found - export will have no audio`);
        }

        // Combine video and audio filters
        const allFilters = [];
        let finalVideoOutput = '0:v';
        
        if (needsOverlay && overlayFilters.length > 0) {
          // Apply overlay filters
          allFilters.push(...overlayFilters);
          // Find the last overlay output (should be the last filter's output)
          const lastOverlayMatch = overlayFilters[overlayFilters.length - 1].match(/\[([^\]]+)\]$/);
          if (lastOverlayMatch) {
            finalVideoOutput = lastOverlayMatch[1];
          }
        }
        
        // Add audio filters (only if we have valid audio tracks)
        if (audioFilters.length > 0) {
          allFilters.push(...audioFilters);
        }

        // Apply filters
        if (allFilters.length > 0) {
          command = command.complexFilter(allFilters.join(';'));
          command = command.outputOptions('-map', finalVideoOutput);
          if (delayedAudioLabels.length > 0) {
            command = command.outputOptions('-map', '[a]');
          }
        } else {
          // No filters - just map video
          command = command.outputOptions('-map', '0:v');
          // Only map audio if we have audio tracks (from standalone audio clips)
          if (delayedAudioLabels.length > 0) {
            command = command.outputOptions('-map', '[a]');
          }
        }

        // Apply codecs and quality
        command
          .videoCodec('libx264')
          .outputOptions('-preset', 'fast')
          .outputOptions('-crf', '23')
          .outputOptions('-pix_fmt', 'yuv420p')
          .outputOptions('-r', '30'); // Standardize to 30fps
        
        // Only add audio codec if we have audio tracks
        if (delayedAudioLabels.length > 0) {
          command = command.audioCodec('aac');
          command = command.outputOptions('-b:a', '192k');
          console.log(`  ✅ Audio codec (AAC) will be applied to output`);
        } else {
          console.log(`  ⚠️ No audio tracks - skipping audio codec`);
        }

        // Apply scaling
        const scaleNum = scaleResolution ? parseInt(scaleResolution, 10) : null;
        if (scaleNum === 720) {
          command = command.videoFilters('scale=1280:720');
        } else if (scaleNum === 1080) {
          command = command.videoFilters('scale=1920:1080');
        }

        // Cleanup function
        const cleanup = () => {
          tempFiles.forEach(file => {
            try {
              if (fs.existsSync(file)) {
                fs.unlinkSync(file);
              }
            } catch (e) {
              console.warn(`Failed to delete temp file ${file}:`, e);
            }
          });
        };

        command
          .save(outputPath)
          .on('start', (commandLine) => {
            console.log('FFmpeg command:', commandLine);
            event.sender.send('export-progress', 0);
          })
          .on('progress', (progress) => {
            const progressPercent = progress.percent;
            if (progressPercent !== undefined && progressPercent !== null) {
              event.sender.send('export-progress', progressPercent);
            }
          })
          .on('end', () => {
            cleanup();
            event.sender.send('export-progress', 100);
            resolve(outputPath);
          })
          .on('error', (err, stdout, stderr) => {
            cleanup();
            console.error('FFmpeg export error:', err);
            console.error('FFmpeg stdout:', stdout);
            console.error('FFmpeg stderr:', stderr);
            reject(new Error(`FFmpeg error: ${err.message}\n${stderr || stdout || ''}`));
          })
          .run();
      })().catch(reject);  // Catch errors from IIFE

    } catch (error) {
      console.error('Export error:', error);
      reject(error);
    }
  });
});

ipcMain.handle('show-save-dialog', async () => {
  const result = await dialog.showSaveDialog({
    filters: [
      { name: 'Video Files', extensions: ['mp4'] }
    ],
    defaultPath: 'exported_video.mp4'
  });

  if (!result.canceled) {
    return result.filePath;
  }
  return null;
});

// HOMERUN FIX: Multi-select file picker (bypasses Windows UIPI drag/drop block)
ipcMain.handle('open-file-dialog', async () => {
  const os = require('os');
  const defaultPath = path.join(os.homedir(), 'Videos'); // Start in Videos folder
  
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    defaultPath: defaultPath,
    filters: [
      { name: 'Media Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wav', 'mp3', 'aac', 'ogg'] }
    ]
  });
  
  if (!result.canceled) {
    console.log('📁 Files selected via picker:', result.filePaths);
    return result.filePaths;
  }
  return [];
});

// IPC handler to get file path using webUtils (for Electron v32+)
ipcMain.handle('get-file-path', async (event, fileBlob) => {
  try {
    // In main process, we can use webContents.webUtils
    const filePath = event.sender.webUtils.getPathForFile(fileBlob);
    return filePath;
  } catch (error) {
    console.error('Error getting file path via webUtils:', error);
    return null;
  }
});

// Layer 2 IPC handler - receives files from injected code or renderer
ipcMain.on('files-dropped-layer2', (event, fileData) => {
  console.log('📨 [Layer 2] Main process received dropped files:', fileData.length);
  
  // Validate and normalize file paths
  const validFiles = fileData.map(file => {
    let filePath = file.path;
    
    // If path is missing but name exists, log warning
    if (!filePath && file.name) {
      console.warn('⚠️ [Layer 2] No path for file:', file.name, '- skipping');
      return null;
    }
    
    // Normalize Windows paths
    if (filePath && process.platform === 'win32') {
      filePath = filePath.replace(/\//g, '\\');
    }
    
    // Verify file exists
    if (filePath && !fs.existsSync(filePath)) {
      console.warn('⚠️ [Layer 2] File does not exist:', filePath);
      return null;
    }
    
    return {
      path: filePath,
      name: file.name || path.basename(filePath || ''),
      type: file.type || 'application/octet-stream',
      size: file.size || (filePath ? fs.statSync(filePath).size : 0)
    };
  }).filter(file => file && file.path); // Filter out invalid files
  
  if (validFiles.length === 0) {
    console.error('❌ [Layer 2] No valid files to process');
    return;
  }
  
  validFiles.forEach(file => {
    console.log('  ✅ [Layer 2]', file.name, '→', file.path);
  });
  
  // Forward to renderer with 'file-dropped' event (App.jsx is already listening)
  event.sender.send('file-dropped', validFiles);
  console.log('✅ [Layer 2] Forwarded', validFiles.length, 'valid file(s) to renderer process');
});

ipcMain.handle('get-desktop-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 150, height: 150 }
    });
    return sources;
  } catch (error) {
    console.error('Error getting desktop sources:', error);
    return [];
  }
});

ipcMain.handle('show-record-save-dialog', async () => {
  const result = await dialog.showSaveDialog({
    filters: [
      { name: 'Video Files', extensions: ['mp4'] }
    ],
    defaultPath: `recording_${Date.now()}.mp4`
  });

  if (!result.canceled) {
    return result.filePath;
  }
  return null;
});

ipcMain.handle('save-recorded-video', async (event, { filePath, buffer }) => {
  try {
    fs.writeFileSync(filePath, Buffer.from(buffer));
    return true;
  } catch (error) {
    console.error('Error saving recorded video:', error);
    return false;
  }
});

// IPC handler to save frame images to temp directory
ipcMain.handle('save-frame-to-temp', async (event, { frameIndex, frameData }) => {
  try {
    const tempDir = path.join(__dirname, 'temp_frames');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    const framePath = path.join(tempDir, `frame_${frameIndex.toString().padStart(6, '0')}.png`);
    fs.writeFileSync(framePath, Buffer.from(frameData));
    return framePath;
  } catch (error) {
    console.error('Error saving frame:', error);
    return null;
  }
});

// IPC handler to convert frames to video using FFmpeg
// Merges audio files into the video - returns single video file with embedded audio
ipcMain.handle('convert-frames-to-video', async (event, { outputPath, frameRate = 30, audioFiles = [] }) => {
  return new Promise((resolve, reject) => {
    try {
      const tempDir = path.join(__dirname, 'temp_frames');
      const inputPattern = path.join(tempDir, 'frame_%06d.png');
      
      console.log('Converting frames to video WITH audio:', inputPattern, '->', outputPath);
      console.log('Audio files to merge:', audioFiles);
      
      // Build FFmpeg command
      let command = ffmpeg(inputPattern)
        .inputOptions([
          `-r ${frameRate}`,  // Input frame rate
          '-framerate 30'
        ]);
      
      // Add audio inputs if available
      const audioFilters = [];
      const audioInputLabels = [];
      
      if (audioFiles.length > 0) {
        console.log(`🎵 Merging ${audioFiles.length} audio track(s) into video...`);
        // Add each audio file as input
        audioFiles.forEach((audioFile, index) => {
          if (fs.existsSync(audioFile)) {
            command = command.input(audioFile);
            audioInputLabels.push(`[${index + 1}:a]`);
            console.log(`  ✅ Added audio input ${index + 1}: ${path.basename(audioFile)}`);
          } else {
            console.warn(`  ⚠️ Audio file not found: ${audioFile}`);
          }
        });
        
        // Mix all audio tracks together
        if (audioInputLabels.length > 0) {
          if (audioInputLabels.length > 1) {
            // Multiple audio tracks - mix them
            audioFilters.push(`${audioInputLabels.join('')}amix=inputs=${audioInputLabels.length}:duration=longest[a]`);
            console.log(`  🎵 Mixing ${audioInputLabels.length} audio tracks together`);
          } else {
            // Single audio track - pass through
            audioFilters.push(`${audioInputLabels[0]}acopy[a]`);
            console.log(`  🎵 Using single audio track`);
          }
        }
      }
      
      // Build output options
      const outputOptions = [
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-r 30',  // Output frame rate
        '-preset fast',
        '-crf 23',
        '-movflags +faststart'  // Optimize for web playback
      ];
      
      // Add audio codec if we have audio
      if (audioFilters.length > 0) {
        outputOptions.push('-c:a', 'aac');
        outputOptions.push('-b:a', '192k');
        command = command.complexFilter(audioFilters.join(';'));
        command = command.outputOptions('-map', '0:v');
        command = command.outputOptions('-map', '[a]');
        console.log(`  ✅ Audio will be embedded in video with AAC codec`);
      } else {
        console.log(`  ⚠️ No audio filters - creating video without audio`);
      }
      
      command = command.outputOptions(outputOptions).output(outputPath);

      command
        .on('start', (commandLine) => {
          console.log('FFmpeg started (video with audio):', commandLine);
        })
        .on('progress', (progress) => {
          console.log('FFmpeg progress:', progress);
        })
        .on('end', () => {
          console.log('FFmpeg conversion complete (video with embedded audio)');
          
          // Clean up temp frames
          if (fs.existsSync(tempDir)) {
            fs.readdirSync(tempDir).forEach(file => {
              fs.unlinkSync(path.join(tempDir, file));
            });
            fs.rmdirSync(tempDir);
            console.log('Temp frames cleaned up');
          }
          
          // Clean up audio files since they're now embedded in video
          // Also clean up any temp WebM files (they'll have _microphone_temp.webm suffix)
          const allAudioFiles = [...audioFiles];
          
          // Find and add temp WebM files to cleanup list
          audioFiles.forEach(audioFile => {
            if (audioFile.includes('_microphone.wav')) {
              const tempWebmPath = audioFile.replace('_microphone.wav', '_microphone_temp.webm');
              if (fs.existsSync(tempWebmPath)) {
                allAudioFiles.push(tempWebmPath);
                console.log(`Found temp WebM to clean: ${tempWebmPath}`);
              }
            }
          });
          
          allAudioFiles.forEach(audioFile => {
            try {
              if (fs.existsSync(audioFile)) {
                fs.unlinkSync(audioFile);
                console.log(`🧹 Cleaned up audio file: ${path.basename(audioFile)}`);
              }
            } catch (e) {
              console.warn(`Failed to delete audio file ${audioFile}:`, e);
            }
          });
          
          console.log(`✅ All temporary audio files cleaned up. Audio is now embedded in: ${outputPath}`);
          
          // Return success - audio is now embedded in video
          resolve({ 
            success: true,
            videoPath: outputPath  // Single video file with audio embedded
          });
        })
        .on('error', (err, stdout, stderr) => {
          console.error('FFmpeg error:', err);
          console.error('FFmpeg stdout:', stdout);
          console.error('FFmpeg stderr:', stderr);
          reject(err);
        })
        .run();

    } catch (error) {
      console.error('Error converting frames:', error);
      reject(error);
    }
  });
});

// Audio recording handlers
let systemAudioRecorder = null;
let microphoneRecorder = null;
let audioData = {
  systemAudio: [],
  microphone: []
};


ipcMain.handle('start-system-audio-recording', async () => {
  try {
    console.log('Starting system audio recording...');
    
    // Clear previous audio data
    audioData.systemAudio = [];
    
    // Try SoX first (primary method - better loopback support on Windows)
    try {
      // Check if SoX binary exists
      if (!fs.existsSync(soxPath)) {
        throw new Error(`SoX binary not found at ${soxPath}`);
      }
      
      console.log(`Using SoX binary at: ${soxPath}`);
      
      // Spawn SoX to capture system audio (loopback)
      // Args: --default-device (use default audio input), -t wav (WAV format), 
      // -r 44100 (sample rate), -c 2 (stereo), -b 16 (16-bit), - (pipe to stdout)
      const soxProcess = spawn(soxPath, [
        '--default-device',
        '-t', 'wav',
        '-r', '44100',
        '-c', '2',
        '-b', '16',
        '-'
      ]);
      
      // Wait a moment to check if process started successfully
      // spawn() may emit 'error' event asynchronously for ENOENT
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          // If no error after 100ms, assume process started successfully
          resolve();
        }, 100);
        
        soxProcess.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        
        // If process exits immediately with error code, that's also a failure
        soxProcess.on('exit', (code) => {
          if (code !== null && code !== 0) {
            clearTimeout(timeout);
            reject(new Error(`SoX exited with code ${code}`));
          }
        });
      });
      
      // Collect audio data from stdout
      soxProcess.stdout.on('data', (chunk) => {
        if (chunk && chunk.length > 0) {
          audioData.systemAudio.push(chunk);
          console.log(`Received ${chunk.length} bytes of system audio from SoX`);
        }
      });
      
      soxProcess.stderr.on('data', (data) => {
        // SoX outputs warnings/errors to stderr, log but don't fail
        console.warn('SoX stderr:', data.toString());
      });
      
      soxProcess.on('close', (code) => {
        console.log(`SoX process closed with code ${code}`);
      });
      
      // Store process reference for cleanup
      systemAudioRecorder = soxProcess;
      
      console.log('System audio recording started with SoX');
      return { success: true };
      
    } catch (soxError) {
      // Fallback to node-record-lpcm16 if SoX fails
      console.warn('SoX failed, falling back to node-record-lpcm16:', soxError.message);
      
      try {
        const recording = record.record({
          sampleRate: 44100,
          channels: 2,
          device: null, // Use default device
        });
        
        recording.stream().on('data', (chunk) => {
          audioData.systemAudio.push(chunk);
          console.log(`Received ${chunk.length} bytes of system audio (fallback)`);
        });
        
        recording.stream().on('error', (error) => {
          console.error('System audio recording error (fallback):', error);
        });
        
        systemAudioRecorder = recording;
        
        console.log('System audio recording started with node-record-lpcm16 (fallback)');
        return { success: true };
        
      } catch (fallbackError) {
        console.error('Failed to start system audio recording with both methods:', fallbackError.message);
        return { success: false, error: 'System audio recording unavailable. Use microphone instead.' };
      }
    }
    
  } catch (error) {
    console.error('Error starting system audio recording:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('start-microphone-recording', async () => {
  try {
    console.log('Starting microphone recording...');
    
    // Prevent multiple microphone recordings
    if (microphoneRecorder) {
      console.log('Microphone already active, cleaning up...');
      try {
        microphoneRecorder.stop();
      } catch (e) {}
      microphoneRecorder = null;
    }
    
    // Clear previous microphone data
    audioData.microphone = [];
    console.log('Microphone buffer cleared');
    
    // Configure microphone recording with explicit settings
    const micInstance = mic({
      rate: '44100',
      channels: '2',
      debug: true,
      exitOnSilence: 0,
      device: 'default' // Explicitly use default device
    });
    
    microphoneRecorder = micInstance;
    
    const micInputStream = micInstance.getAudioStream();
    
    let chunkCount = 0;
    micInputStream.on('data', (data) => {
      if (data && Buffer.isBuffer(data) && data.length > 0) {
        audioData.microphone.push(Buffer.from(data)); // Ensure it's a proper Buffer
        chunkCount++;
        if (chunkCount % 100 === 0) { // Log every 100 chunks to avoid spam
          console.log(`Microphone: ${chunkCount} chunks, ${data.length} bytes/chunk, total: ${audioData.microphone.reduce((sum, c) => sum + c.length, 0)} bytes`);
        }
      } else {
        console.warn('Received invalid microphone data:', typeof data, data?.length);
      }
    });
    
    micInputStream.on('error', (error) => {
      console.error('Microphone recording stream error:', error);
    });
    
    micInputStream.on('startComplete', () => {
      console.log('✅ Microphone stream started successfully - data should be flowing');
    });
    
    micInputStream.on('stopComplete', () => {
      console.log('✅ Microphone stream stopped');
      console.log(`Final: ${audioData.microphone.length} chunks, ${audioData.microphone.reduce((sum, c) => sum + c.length, 0)} bytes`);
    });
    
    micInstance.start();
    
    // Wait a moment to confirm stream started
    await new Promise(resolve => setTimeout(resolve, 200));
    
    if (chunkCount > 0 || micInputStream.readable) {
      console.log('✅ Microphone recording active and receiving data');
    } else {
      console.warn('⚠️ Microphone started but no data received yet');
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error starting microphone recording:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-audio-recording', async () => {
  try {
    console.log('Stopping audio recording...');
    
    // Give a brief moment for any pending data
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (systemAudioRecorder) {
      console.log('Stopping system audio recording...');
      try {
        // Handle SoX spawn process (has kill method)
        if (systemAudioRecorder.kill) {
          systemAudioRecorder.kill('SIGTERM');
          // Also close stdin to signal end of input
          if (systemAudioRecorder.stdin) {
            systemAudioRecorder.stdin.end();
          }
        } 
        // Handle node-record-lpcm16 recorder (has stop method)
        else if (typeof systemAudioRecorder.stop === 'function') {
          systemAudioRecorder.stop();
        }
      } catch (e) {
        console.warn('Error stopping system recorder:', e);
      }
      
      console.log(`System audio chunks: ${audioData.systemAudio.length}`);
      console.log(`System audio size: ${audioData.systemAudio.reduce((sum, chunk) => sum + (chunk?.length || 0), 0)} bytes`);
      systemAudioRecorder = null;
    }
    
    if (microphoneRecorder) {
      console.log('Stopping microphone recording...');
      try {
        // Get stream to listen for stopComplete
        const micInputStream = microphoneRecorder.getAudioStream();
        
        // Wait for stream to stop properly
        await new Promise((resolve) => {
          let resolved = false;
          
          micInputStream.on('stopComplete', () => {
            if (!resolved) {
              resolved = true;
              console.log('Microphone stopped completely');
              console.log(`Microphone audio chunks: ${audioData.microphone.length}`);
              console.log(`Microphone audio size: ${audioData.microphone.reduce((sum, chunk) => sum + (chunk?.length || 0), 0)} bytes`);
              microphoneRecorder = null;
              resolve();
            }
          });
          
          microphoneRecorder.stop();
          
          // Force resolve after 500ms if stopComplete doesn't fire
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              console.log('Microphone stop timeout, using collected data');
              console.log(`Microphone audio chunks: ${audioData.microphone.length}`);
              microphoneRecorder = null;
              resolve();
            }
          }, 500);
        });
      } catch (e) {
        console.warn('Error stopping microphone:', e);
        microphoneRecorder = null;
      }
    }
    
    console.log('Audio recording stopped. Final state:');
    console.log(`- System audio: ${audioData.systemAudio.length} chunks`);
    console.log(`- Microphone: ${audioData.microphone.length} chunks`);
    
    return { success: true };
  } catch (error) {
    console.error('Error stopping audio recording:', error);
    return { success: false, error: error.message };
  }
});

// Helper function to create WAV header
function createWavHeader(dataLength, sampleRate = 44100, channels = 2, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  
  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4); // File size - 8
  header.write('WAVE', 8);
  
  // fmt chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // Audio format (1 = PCM)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  
  // data chunk
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);
  
  return header;
}

ipcMain.handle('save-audio-blob', async (event, { outputPath, audioData }) => {
  try {
    console.log(`\n📦 SAVING AUDIO BLOB`);
    console.log(`Path: ${outputPath}`);
    console.log(`Data size: ${audioData.length} bytes`);
    
    if (!audioData || audioData.length === 0) {
      return { success: false, error: 'No audio data provided' };
    }
    
    // Convert array back to buffer
    const buffer = Buffer.from(audioData);
    fs.writeFileSync(outputPath, buffer);
    
    console.log(`✅ Successfully saved ${buffer.length} bytes to ${outputPath}`);
    return { success: true, size: buffer.length };
  } catch (error) {
    console.error(`❌ Error saving audio blob:`, error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('convert-audio-to-wav', async (event, { inputPath, outputPath }) => {
  try {
    console.log(`\n🔄 CONVERTING AUDIO TO WAV`);
    console.log(`Input: ${inputPath}`);
    console.log(`Output: ${outputPath}`);
    
    if (!fs.existsSync(inputPath)) {
      return { success: false, error: `Input file not found: ${inputPath}` };
    }
    
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('pcm_s16le') // 16-bit PCM
        .audioChannels(1) // Mono
        .audioFrequency(44100) // 44.1kHz
        .format('wav')
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('FFmpeg converting audio:', commandLine);
        })
        .on('progress', (progress) => {
          console.log('Audio conversion progress:', progress.percent, '%');
        })
        .on('end', () => {
          console.log(`✅ Audio converted: ${inputPath} -> ${outputPath}`);
          // Clean up temp file
          try {
            fs.unlinkSync(inputPath);
            console.log(`Cleaned up temp file: ${inputPath}`);
          } catch (e) {
            console.warn('Could not delete temp file:', e.message);
          }
          resolve({ success: true });
        })
        .on('error', (error, stdout, stderr) => {
          console.error('❌ FFmpeg audio conversion error:', error.message);
          console.error('stdout:', stdout);
          console.error('stderr:', stderr);
          reject({ success: false, error: error.message });
        })
        .run();
    });
  } catch (error) {
    console.error(`❌ Error converting audio:`, error);
    return { success: false, error: error.message };
  }
});

// IPC handler to check if audio recording is active (for playback conflict detection)
ipcMain.handle('is-audio-recording-active', async () => {
  return {
    systemAudio: systemAudioRecorder !== null,
    microphone: microphoneRecorder !== null,
    active: systemAudioRecorder !== null || microphoneRecorder !== null
  };
});

ipcMain.handle('save-audio-data', async (event, { outputPath, audioType }) => {
  try {
    console.log(`\n📦 SAVING ${audioType.toUpperCase()} AUDIO`);
    console.log(`Path: ${outputPath}`);
    console.log(`Buffer has ${audioData[audioType]?.length || 0} chunks`);
    
    const audioBuffer = audioData[audioType];
    if (!audioBuffer || audioBuffer.length === 0) {
      console.error(`❌ No audio data for ${audioType}`);
      return { success: false, error: `No audio data to save for ${audioType}` };
    }
    
    // Combine all audio chunks into raw PCM data
    const totalLength = audioBuffer.reduce((sum, chunk) => sum + (chunk?.length || 0), 0);
    console.log(`Total PCM data: ${totalLength} bytes`);
    
    if (totalLength === 0) {
      console.error(`❌ Audio data is empty`);
      return { success: false, error: `Audio data is empty for ${audioType}` };
    }
    
    // Combine chunks into single buffer
    const pcmBuffer = Buffer.alloc(totalLength);
    let offset = 0;
    
    for (const chunk of audioBuffer) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (buf.length > 0) {
        buf.copy(pcmBuffer, offset);
        offset += buf.length;
      }
    }
    
    // Create WAV file with proper header
    const wavHeader = createWavHeader(totalLength, 44100, 2, 16);
    const wavFile = Buffer.concat([wavHeader, pcmBuffer]);
    
    // Save WAV file
    fs.writeFileSync(outputPath, wavFile);
    console.log(`✅ Successfully saved ${wavFile.length} bytes WAV file (${totalLength} bytes PCM)`);
    
    // Clear the audio data
    audioData[audioType] = [];
    
    return { success: true, size: wavFile.length };
  } catch (error) {
    console.error(`❌ Error saving audio data:`, error);
    return { success: false, error: error.message };
  }
});



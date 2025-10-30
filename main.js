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
  
  // MULTI-LAYERED FILE DROP INTERCEPTION
  
  // Layer 1: Intercept navigation attempts
  mainWindow.webContents.on('will-navigate', (event, url) => {
    console.log('🔍 [Layer 1] Navigation intercepted:', url);
    
    // Check if this is a file drop (file:// protocol)
    if (url.startsWith('file://') && !url.includes('/dist/index.html')) {
      console.log('📁 [Layer 1] File drop detected via navigation!');
      event.preventDefault();
      
      // Extract file path from file:// URL
      let filePath = decodeURIComponent(url.replace('file:///', ''));
      
      // Normalize path for Windows
      if (process.platform === 'win32') {
        filePath = filePath.replace(/\//g, '\\');
      }
      
      console.log('✅ [Layer 1] Extracted absolute path:', filePath);
      
      // Get file info
      const fileName = path.basename(filePath);
      const fileExt = path.extname(filePath).toLowerCase();
      
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
        size: 0
      }];
      
      console.log('📤 [Layer 1] Sending to renderer:', fileData);
      mainWindow.webContents.send('file-dropped', fileData);
    } else if (!url.startsWith('devtools://')) {
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
        
        const handleDrop = (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          
          console.log('🎯 [Layer 2] DROP intercepted!', e.dataTransfer.files.length);
          
          if (e.dataTransfer.files.length > 0) {
            const files = Array.from(e.dataTransfer.files);
            
            // CRITICAL: file.path might be undefined, try multiple methods
            const fileData = files.map(file => {
              // Try various ways to get the path
              const filePath = file.path || 
                               (file.getAsFile && file.getAsFile().path) ||
                               (file.webkitRelativePath) ||
                               null;
              
              return {
                path: filePath,
                name: file.name,
                type: file.type,
                size: file.size,
                _raw: file // Send raw file object too
              };
            });
            
            console.log('📁 [Layer 2] Files with paths:', fileData.map(f => ({ name: f.name, path: f.path })));
            
            // If NO paths available, alert user to use file picker
            if (fileData.every(f => !f.path)) {
              console.error('❌ [Layer 2] Cannot get file paths - Windows UIPI blocking');
              alert('Drag & drop blocked by Windows.\\n\\nPlease use the "📁 Add Files" button instead.');
              return false;
            }
            
            // Send via IPC
            if (window.require) {
              const { ipcRenderer } = window.require('electron');
              // Filter out files without paths
              const validFiles = fileData.filter(f => f.path);
              if (validFiles.length > 0) {
                ipcRenderer.send('files-dropped-layer2', validFiles);
              }
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
      console.log('Video clips:', videoClips.map(c => ({ path: c.inputPath, start: c.startTime, end: c.endTime })));
      console.log('Audio clips:', audioClips.map(c => ({ path: c.inputPath, start: c.startTime, end: c.endTime })));

      // Primary video is first clip
      if (videoClips.length === 0) {
        reject(new Error('No video clips to export'));
        return;
      }

      let command = ffmpeg(videoClips[0].inputPath);

      // Calculate timeline bounds - find earliest start and latest end
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
      const maxDuration = timelineEnd - timelineStart; // Total timeline duration
      
      console.log('Timeline bounds:', { start: timelineStart, end: timelineEnd, duration: maxDuration });
      console.log('Video clips:', videoClips.map(c => ({ timelineStart: c.timelineStart, timelineEnd: c.timelineEnd })));
      console.log('Audio clips:', audioClips.map(c => ({ timelineStart: c.timelineStart, timelineEnd: c.timelineEnd })));
      
      // Get primary video duration (after trim)
      const primaryVideoStart = videoClips[0].startTime || 0;
      const primaryVideoEnd = videoClips[0].endTime || (videoClips[0].timelineEnd || 0) - (videoClips[0].timelineStart || 0);
      const primaryVideoDuration = primaryVideoEnd - primaryVideoStart;
      
      // Calculate when video should start relative to timeline start
      const videoTimelineStart = videoClips[0].timelineStart || 0;
      const videoOffset = videoTimelineStart - timelineStart; // How much black space before video
      
      // Apply trim to primary video first (before adding other inputs)
      if (videoClips[0].startTime || videoClips[0].endTime) {
        const startTime = videoClips[0].startTime || 0;
        if (startTime > 0) {
          command = command.seekInput(startTime);
        }
        // Set duration to video's trimmed duration
        const videoDuration = primaryVideoDuration;
        command = command.duration(videoDuration);
      }

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
        // Probing logic here
        const videoAudioStatus = await Promise.all(videoClips.map(async (clip) => ({
          ...clip,
          hasAudio: await hasAudio(clip.inputPath)
        })));

        const audioAudioStatus = await Promise.all(audioClips.map(async (clip) => ({
          ...clip,
          hasAudio: await hasAudio(clip.inputPath)
        })));

        // Rest of the export logic using videoAudioStatus and audioAudioStatus
        // Only include audio from clips that have it

        // Build filters array
        const filters = [];
        let videoOutput = '[0:v]';
        let videoMap = '0:v';
        
        // If multiple videos, overlay them (e.g., PiP for webcam)
        if (videoClips.length > 1) {
          command = command.input(videoClips[1].inputPath);
          // Apply trim to second video if needed
          if (videoClips[1].startTime || videoClips[1].endTime) {
            // Note: seekInput applies to last input, so we need to use inputOptions
            command = command.inputOptions([
              `-ss ${videoClips[1].startTime || 0}`
            ]);
            if (videoClips[1].endTime) {
              const dur = videoClips[1].endTime - (videoClips[1].startTime || 0);
              command = command.inputOptions([`-t ${dur}`]);
            }
          }
          
          // Overlay second video bottom-right (PiP)
          filters.push(`[0:v][1:v]overlay=main_w-overlay_w-20:main_h-overlay_h-20[v]`);
          videoOutput = '[v]';
          videoMap = '[v]';
        }

        // Add audio inputs with trimming
        const audioInputs = [];
        let audioInputIndex = videoClips.length > 1 ? 2 : 1; // Start after video inputs
        
        // Check if primary video has audio (always include [0:a] if video might have audio)
        // We'll try to map it, FFmpeg will handle if it doesn't exist
        const hasVideoAudio = true; // Assume video might have audio
        
        // Add audio clip inputs with trimming via inputOptions
        audioClips.forEach((audio, index) => {
          if (audio.hasAudio) { // Add this check
            command = command.input(audio.inputPath);
            
            // Apply trim via inputOptions (more reliable than complex filters for simple trimming)
            if (audio.startTime || audio.endTime) {
              const startTime = audio.startTime || 0;
              const duration = audio.endTime ? (audio.endTime - startTime) : undefined;
              const inputOptions = [];
              if (startTime > 0) {
                inputOptions.push(`-ss ${startTime}`);
              }
              if (duration) {
                inputOptions.push(`-t ${duration}`);
              }
              if (inputOptions.length > 0) {
                // Apply to the last input (the audio we just added)
                command = command.inputOptions(inputOptions);
              }
            }
            
            const delay = Math.max(0, (audio.timelineStart - timelineStart) * 1000);
            const delayedLabel = `[a_delayed${index}]`;
            filters.push(`[${audioInputIndex}:a]adelay=${Math.round(delay)}|${Math.round(delay)}${delayedLabel}`);
            audioInputs.push(delayedLabel);
            audioInputIndex++;
          }
        });

        // Handle video audio with delay if it exists
        if (hasVideoAudio && videoAudioStatus[0].hasAudio) { // Check primary video
          const videoAudioDelay = Math.max(0, (videoClips[0].timelineStart - timelineStart) * 1000);
          const videoAudioLabel = '[a_video]';
          filters.push(`[0:a]adelay=${Math.round(videoAudioDelay)}|${Math.round(videoAudioDelay)}${videoAudioLabel}`);
          audioInputs.unshift(videoAudioLabel);
        }
        
        if (audioInputs.length > 0) {
          if (audioInputs.length > 1) {
            // Multiple audio inputs - mix them
            filters.push(`${audioInputs.join('')}amix=inputs=${audioInputs.length}:duration=longest[a]`);
          } else {
            // Single audio - just pass through
            filters.push(`${audioInputs[0]}acopy[a]`);
          }
        }

        // Apply all filters
        if (filters.length > 0) {
          command = command.complexFilter(filters.join(';'));
          command = command.outputOptions('-map', videoMap);
          if (audioInputs.length > 0) {
            command = command.outputOptions('-map', '[a]');
          }
        } else {
          // No filters - simple passthrough
          command = command.outputOptions('-map', '0:v');
          if (audioInputs.length > 0 && audioInputs[0] === '[0:a]') {
            command = command.outputOptions('-map', '0:a');
          }
        }

        // Apply codecs and quality
        command
          .videoCodec('libx264')
          .audioCodec('aac')
          .outputOptions('-preset', 'fast')
          .outputOptions('-crf', '23')
          .outputOptions('-pix_fmt', 'yuv420p'); // Ensure compatibility

        // Build video filter: add black padding before/after video if needed
        if (videoOffset > 0 || maxDuration > (primaryVideoDuration + videoOffset)) {
          // Need padding before and/or after video
          let videoInput = '[0:v]';
          let videoOutput = '[0:v]';
          
          // Add padding before video if video starts after timeline start
          if (videoOffset > 0) {
            videoOutput = '[v_start]';
            filters.push(`${videoInput}tpad=start_mode=clone:start_duration=${videoOffset}${videoOutput}`);
            videoInput = videoOutput;
          }
          
          // Add padding after video if total duration exceeds video duration + offset
          const paddingAfter = maxDuration - (primaryVideoDuration + videoOffset);
          if (paddingAfter > 0) {
            const prevOutput = videoInput;
            videoOutput = '[v_final]';
            filters.push(`${prevOutput}tpad=stop_mode=clone:stop_duration=${paddingAfter}${videoOutput}`);
          } else {
            videoOutput = videoInput;
          }
          
          videoMap = videoOutput;
        }
        
        // Apply scaling as a SIMPLE video filter (AFTER complex filter, not part of it)
        const scaleNum = scaleResolution ? parseInt(scaleResolution, 10) : null;
        
        if (scaleNum === 720) {
          command = command.videoFilters('scale=1280:720');
        } else if (scaleNum === 1080) {
          command = command.videoFilters('scale=1920:1080');
        }
        // scaleResolution = null means source resolution (no scaling)

        command
          .save(outputPath)
          .on('start', (commandLine) => {
            event.sender.send('export-progress', 0);
          })
          .on('progress', (progress) => {
            const progressPercent = progress.percent;
            if (progressPercent !== undefined && progressPercent !== null) {
              event.sender.send('export-progress', progressPercent);
            }
          })
          .on('end', () => {
            event.sender.send('export-progress', 100);
            resolve(outputPath);
          })
          .on('error', (err, stdout, stderr) => {
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

// Layer 2 IPC handler - receives files from injected code
ipcMain.on('files-dropped-layer2', (event, fileData) => {
  console.log('📨 [Layer 2] Main process received dropped files:', fileData.length);
  fileData.forEach(file => {
    console.log('  📄 [Layer 2]', file.name, '→', file.path);
  });
  
  // Forward to renderer with 'file-dropped' event (App.jsx is already listening)
  event.sender.send('file-dropped', fileData);
  console.log('✅ [Layer 2] Forwarded files to renderer process');
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
// Returns video WITHOUT audio - audio files are kept separate for timeline import
ipcMain.handle('convert-frames-to-video', async (event, { outputPath, frameRate = 30, audioFiles = [] }) => {
  return new Promise((resolve, reject) => {
    try {
      const tempDir = path.join(__dirname, 'temp_frames');
      const inputPattern = path.join(tempDir, 'frame_%06d.png');
      
      console.log('Converting frames to video (NO AUDIO):', inputPattern, '->', outputPath);
      console.log('Audio files will be kept separate:', audioFiles);
      
      // Create video WITHOUT audio - audio will be imported separately into timeline
      let command = ffmpeg(inputPattern)
        .inputOptions([
          `-r ${frameRate}`,  // Input frame rate
          '-framerate 30'
        ])
        .outputOptions([
          '-c:v libx264',
          '-pix_fmt yuv420p',
          '-r 30',  // Output frame rate
          '-preset fast',
          '-crf 23',
          '-movflags +faststart'  // Optimize for web playback
        ])
        .output(outputPath);

      command
        .on('start', (commandLine) => {
          console.log('FFmpeg started (video only, no audio):', commandLine);
        })
        .on('progress', (progress) => {
          console.log('FFmpeg progress:', progress);
        })
        .on('end', () => {
          console.log('FFmpeg conversion complete (video without audio)');
          
          // Clean up temp frames
          if (fs.existsSync(tempDir)) {
            fs.readdirSync(tempDir).forEach(file => {
              fs.unlinkSync(path.join(tempDir, file));
            });
            fs.rmdirSync(tempDir);
            console.log('Temp frames cleaned up');
          }
          
          // DO NOT clean up audio files - they will be imported separately into timeline
          console.log('Audio files kept separate for timeline import:', audioFiles);
          
          // Return audio file paths so they can be imported separately
          resolve({ 
            success: true, 
            audioFiles: audioFiles // Return audio file paths
          });
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
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


const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, session } = require('electron');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const fs = require('fs');
const record = require('node-record-lpcm16');
const mic = require('mic');
const sox = require('sox-audio');

// Set FFmpeg paths
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}
if (ffprobeStatic) {
  ffmpeg.setFfprobePath(ffprobeStatic.path);
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,  // Enable for MediaRecorder compatibility
      contextIsolation: false  // Required for MediaRecorder to work in Electron
    }
  });

  mainWindow.loadFile('dist/index.html');

  // Open DevTools in development
  if (process.env.NODE_ENV !== 'production') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();

  // Handle permission requests for media (camera, microphone, screen)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    console.log(`Permission request for '${permission}'`);
    console.log('Permission details:', details);
    
    if (permission === 'media') {
      // Auto-grant media permissions (includes camera and microphone)
      console.log('Granting media permission');
      callback(true);
    } else if (permission === 'camera') {
      console.log('Camera permission requested');
      callback(true);
    } else if (permission === 'microphone') {
      console.log('Microphone permission requested');
      callback(true);
    } else {
      console.log(`Denying permission: ${permission}`);
      callback(false);
    }
  });

  // Let the system picker handle display media requests - no custom handler needed

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

    if (scaleTo1080p) {
      command = command.videoFilters('scale=1920:1080');
    }

    command
      .outputOptions('-crf', '23') // Quality preset
      .save(outputPath)
      .on('progress', (progress) => {
        event.sender.send('export-progress', progress.percent);
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
ipcMain.handle('convert-frames-to-video', async (event, { outputPath, frameRate = 30, audioFiles = [] }) => {
  return new Promise((resolve, reject) => {
    try {
      const tempDir = path.join(__dirname, 'temp_frames');
      const inputPattern = path.join(tempDir, 'frame_%06d.png');
      
      console.log('Converting frames to video:', inputPattern, '->', outputPath);
      console.log('Audio files to mix:', audioFiles);
      
      let command = ffmpeg(inputPattern)
        .inputOptions([
          `-r ${frameRate}`,  // Input frame rate
          '-framerate 30'
        ]);
      
      // Add audio inputs if available
      if (audioFiles.length > 0) {
        audioFiles.forEach(audioFile => {
          command = command.input(audioFile);
        });
        
        // Mix multiple audio streams if more than one
        if (audioFiles.length > 1) {
          command = command.complexFilter([
            `[1:a][2:a]amix=inputs=${audioFiles.length}:duration=longest[aout]`
          ]).outputOptions(['-map', '0:v', '-map', '[aout]']);
        } else {
          command = command.outputOptions(['-map', '0:v', '-map', '1:a']);
        }
      }
      
      command = command.outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-r 30',  // Output frame rate
        '-preset fast',
        '-crf 23',
        '-movflags +faststart'  // Optimize for web playback
      ]);
      
      if (audioFiles.length > 0) {
        command = command.outputOptions(['-c:a', 'aac', '-b:a', '128k']);
      }
      
      command = command.output(outputPath);

      command
        .on('start', (commandLine) => {
          console.log('FFmpeg started:', commandLine);
        })
        .on('progress', (progress) => {
          console.log('FFmpeg progress:', progress);
        })
        .on('end', () => {
          console.log('FFmpeg conversion complete');
          
          // Clean up temp frames
          if (fs.existsSync(tempDir)) {
            fs.readdirSync(tempDir).forEach(file => {
              fs.unlinkSync(path.join(tempDir, file));
            });
            fs.rmdirSync(tempDir);
            console.log('Temp frames cleaned up');
          }
          
          // Clean up audio files
          audioFiles.forEach(audioFile => {
            if (fs.existsSync(audioFile)) {
              fs.unlinkSync(audioFile);
              console.log('Cleaned up audio file:', audioFile);
            }
          });
          
          resolve({ success: true });
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
    console.log('Starting system audio recording with SoX...');
    
    // Check if SoX is available
    try {
      // Test SoX availability by trying to create a simple recorder
      const testRecorder = sox.record({
        input: 'default',
        output: 'pipe',
        format: 'wav',
        channels: 1,
        rate: 44100,
        bits: 16
      });
      
      // If we get here, SoX is available
      console.log('SoX is available and working');
      testRecorder.kill(); // Clean up test recorder
      
    } catch (soxError) {
      console.warn('SoX not available, falling back to node-record-lpcm16:', soxError.message);
      // Fallback to node-record-lpcm16 if SoX is not available
      return { success: false, error: 'SoX not available. Please install SoX for system audio recording or use microphone only.' };
    }
    
    // Clear previous audio data
    audioData.systemAudio = [];
    
    // Start SoX recording for system audio
    systemAudioRecorder = sox.record({
      input: 'default', // Use default system audio input
      output: 'pipe', // Output to stream
      format: 'wav',
      channels: 2,
      rate: 44100,
      bits: 16
    });
    
    // Recorder is stored in global variable for cleanup
    
    // Collect audio data
    systemAudioRecorder.on('data', (chunk) => {
      audioData.systemAudio.push(chunk);
    });
    
    systemAudioRecorder.on('error', (error) => {
      console.error('SoX system audio recording error:', error);
    });
    
    console.log('System audio recording started successfully with SoX');
    return { success: true };
    
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
      console.log('Microphone recording already active, skipping...');
      return { success: true, message: 'Microphone recording already active' };
    }
    
    // Configure microphone recording
    const micInstance = mic({
      rate: '44100',
      channels: '2',
      debug: false,
      exitOnSilence: 6
    });
    
    microphoneRecorder = micInstance;
    
    const micInputStream = micInstance.getAudioStream();
    
    micInputStream.on('data', (data) => {
      audioData.microphone.push(data);
    });
    
    micInputStream.on('error', (error) => {
      console.error('Microphone recording error:', error);
    });
    
    micInstance.start();
    
    return { success: true };
  } catch (error) {
    console.error('Error starting microphone recording:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-audio-recording', async () => {
  try {
    console.log('Stopping audio recording...');
    
    if (systemAudioRecorder) {
      console.log('Stopping SoX system audio recording...');
      systemAudioRecorder.kill(); // SoX uses kill() instead of stop()
      systemAudioRecorder = null;
    }
    
    if (microphoneRecorder) {
      console.log('Stopping microphone recording...');
      microphoneRecorder.stop();
      microphoneRecorder = null;
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error stopping audio recording:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-audio-data', async (event, { outputPath, audioType }) => {
  try {
    console.log(`Saving ${audioType} audio data to:`, outputPath);
    
    const audioBuffer = audioData[audioType];
    if (!audioBuffer || audioBuffer.length === 0) {
      return { success: false, error: 'No audio data to save' };
    }
    
    // Combine all audio chunks
    const totalLength = audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
    const combinedBuffer = Buffer.alloc(totalLength);
    let offset = 0;
    
    for (const chunk of audioBuffer) {
      chunk.copy(combinedBuffer, offset);
      offset += chunk.length;
    }
    
    // Save as WAV file
    fs.writeFileSync(outputPath, combinedBuffer);
    
    // Clear the audio data
    audioData[audioType] = [];
    
    return { success: true };
  } catch (error) {
    console.error('Error saving audio data:', error);
    return { success: false, error: error.message };
  }
});


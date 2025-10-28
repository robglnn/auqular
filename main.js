const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, session } = require('electron');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const fs = require('fs');

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
ipcMain.handle('convert-frames-to-video', async (event, { outputPath, frameRate = 30 }) => {
  return new Promise((resolve, reject) => {
    try {
      const tempDir = path.join(__dirname, 'temp_frames');
      const inputPattern = path.join(tempDir, 'frame_%06d.png');
      
      console.log('Converting frames to video:', inputPattern, '->', outputPath);
      
      const command = ffmpeg(inputPattern)
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


const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');

// Set FFmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
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


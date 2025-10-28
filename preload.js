const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  openVideoFile: () => ipcRenderer.invoke('open-video-file'),
  getVideoDuration: (filePath) => ipcRenderer.invoke('get-video-duration', filePath),
  generateThumbnail: (filePath) => ipcRenderer.invoke('generate-thumbnail', filePath),
  exportVideo: (options) => ipcRenderer.invoke('export-video', options),
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),
  onExportProgress: (callback) => ipcRenderer.on('export-progress', (event, progress) => callback(progress)),
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
  showRecordSaveDialog: () => ipcRenderer.invoke('show-record-save-dialog'),
  saveRecordedVideo: (options) => ipcRenderer.invoke('save-recorded-video', options)
});


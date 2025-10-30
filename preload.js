// Preload script - simplified
// With nodeIntegration: true and contextIsolation: false,
// the renderer process has direct access to require('electron')
// so we don't need contextBridge (which causes errors with contextIsolation: false)

console.log('✅ Preload script loaded (no-op with nodeIntegration: true)');

// Note: All IPC communication happens directly via:
// const { ipcRenderer } = window.require('electron');
// This is secure enough for a local desktop app with no remote content.

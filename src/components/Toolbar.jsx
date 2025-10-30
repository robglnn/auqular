import React from 'react';

function Toolbar({ onImport, onExportSource, onExport720p, onExport1080p, canExport, onRecord, onImportAudio, exportProgress, onDropZoneClick, onMediaLibrary }) {
  const [isDragging, setIsDragging] = React.useState(false);
  
  // Format progress as XX% (double digits, 0-100)
  const formatProgress = (progress) => {
    if (progress === null || progress === undefined) return null;
    const rounded = Math.min(100, Math.max(0, Math.round(progress)));
    return `${rounded.toString().padStart(2, '0')}%`;
  };

  return (
    <div className="toolbar">
      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        onClick={onDropZoneClick}
        onDragOver={(e) => { 
          e.preventDefault(); 
          e.stopPropagation();
          setIsDragging(true);
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(false);
        }}
        onDrop={async (e) => { 
          e.preventDefault(); 
          e.stopPropagation();
          setIsDragging(false);
          
          // Handle file drop
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const files = Array.from(e.dataTransfer.files);
            
            // Get file paths using webUtils.getPathForFile() (Electron v32+)
            if (window.require) {
              const { webUtils, ipcRenderer } = window.require('electron');
              
              const fileDataPromises = files.map(async (file) => {
                let filePath = file.path;
                
                // If path is null (Electron v32+), use webUtils.getPathForFile()
                if (!filePath && webUtils && webUtils.getPathForFile) {
                  try {
                    filePath = webUtils.getPathForFile(file);
                  } catch (err) {
                    console.warn('⚠️ [Toolbar] webUtils.getPathForFile failed:', err);
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
                ipcRenderer.send('files-dropped-layer2', filesWithPaths);
              }
            }
          }
        }}
        style={{
          display: 'inline-block',
          border: '2px dashed #007acc',
          borderRadius: '8px',
          padding: '10px 20px',
          marginRight: '12px',
          cursor: 'pointer',
          background: isDragging ? 'rgba(0,122,204,0.2)' : 'rgba(0,122,204,0.05)',
          transition: 'all 0.2s',
          userSelect: 'none',
          fontSize: '14px',
          fontWeight: '500'
        }}
        title="Click to add media files (multi-select supported)"
      >
        <span style={{ fontSize: '18px', marginRight: '8px' }}>📁</span>
        <span>Add Files</span>
      </div>
      <button className="btn btn-primary" onClick={onRecord}>
        Record
      </button>
      <button
        className="btn btn-primary"
        onClick={onExportSource}
        disabled={!canExport}
        style={{ marginRight: '2px' }}
      >
        Export MP4
      </button>
      <button
        className="btn btn-primary"
        onClick={onExport720p}
        disabled={!canExport}
        style={{ marginRight: '2px' }}
      >
        720p
      </button>
      <button
        className="btn btn-primary"
        onClick={onExport1080p}
        disabled={!canExport}
        style={{ marginRight: '2px' }}
      >
        1080p
      </button>
      <button
        className="btn btn-primary"
        onClick={onMediaLibrary}
        style={{ marginRight: '2px' }}
        title="Media Library"
      >
        📚 Library
      </button>
      <div style={{ flex: 1 }} />
      <div style={{ fontSize: '14px', color: '#888', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>Auqular</span>
        {exportProgress !== null && (
          <span style={{ color: '#007acc', fontWeight: '500' }}>
            {formatProgress(exportProgress)}
          </span>
        )}
      </div>
    </div>
  );
}

export default Toolbar;


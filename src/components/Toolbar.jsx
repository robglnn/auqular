import React from 'react';

function Toolbar({ onImport, onExport, canExport, onRecord, onImportAudio, exportProgress }) {
  // Format progress as XX% (double digits, 0-100)
  const formatProgress = (progress) => {
    if (progress === null || progress === undefined) return null;
    const rounded = Math.min(100, Math.max(0, Math.round(progress)));
    return `${rounded.toString().padStart(2, '0')}%`;
  };

  return (
    <div className="toolbar">
      <button className="btn btn-primary" onClick={onImport}>
        Import Video
      </button>
      <button onClick={onImportAudio} className="toolbar-button">
        Import Audio
      </button>
      <button className="btn btn-primary" onClick={onRecord}>
        Record
      </button>
      <button 
        className="btn btn-primary" 
        onClick={onExport}
        disabled={!canExport}
      >
        Export MP4
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


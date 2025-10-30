import React from 'react';

function Toolbar({ onImport, onExportSource, onExport720p, onExport1080p, canExport, onRecord, onImportAudio, exportProgress }) {
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
        style={{ marginRight: '4px' }}
      >
        1080p
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


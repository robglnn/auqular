import React from 'react';

function Toolbar({ onImport, onExport, canExport, onRecord, onImportAudio }) {
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
      <div style={{ fontSize: '14px', color: '#888' }}>
        Auqular
      </div>
    </div>
  );
}

export default Toolbar;


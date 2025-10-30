import React from 'react';

function MediaLibrary({ clips, onSelectClip, onClose }) {
  // Format duration from seconds to MM:SS or HH:MM:SS
  const formatDuration = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes || isNaN(bytes)) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1024) {
      return `${Math.round(kb)} KB`;
    }
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  // Format resolution
  const formatResolution = (clip) => {
    if (clip.type === 'audio') return 'Audio';
    if (clip.width && clip.height) {
      return `${clip.width}×${clip.height}`;
    }
    return 'Unknown';
  };

  // Get file name from path
  const getFileName = (filePath) => {
    if (!filePath) return 'Unknown';
    return filePath.split(/[\\/]/).pop() || filePath;
  };

  // Group clips by date (for now, just show all - can add grouping later)
  const allClips = [...clips].sort((a, b) => {
    // Sort by ID (newest first)
    return (b.id || 0) - (a.id || 0);
  });

  return (
    <div className="media-library-overlay" onClick={onClose}>
      <div className="media-library-panel" onClick={(e) => e.stopPropagation()}>
        <div className="media-library-header">
          <h3>Media Library</h3>
          <button className="media-library-close" onClick={onClose}>×</button>
        </div>
        <div className="media-library-content">
          <table className="media-library-table">
            <thead>
              <tr>
                <th className="col-name">Name</th>
                <th className="col-duration">Duration</th>
                <th className="col-resolution">Resolution</th>
                <th className="col-size">Size</th>
              </tr>
            </thead>
            <tbody>
              {allClips.length === 0 ? (
                <tr>
                  <td colSpan="4" className="media-library-empty">
                    No media files imported yet
                  </td>
                </tr>
              ) : (
                allClips.map((clip) => (
                  <tr
                    key={clip.id}
                    className="media-library-row"
                    onClick={() => {
                      if (onSelectClip) onSelectClip(clip);
                    }}
                  >
                    <td className="col-name">
                      <div className="media-library-name-cell">
                        {clip.thumbnailPath && clip.type === 'video' ? (
                          <img
                            src={`file://${clip.thumbnailPath}`}
                            alt=""
                            className="media-library-thumbnail"
                          />
                        ) : (
                          <div className="media-library-icon">
                            {clip.type === 'video' ? '🎬' : '🎵'}
                          </div>
                        )}
                        <span className="media-library-filename">{getFileName(clip.filePath)}</span>
                      </div>
                    </td>
                    <td className="col-duration">{formatDuration(clip.duration)}</td>
                    <td className="col-resolution">{formatResolution(clip)}</td>
                    <td className="col-size">
                      {clip.fileSize ? formatFileSize(clip.fileSize) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default MediaLibrary;


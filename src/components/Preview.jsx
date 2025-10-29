import React, { useRef, useEffect } from 'react';

function Preview({ clip, isPlaying, onPlay, onPause, playheadPosition, onTimeUpdate, onSeek }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const lastClipIdRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => {
      // Send the actual video currentTime (not timeline position)
      onTimeUpdate(video.currentTime);
    };

    const handleEnded = () => {
      // Video ended naturally
      // Don't pause - let App.jsx handle transitioning to next clip or continuing
      // The video element will pause automatically, but we keep isPlaying true
      // so the playhead can continue moving
    };

    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('ended', handleEnded);
    };
  }, [onTimeUpdate, onPause]);

  useEffect(() => {
    if (isPlaying) {
      videoRef.current?.play();
    } else {
      videoRef.current?.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip) return;

    // Update video source if clip changed
    if (video.src !== `file:///${clip.filePath.replace(/\\/g, '/')}`) {
      video.src = `file:///${clip.filePath.replace(/\\/g, '/')}`;
      video.load();
      // Set initial time when loading new clip
      video.addEventListener('loadedmetadata', () => {
        const offsetInClip = playheadPosition - clip.position + clip.trimStart;
        video.currentTime = Math.max(clip.trimStart, Math.min(offsetInClip, clip.trimEnd));
      }, { once: true });
    }
  }, [clip]);

  // Sync video currentTime with playhead position (when seeking)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip) return;
    
    // Skip if this is the same clip ID we just loaded (avoid setting time twice)
    if (lastClipIdRef.current === clip.id) {
      lastClipIdRef.current = null;
      return;
    }
    
    // Calculate the time within the clip based on timeline position
    const offsetInClip = playheadPosition - clip.position + clip.trimStart;
    const targetTime = Math.max(clip.trimStart, Math.min(offsetInClip, clip.trimEnd));
    
    // Only seek if there's a significant difference (avoid endless loop)
    const tolerance = 0.1;
    if (Math.abs(video.currentTime - targetTime) > tolerance) {
      video.currentTime = targetTime;
    }
  }, [playheadPosition, clip]);

  // Track when clip changes
  useEffect(() => {
    if (clip) {
      lastClipIdRef.current = clip.id;
    }
  }, [clip]);

  const handleVideoClick = (event) => {
    if (videoRef.current) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const clickX = event.clientX - rect.left;
        const clickPercent = clickX / rect.width;
        const duration = videoRef.current.duration || 0;
        const newTime = clickPercent * duration;
        videoRef.current.currentTime = newTime;
        onSeek(newTime);
      }
    }
  };

  if (!clip) {
    return (
      <div className="preview-container" ref={containerRef}>
        <div className="loading">
          Import a video to get started
        </div>
      </div>
    );
  }

  return (
    <div 
      className="preview-container" 
      ref={containerRef}
      onClick={handleVideoClick}
      style={{ cursor: 'pointer', position: 'relative' }}
    >
      <video
        ref={videoRef}
        className="preview-video"
        controls={false}
        muted
      />
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '10px'
      }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isPlaying) {
              onPause();
            } else {
              onPlay();
            }
          }}
          style={{
            padding: '10px 20px',
            backgroundColor: '#007acc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
      </div>
    </div>
  );
}

export default Preview;


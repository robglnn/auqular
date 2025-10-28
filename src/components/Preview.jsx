import React, { useRef, useEffect } from 'react';

function Preview({ clip, isPlaying, onPlay, onPause, playheadPosition, onTimeUpdate, onSeek }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => {
      onTimeUpdate(video.currentTime);
    };

    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('ended', onPause);

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('ended', onPause);
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
      style={{ cursor: 'pointer' }}
    >
      <video
        ref={videoRef}
        className="preview-video"
        controls={false}
        muted
      />
    </div>
  );
}

export default Preview;


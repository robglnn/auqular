import React, { useRef, useEffect, useCallback } from 'react';

function Preview({ clip, allClipsAtPosition = [], isPlaying, onPlay, onPause, playheadPosition, onTimeUpdate, onSeek }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const audioElementsRef = useRef({}); // Store multiple audio elements for simultaneous playback
  const containerRef = useRef(null);
  const lastClipIdRef = useRef(null);
  const videoStopTimeRef = useRef(null); // Track when video stopped at trimEnd
  const isAudioOnly = clip?.type === 'audio';

  // Initialize audio element when it mounts
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = false;
      audioRef.current.volume = 1.0;
    }
  }, []);
  
  // Handle simultaneous multi-track audio playback
  useEffect(() => {
    // Get all audio clips AND video clips (videos also have audio) at current position
    const audioClips = allClipsAtPosition.filter(c => c.type === 'audio');
    const videoClips = allClipsAtPosition.filter(c => c.type === 'video');
    
    // Create audio clips from video clips (extract audio from video)
    const videoAudioClips = videoClips.map(videoClip => ({
      ...videoClip,
      id: `video_audio_${videoClip.id}`, // Unique ID for video audio
      type: 'audio', // Treat as audio for playback
      isVideoAudio: true // Flag to distinguish from standalone audio
    }));
    
    // Combine all audio clips (standalone + video audio)
    const allAudioClips = [...audioClips, ...videoAudioClips];
    
    // Clean up old audio elements that are no longer needed
    const currentAudioIds = new Set(allAudioClips.map(c => c.id));
    Object.keys(audioElementsRef.current).forEach(clipId => {
      if (!currentAudioIds.has(clipId)) {
        const audioEl = audioElementsRef.current[clipId];
        if (audioEl) {
          audioEl.pause();
          audioEl.src = '';
          if (audioEl.parentNode) {
            audioEl.parentNode.removeChild(audioEl);
          }
        }
        delete audioElementsRef.current[clipId];
      }
    });
    
    // Create and manage audio elements for each overlapping audio clip
    allAudioClips.forEach(audioClip => {
      // Skip if this is the primary clip (it uses audioRef) - but NOT for video audio
      if (clip && clip.id === audioClip.id && isAudioOnly && !audioClip.isVideoAudio) {
        return;
      }
      
      let audioEl = audioElementsRef.current[audioClip.id];
      
      // Create new audio element if needed
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.preload = 'auto';
        audioEl.muted = false;
        audioEl.volume = 1.0;
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
        audioElementsRef.current[audioClip.id] = audioEl;
      }
      
      // Set source if changed
      const filePath = `file:///${audioClip.filePath.replace(/\\/g, '/')}`;
      const clipKey = `${audioClip.id}-${audioClip.trimStart}-${audioClip.trimEnd}`;
      const currentClipKey = audioEl.dataset?.clipKey;
      
      if (audioEl.src !== filePath || currentClipKey !== clipKey) {
        if (!audioEl.dataset) audioEl.dataset = {};
        audioEl.dataset.clipKey = clipKey;
        audioEl.src = filePath;
        audioEl.load();
        
        // Set initial time
        audioEl.addEventListener('loadedmetadata', () => {
          const initialTime = Math.max(0, audioClip.trimStart);
          audioEl.currentTime = initialTime;
        }, { once: true });
      }
      
      // Sync playback state
      if (isPlaying) {
        const offsetInClip = playheadPosition - audioClip.position + audioClip.trimStart;
        const targetTime = Math.max(audioClip.trimStart, Math.min(offsetInClip, audioClip.trimEnd));
        
        if (Math.abs(audioEl.currentTime - targetTime) > 0.1) {
          audioEl.currentTime = targetTime;
        }
        
        if (audioEl.paused && audioEl.readyState >= 2) {
          audioEl.play().catch(err => {
            console.warn('Failed to play simultaneous audio track:', err);
          });
        }
      } else {
        audioEl.pause();
      }
      
      // Enforce trim boundaries
      const checkBounds = () => {
        if (audioEl.currentTime > audioClip.trimEnd) {
          audioEl.currentTime = audioClip.trimEnd;
          audioEl.pause();
        } else if (audioEl.currentTime < audioClip.trimStart) {
          audioEl.currentTime = audioClip.trimStart;
        }
      };
      
      audioEl.addEventListener('timeupdate', checkBounds);
      
      return () => {
        audioEl.removeEventListener('timeupdate', checkBounds);
      };
    });
    
    // Cleanup on unmount
    return () => {
      Object.values(audioElementsRef.current).forEach(audioEl => {
        if (audioEl) {
          audioEl.pause();
          audioEl.src = '';
          if (audioEl.parentNode) {
            audioEl.parentNode.removeChild(audioEl);
          }
        }
      });
      audioElementsRef.current = {};
    };
  }, [allClipsAtPosition, isPlaying, playheadPosition, clip, isAudioOnly]);

  // Handle video time updates - drive playhead during playback, enforce trim boundaries
  // Use clip.id instead of clip object to prevent re-attaching listeners on every render
  useEffect(() => {
    if (isAudioOnly) return;
    const video = videoRef.current;
    if (!video || !clip) return;

    // Store clip values in closure to avoid stale closures
    const clipId = clip.id;
    const clipTrimStart = clip.trimStart;
    const clipTrimEnd = clip.trimEnd;
    const clipPosition = clip.position;

    const updateTime = () => {
      const currentVideoTime = video.currentTime;
      
      // During playback, video drives the playhead position CONTINUOUSLY
      if (isPlaying) {
        // Detect if video has reached trimEnd
        const videoAtEnd = currentVideoTime >= clipTrimEnd - 0.05;
        
        if (videoAtEnd) {
          // Video reached end - mark stop time and switch to timer-based advancement
          if (!videoStopTimeRef.current) {
            const clipEndPosition = clipPosition + (clipTrimEnd - clipTrimStart);
            videoStopTimeRef.current = {
              stopTime: Date.now(),
              clipEndPosition
            };
          }
          
          // Calculate overshoot time since video stopped
          const elapsedSinceStop = (Date.now() - videoStopTimeRef.current.stopTime) / 1000;
          const timelinePosition = videoStopTimeRef.current.clipEndPosition + elapsedSinceStop;
          
          // Continue advancing playhead past clip end
          if (onTimeUpdate) {
            onTimeUpdate(timelinePosition);
          }
          return;
        } else {
          // Video is still advancing - clear stop time tracker
          videoStopTimeRef.current = null;
        }
        
        // Calculate timeline position from video's currentTime (normal playback)
        const offsetInClip = currentVideoTime - clipTrimStart;
        const timelinePosition = clipPosition + offsetInClip;
        
        // Update playhead to match video playback
        if (onTimeUpdate) {
          onTimeUpdate(timelinePosition);
        }
      }
      
      // Enforce trim boundaries only when NOT playing (manual seeking)
      if (!isPlaying) {
        videoStopTimeRef.current = null; // Clear stop tracker when paused
        const tolerance = 0.05;
        if (video.currentTime >= clipTrimEnd + tolerance) {
          video.currentTime = clipTrimEnd;
        } else if (video.currentTime < clipTrimStart - tolerance) {
          video.currentTime = clipTrimStart;
        }
      }
    };

    const handleEnded = () => {
      // Video reached end of clip - mark stop time so playhead continues advancing
      console.log('Video clip ended at trim boundary - switching to timer-based advancement');
      
      if (isPlaying) {
        // Mark that video stopped - updateTime will detect this and continue playhead
        const clipEndPosition = clipPosition + (clipTrimEnd - clipTrimStart);
        videoStopTimeRef.current = {
          stopTime: Date.now(),
          clipEndPosition
        };
        
        // Keep video at trimEnd - playhead will continue via timer
        const video = videoRef.current;
        if (video) {
          video.currentTime = clipTrimEnd;
        }
      } else {
        // User paused playback - allow pause
        videoStopTimeRef.current = null;
        if (onPause) {
          onPause();
        }
      }
    };

    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('ended', handleEnded);
    };
  }, [onTimeUpdate, onPause, isAudioOnly, clip?.id, clip?.trimStart, clip?.trimEnd, clip?.position, isPlaying]);

  // Handle audio time updates - enforce trim boundaries for split clips
  useEffect(() => {
    if (!isAudioOnly) return;
    const audio = audioRef.current;
    if (!audio || !clip) return;

    const updateTime = () => {
      // Enforce trim boundaries - if audio tries to play beyond trimEnd, stop/pause
      if (audio.currentTime > clip.trimEnd) {
        audio.currentTime = clip.trimEnd;
        audio.pause();
      } else if (audio.currentTime < clip.trimStart) {
        audio.currentTime = clip.trimStart;
      }
      onTimeUpdate(audio.currentTime);
    };

    const handleEnded = () => {
      // Audio ended - App's updatePlayhead will detect and transition to next clip
      console.log('Audio clip ended at trim boundary');
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [onTimeUpdate, isAudioOnly, clip]);

  // Play/Pause handler with retry logic
  useEffect(() => {
    const handlePlayPause = async () => {
      if (isPlaying) {
        const element = isAudioOnly ? audioRef.current : videoRef.current;
        if (element) {
          // For audio, check for recording conflicts and ensure proper configuration
          if (isAudioOnly) {
            // Check if audio recording is active (could block playback on Windows)
            try {
              // Check if window.require is available (depends on nodeIntegration setting)
              if (typeof window !== 'undefined' && window.require) {
                const { ipcRenderer } = window.require('electron');
                const recordingStatus = await ipcRenderer.invoke('is-audio-recording-active');
                if (recordingStatus && recordingStatus.active) {
                  console.warn('⚠️ Audio recording is active - this may block playback. Stopping recording...');
                  await ipcRenderer.invoke('stop-audio-recording');
                  // Give Windows a moment to release the audio device
                  await new Promise(resolve => setTimeout(resolve, 200));
                }
              }
            } catch (err) {
              // Silently handle - recording check is optional
              console.warn('Could not check recording status (non-critical):', err.message);
            }
            
            // Explicitly ensure audio is not muted and volume is set
            element.muted = false;
            element.volume = 1.0;
            console.log('Starting audio playback - volume:', element.volume, 'muted:', element.muted, 'readyState:', element.readyState);
          }
          
          // Wait for element to be ready - but also check if it's still loading
          if (element.readyState >= 2) {
            try {
              // Set correct start time BEFORE playing
              if (clip) {
                const offsetInClip = playheadPosition - clip.position + clip.trimStart;
                const targetTime = Math.max(clip.trimStart, Math.min(offsetInClip, clip.trimEnd));
                if (Math.abs(element.currentTime - targetTime) > 0.1) {
                  element.currentTime = targetTime;
                }
              }
              
              const playPromise = element.play();
              if (playPromise !== undefined) {
                await playPromise;
                // Double-check after play starts
                if (isAudioOnly) {
                  element.muted = false;
                  element.volume = 1.0;
                  console.log('✅ Audio playback started - currentTime:', element.currentTime, 'paused:', element.paused);
                } else {
                  // Video
                  element.muted = false; // Unmute for preview
                  console.log('✅ Video playback started - currentTime:', element.currentTime, 'paused:', element.paused);
                }
              }
          } catch (err) {
            if (err.name === 'AbortError') {
              console.warn('Play interrupted, retrying...');
              setTimeout(async () => {
                try {
                    if (isAudioOnly) {
                      element.muted = false;
                      element.volume = 1.0;
                    }
                  await element.play();
                } catch (retryErr) {
                  console.error('Retry play failed:', retryErr);
                }
              }, 100);
            } else {
              console.error('Play error:', err);
            }
            }
          } else {
            // Wait for audio to be ready
            console.log('Audio not ready yet, waiting... readyState:', element.readyState);
            const handleCanPlay = async () => {
              try {
                if (isAudioOnly) {
                  element.muted = false;
                  element.volume = 1.0;
                }
                await element.play();
                console.log('✅ Audio playback started after canplaythrough');
              } catch (err) {
                console.error('Play after canplay failed:', err);
              }
            };
            element.addEventListener('canplaythrough', handleCanPlay, { once: true });
          }
        }
      } else {
        const element = isAudioOnly ? audioRef.current : videoRef.current;
        if (element) {
          element.pause();
        }
      }
    };

    handlePlayPause();
  }, [isPlaying, isAudioOnly]);

  // Handle video source changes - reload when clip or trim changes (for split clips)
  // NOTE: playheadPosition removed from deps - it was causing constant reloads during playback
  useEffect(() => {
    if (isAudioOnly) return;
    const video = videoRef.current;
    if (!video || !clip) return;

    const filePath = `file:///${clip.filePath.replace(/\\/g, '/')}`;
    
    // Reload if clip ID changed OR trim points changed (for split clips)
    const clipKey = `${clip.id}-${clip.trimStart}-${clip.trimEnd}`;
    const currentClipKey = video.dataset?.clipKey;
    
    if (video.src !== filePath || currentClipKey !== clipKey) {
      // Store current playback state before reload
      const wasPlaying = !video.paused;
      const currentTimeBeforeReload = video.currentTime;
      
      if (!video.dataset) video.dataset = {};
      video.dataset.clipKey = clipKey;
      
      video.src = filePath;
      video.preload = 'auto';
      video.load();
      
      video.addEventListener('loadedmetadata', () => {
        // Only set initial time if paused (don't interfere with playback)
        if (!isPlaying && !wasPlaying) {
          const offsetInClip = playheadPosition - clip.position + clip.trimStart;
          const targetTime = Math.max(clip.trimStart, Math.min(offsetInClip, clip.trimEnd));
          video.currentTime = targetTime;
        } else if (wasPlaying && isPlaying) {
          // If we were playing, try to restore playback position
          const offsetInClip = playheadPosition - clip.position + clip.trimStart;
          const targetTime = Math.max(clip.trimStart, Math.min(offsetInClip, clip.trimEnd));
          video.currentTime = targetTime;
          // Resume playback if it was playing
          video.play().catch(err => console.warn('Resume playback failed:', err));
        }
        console.log('✅ Video preloaded - duration:', video.duration, 'currentTime:', video.currentTime, 'wasPlaying:', wasPlaying);
      }, { once: true });
    }
  }, [clip?.id, clip?.trimStart, clip?.trimEnd, isAudioOnly]);

  // Handle audio source changes - PRELOAD IMMEDIATELY when clip is set (CRITICAL FIX)
  useEffect(() => {
    if (!isAudioOnly || !clip) return;
    const audio = audioRef.current;
    if (!audio) return;

    // Convert Windows path to file:// URL format (same as video)
    const filePath = `file:///${clip.filePath.replace(/\\/g, '/')}`;
    
    // Load audio immediately when clip is set (not waiting for playhead or play button)
    // CRITICAL: Remove all conditions - just load it immediately
    const currentSrc = audio.src || '';
    const normalizedCurrentSrc = currentSrc.replace(/^file:\/\/\/+/, 'file:///');
    const normalizedFilePath = filePath.replace(/^file:\/\/\/+/, 'file:///');
    
    // Always reload if clip ID changed OR trim points changed (for split clips)
    const clipKey = `${clip.id}-${clip.trimStart}-${clip.trimEnd}`;
    const currentClipKey = audio.dataset?.clipKey;
    
    if (normalizedCurrentSrc !== normalizedFilePath || currentClipKey !== clipKey) {
      // Explicitly ensure audio is not muted and volume is set
      audio.muted = false;
      audio.volume = 1.0;
      
      // Set up event listeners
      const handleError = (e) => {
        console.error('Audio load error:', {
          code: audio.error?.code,
          message: audio.error?.message,
          networkState: audio.networkState,
          readyState: audio.readyState,
          src: audio.src
        });
      };
      
      const handleLoadedMetadata = () => {
        audio.muted = false;
        audio.volume = 1.0;
        const offsetInClip = playheadPosition - clip.position + clip.trimStart;
        audio.currentTime = Math.max(clip.trimStart, Math.min(offsetInClip, clip.trimEnd));
        console.log('✅ Audio metadata loaded - duration:', audio.duration, 'readyState:', audio.readyState);
      };
      
      const handleCanPlay = () => {
        audio.muted = false;
        audio.volume = 1.0;
        // Set correct start time when ready
        const offsetInClip = playheadPosition - clip.position + clip.trimStart;
        audio.currentTime = Math.max(clip.trimStart, Math.min(offsetInClip, clip.trimEnd));
        console.log('✅ Audio can play - volume:', audio.volume, 'muted:', audio.muted, 'readyState:', audio.readyState, 'currentTime:', audio.currentTime);
      };
      
      audio.addEventListener('error', handleError);
      audio.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
      audio.addEventListener('canplaythrough', handleCanPlay, { once: true });
      
      // Store clip key to detect trim changes
      if (!audio.dataset) audio.dataset = {};
      audio.dataset.clipKey = clipKey;
      
      // Set source and load IMMEDIATELY
      audio.src = filePath;
      audio.preload = 'auto';
      audio.load();
      
      // FORCE preload by setting currentTime to trimStart (helps trigger buffering)
      const initialTime = Math.max(0, clip.trimStart);
      audio.addEventListener('loadedmetadata', () => {
        audio.currentTime = initialTime;
        console.log('✅ Audio preloaded - duration:', audio.duration, 'readyState:', audio.readyState, 'currentTime set to:', initialTime);
      }, { once: true });
      
      console.log('🎵 Audio PRELOADING - src:', filePath, 'clipKey:', clipKey, 'trimStart:', clip.trimStart);
      
      // Cleanup
      return () => {
        audio.removeEventListener('error', handleError);
      };
    }
  }, [clip?.id, clip?.trimStart, clip?.trimEnd, isAudioOnly]); // Depend on trim points so split clips reload

  // Sync video currentTime with playhead position (only when paused or seeking)
  useEffect(() => {
    if (isAudioOnly) return;
    const video = videoRef.current;
    if (!video || !clip) return;
    
    // When playing, video drives playhead - don't sync playhead -> video
    // Only sync when paused or when clip changes
    if (isPlaying) {
      // But if clip changed while playing, we need to sync to start of new clip
      if (lastClipIdRef.current !== clip.id) {
        const offsetInClip = playheadPosition - clip.position + clip.trimStart;
        const targetTime = Math.max(clip.trimStart, Math.min(offsetInClip, clip.trimEnd));
        video.currentTime = targetTime;
        lastClipIdRef.current = clip.id;
        // Resume playback if it was playing
        if (video.paused && video.readyState >= 2) {
          video.play().catch(err => console.warn('Resume playback after clip change failed:', err));
        }
      }
      return;
    }
    
    if (lastClipIdRef.current === clip.id) {
      lastClipIdRef.current = null;
      return;
    }
    
    const offsetInClip = playheadPosition - clip.position + clip.trimStart;
    const targetTime = Math.max(clip.trimStart, Math.min(offsetInClip, clip.trimEnd));
    
    const tolerance = 0.1;
    if (Math.abs(video.currentTime - targetTime) > tolerance) {
      video.currentTime = targetTime;
    }
  }, [playheadPosition, clip, isAudioOnly, isPlaying]);

  // Sync audio currentTime with playhead position (when seeking)
  useEffect(() => {
    if (!isAudioOnly || !clip || !audioRef.current) return;
    const audio = audioRef.current;
    
    if (lastClipIdRef.current === clip.id) {
      lastClipIdRef.current = null;
      return;
    }
    
    // Calculate target time based on trim points (CRITICAL for split to work)
      const offsetInClip = playheadPosition - clip.position + clip.trimStart;
      const targetTime = Math.max(clip.trimStart, Math.min(offsetInClip, clip.trimEnd));
      
    // Only sync when paused to avoid interrupting playback
    if (!isPlaying && audio.readyState >= 2) {
      const tolerance = 0.1;
      if (Math.abs(audio.currentTime - targetTime) > tolerance) {
        audio.currentTime = targetTime;
      }
    }
  }, [playheadPosition, clip, isAudioOnly, isPlaying]);

  // Track when clip changes - mark that we've handled this clip transition
  useEffect(() => {
    if (clip) {
      // Only mark if clip ID actually changed (not just on every render)
      if (lastClipIdRef.current !== clip.id) {
        lastClipIdRef.current = clip.id;
      }
    }
  }, [clip?.id]);

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

  return (
    <div 
      className="preview-container" 
      ref={containerRef}
      onClick={clip && !isAudioOnly ? handleVideoClick : undefined}
      style={{ cursor: clip && !isAudioOnly ? 'pointer' : 'default', position: 'relative' }}
    >
      {!clip ? (
        <div className="loading" style={{ padding: '50px', textAlign: 'center', color: '#888' }}>
          Import media to get started
        </div>
      ) : isAudioOnly ? (
        <div style={{ padding: '50px', textAlign: 'center', color: '#888', position: 'relative' }}>
          <audio
            ref={audioRef}
            style={{ display: 'none' }}
            preload="auto"
            muted={false}
          />
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>🎵</div>
          <div>{clip.label || 'Audio Clip'}</div>
          <div style={{ fontSize: '12px', marginTop: '10px', color: '#666' }}>
            {clip.duration?.toFixed(2)}s
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          className="preview-video"
          controls={false}
          muted={false}
          preload="auto"
          playsInline
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      )}
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


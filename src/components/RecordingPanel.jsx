import React, { useState, useRef, useEffect } from 'react';

function RecordingPanel({ onRecordingComplete }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedFilePath, setRecordedFilePath] = useState(null);
  const [isScreenRecording, setIsScreenRecording] = useState(true);
  const [hasPermissions, setHasPermissions] = useState(false);
  
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const videoRef = useRef(null); // For hidden video element workaround

  useEffect(() => {
    return () => {
      // Cleanup: stop recording if component unmounts
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  const startScreenRecording = async () => {
    try {
      console.log('Starting screen recording...');
      
      // Request screen capture (shows system picker for screen/window selection)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: true
      });

      console.log('Screen stream obtained:', stream);
      console.log('Video tracks:', stream.getVideoTracks().length);
      console.log('Audio tracks:', stream.getAudioTracks().length);
      
      if (stream.getVideoTracks().length === 0) {
        throw new Error('No video tracks available');
      }

      streamRef.current = stream;

      // Add track listeners to see if tracks are being stopped
      stream.getVideoTracks().forEach(track => {
        track.addEventListener('ended', () => {
          console.error('Video track ended!', track);
        });
        track.addEventListener('mute', () => {
          console.warn('Video track muted!', track);
        });
        track.addEventListener('unmute', () => {
          console.log('Video track unmuted', track);
        });
      });

      stream.getAudioTracks().forEach(track => {
        track.addEventListener('ended', () => {
          console.error('Audio track ended!', track);
        });
      });

      console.log('All tracks:', stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, readyState: t.readyState, muted: t.muted })));
      
      // CRITICAL FIX: Create hidden video element to keep stream alive (same as webcam recording)
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.style.display = 'none';
      document.body.appendChild(video);
      
      // Wait for video to be ready
      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.play();
          console.log('Hidden video element started playing');
          resolve();
        };
      });
      
      // CRITICAL: Capture stream from video element instead of direct stream
      const captureStream = video.captureStream(30); // 30 FPS
      console.log('Capture stream from video:', captureStream);
      console.log('Capture stream active:', captureStream.active);
      
      // Store video reference for cleanup
      videoRef.current = video;
      
      // Use the capture stream for MediaRecorder, keep original stream for cleanup
      const recordingStream = captureStream;
      
      // Create MediaRecorder - use simplest MIME type for compatibility
      const mimeType = 'video/webm';

      console.log('Using MIME type:', mimeType);
      console.log('MediaRecorder supported types:', [
        'video/webm; codecs=vp9',
        'video/webm; codecs=vp8', 
        'video/webm',
        'video/mp4'
      ].filter(type => MediaRecorder.isTypeSupported(type)));

      // Use captured stream instead of original stream
      const recorder = new MediaRecorder(recordingStream, {
        mimeType: mimeType
      });

      console.log('MediaRecorder created:', recorder);
      console.log('Stream tracks:', stream.getTracks().map(track => ({
        kind: track.kind,
        enabled: track.enabled,
        readyState: track.readyState,
        muted: track.muted
      })));

      // Add error handler
      recorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error);
      };

      recorder.onpause = () => {
        console.warn('MediaRecorder paused!');
      };

      recorder.onresume = () => {
        console.log('MediaRecorder resumed');
      };

      // Add state change listener
      recorder.addEventListener('statechange', () => {
        console.log('MediaRecorder state changed to:', recorder.state);
      });

      recorder.onstart = () => {
        console.log('MediaRecorder started successfully. State:', recorder.state);
        console.log('Stream active after start:', streamRef.current?.active);
        console.log('Tracks after start:', streamRef.current?.getTracks().map(t => ({ kind: t.kind, readyState: t.readyState, enabled: t.enabled })));
      };

      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        console.log('Data available:', event.data.size, 'bytes', 'type:', event.data.type);
        console.log('Recorder state when data available:', recorder.state);
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          console.log('Total chunks:', chunksRef.current.length);
        } else {
          console.warn('Received empty data chunk - this is normal for some recorders');
        }
      };

      recorder.onstop = async () => {
        console.log('Recorder stopped. Chunks collected:', chunksRef.current.length);
        
        // Reset UI state now that recording has stopped
        setIsRecording(false);
        
        // Cleanup hidden video element
        if (videoRef.current) {
          console.log('Cleaning up video element');
          videoRef.current.srcObject.getTracks().forEach(track => track.stop());
          videoRef.current.remove();
          videoRef.current = null;
        }
        
        if (chunksRef.current.length === 0) {
          console.error('No video data collected');
          alert('No recording data available - please record for at least 1 second before stopping');
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
          return;
        }
        
        const blob = new Blob(chunksRef.current, { type: mimeType });
        console.log('Blob created:', blob.size, 'bytes');
        
        // Save the recording
        const { ipcRenderer } = window.require('electron');
        const outputPath = await ipcRenderer.invoke('show-record-save-dialog');
        if (outputPath) {
          // Convert blob to array buffer and save via IPC
          const arrayBuffer = await blob.arrayBuffer();
          const buffer = Array.from(new Uint8Array(arrayBuffer));
          
          // Save file via IPC
          const success = await ipcRenderer.invoke('save-recorded-video', {
            filePath: outputPath,
            buffer: buffer
          });
          
          if (success) {
            setRecordedFilePath(outputPath);
            
            // Stop all tracks
            if (streamRef.current) {
              streamRef.current.getTracks().forEach(track => track.stop());
              streamRef.current = null;
            }
            
            // Notify parent component
            if (onRecordingComplete) {
              onRecordingComplete(outputPath);
            }
          }
        }
      };

      recorder.onpause = () => {
        console.warn('MediaRecorder paused!');
      };

      recorder.onresume = () => {
        console.log('MediaRecorder resumed');
      };

      // Add state change listener
      recorder.addEventListener('statechange', () => {
        console.log('MediaRecorder state changed to:', recorder.state);
      });

      mediaRecorderRef.current = recorder;
      recorder.start(1000); // Use timeslice of 1000ms to collect data regularly
      console.log('MediaRecorder started:', recorder.state);

      setIsRecording(true);
      setRecordingTime(0);
      startTimer();

      // Handle stop button on system UI
      stream.getVideoTracks()[0].onended = () => {
        stopRecording();
      };
    } catch (error) {
      console.error('Error starting screen recording:', error);
      alert('Failed to start screen recording: ' + error.message);
    }
  };

  const startWebcamRecording = async () => {
    try {
      console.log('Starting webcam recording...');
      
      // Request webcam access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: true
      });

      console.log('Webcam stream obtained:', stream);
      console.log('Video tracks:', stream.getVideoTracks().length);
      console.log('Audio tracks:', stream.getAudioTracks().length);
      
      if (stream.getVideoTracks().length === 0) {
        throw new Error('No video tracks available');
      }

      streamRef.current = stream;

      // Add track listeners to see if tracks are being stopped
      stream.getVideoTracks().forEach(track => {
        track.addEventListener('ended', () => {
          console.error('Video track ended!', track);
        });
        track.addEventListener('mute', () => {
          console.warn('Video track muted!', track);
        });
        track.addEventListener('unmute', () => {
          console.log('Video track unmuted', track);
        });
      });

      stream.getAudioTracks().forEach(track => {
        track.addEventListener('ended', () => {
          console.error('Audio track ended!', track);
        });
      });

      console.log('All tracks:', stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, readyState: t.readyState, muted: t.muted })));
      
      // CRITICAL FIX: Create hidden video element to keep stream alive
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.style.display = 'none';
      document.body.appendChild(video);
      
      // Wait for video to be ready
      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.play();
          console.log('Hidden video element started playing');
          resolve();
        };
      });
      
      // CRITICAL: Capture stream from video element instead of direct stream
      const captureStream = video.captureStream(30); // 30 FPS
      console.log('Capture stream from video:', captureStream);
      console.log('Capture stream active:', captureStream.active);
      
      // Store video reference for cleanup
      videoRef.current = video;
      
      // Use the capture stream for MediaRecorder, keep original stream for cleanup
      const recordingStream = captureStream;

      // Create MediaRecorder - use simplest MIME type for compatibility
      const mimeType = 'video/webm';

      console.log('Using MIME type:', mimeType);
      console.log('MediaRecorder supported types:', [
        'video/webm; codecs=vp9',
        'video/webm; codecs=vp8', 
        'video/webm',
        'video/mp4'
      ].filter(type => MediaRecorder.isTypeSupported(type)));

      // Use captured stream instead of original stream
      const recorder = new MediaRecorder(recordingStream, {
        mimeType: mimeType
      });

      console.log('MediaRecorder created:', recorder);
      console.log('Stream tracks:', stream.getTracks().map(track => ({
        kind: track.kind,
        enabled: track.enabled,
        readyState: track.readyState,
        muted: track.muted
      })));

      // Add error handler
      recorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error);
      };

      recorder.onpause = () => {
        console.warn('MediaRecorder paused!');
      };

      recorder.onresume = () => {
        console.log('MediaRecorder resumed');
      };

      // Add state change listener
      recorder.addEventListener('statechange', () => {
        console.log('MediaRecorder state changed to:', recorder.state);
      });

      recorder.onstart = () => {
        console.log('MediaRecorder started successfully. State:', recorder.state);
        console.log('Stream active after start:', streamRef.current?.active);
        console.log('Tracks after start:', streamRef.current?.getTracks().map(t => ({ kind: t.kind, readyState: t.readyState, enabled: t.enabled })));
      };

      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        console.log('Data available:', event.data.size, 'bytes', 'type:', event.data.type);
        console.log('Recorder state when data available:', recorder.state);
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          console.log('Total chunks:', chunksRef.current.length);
        } else {
          console.warn('Received empty data chunk - this is normal for some recorders');
        }
      };

      recorder.onstop = async () => {
        console.log('Recorder stopped. Chunks collected:', chunksRef.current.length);
        
        // Reset UI state now that recording has stopped
        setIsRecording(false);
        
        // Cleanup hidden video element
        if (videoRef.current) {
          console.log('Cleaning up video element');
          videoRef.current.srcObject.getTracks().forEach(track => track.stop());
          videoRef.current.remove();
          videoRef.current = null;
        }
        
        if (chunksRef.current.length === 0) {
          console.error('No video data collected');
          alert('No recording data available - please record for at least 1 second before stopping');
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
          return;
        }
        
        const blob = new Blob(chunksRef.current, { type: mimeType });
        console.log('Blob created:', blob.size, 'bytes');
        
        // Save the recording
        const { ipcRenderer } = window.require('electron');
        const outputPath = await ipcRenderer.invoke('show-record-save-dialog');
        if (outputPath) {
          // Convert blob to array buffer and save via IPC
          const arrayBuffer = await blob.arrayBuffer();
          const buffer = Array.from(new Uint8Array(arrayBuffer));
          
          // Save file via IPC
          const success = await ipcRenderer.invoke('save-recorded-video', {
            filePath: outputPath,
            buffer: buffer
          });
          
          if (success) {
            setRecordedFilePath(outputPath);
            
            // Stop all tracks
            if (streamRef.current) {
              streamRef.current.getTracks().forEach(track => track.stop());
              streamRef.current = null;
            }
            
            // Notify parent component
            if (onRecordingComplete) {
              onRecordingComplete(outputPath);
            }
          }
        }
      };

      recorder.onpause = () => {
        console.warn('MediaRecorder paused!');
      };

      recorder.onresume = () => {
        console.log('MediaRecorder resumed');
      };

      // Add state change listener
      recorder.addEventListener('statechange', () => {
        console.log('MediaRecorder state changed to:', recorder.state);
      });

      mediaRecorderRef.current = recorder;
      recorder.start(1000);

      setIsRecording(true);
      setRecordingTime(0);
      startTimer();
    } catch (error) {
      console.error('Error starting webcam recording:', error);
      alert('Failed to start webcam recording: ' + error.message);
    }
  };

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  const stopRecording = () => {
    console.log('stopRecording called. isRecording:', isRecording, 'recorder state:', mediaRecorderRef.current?.state);
    if (mediaRecorderRef.current && isRecording) {
      // Don't set isRecording to false yet - wait until recording actually stops
      
      try {
        // Check if recorder is still active before stopping
        if (mediaRecorderRef.current.state === 'recording') {
          console.log('Stopping MediaRecorder...');
          mediaRecorderRef.current.stop();
          console.log('MediaRecorder stop() called');
        } else {
          console.log('MediaRecorder not in recording state:', mediaRecorderRef.current.state);
          setIsRecording(false);
        }
      } catch (error) {
        console.error('Error stopping recorder:', error);
        setIsRecording(false);
      }
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    if (isScreenRecording) {
      startScreenRecording();
    } else {
      startWebcamRecording();
    }
  };

  return (
    <div className="recording-panel">
      <h3>Record</h3>
      
      <div className="recording-options">
        <label>
          <input
            type="radio"
            name="recordingType"
            checked={isScreenRecording}
            onChange={() => setIsScreenRecording(true)}
            disabled={isRecording}
          />
          Screen
        </label>
        <label>
          <input
            type="radio"
            name="recordingType"
            checked={!isScreenRecording}
            onChange={() => setIsScreenRecording(false)}
            disabled={isRecording}
          />
          Webcam
        </label>
      </div>

      <div className="recording-controls">
        {!isRecording ? (
          <button onClick={handleStart} className="record-button">
            Start Recording
          </button>
        ) : (
          <>
            <button 
              onClick={stopRecording} 
              className="stop-button"
              disabled={recordingTime < 1}
            >
              {recordingTime < 1 ? 'Please wait...' : 'Stop Recording'}
            </button>
            <div className="recording-time">
              ⏺ {formatTime(recordingTime)}
            </div>
          </>
        )}
      </div>

      {recordedFilePath && (
        <div className="recording-success">
          ✓ Recording saved: {recordedFilePath}
        </div>
      )}
    </div>
  );
}

export default RecordingPanel;


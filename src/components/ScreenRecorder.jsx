import React, { useState, useRef, useEffect } from 'react';

function ScreenRecorder({ onRecordingComplete }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioSources, setAudioSources] = useState({
    microphone: true,
    systemAudio: false // Optional - can enable if needed
  });
  
  // Screen recording refs
  const screenVideoRef = useRef(null);
  const screenCanvasRef = useRef(null);
  const screenStreamRef = useRef(null);
  const screenFrameRef = useRef(null);
  
  // Canvas for frame capture
  const canvasRef = useRef(null);
  const framesRef = useRef([]);
  
  // Audio refs - MediaRecorder approach
  const microphoneStreamRef = useRef(null);
  const microphoneAudioChunksRef = useRef([]);
  
  const timerRef = useRef(null);
  const recordingActiveRef = useRef(false);
  const frameRef = useRef(null);

  const fetchDesktopSources = async () => {
    // Try IPC handler first (most reliable - already configured in main.js)
    if (typeof window.require === 'function') {
      try {
        const { ipcRenderer } = window.require('electron');
        const sources = await ipcRenderer.invoke('get-desktop-sources');
        if (Array.isArray(sources) && sources.length > 0) {
          console.log(`✅ Found ${sources.length} desktop sources via IPC:`, sources.map(s => ({ id: s.id, name: s.name })));
          return sources;
        }
      } catch (err) {
        console.error('IPC get-desktop-sources failed:', err);
      }
    }

    // Fallback: Direct desktopCapturer call
    if (typeof window.require === 'function') {
      try {
        const { desktopCapturer } = window.require('electron');
        if (desktopCapturer?.getSources) {
          const sources = await desktopCapturer.getSources({
            types: ['screen', 'window'],
            thumbnailSize: { width: 1, height: 1 }
          });
          if (Array.isArray(sources) && sources.length > 0) {
            console.log(`✅ Found ${sources.length} desktop sources via direct call:`, sources.map(s => ({ id: s.id, name: s.name })));
            return sources;
          }
        }
      } catch (err) {
        console.error('desktopCapturer fallback failed:', err);
      }
    }

    throw new Error('No desktop sources found');
  };

  // Force desktopCapturer reset and acquire fresh screen stream
  const resetDesktopCapturer = async () => {
    console.log("NUCLEAR desktopCapturer RESET");

    document.querySelectorAll('video').forEach(video => {
      if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
      }
      video.src = '';
    });

    const sources = await fetchDesktopSources();
    console.log(`📺 Available sources:`, sources.map(s => ({ id: s.id, name: s.name, displayId: s.display_id })));
    
    // Prefer screen sources, but fall back to window sources if no screens available
    const screenSource = sources.find(source => source.id?.startsWith('screen:'));
    if (screenSource) {
      console.log(`✅ Using screen source: ${screenSource.name} (${screenSource.id})`);
      return screenSource.id;
    }
    
    // Fallback to first available source (window or screen)
    if (sources.length > 0) {
      console.log(`⚠️ No screen source found, using first available: ${sources[0].name} (${sources[0].id})`);
      return sources[0].id;
    }
    
    throw new Error('No desktop sources available');
  };

  const getScreenStream = async () => {
    let screenSourceId;
    try {
      screenSourceId = await resetDesktopCapturer();
    } catch (err) {
      console.error("desktopCapturer failed:", err);
      throw err;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: screenSourceId
          }
        }
      });

      console.log("Screen stream acquired with source ID:", screenSourceId);
      return stream;
    } catch (err) {
      console.error("Failed to acquire screen stream:", err);
      throw err;
    }
  };

  const startRecording = async () => {
    try {
      console.log('Starting screen recording...');
      
      const { ipcRenderer } = window.require('electron');
      
      // Get screen stream
      const screenStream = await getScreenStream();
      console.log("✅ Screen acquired");

      // Set up screen video element
      const screenVideo = document.createElement('video');
      screenVideo.srcObject = screenStream;
      screenVideo.autoplay = true;
      screenVideo.playsInline = true;
      screenVideo.style.position = 'absolute';
      screenVideo.style.left = '-9999px';
      document.body.appendChild(screenVideo);
      
      await new Promise((resolve) => {
        screenVideo.onloadedmetadata = () => {
          screenVideo.play();
          resolve();
        };
      });
      
      screenVideoRef.current = screenVideo;
      screenStreamRef.current = screenStream;

      // Set up microphone capture if enabled
      if (audioSources.microphone) {
        const webcamStream = await navigator.mediaDevices.getUserMedia({
          video: false, // No video, just audio
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        
        const audioTracks = webcamStream.getAudioTracks();
        console.log(`🎤 Setting up microphone capture - found ${audioTracks.length} audio track(s)`);
        
        if (audioTracks.length > 0) {
          const audioTrack = audioTracks[0];
          audioTrack.enabled = true;
          
          const audioStream = new MediaStream([audioTrack]);
          const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/webm;codecs=opus';
          
          const audioRecorder = new MediaRecorder(audioStream, { mimeType });
          microphoneAudioChunksRef.current = [];
          
          audioRecorder.ondataavailable = (event) => {
            if (!recordingActiveRef.current) return;
            if (event.data && event.data.size > 0) {
              microphoneAudioChunksRef.current.push(event.data);
              console.log(`🎤 MediaRecorder audio chunk: ${event.data.size} bytes`);
            }
          };
          
          audioRecorder.onerror = (event) => {
            console.error('❌ MediaRecorder error:', event.error);
          };
          
          audioRecorder.onstop = () => {
            console.log(`🎤 MediaRecorder stopped. Total chunks: ${microphoneAudioChunksRef.current.length}`);
          };
          
          audioRecorder.start(1000); // Collect chunks every second
          microphoneStreamRef.current = { recorder: audioRecorder, stream: audioStream };
          console.log(`✅ Microphone capture started`);
        }
      }

      // Set up canvas for frame capture
      const canvas = document.createElement('canvas');
      canvas.width = screenVideo.videoWidth || 1920;
      canvas.height = screenVideo.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      canvasRef.current = canvas;
      framesRef.current = [];

      setIsRecording(true);
      recordingActiveRef.current = true;

      // Start frame capture loop
      const captureFrame = () => {
        if (recordingActiveRef.current && screenVideo.readyState >= 2) {
          ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
          
          canvas.toBlob((blob) => {
            if (blob) {
              framesRef.current.push(blob);
            }
          }, 'image/png');
        }
        
        if (recordingActiveRef.current) {
          frameRef.current = setTimeout(captureFrame, 1000 / 30); // 30 FPS
        }
      };
      
      captureFrame();

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Error starting screen recording:', error);
      alert('Failed to start recording: ' + error.message);
    }
  };

  const stopRecording = async () => {
    console.log("🛑 Stopping screen recording");

    setIsRecording(false);
    recordingActiveRef.current = false;
    
    // Stop frame capture
    if (frameRef.current) {
      clearTimeout(frameRef.current);
      frameRef.current = null;
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    console.log(`Captured ${framesRef.current.length} frames`);

    // Stop microphone MediaRecorder
    if (microphoneStreamRef.current && microphoneStreamRef.current.recorder) {
      const recorder = microphoneStreamRef.current.recorder;
      if (recorder.state === 'recording' || recorder.state === 'paused') {
        recorder.stop();
      }
    }

    // Stop all tracks
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }

    if (microphoneStreamRef.current) {
      if (microphoneStreamRef.current.stream) {
        microphoneStreamRef.current.stream.getTracks().forEach(track => track.stop());
      }
      microphoneStreamRef.current = null;
    }

    // Cleanup video elements
    if (screenVideoRef.current) {
      if (screenVideoRef.current.srcObject) {
        screenVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
        screenVideoRef.current.srcObject = null;
      }
      screenVideoRef.current.remove();
      screenVideoRef.current = null;
    }

    // Don't continue if no frames captured
    if (framesRef.current.length === 0) {
      return;
    }

    // Save frames and convert to video with FFmpeg
    try {
      const { ipcRenderer } = window.require('electron');
      const outputPath = await ipcRenderer.invoke('show-record-save-dialog');
      
      if (outputPath) {
        console.log(`Saving ${framesRef.current.length} frames and converting to video...`);
        
        // Save frames to temp directory
        // Generate sessionId for this recording to track temp directory
        const sessionId = Date.now().toString();
        let savedCount = 0;
        let recordingTempDir = null;
        
        for (let i = 0; i < framesRef.current.length; i++) {
          const frameData = await framesRef.current[i].arrayBuffer();
          const buffer = Array.from(new Uint8Array(frameData));
          const result = await ipcRenderer.invoke('save-frame-to-temp', {
            frameIndex: i,
            frameData: buffer,
            sessionId: sessionId
          });
          if (result && result.framePath) {
            savedCount++;
            // Store tempDir from first frame (all frames use same dir)
            if (!recordingTempDir) {
              recordingTempDir = result.tempDir;
            }
          }
        }
        
        console.log(`Saved ${savedCount} frames to temp directory:`, recordingTempDir);
        
        // Save audio data if available
        let audioFiles = [];
        
        // Save MediaRecorder microphone audio
        if (microphoneAudioChunksRef.current.length > 0) {
          console.log(`🎤 Saving MediaRecorder microphone audio: ${microphoneAudioChunksRef.current.length} WebM chunks`);
          
          const webmBlob = new Blob(microphoneAudioChunksRef.current, { type: 'audio/webm' });
          const tempWebmPath = outputPath.replace('.mp4', '_microphone_temp.webm');
          const micWavPath = outputPath.replace('.mp4', '_microphone.wav');
          
          const arrayBuffer = await webmBlob.arrayBuffer();
          const buffer = Array.from(new Uint8Array(arrayBuffer));
          
          const tempSaveResult = await ipcRenderer.invoke('save-audio-blob', {
            outputPath: tempWebmPath,
            audioData: buffer
          });
          
          if (tempSaveResult.success) {
            const convertResult = await ipcRenderer.invoke('convert-audio-to-wav', {
              inputPath: tempWebmPath,
              outputPath: micWavPath
            });
            
            if (convertResult.success) {
              audioFiles.push(micWavPath);
              console.log(`✅ MediaRecorder microphone converted: ${webmBlob.size} bytes WebM -> WAV`);
            }
          }
        }
        
        // Convert frames to video using FFmpeg (WITH audio embedded)
        console.log(`🎬 Converting ${framesRef.current.length} frames to video with ${audioFiles.length} audio track(s):`, audioFiles);
        
        const result = await ipcRenderer.invoke('convert-frames-to-video', {
          outputPath: outputPath,
          frameRate: 30,
          audioFiles: audioFiles,
          tempDir: recordingTempDir  // Pass tempDir so FFmpeg knows where frames are
        });
        
        if (result.success) {
          console.log(`✅ Video created with embedded audio: ${outputPath}`);
          
          const recordingData = {
            videoPath: result.videoPath || outputPath
          };
          
          alert(`Screen recording saved successfully!\nVideo with embedded audio: ${recordingData.videoPath}`);
          
          if (onRecordingComplete) {
            onRecordingComplete(recordingData);
          }
        } else {
          alert('Failed to convert frames to video');
        }
      }
      
      framesRef.current = [];
    } catch (error) {
      console.error('Error saving screen recording:', error);
    }
  };

  return (
    <div className="screen-recorder">
      <div className="recording-controls">
        <button
          className={`btn ${isRecording ? 'btn-danger' : 'btn-primary'}`}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={false}
        >
          {isRecording ? '⏹ Stop Recording' : '🔴 Start Screen Recording'}
        </button>
        
        {isRecording && (
          <div className="recording-timer">
            Recording: {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
          </div>
        )}
      </div>
      
      <div className="audio-options" style={{ marginTop: '20px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={audioSources.microphone}
            onChange={(e) => setAudioSources(prev => ({ ...prev, microphone: e.target.checked }))}
            disabled={isRecording}
          />
          <span>🎤 Microphone</span>
        </label>
      </div>
      
      {isRecording && (
        <div className="recording-preview" style={{ marginTop: '20px', padding: '10px', background: '#222', borderRadius: '4px' }}>
          <p style={{ color: '#0f0', margin: 0 }}>🔴 Recording screen...</p>
          <p style={{ color: '#aaa', fontSize: '12px', margin: '5px 0 0 0' }}>
            {audioSources.microphone ? 'With microphone audio' : 'No audio'}
          </p>
        </div>
      )}
    </div>
  );
}

export default ScreenRecorder;


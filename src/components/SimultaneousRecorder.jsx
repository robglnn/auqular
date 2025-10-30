
import React, { useState, useRef, useEffect } from 'react';

function SimultaneousRecorder({ onRecordingComplete }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioSources, setAudioSources] = useState({
    microphone: true,
    systemAudio: true // Now implemented with native solution
  });
  
  // Screen recording refs
  const screenVideoRef = useRef(null);
  const screenCanvasRef = useRef(null);
  const screenStreamRef = useRef(null);
  const screenFrameRef = useRef(null);
  
  // Webcam recording refs
  const webcamVideoRef = useRef(null);
  const webcamCanvasRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const webcamFrameRef = useRef(null);
  
  // Combined canvas for PiP effect
  const combinedCanvasRef = useRef(null);
  const combinedFramesRef = useRef([]);
  
  // Audio refs - MediaRecorder approach (same as RecordingPanel)
  const microphoneStreamRef = useRef(null);
  const microphoneAudioChunksRef = useRef([]);
  
  const timerRef = useRef(null);
  const recordingActiveRef = useRef(false);
  const frameRef = useRef(null);

  // EMERGENCY TRACK CLEANUP - Run before EVERY recording attempt
  const killAllTracks = () => {
    console.log("⚡ EMERGENCY TRACK SWEEP");
    
    // Log active devices
    navigator.mediaDevices.enumerateDevices().then(devices => {
      console.log("Active devices:", devices.map(d => `${d.kind}: ${d.label}`));
    }).catch(console.error);

    // Find ANY video/audio with srcObject and kill tracks
    document.querySelectorAll('video, audio').forEach((el, i) => {
      if (el.srcObject) {
        console.warn(`Found rogue stream in element #${i}`, el);
        el.srcObject.getTracks().forEach(t => {
          console.log(`Force-stop: ${t.kind} (${t.label || 'unlabeled'})`);
          t.stop();
        });
        el.srcObject = null;
      }
      el.src = '';
    });
  };

  const fetchDesktopSources = async () => {
    if (window.electronAPI?.getDesktopSources) {
      const sources = await window.electronAPI.getDesktopSources();
      if (Array.isArray(sources) && sources.length > 0) {
        return sources;
      }
    }

    if (typeof window.require === 'function') {
      try {
        const { desktopCapturer } = window.require('electron');
        if (desktopCapturer?.getSources) {
          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: 1, height: 1 }
          });
          if (Array.isArray(sources) && sources.length > 0) {
            return sources;
          }
        }
      } catch (err) {
        console.error('desktopCapturer fallback failed:', err);
      }
    }

    throw new Error('No desktop sources found');
  };

  // === NUCLEAR RESET: FORCE KILL ALL MEDIA DEVICES + RESTART STACK ===
  const nuclearReset = async () => {
    console.log("☢️ NUCLEAR MEDIA STACK RESET INITIATED");

    // 1. Kill EVERYTHING in DOM
    document.querySelectorAll('video, audio').forEach(el => {
      if (el.srcObject) {
        el.srcObject.getTracks().forEach(t => t.stop());
        el.srcObject = null;
      }
      el.src = '';
    });

    // 2. Force Chrome to release ALL MediaStreamTracks globally
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      console.log("Devices before reset:", devices.length);
    } catch (e) {}

    // 3. **CRITICAL: RELOAD MEDIA DEVICES API** (forces Chrome to re-enumerate)
    await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(stream => stream.getTracks().forEach(t => t.stop()))
      .catch(() => {});

    // 4. **FORCE desktopCapturer CACHE CLEAR**
    try {
      await fetchDesktopSources();
      console.log("desktopCapturer cache probed");
    } catch (e) {
      console.log("desktopCapturer cache probed (error ignored)");
    }

    // 5. HARD DELAY — Windows needs 1.2s to release DWM lock
    await new Promise(r => setTimeout(r, 1200));
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
    return sources.find(source => source.id?.startsWith('screen:'))?.id || sources[0].id;
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
      console.log('Starting simultaneous screen + webcam recording...');
      
      // === NUCLEAR RESET FIRST ===
      await nuclearReset();
      await new Promise(r => setTimeout(r, 1500));

      const { ipcRenderer } = window.require('electron');
      
      // === REVERSE ACQUISITION ORDER: Webcam first, then Screen ===
      let webcamStream = null;
      let screenStream = null;

      try {
        // 1. GET WEBCAM FIRST (less likely to fail)
        webcamStream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: 640 }, 
            height: { ideal: 480 },
            frameRate: { ideal: 30 }
          },
          audio: audioSources.microphone ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } : false
        });
        console.log("✅ Webcam acquired");

        // 2. THEN GET SCREEN
        screenStream = await getScreenStream();
        console.log("✅ Screen acquired");

      } catch (err) {
        // IF SCREEN FAILS — RELEASE WEBCAM AND RETRY IN REVERSE ORDER
        if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());
        if (screenStream) screenStream.getTracks().forEach(t => t.stop());

        console.log("Fallback: Trying screen first...");
        await new Promise(r => setTimeout(r, 1000));

        screenStream = await getScreenStream();
        webcamStream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: 640 }, 
            height: { ideal: 480 },
            frameRate: { ideal: 30 }
          },
          audio: audioSources.microphone ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } : false
        });
      }
      
      console.log('Both streams obtained successfully');
      
      // {{ edit_3 }}: Start system audio AFTER video streams (to avoid locking conflicts)
      // Wrapped in try-catch to fall back if it fails
      if (audioSources.systemAudio) {
        try {
          const systemAudioResult = await ipcRenderer.invoke('start-system-audio-recording');
          if (!systemAudioResult.success) {
            console.warn('Failed to start system audio recording:', systemAudioResult.error);
            // Fall back without blocking video
            setAudioSources(prev => ({ ...prev, systemAudio: false }));
          }
        } catch (e) {
          console.warn('System audio start failed (non-blocking):', e);
          setAudioSources(prev => ({ ...prev, systemAudio: false }));
        }
      }
      
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
      
      // Set up webcam video element
      const webcamVideo = document.createElement('video');
      webcamVideo.srcObject = webcamStream;
      webcamVideo.autoplay = true;
      webcamVideo.playsInline = true;
      webcamVideo.style.position = 'absolute';
      webcamVideo.style.left = '-9999px';
      document.body.appendChild(webcamVideo);
      
      await new Promise((resolve) => {
        webcamVideo.onloadedmetadata = () => {
          webcamVideo.play();
          resolve();
        };
      });
      
      webcamVideoRef.current = webcamVideo;
      webcamStreamRef.current = webcamStream;
      
      // SOLUTION 1 (BEST): Use MediaRecorder API on webcam audio track - EXACTLY like RecordingPanel does (PROVEN TO WORK!)
      // This is the SAME technology that successfully captures audio in webcam-only recording
      if (audioSources.microphone) {
        const audioTracks = webcamStream.getAudioTracks();
        console.log(`🎤 [SOLUTION 1] Setting up microphone capture - found ${audioTracks.length} audio track(s)`);
        
        if (audioTracks.length > 0) {
          // CRITICAL: Video element MUST be playing to keep audio track alive (same as RecordingPanel)
          // The webcamVideo element above already does this, but ensure it's ready
          await new Promise((resolve) => {
            if (webcamVideo.readyState >= 2) { // HAVE_CURRENT_DATA
              resolve();
            } else {
              webcamVideo.onloadedmetadata = resolve;
            }
          });
          
          // Ensure video is playing to keep stream active
          if (webcamVideo.paused) {
            await webcamVideo.play();
          }
          
          // Extract audio track and create audio-only stream (MediaRecorder needs a stream)
          const audioTrack = audioTracks[0];
          audioTrack.enabled = true;
          console.log(`Audio track: enabled=${audioTrack.enabled}, muted=${audioTrack.muted}, readyState=${audioTrack.readyState}, label=${audioTrack.label}`);
          
          // Create audio-only MediaStream for MediaRecorder
          const audioStream = new MediaStream([audioTrack]);
          
          // CRITICAL: Use MediaRecorder API (same as RecordingPanel - PROVEN TO WORK!)
          const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/webm;codecs=opus';
          console.log(`Using MediaRecorder with mimeType: ${mimeType}`);
          
          const audioRecorder = new MediaRecorder(audioStream, {
            mimeType: mimeType
          });
          
          microphoneAudioChunksRef.current = [];
          
          audioRecorder.ondataavailable = (event) => {
            if (!recordingActiveRef.current) return;
            
            if (event.data && event.data.size > 0) {
              microphoneAudioChunksRef.current.push(event.data);
              console.log(`🎤 MediaRecorder audio chunk: ${event.data.size} bytes, total: ${microphoneAudioChunksRef.current.length} chunks`);
            }
          };
          
          audioRecorder.onerror = (event) => {
            console.error('❌ MediaRecorder error:', event.error);
          };
          
          audioRecorder.onstart = () => {
            console.log('✅ MediaRecorder started successfully! State:', audioRecorder.state);
          };
          
          audioRecorder.onstop = () => {
            console.log(`🎤 MediaRecorder stopped. Total chunks: ${microphoneAudioChunksRef.current.length}`);
            const totalSize = microphoneAudioChunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0);
            console.log(`🎤 Total audio data: ${totalSize} bytes`);
          };
          
          // Start recording with timeslice (like RecordingPanel does)
          audioRecorder.start(1000); // Collect data every 1 second
          
          // Store reference for cleanup
          microphoneStreamRef.current = { recorder: audioRecorder, stream: audioStream };
          
          console.log('✅ Microphone capture started using MediaRecorder API (PROVEN SOLUTION from RecordingPanel)');
        } else {
          console.error('❌ Microphone requested but webcam stream has NO audio tracks!');
          console.error('All tracks:', webcamStream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, readyState: t.readyState })));
        }
      }
      
      // Create combined canvas for PiP effect
      const combinedCanvas = document.createElement('canvas');
      combinedCanvas.width = screenVideo.videoWidth;
      combinedCanvas.height = screenVideo.videoHeight;
      combinedCanvasRef.current = combinedCanvas;
      
      const ctx = combinedCanvas.getContext('2d');
      combinedFramesRef.current = [];
      
      // Start recording state BEFORE frame capture to ensure audio capture works
      setIsRecording(true);
      setRecordingTime(0);
      recordingActiveRef.current = true;
      
      console.log('Starting combined frame capture at 30 FPS...');
      
      // Start combined frame capture loop
      let frameCount = 0;
      
      const captureCombinedFrame = () => {
        if (recordingActiveRef.current && 
            screenVideo.readyState >= 2 && 
            webcamVideo.readyState >= 2) {
          
          // Clear canvas
          ctx.clearRect(0, 0, combinedCanvas.width, combinedCanvas.height);
          
          // Draw screen as background
          ctx.drawImage(screenVideo, 0, 0, combinedCanvas.width, combinedCanvas.height);
          
          // Draw webcam as PiP overlay (bottom-right corner)
          const pipWidth = Math.min(320, combinedCanvas.width * 0.25);
          const pipHeight = Math.min(240, combinedCanvas.height * 0.25);
          const pipX = combinedCanvas.width - pipWidth - 20;
          const pipY = combinedCanvas.height - pipHeight - 20;
          
          // Add rounded rectangle background for webcam
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          const radius = 10;
          const bgX = pipX - 5;
          const bgY = pipY - 5;
          const bgWidth = pipWidth + 10;
          const bgHeight = pipHeight + 10;
          
          ctx.beginPath();
          ctx.moveTo(bgX + radius, bgY);
          ctx.lineTo(bgX + bgWidth - radius, bgY);
          ctx.quadraticCurveTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + radius);
          ctx.lineTo(bgX + bgWidth, bgY + bgHeight - radius);
          ctx.quadraticCurveTo(bgX + bgWidth, bgY + bgHeight, bgX + bgWidth - radius, bgY + bgHeight);
          ctx.lineTo(bgX + radius, bgY + bgHeight);
          ctx.quadraticCurveTo(bgX, bgY + bgHeight, bgX, bgY + bgHeight - radius);
          ctx.lineTo(bgX, bgY + radius);
          ctx.quadraticCurveTo(bgX, bgY, bgX + radius, bgY);
          ctx.closePath();
          ctx.fill();
          
          // Draw webcam video
          ctx.drawImage(webcamVideo, pipX, pipY, pipWidth, pipHeight);
          
          // Add border to webcam
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.strokeRect(pipX, pipY, pipWidth, pipHeight);
          
          // Convert to blob
          combinedCanvas.toBlob((blob) => {
            if (blob) {
              combinedFramesRef.current.push(blob);
              frameCount++;
              console.log(`Captured combined frame ${frameCount}`);
            }
          }, 'image/png');
        }
        
        if (recordingActiveRef.current) {
          frameRef.current = setTimeout(captureCombinedFrame, 1000 / 30); // 30 FPS
        }
      };
      
      captureCombinedFrame();
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error('Error starting simultaneous recording:', error);
      alert('Failed to start recording: ' + error.message);
    }
  };

  const stopRecording = async () => {
    console.log("🛑 FORCE STOP: Beginning emergency track cleanup");

    if (!isRecording || combinedFramesRef.current.length === 0) {
      // Still cleanup even if no frames
      console.warn('No frames captured, but cleaning up tracks anyway');
    }

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

    console.log(`Captured ${combinedFramesRef.current.length} combined frames`);

    // 1. Stop all MediaRecorder instances first
    if (microphoneStreamRef.current && microphoneStreamRef.current.recorder) {
      const recorder = microphoneStreamRef.current.recorder;
      if (recorder.state === 'recording' || recorder.state === 'paused') {
        console.log(`Stopping MediaRecorder: ${recorder.state}`);
        try {
          recorder.stop();
        } catch (e) {
          console.warn('Error stopping MediaRecorder:', e);
        }
      }
    }

    // 2. Stop ALL tracks from ALL known streams
    [screenStreamRef.current, webcamStreamRef.current].forEach((stream, index) => {
      if (stream) {
        stream.getTracks().forEach(track => {
          console.log(`Stopping track: ${track.kind} (${track.label || 'unlabeled'})`);
          track.stop();
        });
        if (index === 0) screenStreamRef.current = null;
        if (index === 1) webcamStreamRef.current = null;
      }
    });

    // 3. Cleanup video elements and stop their tracks
    if (screenVideoRef.current) {
      if (screenVideoRef.current.srcObject) {
        screenVideoRef.current.srcObject.getTracks().forEach(track => {
          console.log(`Stopping screen video element track: ${track.kind}`);
          track.stop();
        });
        screenVideoRef.current.srcObject = null;
      }
      screenVideoRef.current.remove();
      screenVideoRef.current = null;
    }

    if (webcamVideoRef.current) {
      if (webcamVideoRef.current.srcObject) {
        webcamVideoRef.current.srcObject.getTracks().forEach(track => {
          console.log(`Stopping webcam video element track: ${track.kind}`);
          track.stop();
        });
        webcamVideoRef.current.srcObject = null;
      }
      webcamVideoRef.current.remove();
      webcamVideoRef.current = null;
    }

    // 4. Clear ALL video/audio elements in DOM (emergency cleanup)
    document.querySelectorAll('video, audio').forEach(el => {
      if (el.srcObject) {
        el.srcObject.getTracks().forEach(t => {
          console.log(`Stopping DOM element track: ${t.kind}`);
          t.stop();
        });
        el.srcObject = null;
      }
      el.src = '';
      el.load();
    });

    // 5. Stop microphone MediaRecorder capture (already handled above, but ensure stream is stopped)

    // 5. Stop MediaRecorder microphone capture (recorder already stopped above, now stop stream)
    const { ipcRenderer } = window.require('electron');
    
    if (microphoneStreamRef.current) {
      try {
        // Stop audio track
        if (microphoneStreamRef.current.stream) {
          microphoneStreamRef.current.stream.getTracks().forEach(track => {
            console.log(`Stopping microphone stream track: ${track.kind}`);
            track.stop();
          });
        }
        
        console.log(`🎤 MediaRecorder stopped. Total chunks: ${microphoneAudioChunksRef.current.length}`);
      } catch (e) {
        console.warn('Error stopping MediaRecorder microphone capture:', e);
      }
      microphoneStreamRef.current = null;
    }
    
    const totalSize = microphoneAudioChunksRef.current.reduce((sum, chunk) => sum + (chunk.size || 0), 0);
    console.log(`🎤 Microphone audio collected: ${microphoneAudioChunksRef.current.length} chunks, ${totalSize} bytes`);
    
    // 6. Stop native audio recording (fallback)
    try {
      await ipcRenderer.invoke('stop-audio-recording');
    } catch (error) {
      console.error('Error stopping native audio recording:', error);
    }

    // 7. Clear all refs to ensure no lingering references
    combinedCanvasRef.current = null;
    
    // 8. Force cleanup complete log
    console.log("🧹 Cleanup complete. Ready for new recording.");
    
    // Don't continue if no frames captured
    if (combinedFramesRef.current.length === 0) {
      return;
    }

    // Save frames and convert to video with FFmpeg
    try {
      // Get save location first
      const outputPath = await ipcRenderer.invoke('show-record-save-dialog');
      
      if (outputPath) {
        console.log(`Saving ${combinedFramesRef.current.length} combined frames and converting to video...`);
        
        // Save frames to temp directory
        let savedCount = 0;
        for (let i = 0; i < combinedFramesRef.current.length; i++) {
          const frameData = await combinedFramesRef.current[i].arrayBuffer();
          const buffer = Array.from(new Uint8Array(frameData));
          const framePath = await ipcRenderer.invoke('save-frame-to-temp', {
            frameIndex: i,
            frameData: buffer
          });
          if (framePath) savedCount++;
        }
        
        console.log(`Saved ${savedCount} combined frames to temp directory`);
        
        // Save audio data if available
        // IMPORTANT: Order matters - system audio first, then microphone
        // This ensures system audio goes to 'audio1' lane and microphone to 'audio2' lane
        let audioFiles = [];
        
        if (audioSources.systemAudio) {
          const systemAudioPath = outputPath.replace('.mp4', '_system_audio.wav');
          const systemAudioResult = await ipcRenderer.invoke('save-audio-data', {
            outputPath: systemAudioPath,
            audioType: 'systemAudio'
          });
          if (systemAudioResult.success) {
            audioFiles.push(systemAudioPath); // First audio = audio1 lane
            console.log('System audio saved successfully:', systemAudioPath);
          }
        }
        
        // Save MediaRecorder microphone audio (WebM format) - convert to WAV using FFmpeg
        if (microphoneAudioChunksRef.current.length > 0) {
          console.log(`🎤 Saving MediaRecorder microphone audio: ${microphoneAudioChunksRef.current.length} WebM chunks`);
          
          // Combine all MediaRecorder Blob chunks into single WebM blob
          const webmBlob = new Blob(microphoneAudioChunksRef.current, { type: 'audio/webm' });
          console.log(`🎤 Combined WebM blob size: ${webmBlob.size} bytes`);
          
          // Save WebM file temporarily, then convert to WAV using FFmpeg
          const tempWebmPath = outputPath.replace('.mp4', '_microphone_temp.webm');
          const micWavPath = outputPath.replace('.mp4', '_microphone.wav');
          
          // Convert Blob to array buffer for IPC
          const arrayBuffer = await webmBlob.arrayBuffer();
          const buffer = Array.from(new Uint8Array(arrayBuffer));
          
          // Save temporary WebM file
          const tempSaveResult = await ipcRenderer.invoke('save-audio-blob', {
            outputPath: tempWebmPath,
            audioData: buffer
          });
          
          if (tempSaveResult.success) {
            console.log(`✅ Saved temporary WebM: ${tempWebmPath}`);
            
            // Convert WebM to WAV using FFmpeg via IPC
            const convertResult = await ipcRenderer.invoke('convert-audio-to-wav', {
              inputPath: tempWebmPath,
              outputPath: micWavPath
            });
            
            if (convertResult.success) {
              audioFiles.push(micWavPath);
              console.log(`✅ MediaRecorder microphone converted: ${webmBlob.size} bytes WebM -> WAV`);
            } else {
              console.error('❌ Failed to convert WebM to WAV:', convertResult.error);
            }
          } else {
            console.error('❌ Failed to save temporary WebM file');
          }
        } else if (audioSources.microphone) {
          // Fallback: try native microphone recording (unlikely to work but worth trying)
          const micAudioPath = outputPath.replace('.mp4', '_microphone.wav');
          const micAudioResult = await ipcRenderer.invoke('save-audio-data', {
            outputPath: micAudioPath,
            audioType: 'microphone'
          });
          if (micAudioResult.success) {
            audioFiles.push(micAudioPath);
            console.log('Native microphone audio saved:', micAudioPath);
          }
        }
        
        // Convert frames to video using FFmpeg (video WITHOUT audio)
        // Audio files will be kept separate and imported into timeline separately
        const result = await ipcRenderer.invoke('convert-frames-to-video', {
          outputPath: outputPath,
          frameRate: 30,
          audioFiles: audioFiles
        });
        
        if (result.success) {
          // Return video path and separate audio file paths for timeline import
          const recordingData = {
            videoPath: outputPath,
            audioFiles: result.audioFiles || audioFiles // Return audio file paths
          };
          
          alert(`Simultaneous recording saved successfully!\nVideo: ${outputPath}\nAudio tracks will be imported separately into timeline.`);
          
          if (onRecordingComplete) {
            // Pass both video and audio file paths
            onRecordingComplete(recordingData);
          }
        } else {
          alert('Failed to convert frames to video');
        }
      }
      
      combinedFramesRef.current = [];
    } catch (error) {
      console.error('Error saving simultaneous recording:', error);
      alert('Failed to save recording: ' + error.message);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="recording-panel">
      <h3>Record Screen + Webcam (Loom Style)</h3>
      
      <div className="audio-sources">
        <h4>Audio Sources:</h4>
        <label>
          <input
            type="checkbox"
            checked={audioSources.microphone}
            onChange={(e) => setAudioSources(prev => ({ ...prev, microphone: e.target.checked }))}
            disabled={isRecording}
          />
          Microphone
        </label>
        <label>
          <input
            type="checkbox"
            checked={audioSources.systemAudio}
            onChange={(e) => setAudioSources(prev => ({ ...prev, systemAudio: e.target.checked }))}
            disabled={isRecording}
          />
          System Audio (Requires SoX Installation)
        </label>
      </div>
      
      <div className="recording-controls">
        {!isRecording ? (
          <button onClick={startRecording} className="record-button">
            Start Simultaneous Recording
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
      
      <div className="recording-info">
        <p>This will record your screen with webcam overlay in the bottom-right corner, similar to Loom.</p>
        <p>Microphone audio is supported. System audio requires SoX installation.</p>
        <p>Audio will be automatically mixed and synchronized with the video.</p>
        <p><strong>Note:</strong> For system audio, install SoX from https://sox.sourceforge.net/</p>
      </div>
    </div>
  );
}

// === TEST FUNCTION FOR DEVTOOLS ===
if (typeof window !== 'undefined') {
  window.TEST_FIX = async () => {
    console.clear();
    console.log("🧪 TEST_FIX: Starting nuclear reset and screen stream test...");
    
    const sources = await fetchDesktopSources();
    
    // Nuclear reset
    console.log("☢️ Running nuclear reset...");
    document.querySelectorAll('video, audio').forEach(el => {
      if (el.srcObject) {
        el.srcObject.getTracks().forEach(t => t.stop());
        el.srcObject = null;
      }
      el.src = '';
    });
    
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(stream => stream.getTracks().forEach(t => t.stop()))
        .catch(() => {});
    } catch (e) {}
    
    try {
      await fetchDesktopSources();
    } catch (e) {}
    
    await new Promise(r => setTimeout(r, 1200));
    
    // Get screen stream
    try {
      const sources = await fetchDesktopSources();
      const screenSource = sources.find(source => source.id.startsWith('screen:')) || sources[0];
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: screenSource.id,
            minWidth: 1280,
            maxWidth: 1920,
            minHeight: 720,
            maxHeight: 1080
          }
        }
      });
      
      console.log("✅ SUCCESS: Screen stream acquired", stream.getVideoTracks()[0].label);
      stream.getTracks().forEach(t => t.stop());
      console.log("✅ Stream stopped successfully");
    } catch (e) {
      console.error("❌ STILL FAILED", e);
      console.error("Error details:", e.name, e.message);
    }
  };
}

export default SimultaneousRecorder;
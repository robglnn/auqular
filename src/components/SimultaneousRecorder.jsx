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
  
  // Audio refs
  const audioContextRef = useRef(null);
  const microphoneStreamRef = useRef(null);
  const audioDataRef = useRef([]);
  
  const timerRef = useRef(null);
  const recordingActiveRef = useRef(false);
  const frameRef = useRef(null);

  const startRecording = async () => {
    try {
      console.log('Starting simultaneous screen + webcam recording...');
      
      const { ipcRenderer } = window.require('electron');
      
      // Start native audio recording if enabled
      if (audioSources.systemAudio) {
        const systemAudioResult = await ipcRenderer.invoke('start-system-audio-recording');
        if (!systemAudioResult.success) {
          console.warn('Failed to start system audio recording:', systemAudioResult.error);
          alert('System audio recording is not available. Please install SoX or use microphone only.\n\nContinuing with microphone audio only.');
          // Disable system audio for this session
          setAudioSources(prev => ({ ...prev, systemAudio: false }));
        }
      }
      
      if (audioSources.microphone) {
        const micResult = await ipcRenderer.invoke('start-microphone-recording');
        if (!micResult.success) {
          console.warn('Failed to start microphone recording:', micResult.error);
          alert('Warning: Microphone recording failed. Continuing with video only.');
        }
      }
      
      // Get desktop sources for screen recording
      const sources = await ipcRenderer.invoke('get-desktop-sources');
      const screenSource = sources.find(source => source.id.startsWith('screen:'));
      
      if (!screenSource) {
        throw new Error('No screen found. Please ensure desktop is available.');
      }
      
      // Start screen capture
      const screenStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: screenSource.id,
            minWidth: 1920,
            minHeight: 1080
          }
        }
      });
      
      // Start webcam capture (without audio since we're using native recording)
      const webcamStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 }
        },
        audio: false // Use native audio recording instead
      });
      
      console.log('Both streams obtained successfully');
      
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
      
      // Create combined canvas for PiP effect
      const combinedCanvas = document.createElement('canvas');
      combinedCanvas.width = screenVideo.videoWidth;
      combinedCanvas.height = screenVideo.videoHeight;
      combinedCanvasRef.current = combinedCanvas;
      
      const ctx = combinedCanvas.getContext('2d');
      combinedFramesRef.current = [];
      
      // Audio recording is now handled natively via IPC
      
      console.log('Starting combined frame capture at 30 FPS...');
      setIsRecording(true);
      setRecordingTime(0);
      recordingActiveRef.current = true;
      
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
    if (!isRecording || combinedFramesRef.current.length === 0) {
      alert('No frames captured');
      return;
    }

    setIsRecording(false);
    recordingActiveRef.current = false;
    
    // Stop frame capture
    if (frameRef.current) {
      clearTimeout(frameRef.current);
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    console.log(`Captured ${combinedFramesRef.current.length} combined frames`);

    // Cleanup video elements
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
      screenVideoRef.current.remove();
      screenVideoRef.current = null;
    }

    if (webcamVideoRef.current) {
      webcamVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
      webcamVideoRef.current.remove();
      webcamVideoRef.current = null;
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }

    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach(track => track.stop());
      webcamStreamRef.current = null;
    }

    // Stop native audio recording
    try {
      const { ipcRenderer } = window.require('electron');
      await ipcRenderer.invoke('stop-audio-recording');
    } catch (error) {
      console.error('Error stopping audio recording:', error);
    }

    // Save frames and convert to video with FFmpeg
    try {
      const { ipcRenderer } = window.require('electron');
      
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
        let audioFiles = [];
        if (audioSources.systemAudio) {
          const systemAudioPath = outputPath.replace('.mp4', '_system_audio.wav');
          const systemAudioResult = await ipcRenderer.invoke('save-audio-data', {
            outputPath: systemAudioPath,
            audioType: 'systemAudio'
          });
          if (systemAudioResult.success) {
            audioFiles.push(systemAudioPath);
            console.log('System audio saved successfully');
          }
        }
        
        if (audioSources.microphone) {
          const micAudioPath = outputPath.replace('.mp4', '_microphone.wav');
          const micAudioResult = await ipcRenderer.invoke('save-audio-data', {
            outputPath: micAudioPath,
            audioType: 'microphone'
          });
          if (micAudioResult.success) {
            audioFiles.push(micAudioPath);
            console.log('Microphone audio saved successfully');
          }
        }
        
        // Convert frames to video using FFmpeg
        const result = await ipcRenderer.invoke('convert-frames-to-video', {
          outputPath: outputPath,
          frameRate: 30,
          audioFiles: audioFiles
        });
        
        if (result.success) {
          alert(`Simultaneous recording saved successfully to: ${outputPath}`);
          
          if (onRecordingComplete) {
            onRecordingComplete(outputPath);
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

export default SimultaneousRecorder;

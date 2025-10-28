import React, { useState, useRef, useEffect } from 'react';

function WebcamRecorder({ onRecordingComplete }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const timerRef = useRef(null);
  const framesRef = useRef([]);
  const recordingActiveRef = useRef(false);

  const startRecording = async () => {
    try {
      console.log('Starting canvas-based webcam recording...');
      
      // Get webcam stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: true
      });

      console.log('Webcam stream obtained:', stream);
      streamRef.current = stream;

      // Set up video element
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      document.body.appendChild(video);
      
      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.play();
          resolve();
        };
      });

      videoRef.current = video;

      // Create canvas for frame capture
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvasRef.current = canvas;
      
      const ctx = canvas.getContext('2d');
      framesRef.current = [];

      console.log('Starting frame capture at 30 FPS...');
      setIsRecording(true);
      setRecordingTime(0);

      // Start frame capture loop
      let frameCount = 0;
      recordingActiveRef.current = true; // Use ref instead of state
      
      const captureFrame = () => {
        if (recordingActiveRef.current && video.readyState >= 2) {
          // Draw current frame to canvas
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Convert to blob
          canvas.toBlob((blob) => {
            if (blob) {
              framesRef.current.push(blob);
              frameCount++;
              console.log(`Captured frame ${frameCount}`);
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
      console.error('Error starting canvas recording:', error);
      alert('Failed to start webcam recording: ' + error.message);
    }
  };

  const stopRecording = async () => {
    if (!isRecording || framesRef.current.length === 0) {
      alert('No frames captured');
      return;
    }

    setIsRecording(false);
    recordingActiveRef.current = false; // Stop the frame capture loop
    
    // Stop frame capture
    if (frameRef.current) {
      clearTimeout(frameRef.current);
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    console.log(`Captured ${framesRef.current.length} frames`);

    // Cleanup video
    if (videoRef.current) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.remove();
      videoRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Save frames and convert to video with FFmpeg
    try {
      const { ipcRenderer } = window.require('electron');
      
      // Get save location first
      const outputPath = await ipcRenderer.invoke('show-record-save-dialog');
      
      if (outputPath) {
        console.log(`Saving ${framesRef.current.length} frames and converting to video...`);
        
        // Save frames to temp directory
        let savedCount = 0;
        for (let i = 0; i < framesRef.current.length; i++) {
          const frameData = await framesRef.current[i].arrayBuffer();
          const buffer = Array.from(new Uint8Array(frameData));
          const framePath = await ipcRenderer.invoke('save-frame-to-temp', {
            frameIndex: i,
            frameData: buffer
          });
          if (framePath) savedCount++;
        }
        
        console.log(`Saved ${savedCount} frames to temp directory`);
        
        // Convert frames to video using FFmpeg
        const result = await ipcRenderer.invoke('convert-frames-to-video', {
          outputPath: outputPath,
          frameRate: 30
        });
        
        if (result.success) {
          alert(`Recording saved successfully to: ${outputPath}`);
          
          if (onRecordingComplete) {
            onRecordingComplete(outputPath);
          }
        } else {
          alert('Failed to convert frames to video');
        }
      }
      
      framesRef.current = [];
    } catch (error) {
      console.error('Error saving recording:', error);
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
      <h3>Record Webcam</h3>
      
      <div className="recording-controls">
        {!isRecording ? (
          <button onClick={startRecording} className="record-button">
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
    </div>
  );
}

export default WebcamRecorder;

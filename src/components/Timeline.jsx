import React, { useState, useRef } from 'react';
import { Stage, Layer, Rect, Group, Text, Line } from 'react-konva';

const PIXELS_PER_SECOND = 50; // Timeline scale

function Timeline({ clips, setClips, currentClip, setCurrentClip, playheadPosition, onSeek }) {
  const [dragState, setDragState] = useState(null);
  const stageRef = useRef(null);

  const handleClipClick = (clip) => {
    setCurrentClip(clip);
  };

  const handleClipDrag = (clipId, newX) => {
    setClips(clips.map(clip => {
      if (clip.id === clipId) {
        const newPosition = Math.max(0, newX / PIXELS_PER_SECOND);
        return { ...clip, position: newPosition };
      }
      return clip;
    }));
  };

  const handleTrimStart = (clipId, newStart) => {
    setClips(clips.map(clip => {
      if (clip.id === clipId) {
        const startTime = Math.max(0, newStart / PIXELS_PER_SECOND);
        return { ...clip, trimStart: startTime };
      }
      return clip;
    }));
  };

  const handleTrimEnd = (clipId, newEnd) => {
    setClips(clips.map(clip => {
      if (clip.id === clipId) {
        const endTime = Math.min(clip.duration, newEnd / PIXELS_PER_SECOND);
        return { ...clip, trimEnd: endTime };
      }
      return clip;
    }));
  };

  const getClipProps = (clip) => {
    const x = clip.position * PIXELS_PER_SECOND;
    const width = (clip.trimEnd - clip.trimStart) * PIXELS_PER_SECOND;
    return { x, width };
  };

  const handleStageClick = (e) => {
    // Clicking on empty timeline seeks to that position
    const stage = stageRef.current;
    const pointerPos = stage.getPointerPosition();
    const timelinePosition = pointerPos.x / PIXELS_PER_SECOND;
    onSeek(timelinePosition);
  };

  return (
    <div className="timeline-container">
      <div className="info-panel">
        <div className="info-row">
          <span className="info-label">Clips: </span>
          <span className="info-value">{clips.length}</span>
        </div>
        {currentClip && (
          <>
            <div className="info-row">
              <span className="info-label">Duration: </span>
              <span className="info-value">{currentClip.duration.toFixed(2)}s</span>
            </div>
            <div className="info-row">
              <span className="info-label">Trim: </span>
              <span className="info-value">
                {currentClip.trimStart.toFixed(2)}s - {currentClip.trimEnd.toFixed(2)}s
              </span>
            </div>
          </>
        )}
      </div>
      <Stage
        ref={stageRef}
        width={Math.max(800, clips.reduce((max, clip) => {
          const { x, width } = getClipProps(clip);
          return Math.max(max, x + width);
        }, 0) + 200)}
        height={200}
        onClick={handleStageClick}
        style={{ cursor: 'default' }}
      >
        <Layer>
          {/* Grid lines */}
          {[...Array(40)].map((_, i) => (
            <Line
              key={i}
              points={[i * 50, 0, i * 50, 200]}
              stroke="#333"
              strokeWidth={1}
            />
          ))}
          
          {/* Clips */}
          {clips.map((clip, index) => {
            const { x, width } = getClipProps(clip);
            const isSelected = currentClip?.id === clip.id;

            return (
              <Group key={clip.id}>
                <Rect
                  x={x}
                  y={index * 100 + 20}
                  width={width}
                  height={80}
                  fill={isSelected ? '#007acc' : '#667eea'}
                  stroke={isSelected ? '#00aaff' : '#764ba2'}
                  strokeWidth={2}
                  cornerRadius={6}
                  draggable
                  onDragEnd={(e) => {
                    handleClipDrag(clip.id, e.target.x());
                  }}
                  onClick={() => handleClipClick(clip)}
                  shadowBlur={5}
                  shadowColor="black"
                  shadowOpacity={0.3}
                />
                <Text
                  x={x + 10}
                  y={index * 100 + 50}
                  text={`Clip ${index + 1}`}
                  fontSize={12}
                  fill="white"
                  fontStyle="bold"
                />
                
                {/* Trim handle - start */}
                <Rect
                  x={x - 4}
                  y={index * 100 + 20}
                  width={8}
                  height={80}
                  fill="rgba(255, 255, 255, 0.3)"
                  draggable
                  onDragMove={(e) => {
                    const newX = Math.max(x - 20, e.target.x() + 4);
                    handleTrimStart(clip.id, newX);
                  }}
                  onMouseEnter={(e) => {
                    document.body.style.cursor = 'ew-resize';
                  }}
                  onMouseLeave={(e) => {
                    document.body.style.cursor = 'default';
                  }}
                />
                
                {/* Trim handle - end */}
                <Rect
                  x={x + width - 4}
                  y={index * 100 + 20}
                  width={8}
                  height={80}
                  fill="rgba(255, 255, 255, 0.3)"
                  draggable
                  onDragMove={(e) => {
                    const newX = Math.min(x + width + 20, e.target.x() - 4);
                    handleTrimEnd(clip.id, newX);
                  }}
                  onMouseEnter={(e) => {
                    document.body.style.cursor = 'ew-resize';
                  }}
                  onMouseLeave={(e) => {
                    document.body.style.cursor = 'default';
                  }}
                />
              </Group>
            );
          })}
          
          {/* Playhead */}
          <Line
            points={[playheadPosition * PIXELS_PER_SECOND, 0, playheadPosition * PIXELS_PER_SECOND, 200]}
            stroke="#ff0000"
            strokeWidth={2}
          />
        </Layer>
      </Stage>
    </div>
  );
}

export default Timeline;


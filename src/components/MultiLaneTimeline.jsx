import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Rect, Group, Text, Line, Image } from 'react-konva';
import useImage from 'use-image';

const PIXELS_PER_SECOND = 50; // Timeline scale
const LANE_HEIGHT = 80; // Fixed lane height
const LANE_SPACING = 10; // Space between lanes
const THUMBNAIL_WIDTH = 60; // Width of thumbnail preview
const SNAP_DISTANCE = 20; // Pixels for auto-snap

function MultiLaneTimeline({ clips, setClips, currentClip, setCurrentClip, playheadPosition, onSeek }) {
  const [lanes, setLanes] = useState([
    { id: 'video', name: 'Video', type: 'video', clips: [], visible: true },
    { id: 'audio1', name: 'Audio 1', type: 'audio', clips: [], visible: true },
    { id: 'audio2', name: 'Audio 2', type: 'audio', clips: [], visible: true }
  ]);
  const [dragState, setDragState] = useState(null);
  const [scrollY, setScrollY] = useState(0);
  const stageRef = useRef(null);
  const containerRef = useRef(null);

  // Update lanes when clips change
  useEffect(() => {
    const updatedLanes = lanes.map(lane => ({
      ...lane,
      clips: clips.filter(clip => clip.lane === lane.id)
    }));
    setLanes(updatedLanes);
  }, [clips]);

  const addLane = () => {
    const newLane = {
      id: `lane_${Date.now()}`,
      name: `Lane ${lanes.length + 1}`,
      type: 'video', // Default to video, user can change
      clips: [],
      visible: true
    };
    setLanes([...lanes, newLane]);
  };

  const toggleLaneVisibility = (laneId) => {
    setLanes(lanes.map(lane => 
      lane.id === laneId 
        ? { ...lane, visible: !lane.visible }
        : lane
    ));
  };

  const getLaneY = (laneIndex) => {
    return laneIndex * (LANE_HEIGHT + LANE_SPACING) - scrollY;
  };

  const getTotalHeight = () => {
    return lanes.length * (LANE_HEIGHT + LANE_SPACING);
  };

  const handleClipClick = (clip) => {
    setCurrentClip(clip);
  };

  const handleClipDrag = (clipId, newX, newY) => {
    // Find which lane the clip is being dragged to
    const targetLaneIndex = Math.round((newY + scrollY) / (LANE_HEIGHT + LANE_SPACING));
    const targetLane = lanes[targetLaneIndex];
    
    if (!targetLane) return;

    // Calculate new position
    const newPosition = Math.max(0, newX / PIXELS_PER_SECOND);
    
    // Check for auto-snap to nearby clips
    const snappedPosition = findSnapPosition(targetLane, newPosition);
    
    setClips(clips.map(clip => {
      if (clip.id === clipId) {
        return { 
          ...clip, 
          position: snappedPosition,
          lane: targetLane.id
        };
      }
      return clip;
    }));
  };

  const findSnapPosition = (lane, position) => {
    const laneClips = clips.filter(clip => clip.lane === lane.id);
    
    for (const clip of laneClips) {
      const clipStart = clip.position;
      const clipEnd = clip.position + (clip.trimEnd - clip.trimStart);
      
      // Snap to start of existing clip
      if (Math.abs(position - clipStart) < SNAP_DISTANCE / PIXELS_PER_SECOND) {
        return clipStart;
      }
      
      // Snap to end of existing clip
      if (Math.abs(position - clipEnd) < SNAP_DISTANCE / PIXELS_PER_SECOND) {
        return clipEnd;
      }
    }
    
    return position;
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
    const trimmedDuration = clip.trimEnd - clip.trimStart;
    const width = trimmedDuration * PIXELS_PER_SECOND;
    return { x, width, trimStart: clip.trimStart, trimEnd: clip.trimEnd };
  };

  const handleStageClick = (e) => {
    const stage = stageRef.current;
    const pointerPos = stage.getPointerPosition();
    const timelinePosition = pointerPos.x / PIXELS_PER_SECOND;
    onSeek(timelinePosition);
  };

  const handleWheel = (e) => {
    e.evt.preventDefault();
    const delta = e.evt.deltaY;
    const newScrollY = Math.max(0, Math.min(scrollY + delta, getTotalHeight() - 300));
    setScrollY(newScrollY);
  };

  const getVisibleClips = () => {
    const visibleLaneIds = lanes.filter(lane => lane.visible).map(lane => lane.id);
    return clips.filter(clip => visibleLaneIds.includes(clip.lane));
  };

  // Expose visible clips to parent component
  useEffect(() => {
    if (onSeek) {
      // This is a hack to pass visible clips info to parent
      // In a real app, you'd use a callback prop
      window.visibleClips = getVisibleClips();
    }
  }, [clips, lanes]);

  return (
    <div className="multi-lane-timeline-container" ref={containerRef}>
      <div className="timeline-controls">
        <button onClick={addLane} className="add-lane-btn">
          + Add Lane
        </button>
        <div className="lane-count">
          {lanes.length} lanes
        </div>
      </div>
      
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
            <div className="info-row">
              <span className="info-label">Lane: </span>
              <span className="info-value">{currentClip.lane || 'video'}</span>
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
        height={300}
        onClick={handleStageClick}
        onWheel={handleWheel}
        style={{ cursor: 'default' }}
      >
        <Layer>
          {/* Grid lines */}
          {[...Array(40)].map((_, i) => (
            <Line
              key={i}
              points={[i * 50, 0, i * 50, 300]}
              stroke="#333"
              strokeWidth={1}
            />
          ))}
          
          {/* Lane backgrounds and headers */}
          {lanes.map((lane, laneIndex) => {
            const y = getLaneY(laneIndex);
            const isHidden = !lane.visible;
            const opacity = isHidden ? 0.3 : 1;
            
            return (
              <Group key={lane.id} opacity={opacity}>
                {/* Lane background */}
                <Rect
                  x={0}
                  y={y}
                  width={stageRef.current?.width() || 800}
                  height={LANE_HEIGHT}
                  fill={lane.type === 'video' ? 'rgba(0, 122, 204, 0.1)' : 'rgba(102, 126, 234, 0.1)'}
                  stroke={isHidden ? "#666" : "#444"}
                  strokeWidth={1}
                />
                
                {/* Lane toolbar */}
                <LaneToolbar
                  x={10}
                  y={y + 5}
                  lane={lane}
                  onToggleVisibility={toggleLaneVisibility}
                />
                
                {/* Lane header */}
                <Text
                  x={80}
                  y={y + 10}
                  text={lane.name}
                  fontSize={12}
                  fill={isHidden ? "#888" : "white"}
                  fontStyle="bold"
                />
                
                {/* Lane type indicator */}
                <Rect
                  x={80}
                  y={y + 25}
                  width={60}
                  height={20}
                  fill={isHidden ? "#666" : (lane.type === 'video' ? '#007acc' : '#667eea')}
                  cornerRadius={3}
                />
                <Text
                  x={85}
                  y={y + 35}
                  text={lane.type.toUpperCase()}
                  fontSize={10}
                  fill={isHidden ? "#aaa" : "white"}
                />
              </Group>
            );
          })}
          
          {/* Clips */}
          {clips.map((clip) => {
            const laneIndex = lanes.findIndex(lane => lane.id === clip.lane);
            if (laneIndex === -1) return null;
            
            const lane = lanes[laneIndex];
            const isHidden = !lane.visible;
            const opacity = isHidden ? 0.3 : 1;
            
            const { x, width, trimStart, trimEnd } = getClipProps(clip);
            const y = getLaneY(laneIndex) + 50; // Offset from lane header
            const isSelected = currentClip?.id === clip.id;
            
            const handleStartX = x;
            const handleEndX = x + width;

            return (
              <Group key={clip.id} opacity={opacity}>
                {/* Main clip rectangle */}
                <Rect
                  x={x}
                  y={y}
                  width={width}
                  height={LANE_HEIGHT - 50}
                  fill={isSelected ? '#007acc' : '#667eea'}
                  stroke={isSelected ? '#00aaff' : '#764ba2'}
                  strokeWidth={2}
                  cornerRadius={6}
                  draggable
                  onDragEnd={(e) => {
                    const newX = e.target.x();
                    const newY = e.target.y();
                    handleClipDrag(clip.id, newX, newY);
                  }}
                  onClick={() => handleClipClick(clip)}
                  shadowBlur={5}
                  shadowColor="black"
                  shadowOpacity={0.3}
                />
                
                {/* Video thumbnail preview */}
                {clip.thumbnailPath && (
                  <ThumbnailPreview
                    x={x + 5}
                    y={y + 5}
                    width={THUMBNAIL_WIDTH}
                    height={LANE_HEIGHT - 60}
                    thumbnailPath={clip.thumbnailPath}
                  />
                )}
                
                {/* Clip info text */}
                <Text
                  x={x + (clip.thumbnailPath ? THUMBNAIL_WIDTH + 10 : 10)}
                  y={y + 15}
                  text={`${trimStart.toFixed(1)}s - ${trimEnd.toFixed(1)}s`}
                  fontSize={10}
                  fill="white"
                  fontStyle="bold"
                />
                
                {/* Trim handle - start */}
                <Rect
                  x={handleStartX - 4}
                  y={y}
                  width={8}
                  height={LANE_HEIGHT - 50}
                  fill={isSelected ? "rgba(0, 255, 0, 0.5)" : "rgba(255, 255, 255, 0.3)"}
                  draggable
                  onDragMove={(e) => {
                    const stage = e.target.getStage();
                    const pointerPos = stage.getPointerPosition();
                    const newX = pointerPos.x;
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
                  x={handleEndX - 4}
                  y={y}
                  width={8}
                  height={LANE_HEIGHT - 50}
                  fill={isSelected ? "rgba(0, 255, 0, 0.5)" : "rgba(255, 255, 255, 0.3)"}
                  draggable
                  onDragMove={(e) => {
                    const stage = e.target.getStage();
                    const pointerPos = stage.getPointerPosition();
                    const newX = pointerPos.x;
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
            points={[playheadPosition * PIXELS_PER_SECOND, 0, playheadPosition * PIXELS_PER_SECOND, 300]}
            stroke="#ff0000"
            strokeWidth={2}
          />
        </Layer>
      </Stage>
    </div>
  );
}

// Thumbnail preview component
function ThumbnailPreview({ x, y, width, height, thumbnailPath }) {
  const [image] = useImage(thumbnailPath);
  
  if (!image) {
    return (
      <Rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="#333"
        stroke="#666"
        strokeWidth={1}
      />
    );
  }
  
  return (
    <Image
      image={image}
      x={x}
      y={y}
      width={width}
      height={height}
      cornerRadius={3}
    />
  );
}

// Lane Toolbar Component
function LaneToolbar({ x, y, lane, onToggleVisibility }) {
  const handleEyeClick = (e) => {
    e.cancelBubble = true;
    onToggleVisibility(lane.id);
  };

  return (
    <Group x={x} y={y}>
      {/* Toolbar background */}
      <Rect
        x={0}
        y={0}
        width={60}
        height={30}
        fill="rgba(0, 0, 0, 0.7)"
        cornerRadius={4}
        stroke="#444"
        strokeWidth={1}
      />
      
      {/* Eye button */}
      <Group
        x={5}
        y={5}
        onClick={handleEyeClick}
        onTap={handleEyeClick}
      >
        {/* Eye icon */}
        <Rect
          x={0}
          y={0}
          width={20}
          height={20}
          fill={lane.visible ? "#007acc" : "#666"}
          cornerRadius={3}
          stroke={lane.visible ? "#00aaff" : "#888"}
          strokeWidth={1}
        />
        
        {/* Eye symbol */}
        <Text
          x={5}
          y={12}
          text="👁"
          fontSize={12}
          fill={lane.visible ? "white" : "#aaa"}
        />
      </Group>
      
      {/* Placeholder for future buttons */}
      <Rect
        x={30}
        y={5}
        width={20}
        height={20}
        fill="rgba(255, 255, 255, 0.1)"
        cornerRadius={3}
        stroke="#444"
        strokeWidth={1}
      />
      
      <Rect
        x={55}
        y={5}
        width={20}
        height={20}
        fill="rgba(255, 255, 255, 0.1)"
        cornerRadius={3}
        stroke="#444"
        strokeWidth={1}
      />
    </Group>
  );
}

export default MultiLaneTimeline;

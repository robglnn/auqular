import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Rect, Group, Text, Line, Image, Circle } from 'react-konva';
import useImage from 'use-image';

// PIXELS_PER_SECOND moved into component (dynamic zoom)
const LANE_HEIGHT = 80; // Fixed lane height
const LANE_SPACING = 10; // Space between lanes
const THUMBNAIL_WIDTH = 60; // Width of thumbnail preview
const SNAP_DISTANCE = 20; // Pixels for auto-snap

function MultiLaneTimeline({ clips, setClips, currentClip, setCurrentClip, playheadPosition, setPlayheadPosition, isPlaying, setIsPlaying, onToggleVisibility, lanes, setLanes, onSplitClip, onDeleteClip }) {
  const [dragState, setDragState] = useState(null);
  const [scrollY, setScrollY] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const [zoom, setZoom] = useState(1); // Zoom factor (1 = 50px/sec)
  const stageRef = useRef(null);
  const containerRef = useRef(null);
  
  const PIXELS_PER_SECOND = 50 * zoom; // Dynamic zoom

  // Update lanes when clips change
  useEffect(() => {
    const updatedLanes = lanes.map(lane => ({
      ...lane,
      clips: clips.filter(clip => clip.lane === lane.id)
    }));
    setLanes(updatedLanes);
  }, [clips]);

  const toggleLaneVisibility = (laneId) => {
    setLanes(prev => prev.map(lane => 
      lane.id === laneId ? { ...lane, visible: !lane.visible } : lane
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
    const x = (clip.position * PIXELS_PER_SECOND) - scrollX; // Apply horizontal scroll
    const trimmedDuration = clip.trimEnd - clip.trimStart;
    const width = trimmedDuration * PIXELS_PER_SECOND;
    return { x, width, trimStart: clip.trimStart, trimEnd: clip.trimEnd };
  };

  const handleStageClick = (e) => {
    const stage = stageRef.current;
    if (!stage) return;
    const pointerPos = stage.getPointerPosition();
    // Account for horizontal scroll
    const timelinePosition = (pointerPos.x + scrollX) / PIXELS_PER_SECOND;
    if (setPlayheadPosition && typeof setPlayheadPosition === 'function') {
      setPlayheadPosition(timelinePosition);
    }
  };

  const handleWheel = (e) => {
    const evt = e.evt || e.nativeEvent || e;
    evt.preventDefault();
    evt.stopPropagation();
    
    // Zoom with Ctrl/Cmd + wheel
    if (evt.ctrlKey || evt.metaKey) {
      const delta = evt.deltaY;
      const newZoom = Math.max(0.25, Math.min(4, zoom - delta * 0.001));
      setZoom(newZoom);
    } 
    // Horizontal scroll with Shift + wheel
    else if (evt.shiftKey) {
      const delta = evt.deltaY || evt.deltaX; // Use deltaY when shift pressed
      // Calculate max scroll based on timeline length
      const maxClipEnd = clips.length > 0 ? Math.max(...clips.map(clip => 
        (clip.position + (clip.trimEnd - clip.trimStart)) * PIXELS_PER_SECOND
      )) : 0;
      const stageWidth = stageRef.current?.width() || 800;
      const maxScrollX = Math.max(0, maxClipEnd + 200 - stageWidth);
      
      // Use larger multiplier for visible scrolling (was 0.5, now 2.0)
      const newScrollX = Math.max(0, Math.min(scrollX - delta * 2.0, maxScrollX));
      setScrollX(newScrollX);
      console.log('Shift+scroll horizontal - delta:', delta, 'oldScrollX:', scrollX, 'newScrollX:', newScrollX, 'maxScrollX:', maxScrollX);
    }
    // Vertical scroll without modifiers
    else {
      const delta = evt.deltaY;
      const newScrollY = Math.max(0, Math.min(scrollY + delta, getTotalHeight() - 300));
      setScrollY(newScrollY);
    }
  };

  const getVisibleClips = () => {
    const visibleLaneIds = lanes.filter(lane => lane.visible).map(lane => lane.id);
    return clips.filter(clip => visibleLaneIds.includes(clip.lane));
  };

  // Expose visible clips to parent component
  useEffect(() => {
    if (onToggleVisibility) {
      // This is a hack to pass visible clips info to parent
      // In a real app, you'd use a callback prop
      window.visibleClips = getVisibleClips();
    }
  }, [clips, lanes]);

  // Calculate timeline width for scrollbar
  const maxClipEnd = clips.length > 0 ? Math.max(...clips.map(clip => 
    (clip.position + (clip.trimEnd - clip.trimStart)) * PIXELS_PER_SECOND
  )) : 800;
  const stageWidth = stageRef.current?.width() || 800;
  const maxScrollX = Math.max(0, maxClipEnd + 200 - stageWidth);
  const scrollbarWidth = stageWidth;
  const scrollbarThumbWidth = Math.max(20, (stageWidth / maxClipEnd) * stageWidth);
  const scrollbarThumbX = (scrollX / maxScrollX) * (scrollbarWidth - scrollbarThumbWidth);

  return (
    <div className="multi-lane-timeline-container" ref={containerRef}>
      <div className="timeline-controls">
        <button onClick={() => setLanes([...lanes, { id: `lane_${Date.now()}`, name: `Lane ${lanes.length + 1}`, type: 'video', clips: [], visible: true }])} className="add-lane-btn">
          + Add Lane
        </button>
        {currentClip && (
          <>
            <button onClick={onSplitClip} className="btn-small" title="Split at playhead (S)">
              ✂️ Split
            </button>
            <button onClick={onDeleteClip} className="btn-small" title="Delete clip (Delete)">
              🗑️ Delete
            </button>
          </>
        )}
        <div className="lane-count">
          {lanes.length} lanes | Zoom: {Math.round(zoom * 100)}% | Scroll: Ctrl+Wheel=zoom, Shift+Wheel=horizontal, Wheel=vertical
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
          {[...Array(40)].map((_, i) => {
            const x = (i * 50 * zoom) - scrollX;
            return (
              <Line
                key={i}
                points={[x, 0, x, 300]}
                stroke="#333"
                strokeWidth={1}
              />
            );
          })}
          
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
                  onToggleVisibility={onToggleVisibility}
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
                onDblClick={() => {
                  if (onSplitClip) onSplitClip();
                }}
                  shadowBlur={5}
                  shadowColor="black"
                  shadowOpacity={0.3}
                />
                
                {/* Video thumbnail preview or audio icon */}
                {clip.thumbnailPath ? (
                  <ThumbnailPreview
                    x={x + 5}
                    y={y + 5}
                    width={THUMBNAIL_WIDTH}
                    height={LANE_HEIGHT - 60}
                    thumbnailPath={clip.thumbnailPath}
                  />
                ) : clip.type === 'audio' ? (
                  // Audio clip icon
                  <Group x={x + 15} y={y + 15}>
                    <Rect
                      x={0}
                      y={0}
                      width={THUMBNAIL_WIDTH - 20}
                      height={LANE_HEIGHT - 70}
                      fill="rgba(102, 126, 234, 0.5)"
                      stroke="#667eea"
                      strokeWidth={2}
                      cornerRadius={4}
                    />
                    <Text
                      x={5}
                      y={15}
                      text="🎵"
                      fontSize={24}
                      align="center"
                      width={THUMBNAIL_WIDTH - 30}
                    />
                  </Group>
                ) : null}
                
                {/* Clip info text */}
                <Text
                  x={x + (clip.thumbnailPath || clip.type === 'audio' ? THUMBNAIL_WIDTH + 10 : 10)}
                  y={y + 15}
                  text={clip.label || `${trimStart.toFixed(1)}s - ${trimEnd.toFixed(1)}s`}
                  fontSize={10}
                  fill="white"
                  fontStyle="bold"
                />
                {clip.label && (
                  <Text
                    x={x + (clip.thumbnailPath || clip.type === 'audio' ? THUMBNAIL_WIDTH + 10 : 10)}
                    y={y + 30}
                    text={`${trimStart.toFixed(1)}s - ${trimEnd.toFixed(1)}s`}
                    fontSize={9}
                    fill="rgba(255, 255, 255, 0.7)"
                  />
                )}
                
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
            points={[(playheadPosition * PIXELS_PER_SECOND) - scrollX, 0, (playheadPosition * PIXELS_PER_SECOND) - scrollX, 300]}
            stroke="#ff0000"
            strokeWidth={2}
          />
        </Layer>
      </Stage>
      
      {/* Horizontal Scrollbar */}
      {maxScrollX > 0 && (
        <div style={{
          position: 'relative',
          width: '100%',
          height: '20px',
          backgroundColor: '#222',
          borderTop: '1px solid #444',
          marginTop: '5px'
        }}>
          <div
            style={{
              position: 'absolute',
              left: `${scrollbarThumbX}px`,
              width: `${scrollbarThumbWidth}px`,
              height: '18px',
              backgroundColor: '#555',
              cursor: 'grab',
              borderRadius: '2px',
              margin: '1px'
            }}
            onMouseDown={(e) => {
              const startX = e.clientX;
              const startScrollX = scrollX;
              
              const handleMouseMove = (moveEvent) => {
                const deltaX = moveEvent.clientX - startX;
                const scrollRatio = maxScrollX / (scrollbarWidth - scrollbarThumbWidth);
                const newScrollX = Math.max(0, Math.min(maxScrollX, startScrollX + (deltaX * scrollRatio)));
                setScrollX(newScrollX);
                console.log('Scrollbar dragged - scrollX:', newScrollX);
              };
              
              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };
              
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          />
        </div>
      )}
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
        height={LANE_HEIGHT - 10}
        fill="#222"
        cornerRadius={4}
      />
      
      {/* Eye icon for visibility toggle */}
      <Circle
        x={20}
        y={20}
        radius={12}
        fill={lane.visible ? '#00ff00' : '#ff0000'}
        onClick={handleEyeClick}
        draggable={false}
      />
      {/* Add 2 more button placeholders */}
      <Circle x={40} y={20} radius={12} fill="#444" />
      <Circle x={60} y={20} radius={12} fill="#444" />
    </Group>
  );
}

export default MultiLaneTimeline;

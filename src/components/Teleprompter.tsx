import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Play, Pause } from 'lucide-react';

export default function Teleprompter() {
  const { teleprompterQueue, isGenerating } = useAppStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1.5);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  // Reset index when queue changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [teleprompterQueue]);

  useEffect(() => {
    if (!isPlaying || teleprompterQueue.length === 0 || currentIndex >= teleprompterQueue.length) return;
    
    const container = scrollRef.current;
    const textElement = textRef.current;
    if (!container || !textElement) return;

    let animationId: number;
    let position = container.offsetWidth; 
    
    const baseSpeed = 2 * speed; 

    const scroll = () => {
      position -= baseSpeed;
      const textWidth = textElement.offsetWidth;
      
      if (position < -textWidth) {
         if (currentIndex < teleprompterQueue.length - 1) {
            setCurrentIndex(prev => prev + 1);
            position = container.offsetWidth;
         }
      } else {
         textElement.style.transform = `translateX(${position}px)`;
      }
      animationId = requestAnimationFrame(scroll);
    };

    animationId = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, teleprompterQueue, currentIndex, speed]);

  if (teleprompterQueue.length === 0 && !isGenerating) return null;

  return (
    <div style={{ background: '#0a0a0f', borderBottom: '1px solid #2d2b3b', padding: '24px', position: 'relative', overflow: 'hidden', height: '140px', display: 'flex', flexDirection: 'column', flexShrink: 0, zIndex: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff3366' }} />
          <span style={{ color: '#a09ebd', fontSize: '12px', fontWeight: 'bold', letterSpacing: '1px' }}>LIVE ANSWER RAIL</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setSpeed(s => s === 0.5 ? 2 : s === 2 ? 1 : s === 1 ? 1.5 : 0.5)} style={{ background: '#1c1b26', border: '1px solid #2d2b3b', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>{speed}x</button>
          <button onClick={() => setIsPlaying(!isPlaying)} style={{ background: '#1c1b26', border: '1px solid #2d2b3b', color: '#fff', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>{isPlaying ? <Pause size={14} /> : <Play size={14} />}</button>
        </div>
      </div>
      
      <div ref={scrollRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {currentIndex < teleprompterQueue.length ? (
          <div ref={textRef} style={{ position: 'absolute', whiteSpace: 'nowrap', fontSize: '28px', color: '#ffffff', fontWeight: 500, left: 0, willChange: 'transform' }}>
            {teleprompterQueue[currentIndex]}
          </div>
        ) : (
          isGenerating && <span style={{ color: '#5b5873', fontSize: '24px' }}>Analyzing...</span>
        )}
      </div>
    </div>
  );
}
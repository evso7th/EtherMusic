
"use client";
import { CSSProperties, memo, useEffect, useState } from 'react';
import styles from './orbital-animation.module.css';
import { cn } from '@/lib/utils';
import { useAudioEngine } from '@/hooks/use-audio-engine';

function OrbitalAnimationComponent() {
  const { emitter, volumes } = useAudioEngine();
  const [isPlaying, setIsPlaying] = useState(false);
  const [tempo, setTempo] = useState(120);

  useEffect(() => {
    if (!emitter) return;

    const handlePlayStateChange = (playing: boolean) => {
      setIsPlaying(playing);
    };
    
    const handleVolumesChange = (newVolumes: any) => {
        if(newVolumes.tempo) {
            setTempo(newVolumes.tempo);
        }
    };

    emitter.on('playStateChanged', handlePlayStateChange);
    emitter.on('volumesChanged', handleVolumesChange);
    
    // Set initial state from volumes if available
    if(volumes) {
      setTempo(volumes.tempo);
    }

    return () => {
      emitter.off('playStateChanged', handlePlayStateChange);
      emitter.off('volumesChanged', handleVolumesChange);
    };
  }, [emitter, volumes]);
  
  const pulseDuration = 60 / tempo;

  const animationStyle: CSSProperties = {
    // @ts-ignore
    '--pulse-duration': `${pulseDuration}s`,
  };

  return (
    <div 
      className={styles.view}
      style={animationStyle}
    >
      <div className={cn(styles.plane, !isPlaying && styles.paused)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div 
            key={i} 
            className={cn(
              styles.circle,
               isPlaying && styles.pulsating
            )}
          ></div>
        ))}
      </div>
    </div>
  );
}

export const OrbitalAnimation = memo(OrbitalAnimationComponent);

    
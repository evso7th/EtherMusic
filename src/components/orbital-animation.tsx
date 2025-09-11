
import { useState, useEffect } from 'react';
import styles from './orbital-animation.module.css';
import { cn } from '@/lib/utils';
import type { CSSProperties } from 'react';
import type { AudioEngine } from '@/lib/audio-engine';

interface OrbitalAnimationProps {
  audioEngine?: AudioEngine | null;
}

export function OrbitalAnimation({ audioEngine }: OrbitalAnimationProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [tempo, setTempo] = useState(120);

  useEffect(() => {
    if (!audioEngine) {
      setIsPlaying(false);
      return;
    }

    // Set initial state from engine
    setIsPlaying(audioEngine.isPlaying);
    setTempo(audioEngine.getVolumes().tempo);

    const handlePlayStateChange = (playing: boolean) => {
      setIsPlaying(playing);
    };

    const handleVolumeChange = (volumes: any) => {
      setTempo(volumes.tempo);
    };

    audioEngine.emitter.on('playStateChanged', handlePlayStateChange);
    audioEngine.emitter.on('volumesChanged', handleVolumeChange);

    return () => {
      audioEngine.emitter.off('playStateChanged', handlePlayStateChange);
      audioEngine.emitter.off('volumesChanged', handleVolumeChange);
    };
  }, [audioEngine]);

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

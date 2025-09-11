
import { useState, useEffect } from 'react';
import styles from './orbital-animation.module.css';
import { cn } from '@/lib/utils';
import type { CSSProperties } from 'react';
import type { AudioEngine } from '@/lib/audio-engine';
import type { Emitter } from 'mitt';
import type { AudioEngineEvents } from '@/hooks/use-audio-engine';

interface OrbitalAnimationProps {
  audioEngine: AudioEngine | null;
  emitter: Emitter<AudioEngineEvents> | null;
  isPlaying?: boolean;
  tempo?: number;
}

export function OrbitalAnimation({ 
  audioEngine, 
  emitter,
  isPlaying: initialIsPlaying = false,
  tempo: initialTempo = 120,
}: OrbitalAnimationProps) {
  const [isPlaying, setIsPlaying] = useState(initialIsPlaying);
  const [tempo, setTempo] = useState(initialTempo);

  useEffect(() => {
    if (!emitter) return;

    const onPlayStateChanged = (playing: boolean) => {
      setIsPlaying(playing);
    };
    
    const onVolumesChanged = (volumes: { tempo: number }) => {
        setTempo(volumes.tempo);
    };

    setIsPlaying(audioEngine?.isPlaying || false);
    if(audioEngine) {
        setTempo(audioEngine.getVolumes().tempo)
    }

    emitter.on('playStateChanged', onPlayStateChanged);
    emitter.on('volumesChanged', onVolumesChanged);

    return () => {
        emitter.off('playStateChanged', onPlayStateChanged);
        emitter.off('volumesChanged', onVolumesChanged);
    };
  }, [emitter, audioEngine]);

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

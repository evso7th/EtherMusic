
import styles from './orbital-animation.module.css';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';

interface OrbitalAnimationProps {
  isPlaying?: boolean;
  tempo?: number;
}

export function OrbitalAnimation({ isPlaying = false, tempo = 120 }: OrbitalAnimationProps) {
  const pulseDuration = useMemo(() => {
    if (!isPlaying) return '0s';
    // This creates a pulse every beat. For 4/4 time, you might want * 2 for every other beat.
    return `${60 / tempo}s`;
  }, [isPlaying, tempo]);

  return (
    <div className={styles.view}>
      <div 
        className={cn(
          styles.plane
        )}
      >
        <div 
          className={cn(
            styles.planeContent, 
            isPlaying && styles.pulsating
          )}
          style={{ animationDuration: `20s, ${pulseDuration}` } as React.CSSProperties}
        >
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={styles.circle}></div>
        ))}
        </div>
      </div>
    </div>
  );
}


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
    return `${60 / tempo}s`;
  }, [isPlaying, tempo]);

  return (
    <div className={styles.view}>
      <div 
        className={cn(
          styles.plane, 
          isPlaying && styles.pulsating
        )}
        style={{ '--pulse-duration': pulseDuration } as React.CSSProperties}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={styles.circle}></div>
        ))}
      </div>
    </div>
  );
}

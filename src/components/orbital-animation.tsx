
import styles from './orbital-animation.module.css';
import { cn } from '@/lib/utils';
import type { CSSProperties } from 'react';

interface OrbitalAnimationProps {
  isPlaying?: boolean;
  tempo?: number;
}

export function OrbitalAnimation({ isPlaying = false, tempo = 120 }: OrbitalAnimationProps) {
  const pulseDuration = 60 / tempo;

  const animationStyle: CSSProperties = {
    '--pulse-duration': `${pulseDuration}s`,
  };

  return (
    <div 
      className={cn(styles.view, isPlaying && styles.pulsating)}
      style={animationStyle}
    >
      <div className={styles.plane}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={styles.circle}></div>
        ))}
      </div>
    </div>
  );
}

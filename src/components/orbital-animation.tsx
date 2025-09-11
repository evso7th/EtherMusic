
import { CSSProperties, memo } from 'react';
import styles from './orbital-animation.module.css';
import { cn } from '@/lib/utils';

interface OrbitalAnimationProps {
  isPlaying: boolean;
  tempo: number;
}

function OrbitalAnimationComponent({ 
  isPlaying,
  tempo,
}: OrbitalAnimationProps) {
  
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

    
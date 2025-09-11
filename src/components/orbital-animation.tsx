
"use client";
import { CSSProperties, memo } from 'react';
import styles from './orbital-animation.module.css';
import { cn } from '@/lib/utils';

function OrbitalAnimationComponent() {
  const tempo = 90; // Fixed value for tempo
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
      <div className={cn(styles.plane)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div 
            key={i} 
            className={cn(
              styles.circle,
              styles.pulsating // Always pulsating
            )}
          ></div>
        ))}
      </div>
    </div>
  );
}

export const OrbitalAnimation = memo(OrbitalAnimationComponent);

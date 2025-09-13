
"use client";
import { memo } from 'react';
import styles from './orbital-animation.module.css';
import { cn } from '@/lib/utils';

function OrbitalAnimationComponent() {
  // This component is now purely presentational.
  // The 'rotate' and 'pulse' animations are continuous and defined in the CSS module.
  return (
    <div className={styles.view}>
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

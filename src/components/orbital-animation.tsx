
"use client";
import React, { useEffect, useRef } from 'react';
import styles from './orbital-animation.module.css';
import { cn } from '@/lib/utils';

interface OrbitalAnimationProps {
    isPlaying?: boolean;
    tempo?: number;
}

export function OrbitalAnimation({ isPlaying = false, tempo = 90 }: OrbitalAnimationProps) {
  const planeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (planeRef.current) {
        const animationDuration = isPlaying ? `${(60 / tempo) * 16}s` : '40s';
        planeRef.current.style.animationDuration = animationDuration;
    }
  }, [isPlaying, tempo]);

  return (
    <div className={styles.view}>
      <div ref={planeRef} className={cn(styles.plane, styles.main)}>
        {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.circle}></div>
        ))}
      </div>
    </div>
  );
}

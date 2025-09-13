
"use client";
import React from 'react';
import styles from './orbital-animation.module.css';
import { cn } from '@/lib/utils';

export function OrbitalAnimation() {
  return (
    <div className={styles.view}>
      <div className={cn(styles.plane, styles.main)}>
        {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.circle}></div>
        ))}
      </div>
    </div>
  );
}

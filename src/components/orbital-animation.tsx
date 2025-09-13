
"use client";
import React from 'react';
import styles from './orbital-animation.module.css';

export function OrbitalAnimation() {
  return (
    <div className={styles.view}>
      <div className={styles.plane}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div 
            key={i} 
            className={styles.circle}
          ></div>
        ))}
      </div>
    </div>
  );
}


"use client";
import React from 'react';
import styles from './orbital-animation.module.css';

export function OrbitalAnimation() {
  return (
    <div className={styles.view}>
      <div className={styles.plane}>
        <div className={styles.circle}></div>
        <div className={styles.circle}></div>
        <div className={styles.circle}></div>
        <div className={styles.circle}></div>
        <div className={styles.circle}></div>
      </div>
    </div>
  );
}

    

import styles from './animated-background.module.css';

export function AnimatedBackground() {
  return (
    <div className={styles.container}>
      <ul className={styles.circles}>
        <li></li>
        <li></li>
        <li></li>
      </ul>
    </div>
  );
}

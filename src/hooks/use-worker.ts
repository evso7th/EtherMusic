
"use client";

import { useState, useEffect } from 'react';

export function useWorker(workerFactory: () => Worker): Worker | null {
  const [worker, setWorker] = useState<Worker | null>(null);

  useEffect(() => {
    // Worker is only created on the client-side
    if (typeof window !== 'undefined') {
      const newWorker = workerFactory();
      setWorker(newWorker);

      return () => {
        newWorker.terminate();
      };
    }
    return () => {};
  }, [workerFactory]);

  return worker;
}

    
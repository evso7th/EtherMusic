
"use client";

import { useState, useEffect, useRef } from 'react';

export function useWorker(workerPath: string) {
    const [worker, setWorker] = useState<Worker | null>(null);
    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined' && !workerRef.current) {
            const newWorker = new Worker(new URL(workerPath, import.meta.url));
            workerRef.current = newWorker;
            setWorker(newWorker);
        }

        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, [workerPath]);

    return worker;
}

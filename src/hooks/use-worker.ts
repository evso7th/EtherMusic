
"use client";

import { useState, useEffect, useRef } from 'react';

export function useWorker(workerPath: string) {
    const workerRef = useRef<Worker | null>(null);
    const [worker, setWorker] = useState<Worker | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined' && !workerRef.current) {
            // The public path is passed directly to the Worker constructor.
            // The browser will resolve this relative to the document's origin.
            const newWorker = new Worker(workerPath);
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

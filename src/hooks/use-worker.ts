
"use client";

import { useState, useEffect, useRef } from 'react';

export function useWorker(workerPath: string) {
    const [worker, setWorker] = useState<Worker | null>(null);
    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        // This check ensures the code runs only in the browser.
        if (typeof window !== 'undefined' && !workerRef.current) {
            // We pass the public path directly to the Worker constructor.
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

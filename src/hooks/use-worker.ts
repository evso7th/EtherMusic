
"use client";

import { useState, useEffect, useRef } from 'react';

export function useWorker(workerPath: string): Worker | null {
    const workerRef = useRef<Worker | null>(null);
    const [worker, setWorker] = useState<Worker | null>(null);

    useEffect(() => {
        // Ensure this only runs on the client
        if (typeof window === 'undefined') {
            return;
        }

        // Create a new worker only if one doesn't exist.
        // This check prevents re-creating the worker on every render.
        if (!workerRef.current) {
            try {
                // The public path is passed directly to the Worker constructor.
                // The browser will resolve this relative to the document's origin.
                const newWorker = new Worker(workerPath);
                workerRef.current = newWorker;
                setWorker(newWorker);
            } catch (error) {
                console.error("Failed to create worker:", error);
                // Optionally handle the error, e.g., by setting an error state
            }
        }

        const currentWorker = workerRef.current;
        // Cleanup function to terminate the worker when the component unmounts
        // or when the workerPath changes.
        return () => {
            if (currentWorker) {
                currentWorker.terminate();
                workerRef.current = null;
                setWorker(null);
            }
        };
    }, [workerPath]); // Re-run effect if workerPath changes

    return worker;
}

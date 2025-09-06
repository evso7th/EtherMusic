
"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { AudioEngine } from '@/lib/audio-engine';
import { OrbManager } from '@/lib/orb-manager';
import type { Volumes } from '@/types';

export function useAudioEngine() {
    const { toast } = useToast();
    
    const [isAppStarted, setIsAppStarted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [sleepTimerId, setSleepTimerId] = useState<NodeJS.Timeout | null>(null);

    const audioEngine = useRef<AudioEngine | null>(null);
    const orbManager = useRef<OrbManager | null>(null);
    const isBassLatchOnRef = useRef(false);
    
    const initializeAudioEngine = useCallback(async () => {
        try {
            if (!orbManager.current) {
                orbManager.current = new OrbManager();
            }

            if (!audioEngine.current) {
                const context = new (window.AudioContext || (window as any).webkitAudioContext)();
                if (context.state === 'suspended') {
                    await context.resume();
                }
                audioEngine.current = new AudioEngine(context, orbManager.current);
                await audioEngine.current.initialize();
            }
            
            setIsReady(true);
            setIsPlaying(audioEngine.current.isPlaying);
            console.log('AudioEngine initialized and ready.');

        } catch(e) {
            console.error("Failed to initialize audio engines:", e);
            toast({
                title: "Audio Error",
                description: e instanceof Error ? e.message : "Could not initialize the audio engine. Please refresh the page.",
                variant: "destructive"
            });
        }
    }, [toast]);

    const startApp = useCallback(async () => {
        if (isAppStarted) return;
        
        setIsAppStarted(true);
        const audio = new Audio('/assets/sounds/transition.webm');
        audio.play().catch(e => console.error("Error playing transition sound:", e));
        
        await initializeAudioEngine();
    }, [isAppStarted, initializeAudioEngine]);

    useEffect(() => {
      const resumeAudio = async () => {
        if (audioEngine.current && audioEngine.current.isInitialized && audioEngine.current.masterOut.context.state === 'suspended') {
          await audioEngine.current.masterOut.context.resume();
        }
      };
      document.addEventListener('click', resumeAudio);
      document.addEventListener('touchstart', resumeAudio);
      return () => {
        document.removeEventListener('click', resumeAudio);
        document.removeEventListener('touchstart', resumeAudio);
      };
    }, []);

    const play = useCallback(() => {
        if (!isReady || !audioEngine.current) return;
        audioEngine.current.play();
        setIsPlaying(true);
    }, [isReady]);

    const pause = useCallback(() => {
        if (!isReady || !audioEngine.current) return;
        audioEngine.current.pause();
        setIsPlaying(false);
    }, [isReady]);

    const stop = useCallback(() => {
        if (!audioEngine.current) return;
        audioEngine.current.stop();
        setIsPlaying(false);
    }, []);

    const setTempo = useCallback((bpm: number) => {
        audioEngine.current?.setTempo(bpm);
    }, []);

    const setVolumes = useCallback((volumes: Volumes) => {
        audioEngine.current?.setVolumes(volumes);
    }, []);
    
    const setBeatPattern = useCallback((patternName: string) => {
        audioEngine.current?.setBeatPattern(patternName);
    }, []);
    
    const setBassLatch = useCallback((isOn: boolean) => {
        isBassLatchOnRef.current = isOn;
        audioEngine.current?.setBassLatch(isOn);
        console.log(`[useAudioEngine] Latch mode set to: ${isOn}`);
    }, []);

    const startRecording = useCallback(() => {
        audioEngine.current?.startRecording();
    }, []);

    const stopRecording = useCallback(() => {
        audioEngine.current?.stopRecording();
    }, []);

    const setSleepTimer = useCallback((durationMinutes: number | null) => {
        if (sleepTimerId) {
            clearTimeout(sleepTimerId);
            setSleepTimerId(null);
        }
        if (durationMinutes !== null) {
            const id = setTimeout(() => {
                if (audioEngine.current) {
                    audioEngine.current.fadeOutAndStop(5);
                }
            }, durationMinutes * 60 * 1000);
            setSleepTimerId(id);
        }
    }, [sleepTimerId]);
    
    const handleThereminInteraction = useCallback((type: 'melody' | 'bass', data: { frequency: number; volume: number; pointerId: number; x: number, y: number } | null, state: 'down' | 'move' | 'up') => {
        console.log(`[useAudioEngine] Interaction:`, { type, state, isBassLatchOn: isBassLatchOnRef.current });
        if (!isReady || !audioEngine.current) return;

        // The audio engine now handles the latch "tap" logic internally.
        // We just pass the events through.
        audioEngine.current.handleThereminInteraction(type, data, state);
    }, [isReady]);


    return {
        isAppStarted,
        isReady,
        isPlaying,
        orbManager: orbManager.current,
        startApp,
        play,
        pause,
        stop,
        setTempo,
        setVolumes,
        setMelodyInstrument: () => {}, // Kept for compatibility, does nothing
        setBassInstrument: () => {}, // Kept for compatibility, does nothing
        setBeatPattern,
        setBassLatch,
        startRecording,
        stopRecording,
        handleThereminInteraction,
        setSleepTimer,
    };
}


"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { AudioEngine } from '@/lib/audio-engine';
import { OrbManager } from '@/lib/orb-manager';
import type { Volumes, Instrument, BassInstrument, CompressorSettings } from '@/types';

export function useAudioEngine() {
    const { toast } = useToast();
    
    const [isAppStarted, setIsAppStarted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [sleepTimerId, setSleepTimerId] = useState<NodeJS.Timeout | null>(null);

    const audioEngine = useRef<AudioEngine | null>(null);
    const orbManager = useRef<OrbManager | null>(null);
    const workerRef = useRef<Worker | null>(null);
    
    const initializeAudioEngine = useCallback(async () => {
        try {
            console.log("[useAudioEngine] Initializing...");
            if (!orbManager.current) {
                const padContainer = document.querySelector('main');
                orbManager.current = new OrbManager(padContainer);
                console.log("[useAudioEngine] OrbManager created.");
            }

            if (!audioEngine.current) {
                const context = new (window.AudioContext || (window as any).webkitAudioContext)();
                if (context.state === 'suspended') {
                    await context.resume();
                    console.log("[useAudioEngine] AudioContext resumed.");
                }
                // Note: The worker is no longer passed to the AudioEngine constructor
                // as the Autopilot feature is deprecated.
                audioEngine.current = new AudioEngine(context, orbManager.current);
                await audioEngine.current.initialize();
            }
            
            setIsReady(true);
            setIsPlaying(audioEngine.current.isPlaying);
            console.log("[useAudioEngine] AudioEngine initialized.");
            
        } catch(e) {
            console.error("Failed to initialize audio engine:", e);
            toast({
                title: "Audio Error",
                description: e instanceof Error ? e.message : "Could not initialize the audio engine. Please try refreshing the page.",
                variant: "destructive"
            });
        }
    }, [toast]);

    const startApp = useCallback(async () => {
        if (isAppStarted) return;
        
        console.log("[useAudioEngine] Starting app...");
        setIsAppStarted(true);
        // Play a subtle transition sound
        const audio = new Audio('/assets/sounds/transition.webm');
        audio.play().catch(e => console.error("Error playing transition sound:", e));
        
        await initializeAudioEngine();
    }, [isAppStarted, initializeAudioEngine]);

    useEffect(() => {
      const resumeAudio = async () => {
        if (audioEngine.current?.isInitialized && audioEngine.current.getContext().state === 'suspended') {
          await audioEngine.current.getContext().resume();
        }
      };
      document.addEventListener('click', resumeAudio, { once: true });
      document.addEventListener('touchstart', resumeAudio, { once: true });
      return () => {
        document.removeEventListener('click', resumeAudio);
        document.removeEventListener('touchstart', resumeAudio);
      };
    }, []);

    const play = useCallback(() => {
        console.log("[useAudioEngine] Play requested.");
        if (!isReady || !audioEngine.current) {
            return;
        }
        audioEngine.current.play();
        setIsPlaying(true);
    }, [isReady]);

    const pause = useCallback(() => {
        console.log("[useAudioEngine] Pause requested.");
        if (!isReady || !audioEngine.current) return;
        audioEngine.current.pause();
        setIsPlaying(false);
    }, [isReady]);

    const stop = useCallback(() => {
        if (!audioEngine.current) return;
        audioEngine.current.stop();
        setIsPlaying(false);
    }, []);
    
    const setVolumes = useCallback((volumes: Volumes) => {
        audioEngine.current?.setVolumes(volumes);
    }, []);

    const setTempo = useCallback((tempo: number) => {
        console.log("[useAudioEngine] Setting tempo to:", tempo);
        audioEngine.current?.setTempo(tempo);
    }, []);

    const setSwing = useCallback((swing: number) => {
        audioEngine.current?.setSwing(swing);
    }, []);
    
    const setBeatPattern = useCallback((patternName: string) => {
        if (!audioEngine.current) return;
        console.log(`[useAudioEngine] Setting beat pattern to: ${patternName}`);
        const wasPlaying = audioEngine.current.isPlaying;
        audioEngine.current.setBeatPattern(patternName);

        if (patternName !== 'Off') {
            // If a pattern is selected and we weren't playing, start it.
            if (!wasPlaying) {
                 console.log("[useAudioEngine] Pattern set to ON, calling play().");
                 play();
            }
             setIsPlaying(true);
        } else {
            // If pattern is set to 'Off', always pause.
            if (wasPlaying) {
                console.log("[useAudioEngine] Pattern set to OFF, calling pause().");
                pause();
            }
             setIsPlaying(false);
        }
    }, [play, pause]);
    
    const setBassLatch = useCallback((isOn: boolean) => {
        audioEngine.current?.setBassLatch(isOn);
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
                    audioEngine.current.fadeOutAndStop(5); // 5-second fade out
                }
            }, durationMinutes * 60 * 1000);
            setSleepTimerId(id);
        }
    }, [sleepTimerId]);
    
    const handleThereminInteraction = useCallback((type: 'melody' | 'bass', data: { frequency: number; volume: number; pointerId: number; x: number, y: number } | null, state: 'down' | 'move' | 'up') => {
        if (!isReady || !audioEngine.current) return;
        audioEngine.current.handleThereminInteraction(type, data, state);
    }, [isReady]);

    const setMelodyInstrument = useCallback((instrumentName: Instrument) => {
        audioEngine.current?.setMelodyInstrument(instrumentName);
    }, []);
    
    const setBassInstrument = useCallback((instrumentName: BassInstrument) => {
        audioEngine.current?.setBassInstrument(instrumentName);
    }, []);
    
    const handleCompressorChange = useCallback((compressorSettings: CompressorSettings) => {
        audioEngine.current?.setCompressorSettings(compressorSettings);
    }, []);
    

    return {
        isAppStarted,
        isReady,
        isPlaying,
        audioEngine: audioEngine.current,
        orbManager: orbManager.current,
        startApp,
        play,
        pause,
        stop,
        setVolumes,
        setTempo,
        setSwing,
        setMelodyInstrument,
        setBassInstrument,
        setBeatPattern,
        setBassLatch,
        startRecording,
        stopRecording,
        handleThereminInteraction,
        setSleepTimer,
        handleCompressorChange,
    };
}

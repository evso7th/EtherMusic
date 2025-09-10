
"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { AudioEngine } from '@/lib/audio-engine';
import { OrbManager } from '@/lib/orb-manager';
import type { Volumes, Instrument, BassInstrument, CompressorSettings } from '@/types';

function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
}

function setCookie(name: string, value: string, days: number) {
    if (typeof document === 'undefined') return;
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
}

const defaultVolumes: Volumes = { 
    melody: { gain: 0, reverbSend: -18, distortion: 0 },
    manualBass: { gain: -25, reverbSend: -48, distortion: 0 },
    latch: { gain: -25, reverbSend: -48, distortion: 0 },
    drums: { gain: -20, reverbSend: -48, distortion: 0 },
    reverbReturn: -25,
    compressor: {
        enabled: true,
        threshold: -70,
        ratio: 7,
        attack: 0.003,
        release: 0.25
    },
    swing: 0.33,
    tempo: 90,
};

function loadVolumes(): Volumes {
     if (typeof window === 'undefined') return defaultVolumes;
     const consent = getCookie("ethermusic_consent") === 'true';
     if (!consent) return defaultVolumes;
     try {
        const savedVolumes = getCookie("ethermusic_volumes");
        const volumes = savedVolumes ? JSON.parse(savedVolumes) : defaultVolumes;
        
        // Basic validation
        if (!volumes.melody || typeof volumes.melody.gain !== 'number' || !volumes.compressor) {
            return defaultVolumes; 
        }
        return { ...defaultVolumes, ...volumes };
    } catch (e) {
        console.error("Failed to load volume settings from cookies", e);
        return defaultVolumes;
    }
}

export function useAudioEngine() {
    const { toast } = useToast();
    
    const [isAppStarted, setIsAppStarted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volumes, setVolumesState] = useState<Volumes>(defaultVolumes);
    
    const audioEngine = useRef<AudioEngine | null>(null);
    const orbManager = useRef<OrbManager | null>(null);
    
    const initializeAudioEngine = useCallback(async (initialVols: Volumes) => {
        try {
            if (!orbManager.current) {
                const padContainer = document.querySelector('main');
                orbManager.current = new OrbManager(padContainer);
            }

            if (!audioEngine.current) {
                const context = new (window.AudioContext || (window as any).webkitAudioContext)();
                if (context.state === 'suspended') {
                    await context.resume();
                }
                const engine = new AudioEngine(context, orbManager.current);
                await engine.initialize();
                
                engine.getDrumMachine().on('playStateChanged', setIsPlaying);
                
                audioEngine.current = engine;
            }
            
            // Set volumes after engine is created and initialized
            audioEngine.current.setVolumes(initialVols);
            setVolumesState(initialVols);

            setIsReady(true);
            setIsPlaying(audioEngine.current.isPlaying);
            
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
        
        setIsAppStarted(true);
        const audio = new Audio('/assets/sounds/transition.webm');
        audio.play().catch(e => console.error("Error playing transition sound:", e));
        
        const initialVols = loadVolumes();
        await initializeAudioEngine(initialVols);
    }, [isAppStarted, initializeAudioEngine]);

    useEffect(() => {
      const resumeAudio = async () => {
        if (audioEngine.current?.isInitialized && audioEngine.current.getContext().state === 'suspended') {
          await audioEngine.current.getContext().resume();
        }
      };
      document.addEventListener('click', resumeAudio, { once: true });
      document.addEventListener('touchstart', resumeAudio, { once: true });
      
      const engine = audioEngine.current;
      const playStateCallback = (playing: boolean) => setIsPlaying(playing);
      engine?.getDrumMachine().on('playStateChanged', playStateCallback);

      return () => {
        document.removeEventListener('click', resumeAudio);
        document.removeEventListener('touchstart', resumeAudio);
        engine?.getDrumMachine().off('playStateChanged', playStateCallback);
      };
    }, []);
    
    // This is the single, stable function to update volumes.
    const setVolumes = useCallback((newVolumes: Partial<Volumes> | ((v: Volumes) => Volumes)) => {
        setVolumesState(prev => {
            const updated = typeof newVolumes === 'function' ? newVolumes(prev) : { ...prev, ...newVolumes };
            audioEngine.current?.setVolumes(updated);
            if (getCookie("ethermusic_consent") === 'true') {
                saveVolumes(updated);
            }
            return updated;
        });
    }, []);

    const stopAllSounds = useCallback(() => {
        audioEngine.current?.stopAllSounds();
    }, []);

    const setBeatPattern = useCallback((patternName: string) => {
        audioEngine.current?.setBeatPattern(patternName);
    }, []);
    
    const setBassLatch = useCallback((isOn: boolean) => {
        audioEngine.current?.setBassLatch(isOn);
    }, []);

    const startRecording = useCallback(() => {
        audioEngine.current?.startRecording();
    }, []);

    const stopRecording = useCallback(() => {
        audioEngine.current?.stopRecording();
    }, []);
    
    const handleThereminInteraction = useCallback((type: 'melody' | 'bass', data: { frequency: number; volume: number; pointerId: number; x: number, y: number } | null, state: 'down' | 'move' | 'up') => {
        if (!isReady || !audioEngine.current) return;
        audioEngine.current.handleThereminInteraction(type, data, state);
    }, [isReady]);

    const setMelodyInstrument = useCallback((instrumentName: Instrument) => {
        audioEngine.current?.setMelodyInstrument(instrumentName);
    }, []);
    
    const setBassInstrument = useCallback((instrumentName: BassInstrument) => {
        const newVolumes = audioEngine.current?.setBassInstrument(instrumentName);
        if (newVolumes) {
            setVolumes(newVolumes);
        }
    }, [setVolumes]);

    return {
        isAppStarted,
        isReady,
        isPlaying,
        audioEngine: audioEngine.current,
        orbManager: orbManager.current,
        volumes,
        setVolumes,
        startApp,
        stopAllSounds,
        setBeatPattern,
        setBassLatch,
        startRecording,
        stopRecording,
        handleThereminInteraction,
        setMelodyInstrument,
        setBassInstrument,
    };
}

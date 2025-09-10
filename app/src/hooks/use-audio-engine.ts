
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

function saveVolumes(volumes: Volumes) {
    if (typeof window === 'undefined' || getCookie("ethermusic_consent") !== 'true') {
        return;
    }
    try {
        setCookie("ethermusic_volumes", JSON.stringify(volumes), 365);
    } catch (e) {
        console.error("Failed to save volume settings to cookies", e);
    }
}

export const defaultVolumes: Volumes = { 
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

export function loadVolumes(): Volumes {
     if (typeof window === 'undefined') return defaultVolumes;
     const consent = getCookie("ethermusic_consent") === 'true';
     if (!consent) return defaultVolumes;
     try {
        const savedVolumes = getCookie("ethermusic_volumes");
        if (!savedVolumes) return defaultVolumes;
        
        const parsed = JSON.parse(savedVolumes);
        // A simple check to see if it's a valid-looking object
        if (parsed && typeof parsed.melody === 'object' && typeof parsed.compressor === 'object') {
            // Deep merge with defaults to ensure all properties are present
            const mergeDeep = (target: any, source: any) => {
                for (const key in source) {
                    if (source[key] instanceof Object && key in target) {
                        Object.assign(source[key], mergeDeep(target[key], source[key]))
                    }
                }
                return Object.assign(target || {}, source)
            }
            return mergeDeep(defaultVolumes, parsed);
        }
        
        return defaultVolumes;

    } catch (e) {
        console.error("Failed to load volume settings from cookies", e);
        return defaultVolumes;
    }
}

export function useAudioEngine(initialVolumes: Volumes) {
    const { toast } = useToast();
    
    const [isAppStarted, setIsAppStarted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    
    const audioEngine = useRef<AudioEngine | null>(null);
    const orbManager = useRef<OrbManager | null>(null);
    
    const [volumes, setVolumesState] = useState<Volumes>(initialVolumes);
    const currentTempo = volumes.tempo;
    
    const initializeAudioEngine = useCallback(async (vols: Volumes) => {
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
                
                engine.setVolumes(vols);
                setVolumesState(vols);
                audioEngine.current = engine;
            }
            
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

    const startApp = useCallback(async (vols: Volumes) => {
        if (isAppStarted) return;
        
        setIsAppStarted(true);
        const audio = new Audio('/assets/sounds/transition.webm');
        audio.play().catch(e => console.error("Error playing transition sound:", e));
        
        await initializeAudioEngine(vols);
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
    
    const setVolumes = useCallback((newVolumes: Partial<Volumes> | ((prev: Volumes) => Volumes)) => {
        setVolumesState(prev => {
            const updated = typeof newVolumes === 'function' ? newVolumes(prev) : { ...prev, ...newVolumes };
            if (audioEngine.current) {
                audioEngine.current.setVolumes(updated);
            }
            if (getCookie("ethermusic_consent") === 'true') {
                saveVolumes(updated);
            }
            return updated;
        });
    }, []);

    const setTempo = useCallback((tempo: number) => {
        setVolumes(v => ({ ...v, tempo }));
    }, [setVolumes]);
    
    const setSwing = useCallback((swing: number) => {
        setVolumes(v => ({...v, swing }));
    }, [setVolumes]);

    const setCompressorSettings = useCallback((compressorSettings: CompressorSettings) => {
        setVolumes(v => ({...v, compressor: compressorSettings }));
    }, [setVolumes]);

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
    
    const setBassInstrument = useCallback((instrumentName: BassInstrument): Volumes | undefined => {
        if(audioEngine.current){
            const newVolumes = audioEngine.current.setBassInstrument(instrumentName);
            if (newVolumes) {
              setVolumes(newVolumes); // Update state via the centralized setter
              return newVolumes
            }
        }
        return undefined;
    }, [setVolumes]);

    return {
        isAppStarted,
        isReady,
        isPlaying,
        audioEngine: audioEngine.current,
        orbManager: orbManager.current,
        startApp,
        stopAllSounds,
        volumes,
        setVolumes,
        setTempo,
        setSwing,
        setCompressorSettings,
        setMelodyInstrument,
        setBassInstrument,
        setBeatPattern,
        setBassLatch,
        startRecording,
        stopRecording,
        handleThereminInteraction,
        currentTempo
    };
}


"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { AudioEngine } from '@/lib/audio-engine';
import { OrbManager } from '@/lib/orb-manager';
import type { Volumes, Instrument, BassInstrument } from '@/types';
import Cookies from 'js-cookie';

function saveVolumes(volumes: Volumes) {
    if (typeof window === 'undefined') return;

    try {
        const consent = Cookies.get("ethermusic_consent") === 'true';
        if (!consent) {
            return;
        }
        Cookies.set("ethermusic_volumes", JSON.stringify(volumes), { expires: 365, path: '/', sameSite: 'lax' });
    } catch (e) {
        console.error("Failed to save volume settings to cookies", e);
    }
}

export const defaultVolumes: Volumes = { 
    melody: { gain: 0, reverbSend: -18, distortion: 0 },
    manualBass: { gain: -6, reverbSend: -48, distortion: 0 },
    latch: { gain: -6, reverbSend: -48, distortion: 0 },
    drums: { gain: -12, reverbSend: -48, distortion: 0 },
    reverbReturn: -25,
    compressor: {
        enabled: true,
        threshold: -24, 
        ratio: 7, 
        attack: 0.003,
        release: 0.25
    },
    swing: 0.33,
    tempo: 90,
};

export function loadVolumes(): Volumes {
     if (typeof window === 'undefined') return defaultVolumes;
     
     try {
        const savedVolumes = Cookies.get("ethermusic_volumes");
        if (!savedVolumes) return defaultVolumes;
        
        const parsed = JSON.parse(savedVolumes);

        // Deep merge with defaults to ensure all properties are present and valid
        const merged = {
            ...defaultVolumes,
            ...parsed,
            melody: { ...defaultVolumes.melody, ...(parsed.melody || {}) },
            manualBass: { ...defaultVolumes.manualBass, ...(parsed.manualBass || {}) },
            latch: { ...defaultVolumes.latch, ...(parsed.latch || {}) },
            drums: { ...defaultVolumes.drums, ...(parsed.drums || {}) },
            compressor: { ...defaultVolumes.compressor, ...(parsed.compressor || {}) },
        };
        return merged;

    } catch (e) {
        console.error("Failed to load volume settings from cookies", e);
        return defaultVolumes;
    }
}


export function useAudioEngine() {
    const { toast } = useToast();
    
    const [isAppStarted, setIsAppStarted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    
    const audioEngine = useRef<AudioEngine | null>(null);
    const [orbManager, setOrbManager] = useState<OrbManager | null>(null);
    
    const [volumes, setVolumesState] = useState<Volumes>(defaultVolumes);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTempo, setCurrentTempo] = useState(defaultVolumes.tempo);


    const initializeAudioEngine = useCallback(async () => {
        try {
            if (!audioEngine.current) {
                const context = new (window.AudioContext || (window as any).webkitAudioContext)();
                if (context.state === 'suspended') {
                    await context.resume();
                }
                
                const engine = new AudioEngine(context);
                await engine.initialize();
                
                const currentVolumes = loadVolumes();
                engine.setVolumes(currentVolumes, true);
                setVolumesState(currentVolumes); 
                setCurrentTempo(currentVolumes.tempo);

                audioEngine.current = engine;
            }
            
            setIsReady(true);
            
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
        if (typeof window !== 'undefined') {
            const audio = new Audio('/assets/sounds/transition.webm');
            audio.play().catch(e => console.error("Error playing transition sound:", e));
        }
        
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
        }
    }, []);
    
    const setVolumes = useCallback((newVolumes: Volumes | ((prev: Volumes) => Volumes)) => {
        setVolumesState(prev => {
            const updated = typeof newVolumes === 'function' ? newVolumes(prev) : newVolumes;
             if (audioEngine.current) {
                audioEngine.current.setVolumes(updated);
            }
            if (updated.tempo !== prev.tempo) {
                setCurrentTempo(updated.tempo);
            }
            saveVolumes(updated);
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
        if(audioEngine.current){
             const newVolumes = audioEngine.current.setBassInstrument(instrumentName);
             if (newVolumes) {
                setVolumes(newVolumes);
             }
        }
    }, [setVolumes]);

    return {
        isAppStarted,
        isReady,
        isPlaying,
        audioEngine: audioEngine.current,
        setOrbManager: (manager: OrbManager | null) => {
            if (audioEngine.current) {
                audioEngine.current.setOrbManager(manager);
            }
        },
        startApp,
        stopAllSounds,
        volumes,
        setVolumes,
        currentTempo,
        setIsPlaying,
        setMelodyInstrument,
        setBassInstrument,
        setBeatPattern,
        setBassLatch,
        startRecording,
        stopRecording,
        handleThereminInteraction,
    };
}


"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { AudioEngine } from '@/lib/audio-engine';
import { OrbManager } from '@/lib/orb-manager';
import type { Volumes, Instrument, BassInstrument, AudioEngineEvents } from '@/types';
import mitt, { Emitter } from 'mitt';

// Removed all cookie-related functions (getCookie, setCookie, saveVolumes, loadVolumes)

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

const emitter = mitt<AudioEngineEvents>();

export function useAudioEngine() {
    const { toast } = useToast();
    
    const [isAppStarted, setIsAppStarted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    
    const audioEngine = useRef<AudioEngine | null>(null);
    const orbManager = useRef<OrbManager | null>(null);
    
    // Initialize volumes state directly with defaultVolumes.
    const [volumes, setVolumesState] = useState<Volumes>(defaultVolumes);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTempo, setCurrentTempo] = useState(volumes.tempo);
    
    const initializeAudioEngine = useCallback(async () => {
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
                
                const engine = new AudioEngine(context, orbManager.current, emitter);
                await engine.initialize();
                
                // Set volumes directly, no longer loading from cookies.
                engine.setVolumes(defaultVolumes);
                setVolumesState(defaultVolumes); 

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
        const handleVolumesChanged = (newVolumes: Volumes) => {
            setVolumesState(newVolumes);
            if (newVolumes.tempo !== currentTempo) {
                setCurrentTempo(newVolumes.tempo);
            }
        };

        const handlePlayStateChanged = (playing: boolean) => {
            setIsPlaying(playing);
        };
        
        emitter.on('volumesChanged', handleVolumesChanged);
        emitter.on('playStateChanged', handlePlayStateChanged);
        
        const resumeAudio = async () => {
            if (audioEngine.current?.isInitialized && audioEngine.current.getContext().state === 'suspended') {
                await audioEngine.current.getContext().resume();
            }
        };
        document.addEventListener('click', resumeAudio, { once: true });
        document.addEventListener('touchstart', resumeAudio, { once: true });

        return () => {
            emitter.off('volumesChanged', handleVolumesChanged);
            emitter.off('playStateChanged', handlePlayStateChanged);
            document.removeEventListener('click', resumeAudio);
            document.removeEventListener('touchstart', resumeAudio);
        }
    }, [currentTempo]);
    
    const setVolumes = useCallback((newVolumes: Volumes | ((prev: Volumes) => Volumes)) => {
        setVolumesState(prev => {
            const updated = typeof newVolumes === 'function' ? newVolumes(prev) : newVolumes;
            if (audioEngine.current) {
                audioEngine.current.setVolumes(updated);
            }
            // saveVolumes call removed
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
        orbManager: orbManager.current,
        startApp,
        stopAllSounds,
        volumes,
        setVolumes,
        currentTempo,
        setMelodyInstrument,
        setBassInstrument,
        setBeatPattern,
        setBassLatch,
        startRecording,
        stopRecording,
        handleThereminInteraction,
    };
}

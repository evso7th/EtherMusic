
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

export function useAudioEngine(initialVolumes: Volumes) {
    const { toast } = useToast();
    
    const [isAppStarted, setIsAppStarted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    
    const audioEngine = useRef<AudioEngine | null>(null);
    const orbManager = useRef<OrbManager | null>(null);
    
    const [volumes, setVolumesState] = useState<Volumes>(initialVolumes);
    const [currentTempo, setCurrentTempo] = useState(initialVolumes.tempo);
    
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
                const engine = new AudioEngine(context, orbManager.current);
                await engine.initialize();
                
                engine.getDrumMachine().on('playStateChanged', setIsPlaying);
                
                engine.setVolumes(volumes);
                setCurrentTempo(volumes.tempo);
                
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
    }, [toast, volumes]);

    const startApp = useCallback(async () => {
        if (isAppStarted) return;
        
        setIsAppStarted(true);
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
      
      const engine = audioEngine.current;
      return () => {
        document.removeEventListener('click', resumeAudio);
        document.removeEventListener('touchstart', resumeAudio);
        engine?.getDrumMachine().off('playStateChanged', setIsPlaying);
      };
    }, []);
    
    const setVolumes = useCallback((newVolumes: Partial<Volumes> | ((prev: Volumes) => Volumes)) => {
        setVolumesState(prev => {
            const updated = typeof newVolumes === 'function' ? newVolumes(prev) : { ...prev, ...newVolumes };
            audioEngine.current?.setVolumes(updated);
             if (getCookie("ethermusic_consent") === 'true') {
                saveVolumes(updated);
            }
            return updated;
        });
    }, []);

    const setTempo = useCallback((tempo: number) => {
        setCurrentTempo(tempo);
        setVolumes(v => ({ ...v, tempo }));
    }, [setVolumes]);
    
    const setSwing = useCallback((swing: number) => {
        setVolumes(v => ({...v, swing }));
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
    
    const setBassInstrument = useCallback((instrumentName: BassInstrument) => {
        const newVolumes = audioEngine.current?.setBassInstrument(instrumentName);
        if (newVolumes) {
            setVolumesState(newVolumes);
            if (getCookie("ethermusic_consent") === 'true') {
                saveVolumes(newVolumes);
            }
        }
    }, []);
    
    const handleCompressorChange = useCallback((compressorSettings: CompressorSettings) => {
        setVolumes(v => ({...v, compressor: compressorSettings }));
    }, [setVolumes]);

    useEffect(() => {
        audioEngine.current?.setVolumes(volumes);
    }, [volumes]);


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
        setMelodyInstrument,
        setBassInstrument,
        setBeatPattern,
        setBassLatch,
        startRecording,
        stopRecording,
        handleThereminInteraction,
        handleCompressorChange,
        currentTempo
    };
}

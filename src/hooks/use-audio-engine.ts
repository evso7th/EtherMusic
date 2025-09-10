
"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { AudioEngine } from '@/lib/audio-engine';
import { OrbManager } from '@/lib/orb-manager';
import type { Volumes, Instrument, BassInstrument, CompressorSettings } from '@/types';

// This function is now outside the component to avoid being part of the props
function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
}

export function useAudioEngine(defaultVolumes: Volumes) {
    const { toast } = useToast();
    
    const [isAppStarted, setIsAppStarted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTempo, setCurrentTempo] = useState(defaultVolumes.swing);

    const audioEngine = useRef<AudioEngine | null>(null);
    const orbManager = useRef<OrbManager | null>(null);
    
    // The volumes state is now managed inside the hook, not passed in from Home.
    const [volumes, setVolumesState] = useState<Volumes>(defaultVolumes);
    
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
                
                engine.getDrumMachine().on('playStateChanged', (playing: boolean) => {
                    setIsPlaying(playing);
                });
                
                engine.setVolumes(initialVols);
                setCurrentTempo(initialVols.swing);
                
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

    const startApp = useCallback(async (initialVols: Volumes) => {
        if (isAppStarted) return;
        
        setIsAppStarted(true);
        const audio = new Audio('/assets/sounds/transition.webm');
        audio.play().catch(e => console.error("Error playing transition sound:", e));
        
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
      return () => {
        document.removeEventListener('click', resumeAudio);
        document.removeEventListener('touchstart', resumeAudio);
      };
    }, []);

    const stopAllSounds = useCallback(() => {
        audioEngine.current?.stopAllSounds();
    }, []);

    const setVolumes = useCallback((newVolumes: Partial<Volumes> | ((v: Volumes) => Partial<Volumes>)) => {
        setVolumesState(prev => {
            const updatedPartial = typeof newVolumes === 'function' ? newVolumes(prev) : newVolumes;
            const updated = { ...prev, ...updatedPartial };
            audioEngine.current?.setVolumes(updated);

            // Also save to cookies if consent is given
            if (getCookie("ethermusic_consent") === 'true') {
                try {
                    const cookieValue = JSON.stringify(updated);
                    const date = new Date();
                    date.setTime(date.getTime() + (365 * 24 * 60 * 60 * 1000));
                    const expires = "; expires=" + date.toUTCString();
                    document.cookie = "ethermusic_volumes=" + (cookieValue || "") + expires + "; path=/; SameSite=Lax";
                } catch (e) {
                    console.error("Failed to save volume settings to cookies", e);
                }
            }
            return updated;
        });
    }, []);

    const setTempo = useCallback((tempo: number) => {
        audioEngine.current?.setTempo(tempo);
        setCurrentTempo(tempo);
    }, []);

    const setSwing = useCallback((swing: number) => {
        setVolumes({ swing });
    }, [setVolumes]);
    
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
            setVolumesState(newVolumes); // Update internal state directly
             if (getCookie("ethermusic_consent") === 'true') {
                 try {
                    setCookie("ethermusic_volumes", JSON.stringify(newVolumes), 365);
                 } catch (e) {
                    console.error("Failed to save volume settings to cookies", e);
                 }
            }
        }
    }, []);
    
    const handleCompressorChange = useCallback((compressorSettings: CompressorSettings) => {
        setVolumes(v => ({...v, compressor: compressorSettings }));
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
        setMelodyInstrument,
        setBassInstrument,
        setBeatPattern,
        setBassLatch,
        startRecording,
        stopRecording,
        handleThereminInteraction,
        handleCompressorChange,
        currentTempo,
    };
}

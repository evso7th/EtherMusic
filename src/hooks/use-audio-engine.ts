
"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { AudioEngine } from '@/lib/audio-engine';
import { OrbManager } from '@/lib/orb-manager';
import type { Volumes, Instrument, BassInstrument } from '@/types';

export function useAudioEngine(initialVolumes: Volumes) {
    const { toast } = useToast();
    
    const [isAppStarted, setIsAppStarted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    
    const audioEngine = useRef<AudioEngine | null>(null);
    const orbManager = useRef<OrbManager | null>(null);
    
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
                audioEngine.current = engine;
            } else {
                audioEngine.current.setVolumes(vols);
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

    useEffect(() => {
        if (audioEngine.current) {
            audioEngine.current.setVolumes(initialVolumes);
        }
    }, [initialVolumes]);

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
        return audioEngine.current?.setBassInstrument(instrumentName);
    }, []);

    return {
        isAppStarted,
        isReady,
        isPlaying,
        audioEngine: audioEngine.current,
        orbManager: orbManager.current,
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

    
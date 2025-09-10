
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

    const audioEngine = useRef<AudioEngine | null>(null);
    const orbManager = useRef<OrbManager | null>(null);
    
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
                
                engine.getDrumMachine().on('playStateChanged', (playing: boolean) => {
                    setIsPlaying(playing);
                });
                
                engine.on('volumesChanged', (newVolumes: Volumes) => {
                    // This is to update the UI when bass instrument changes effects
                    // This is not available in the hook's state to avoid loops
                });

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

    const startApp = useCallback(async () => {
        if (isAppStarted) return;
        
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

    const stopAllSounds = useCallback(() => {
        if (!audioEngine.current) return;
        audioEngine.current.stopAllSounds();
    }, []);

    const setVolumes = useCallback((volumes: Volumes) => {
        audioEngine.current?.setVolumes(volumes);
    }, []);

    const setTempo = useCallback((tempo: number) => {
        audioEngine.current?.setTempo(tempo);
    }, []);

    const setSwing = useCallback((swing: number) => {
        audioEngine.current?.setSwing(swing);
    }, []);
    
    const setBeatPattern = useCallback((patternName: string) => {
        if (!audioEngine.current) return;
        
        audioEngine.current.setBeatPattern(patternName);

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
        stopAllSounds,
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
    };
}


"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import { useToast } from "@/hooks/use-toast";
import { AudioEngine } from '@/lib/audio-engine';
import { OrbManager } from '@/lib/orb-manager';
import type { Instrument, Volumes } from '@/types';

export function useAudioEngine() {
    const { toast } = useToast();
    
    const [isAppStarted, setIsAppStarted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [sleepTimerId, setSleepTimerId] = useState<NodeJS.Timeout | null>(null);

    const audioEngine = useRef<AudioEngine | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined' && !audioEngine.current) {
            const om = new OrbManager();
            audioEngine.current = new AudioEngine(om);
        }
    }, []);

    const startApp = useCallback(async () => {
        if (isAppStarted || !audioEngine.current) return;

        const audio = new Audio('/assets/sounds/transition.webm');
        audio.play().catch(e => console.error("Error playing transition sound:", e));
        
        setIsAppStarted(true);

        try {
            await Tone.start();
            console.log("AudioContext started by user gesture.");
            
            await audioEngine.current.initialize();
            
            setIsReady(true);
            setIsPlaying(Tone.Transport.state === 'started');
            console.log('AudioEngine initialized and ready.');

        } catch(e) {
            console.error("Failed to initialize audio engines:", e);
            toast({
                title: "Audio Error",
                description: e instanceof Error ? e.message : "Could not initialize the audio engine. Please refresh the page.",
                variant: "destructive"
            });
        }
    }, [isAppStarted, toast]);

    const play = useCallback(() => {
        if (!isReady) return;
        if (Tone.Transport.state !== 'started') {
            Tone.Transport.start();
        }
        setIsPlaying(true);
    }, [isReady]);

    const pause = useCallback(() => {
        if (!isReady) return;
        Tone.Transport.pause();
        setIsPlaying(false);
    }, [isReady]);

    const stop = useCallback(() => {
        if (!audioEngine.current) return;
        Tone.Transport.stop();
        setIsPlaying(false);
        audioEngine.current.stopAllSounds();
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
                if (audioEngine.current?.masterOut) {
                    audioEngine.current.masterOut.gain.linearRampTo(0, 5);
                }
                setTimeout(() => {
                    stop();
                }, 5500);
            }, durationMinutes * 60 * 1000);
            setSleepTimerId(id);
        }
    }, [sleepTimerId, stop]);
    
    const handleThereminInteraction = useCallback((type: 'melody' | 'bass', data: { frequency: number; volume: number; pointerId: number; x: number, y: number } | null, state: 'down' | 'move' | 'up') => {
        if (!isReady || !audioEngine.current) return;
        
        const engine = audioEngine.current;
        const padElement = document.getElementById(`theremin-pad-${type}`);
        if (!padElement) return;

        const rect = padElement.getBoundingClientRect();
        
        if (state === 'down' && data) {
            engine.startNote(type, data.pointerId, data.frequency, data.volume, {x: data.x, y: data.y, width: rect.width, height: rect.height});
        } else if (state === 'move' && data) {
            engine.updateNote(type, data.pointerId, data.frequency, data.volume, {x: data.x, y: data.y, width: rect.width, height: rect.height});
        } else if (state === 'up' && data) {
            engine.stopNote(type, data.pointerId);
        }
    }, [isReady]);

    const setMelodyInstrument = useCallback((instrument: Instrument) => {
        audioEngine.current?.setInstrument('melody', instrument);
    }, []);

    const setBassInstrument = useCallback((instrument: Instrument) => {
        audioEngine.current?.setInstrument('manualBass', instrument);
        audioEngine.current?.setInstrument('latch', instrument);
    }, []);

    return {
        isAppStarted,
        isReady,
        isPlaying,
        orbManager: audioEngine.current?.orbManager,
        startApp,
        play,
        pause,
        stop,
        setTempo,
        setVolumes,
        setBeatPattern,
        setBassLatch,
        startRecording,
        stopRecording,
        handleThereminInteraction,
        setSleepTimer,
        setMelodyInstrument,
        setBassInstrument,
    };
}

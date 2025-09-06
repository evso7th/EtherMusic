
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import { useToast } from "@/hooks/use-toast";
import { AudioEngine } from '@/lib/audio-engine';
import { OrbManager } from '@/lib/orb-manager';
import type { Volumes } from '@/types';
import { useWorker } from './use-worker';

export function useAudioEngine() {
    const { toast } = useToast();
    
    const [isAppStarted, setIsAppStarted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [sleepTimerId, setSleepTimerId] = useState<NodeJS.Timeout | null>(null);

    const audioEngine = useRef<AudioEngine | null>(null);
    const worker = useWorker('/workers/autopilot-worker.js'); // This is now safe

    useEffect(() => {
        if (!audioEngine.current) {
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
            console.log("Initializing audio resources after user gesture...");
            await Tone.start();
            
            await audioEngine.current.initialize(worker!);
            
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
    }, [isAppStarted, toast, worker]);

    const play = useCallback(() => {
        if (!isReady) return;
        Tone.Transport.start();
        setIsPlaying(true);
        audioEngine.current?.setAutopilotState(true);
    }, [isReady]);

    const pause = useCallback(() => {
        if (!isReady) return;
        Tone.Transport.pause();
        setIsPlaying(false);
        audioEngine.current?.setAutopilotState(false);
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
    
    const handleAutopilotChange = useCallback((settings: any) => {
        audioEngine.current?.updateAutopilot(settings);
    }, []);
    
    const handleAutopilotToggle = useCallback((isOn: boolean) => {
        audioEngine.current?.setAutopilot(isOn);
    }, []);

    const saveAutopilotPreset = useCallback((style: string) => {
        audioEngine.current?.saveAutopilotPreset(style);
    }, []);

    const loadAutopilotPreset = useCallback((style: string) => {
        return audioEngine.current?.loadAutopilotPreset(style);
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
                    audioEngine.current.masterOut.gain.linearRampToValueAtTime(0, Tone.now() + 5);
                }
                setTimeout(() => {
                    stop();
                    if(audioEngine.current?.masterOut) {
                       audioEngine.current.masterOut.gain.setValueAtTime(1, Tone.now());
                    }
                }, 5500);
            }, durationMinutes * 60 * 1000);
            setSleepTimerId(id);
        } else {
            // Cancel timer
            if(audioEngine.current?.masterOut) {
                audioEngine.current.masterOut.gain.cancelScheduledValues(Tone.now());
                audioEngine.current.masterOut.gain.setValueAtTime(1, Tone.now());
            }
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

    const handleHarmonyChange = useCallback((key: MusicKey, scale: MusicScale) => {
        audioEngine.current?.setHarmony(key, scale);
    }, []);
    

    return {
        isAppStarted,
        isReady,
        isPlaying,
        volumes: audioEngine.current?.getVolumes(),
        startApp,
        play,
        pause,
        stop,
        setTempo,
        setVolumes,
        setBeatPattern,
        setBassLatch,
        handleAutopilotChange,
        handleAutopilotToggle,
        saveAutopilotPreset,
        loadAutopilotPreset,
        startRecording,
        stopRecording,
        handleThereminInteraction,
        handleHarmonyChange,
        setSleepTimer,
        orbManager: audioEngine.current?.orbManager
    };
}

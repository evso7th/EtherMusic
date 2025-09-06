
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import { useToast } from "@/hooks/use-toast";
import { AudioEngine } from '@/lib/audio-engine';
import { OrbManager } from '@/lib/orb-manager';
import type { Instrument, MusicKey, MusicScale, Volumes } from '@/types';
import { useWorker } from './use-worker'; // Assuming this hook is now created.

export function useAudioEngine() {
    const { toast } = useToast();
    
    const [isAppStarted, setIsAppStarted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [sleepTimerId, setSleepTimerId] = useState<NodeJS.Timeout | null>(null);

    const audioEngine = useRef<AudioEngine | null>(null);
    const orbManager = useRef<OrbManager | null>(null);
    
    // Note: The autopilot worker is removed, but the structure to use a worker is kept.
    // If a drum machine worker were added, it would follow a similar pattern.
    // const autopilotWorker = useWorker('/workers/autopilot-worker.js'); // This would be the pattern

    const startApp = useCallback(async () => {
        if (isAppStarted) return;

        const audio = new Audio('/assets/sounds/transition.webm');
        audio.play().catch(e => console.error("Error playing transition sound:", e));
        
        setIsAppStarted(true);

        try {
            console.log("Initializing audio resources after user gesture...");
            await Tone.start();
            
            // AudioEngine now creates its own context.
            const engine = new AudioEngine();
            await engine.initialize();
            
            const om = new OrbManager();
            orbManager.current = om;
            engine.setOrbManager(om);

            audioEngine.current = engine;
            
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
        Tone.Transport.start();
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
    
    const setMelodyInstrument = useCallback((instrument: Instrument) => {
        audioEngine.current?.setMelodyInstrument(instrument);
    }, []);

    const setBassInstrument = useCallback((instrument: Instrument) => {
        audioEngine.current?.setBassInstrument(instrument);
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
        
        if (state === 'down' && data) {
            engine.startNote(type, data.pointerId, data.frequency, data.volume, {x: data.x, y: data.y});
        } else if (state === 'move' && data) {
            engine.updateNote(type, data.pointerId, data.frequency, data.volume, {x: data.x, y: data.y});
        } else if (state === 'up' && data) {
            engine.stopNote(type, data.pointerId);
        }
    }, [isReady]);
    
    // The setHarmony function is removed as it's no longer needed by the audio engine directly.
    // The harmony logic is now fully contained within page.tsx

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
        setMelodyInstrument,
        setBassInstrument,
        setBeatPattern,
        setBassLatch,
        startRecording,
        stopRecording,
        handleThereminInteraction,
        setSleepTimer,
        orbManager: orbManager.current
    };
}

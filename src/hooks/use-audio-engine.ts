
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import { useToast } from "@/hooks/use-toast";
import { AudioEngine } from '@/lib/audio-engine';
import { OrbManager } from '@/lib/orb-manager';
import type { WorkerResponse } from '@/lib/autopilot-worker';
import type { Instrument, MusicKey, MusicScale, Tempo, AutopilotPart } from '@/types';

type UseAudioEngineProps = {
    worker: Worker | null;
};

export function useAudioEngine({ worker }: UseAudioEngineProps) {
    const { toast } = useToast();
    
    const [isAppStarted, setIsAppStarted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [sleepTimerId, setSleepTimerId] = useState<NodeJS.Timeout | null>(null);

    const audioEngine = useRef<AudioEngine | null>(null);
    const autopilotWorker = useRef<Worker | null>(worker);
    const orbManager = useRef<OrbManager | null>(null);

    useEffect(() => {
        autopilotWorker.current = worker;
    }, [worker]);

    const startApp = useCallback(async () => {
        if (isAppStarted) return;

        const audio = new Audio('/assets/sounds/transition.webm');
        audio.play().catch(e => console.error("Error playing transition sound:", e));
        
        setIsAppStarted(true);

        try {
            console.log("Initializing audio resources after user gesture...");
            await Tone.start();
            
            const context = new AudioContext();
            Tone.setContext(context);
            
            const om = new OrbManager();
            orbManager.current = om;

            const engine = new AudioEngine(context);
            await engine.initialize();
            engine.setOrbManager(om);
            audioEngine.current = engine;

            if (autopilotWorker.current) {
                autopilotWorker.current.onmessage = (e: MessageEvent<WorkerResponse>) => {
                    const currentEngine = audioEngine.current;
                    if (!currentEngine) return;

                    if (e.data.type === 'playNote' && e.data.note) {
                        currentEngine.playWorkerNotesBatch([e.data.note]);
                    } else if (e.data.type === 'updateNote' && e.data.note) {
                        currentEngine.updateWorkerNote(e.data.note);
                    } else if (e.data.type === 'playNotesBatch' && e.data.notes) {
                        currentEngine.playWorkerNotesBatch(e.data.notes);
                    }
                };

                Tone.Transport.scheduleRepeat((time) => {
                    autopilotWorker.current?.postMessage({ type: 'tick', time });
                }, '16n');
            }


            setIsReady(true);
            setIsPlaying(Tone.Transport.state === 'started');
            console.log('Audio engines and worker initialized and ready.');

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

    const setTempo = useCallback((tempo: Tempo) => {
        audioEngine.current?.setTempo(tempo.bpm);
        autopilotWorker.current?.postMessage({ type: 'setTempo', bpm: tempo.bpm });
    }, []);

    const setVolumes = useCallback((volumes: any) => {
        audioEngine.current?.setVolumes(volumes);
    }, []);

    const setHarmony = useCallback((key: MusicKey, scale: MusicScale) => {
        audioEngine.current?.setHarmony(key, scale);
        autopilotWorker.current?.postMessage({ type: 'setHarmony', key, scale });
    }, []);
    
    const setDensity = useCallback((density: number) => {
        autopilotWorker.current?.postMessage({ type: 'setDensity', density });
    }, []);

    const setMelodyInstrument = useCallback((instrument: Instrument) => {
        audioEngine.current?.setMelodyInstrument(instrument);
    }, []);

    const setBassInstrument = useCallback((instrument: Instrument) => {
        audioEngine.current?.setBassInstrument(instrument);
    }, []);

    const setAutopilotInstrument = useCallback((part: AutopilotPart, instrument: Instrument) => {
        audioEngine.current?.setAutopilotInstrument(part, instrument);
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
                audioEngine.current?.masterOut.gain.linearRampToValueAtTime(0, Tone.now() + 5);
                setTimeout(() => {
                    stop();
                    audioEngine.current?.masterOut.gain.setValueAtTime(1, Tone.now());
                }, 5500);
            }, durationMinutes * 60 * 1000);
            setSleepTimerId(id);
        } else {
            // Cancel timer
            audioEngine.current?.masterOut.gain.cancelScheduledValues(Tone.now());
            audioEngine.current?.masterOut.gain.setValueAtTime(1, Tone.now());
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

    const startAutopilot = useCallback(() => {
        autopilotWorker.current?.postMessage({ type: 'start' });
    }, []);

    const stopAutopilot = useCallback(() => {
        autopilotWorker.current?.postMessage({ type: 'stop' });
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
        setHarmony,
        setDensity,
        setMelodyInstrument,
        setBassInstrument,
        setAutopilotInstrument,
        setBeatPattern,
        setBassLatch,
        startRecording,
        stopRecording,
        handleThereminInteraction,
        startAutopilot,
        stopAutopilot,
        setSleepTimer,
        orbManager: orbManager.current
    };
}

    
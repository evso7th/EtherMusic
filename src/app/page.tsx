"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import type * as Tone from 'tone';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ThereminPad } from '@/components/theremin-pad';
import { BeatBoxControls } from '@/components/beat-box-controls';
import { MixerControls } from '@/components/mixer-controls';
import { PlaybackControls } from '@/components/playback-controls';
import { SlidersHorizontal } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

type BeatPattern = {
    name: string;
    sequence: string[];
};

const beatPatterns: BeatPattern[] = [
    { name: 'Rock', sequence: ['C1', null, 'C2', 'D2', 'C1', null, 'C2', null] },
    { name: 'House', sequence: ['C1', 'D2', 'C2', 'D2', 'C1', 'D2', 'C2', 'D2'] },
    { name: 'Hip Hop', sequence: ['C1', null, 'C2', null, 'C1', 'D2', 'C1', 'C2'] },
    { name: 'Off', sequence: [] },
];

export default function Home() {
    const { toast } = useToast();
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isBassPulsating, setIsBassPulsating] = useState(false);
    
    // Audio state
    const [tempo, setTempo] = useState(120);
    const [volumes, setVolumes] = useState({ melody: -6, bass: -6, drums: -6 });
    const [activePattern, setActivePattern] = useState<BeatPattern>(beatPatterns[3]);

    // Tone.js refs
    const audioInitialized = useRef(false);
    const melodySynth = useRef<Tone.AMSynth | null>(null);
    const bassSynth = useRef<Tone.MonoSynth | null>(null);
    const drumSynths = useRef<{ kick: Tone.MembraneSynth, snare: Tone.NoiseSynth, hat: Tone.MetalSynth } | null>(null);
    const channels = useRef<{ melody: Tone.Channel, bass: Tone.Channel, drums: Tone.Channel } | null>(null);
    const drumSequence = useRef<Tone.Sequence | null>(null);
    const recorder = useRef<Tone.Recorder | null>(null);
    const bassLFO = useRef<Tone.LFO | null>(null);

    const initializeAudio = useCallback(async () => {
        if (audioInitialized.current) return;
        audioInitialized.current = true;
        
        const Tone = await import('tone');

        melodySynth.current = new Tone.AMSynth({
            harmonicity: 1.5,
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.2 },
            modulationEnvelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 0.1 }
        }).toDestination();
        
        bassSynth.current = new Tone.MonoSynth({
            oscillator: { type: 'fatsawtooth' },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.8 },
            filterEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.2, release: 0.5, baseFrequency: 200, octaves: 4 }
        }).toDestination();

        bassLFO.current = new Tone.LFO({
            frequency: "4n",
            min: -24,
            max: 0,
            amplitude: 1
        }).start();


        channels.current = {
            melody: new Tone.Channel(volumes.melody).connect(Tone.getDestination()),
            bass: new Tone.Channel(volumes.bass).connect(Tone.getDestination()),
            drums: new Tone.Channel(volumes.drums).connect(Tone.getDestination()),
        };

        melodySynth.current.connect(channels.current.melody);
        bassSynth.current.connect(channels.current.bass);
        
        drumSynths.current = {
            kick: new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 6, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: 'exponential' } }).connect(channels.current.drums),
            snare: new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.005, decay: 0.2, sustain: 0 } }).connect(channels.current.drums),
            hat: new Tone.MetalSynth({ frequency: 200, envelope: { attack: 0.001, decay: 0.1, release: 0.05 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5 }).connect(channels.current.drums)
        };
        
        drumSequence.current = new Tone.Sequence((time, note) => {
            if (note === 'C1') drumSynths.current?.kick.triggerAttackRelease('C1', '8n', time);
            if (note === 'C2') drumSynths.current?.snare.triggerAttackRelease('16n', time);
            if (note === 'D2') drumSynths.current?.hat.triggerAttackRelease('16n', time);
        }, activePattern.sequence, '8n').start(0);

        recorder.current = new Tone.Recorder();
        Tone.getDestination().connect(recorder.current);
        
        Tone.Transport.bpm.value = tempo;
        setIsReady(true);
    }, [volumes.melody, volumes.bass, volumes.drums, tempo, activePattern.sequence]);
    
    const handlePlayPause = async () => {
        const Tone = await import('tone');
        if (!isReady) {
            await Tone.start();
            await initializeAudio();
        }
        if (Tone.Transport.state === 'started') {
            Tone.Transport.pause();
            setIsPlaying(false);
        } else {
            Tone.Transport.start();
            setIsPlaying(true);
        }
    };

    const handleStop = async () => {
        const Tone = await import('tone');
        if (!isReady) return;

        Tone.Transport.stop();
        melodySynth.current?.triggerRelease();
        bassSynth.current?.triggerRelease();
        setIsPlaying(false);
    };

    const handleRecord = () => {
        if (!recorder.current) return;
        if (!isRecording) {
            recorder.current.start();
            setIsRecording(true);
            toast({ title: "Recording Started", description: "All output is now being recorded." });
        } else {
            recorder.current.stop().then(async (recording) => {
                const url = URL.createObjectURL(recording);
                const anchor = document.createElement("a");
                anchor.download = "ethermusic_recording.webm";
                anchor.href = url;
                anchor.click();
                URL.revokeObjectURL(url);
                toast({ title: "Recording Stopped", description: "Your recording has been downloaded." });
            });
            setIsRecording(false);
        }
    };

    const handlePulsateToggle = () => {
        setIsBassPulsating(prev => !prev);
    }

    useEffect(() => {
        if (bassLFO.current && bassSynth.current) {
            if(isBassPulsating) {
                bassLFO.current.connect(bassSynth.current.volume);
            } else {
                bassLFO.current.disconnect(bassSynth.current.volume);
                // Reset volume to avoid it getting stuck at LFO value
                bassSynth.current.volume.value = 0; 
            }
        }
    }, [isBassPulsating]);
    
    useEffect(() => {
        const Tone = require('tone');
        if(drumSequence.current) {
            drumSequence.current.events = activePattern.sequence;
        }
        if (activePattern.name === 'Off' && isPlaying) {
             drumSequence.current?.stop();
        } else if (isPlaying) {
             drumSequence.current?.start(Tone.Transport.now());
        }
    }, [activePattern, isPlaying]);

    useEffect(() => {
        const Tone = require('tone');
        Tone.Transport.bpm.value = tempo;
        if (bassLFO.current) {
            bassLFO.current.frequency.value = Tone.Transport.bpm.value / 60 * 2; // Sync with quarter notes
        }
    }, [tempo]);

    useEffect(() => {
        if (channels.current) {
            channels.current.melody.volume.value = volumes.melody;
            channels.current.bass.volume.value = volumes.bass;
            channels.current.drums.volume.value = volumes.drums;
        }
    }, [volumes]);

    const handleThereminInteraction = useCallback((type: 'melody' | 'bass', data: { frequency: number; volume: number } | null) => {
        const synth = type === 'melody' ? melodySynth.current : bassSynth.current;
        if (!synth || !isPlaying) return;

        if (data) {
            const minDb = -48;
            const maxDb = 0;
            const dbVolume = minDb + data.volume * (maxDb - minDb);

            synth.triggerAttack(data.frequency);
            
            if(type === 'melody' && melodySynth.current) {
                melodySynth.current.volume.rampTo(dbVolume, 0.1);
            } else if (type === 'bass' && bassSynth.current) {
                 if (!isBassPulsating) {
                    bassSynth.current.volume.rampTo(dbVolume, 0.1);
                }
            }
        } else {
            synth.triggerRelease();
        }
    }, [isPlaying, isBassPulsating]);

    return (
        <div className="flex flex-col h-screen bg-background font-headline p-4 md:p-6 lg:p-8">
            <header className="flex items-center justify-between mb-4 flex-shrink-0">
                <h1 className="text-3xl md:text-4xl font-bold text-primary">EtherMusic</h1>
                <div className="flex items-center gap-2">
                    <PlaybackControls
                        isPlaying={isPlaying}
                        isRecording={isRecording}
                        onPlayPause={handlePlayPause}
                        onRecord={handleRecord}
                        onStop={handleStop}
                    />
                     <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                                <SlidersHorizontal />
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Mixer</DialogTitle>
                            </DialogHeader>
                            <MixerControls volumes={volumes} onVolumeChange={setVolumes} />
                        </DialogContent>
                    </Dialog>
                </div>
            </header>
            <main className="flex-grow flex flex-col gap-6">
                <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-6 h-[80vh]">
                    <ThereminPad
                        title="Bass (Left Hand)"
                        onInteraction={(data) => handleThereminInteraction('bass', data)}
                        frequencyRange={[55, 220]} // A1 to A3
                        color="hsl(var(--accent))"
                        isPulsating={isBassPulsating}
                        onPulsateToggle={handlePulsateToggle}
                    />
                    <ThereminPad
                        title="Melody (Right Hand)"
                        onInteraction={(data) => handleThereminInteraction('melody', data)}
                        frequencyRange={[220, 880]} // A3 to A5
                        color="hsl(var(--primary))"
                    />
                </div>
                <div className="h-[20vh] flex flex-col">
                    <BeatBoxControls
                        patterns={beatPatterns}
                        activePattern={activePattern}
                        onPatternChange={setActivePattern}
                        tempo={tempo}
                        onTempoChange={setTempo}
                    />
                </div>
            </main>
            {!isReady && !isPlaying && (
                 <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
                    <Button size="lg" onClick={handlePlayPause}>Click to Start EtherMusic</Button>
                </div>
            )}
        </div>
    );

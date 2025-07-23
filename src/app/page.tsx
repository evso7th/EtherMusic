
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
    sequence: (string | null)[];
};


const beatPatterns: BeatPattern[] = [
    { name: 'Rock', sequence: ['C1', null, 'C2', 'D2', 'C1', null, 'C2', null] },
    { name: 'House', sequence: ['C1', 'D2', 'C2', 'D2', 'C1', 'D2', 'C2', 'D2'] },
    { name: 'Hip Hop', sequence: ['C1', null, 'C2', null, 'C1', 'D2', 'C1', 'C2'] },
    { name: 'Off', sequence: [] },
];

export type MelodyInstrument = 'synth' | 'organ' | 'theremin' | 'glass';
const melodyInstruments: MelodyInstrument[] = ['synth', 'organ', 'theremin', 'glass'];


export default function Home() {
    const { toast } = useToast();
    const [isAppStarted, setIsAppStarted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    
    // Audio state
    const [tempo, setTempo] = useState(120);
    const [volumes, setVolumes] = useState({ melody: -6, bass: -12, drums: -6 });
    const [activePattern, setActivePattern] = useState<BeatPattern>(beatPatterns[3]);
    const [melodyInstrument, setMelodyInstrument] = useState<MelodyInstrument>('synth');

    // Bass specific state
    const [isBassPulsating, setIsBassPulsating] = useState(false);
    const [isBassLatchOn, setIsBassLatchOn] = useState(false);
    const [latchedBassNote, setLatchedBassNote] = useState<{ frequency: number; volume: number } | null>(null);

    // Tone.js refs
    const audioInitialized = useRef(false);
    const melodySynth = useRef<Tone.PolySynth | null>(null);
    const bassSynth = useRef<Tone.MonoSynth | null>(null);
    const drumSynths = useRef<{ kick: Tone.MembraneSynth, snare: Tone.NoiseSynth, hat: Tone.MetalSynth } | null>(null);
    const channels = useRef<{ melody: Tone.Channel, bass: Tone.Channel, drums: Tone.Channel } | null>(null);
    const drumSequence = useRef<Tone.Sequence | null>(null);
    const recorder = useRef<Tone.Recorder | null>(null);
    const bassLFO = useRef<Tone.LFO | null>(null);
    const bassVCA = useRef<Tone.Volume | null>(null);

    // Background Audio
    const backgroundAudioRef = useRef<HTMLAudioElement>(null);
    
    useEffect(() => {
        if (backgroundAudioRef.current) {
            backgroundAudioRef.current.volume = 0.2;
        }
    }, []);

    const initializeAudio = useCallback(async () => {
        if (audioInitialized.current) return;
        audioInitialized.current = true;
        
        const Tone = await import('tone');
        
        channels.current = {
            melody: new Tone.Channel(volumes.melody).toDestination(),
            bass: new Tone.Channel(volumes.bass).toDestination(),
            drums: new Tone.Channel(volumes.drums).toDestination(),
        };

        melodySynth.current = new Tone.PolySynth(Tone.AMSynth, {
            harmonicity: 1.5,
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.2 },
            modulationEnvelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 0.1 }
        }).connect(channels.current.melody);


        bassVCA.current = new Tone.Volume(0).connect(channels.current.bass);
        bassSynth.current = new Tone.MonoSynth({
            oscillator: { type: 'fatsawtooth' },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.8 },
            filterEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.2, release: 0.5, baseFrequency: 200, octaves: 4 }
        }).connect(bassVCA.current);

        bassLFO.current = new Tone.LFO({
            frequency: "4n",
            min: 0,
            max: -24, // Modulates from full volume to -24db
        }).start();

        drumSynths.current = {
            kick: new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 6, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: 'exponential' } }).connect(channels.current.drums),
            snare: new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.005, decay: 0.2, sustain: 0 } }).connect(channels.current.drums),
            hat: new Tone.MetalSynth({ frequency: 200, envelope: { attack: 0.001, decay: 0.1, release: 0.05 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5 }).connect(channels.current.drums)
        };
        
        drumSequence.current = new Tone.Sequence((time, note) => {
            if (note === 'C1') drumSynths.current?.kick.triggerAttackRelease('C1', '8n', time);
            if (note === 'C2') drumSynths.current?.snare.triggerAttackRelease('16n', time);
            if (note === 'D2') drumSynths.current?.hat.triggerAttackRelease('16n', time);
        }, activePattern.sequence, '8n');

        recorder.current = new Tone.Recorder();
        Tone.getDestination().connect(recorder.current);
        
        Tone.Transport.bpm.value = tempo;
        setIsReady(true);
    }, [volumes.melody, volumes.bass, volumes.drums, tempo, activePattern.sequence]);
    
    useEffect(() => {
        if (!isReady || !melodySynth.current) return;
        
        const Tone = require('tone');

        let newOptions;

        switch (melodyInstrument) {
            case 'organ':
                newOptions = {
                    oscillator: { type: 'fatsine' },
                    envelope: { attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.3 }
                };
                melodySynth.current.set(newOptions);
                break;
            case 'theremin':
                newOptions = {
                    oscillator: { type: "sine" },
                    envelope: { attack: 0.1, decay: 0.1, sustain: 0.8, release: 0.5 }
                };
                 melodySynth.current.set(newOptions);
                break;
            case 'glass':
                newOptions = {
                    harmonicity: 1.2,
                    modulationIndex: 10,
                    envelope: { attack: 0.3, decay: 0, sustain: 1, release: 0.8 },
                    modulationEnvelope: { attack: 0.5, decay: 0.2, sustain: 0.8, release: 0.5 }
                };
                melodySynth.current.set(newOptions);
                break;
            case 'synth':
            default:
                newOptions = {
                    harmonicity: 1.5,
                    envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.2 },
                    modulationEnvelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 0.1 }
                };
                melodySynth.current.set(newOptions);
                break;
        }
    }, [melodyInstrument, isReady]);

    const handleStartApp = async () => {
        const Tone = await import('tone');
        await Tone.start();
        if (backgroundAudioRef.current && !backgroundAudioRef.current.paused) {
            backgroundAudioRef.current.pause();
        }
        await initializeAudio();
        setIsAppStarted(true);
        setIsPlaying(true);
        Tone.Transport.start();
    }
    
    const handlePlayPause = async () => {
        const Tone = await import('tone');
        
        if (Tone.Transport.state === 'started') {
            Tone.Transport.pause();
            setIsPlaying(false);
        } else {
            await Tone.start();
            Tone.Transport.start();
            setIsPlaying(true);
        }
    };

    const handleStop = async () => {
        const Tone = await import('tone');
        if (!isReady) return;

        Tone.Transport.stop();
        melodySynth.current?.releaseAll();
        bassSynth.current?.triggerRelease();
        setIsPlaying(false);
        if (latchedBassNote) {
            setLatchedBassNote(null);
        }
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

    const handleLatchToggle = (checked: boolean) => {
        setIsBassLatchOn(checked);
        if (!checked && latchedBassNote) {
            setLatchedBassNote(null);
            bassSynth.current?.triggerRelease();
        }
    }

    useEffect(() => {
        if (bassLFO.current && bassVCA.current) {
            const isPulsationActive = isBassPulsating || (isBassLatchOn && !!latchedBassNote);
            if (isPulsationActive) {
                bassLFO.current.connect(bassVCA.current.volume);
            } else {
                bassLFO.current.disconnect(bassVCA.current.volume);
                // The main volume is now controlled by interaction, not the LFO
            }
        }
    }, [isBassPulsating, isBassLatchOn, latchedBassNote, isPlaying]);
    
    useEffect(() => {
        const Tone = require('tone');
        if (drumSequence.current) {
            drumSequence.current.stop();
            drumSequence.current.clear();
            drumSequence.current.events = activePattern.sequence;
            if (isPlaying && activePattern.name !== 'Off') {
                drumSequence.current.start(Tone.now());
            }
        }
    }, [activePattern, isPlaying]);

    useEffect(() => {
        const Tone = require('tone');
        Tone.Transport.bpm.value = tempo;
        if (bassLFO.current) {
            bassLFO.current.frequency.value = Tone.Transport.bpm.value / 60 * 2;
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
        if (!isPlaying || !melodySynth.current || !bassSynth.current || !bassVCA.current) return;

        const synth = type === 'melody' ? melodySynth.current : bassSynth.current;

        if (type === 'bass' && isBassLatchOn) {
             if (data && !latchedBassNote) {
                setLatchedBassNote(data);
            } else if (latchedBassNote) {
                setLatchedBassNote(null);
                bassSynth.current?.triggerRelease();
            }
            return;
        }
        
        if (data) {
            const minDb = -48;
            const maxDb = -6;
            const dbVolume = minDb + data.volume * (maxDb - minDb);
            
            if (type === 'melody') {
                 melodySynth.current.volume.rampTo(dbVolume, 0.1);
                 melodySynth.current.triggerAttack(data.frequency);
            } else { // bass
                 bassSynth.current.triggerAttack(data.frequency);
                 bassVCA.current.volume.rampTo(dbVolume, 0.1);
            }
        } else {
             if (type === 'bass' && !isBassLatchOn) {
                bassSynth.current.triggerRelease();
            }
        }
    }, [isPlaying, isBassLatchOn, latchedBassNote]);

    useEffect(() => {
        if (latchedBassNote && bassSynth.current && bassVCA.current && isPlaying) {
            const minDb = -48;
            const maxDb = -6;
            const dbVolume = minDb + latchedBassNote.volume * (maxDb - minDb);

            bassSynth.current.triggerAttack(latchedBassNote.frequency);
            bassVCA.current.volume.rampTo(dbVolume, 0.1);

        } else if (!latchedBassNote && bassSynth.current && isPlaying) {
             if (bassSynth.current.state === "started") {
                bassSynth.current.triggerRelease();
             }
        }
    }, [latchedBassNote, isPlaying]);
    
     const handleThereminPointerUp = (type: 'melody' | 'bass', frequency: number | null) => {
        if (!isPlaying) return;
        
        if (type === 'bass' && isBassLatchOn) {
            return;
        }

        if (type === 'melody' && melodySynth.current && frequency) {
            melodySynth.current.triggerRelease([frequency]);
        } else if (type === 'bass' && bassSynth.current) {
            bassSynth.current.triggerRelease();
        }
    };

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
                        isReady={isReady}
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
                <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-6 h-[calc(80vh-4rem)]">
                    <ThereminPad
                        title="Bass"
                        onInteraction={(data) => handleThereminInteraction('bass', data)}
                        onPointerUp={(freq) => handleThereminPointerUp('bass', freq)}
                        frequencyRange={[55, 220]} // A1 to A3
                        color="hsl(var(--accent))"
                        isPulsating={isBassPulsating}
                        onPulsateToggle={handlePulsateToggle}
                        isLatchOn={isBassLatchOn}
                        onLatchToggle={handleLatchToggle}
                        isLatched={!!latchedBassNote}
                    />
                    <ThereminPad
                        title="Melody"
                        onInteraction={(data) => handleThereminInteraction('melody', data)}
                        onPointerUp={(freq) => handleThereminPointerUp('melody', freq)}
                        frequencyRange={[220, 880]} // A3 to A5
                        color="hsl(var(--primary))"
                        instruments={melodyInstruments}
                        activeInstrument={melodyInstrument}
                        onInstrumentChange={setMelodyInstrument}
                    />
                </div>
                <div className="h-[calc(20vh-2rem)] flex flex-col">
                    <BeatBoxControls
                        patterns={beatPatterns}
                        activePattern={activePattern}
                        onPatternChange={setActivePattern}
                        tempo={tempo}
                        onTempoChange={setTempo}
                    />
                </div>
            </main>
            {!isAppStarted && (
                 <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
                    <Button size="lg" onClick={handleStartApp}>Click to Start EtherMusic</Button>
                </div>
            )}
             {isReady && !isPlaying && !isAppStarted && (
                 <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
                     <div className="text-center text-white">
                        <p className="text-xl mb-4">Loading audio engine...</p>
                        <div className="w-24 h-24 border-4 border-dashed rounded-full animate-spin border-primary mx-auto"></div>
                    </div>
                </div>
            )}
        </div>
    );
}
    

    

    
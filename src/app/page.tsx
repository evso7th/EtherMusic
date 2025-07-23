
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
    const melodySynth = useRef<Tone.AMSynth | null>(null);
    const bassSynth = useRef<Tone.MonoSynth | null>(null);
    const drumSynths = useRef<{ kick: Tone.MembraneSynth, snare: Tone.NoiseSynth, hat: Tone.MetalSynth } | null>(null);
    const channels = useRef<{ melody: Tone.Channel, bass: Tone.Channel, drums: Tone.Channel } | null>(null);
    const drumSequence = useRef<Tone.Sequence | null>(null);
    const recorder = useRef<Tone.Recorder | null>(null);
    const bassLFO = useRef<Tone.LFO | null>(null);
    const bassVCA = useRef<Tone.Volume | null>(null);
    
    const initializeAudio = useCallback(async () => {
        if (audioInitialized.current) return;
        audioInitialized.current = true;
        
        const Tone = await import('tone');
        
        channels.current = {
            melody: new Tone.Channel(volumes.melody).toDestination(),
            bass: new Tone.Channel(volumes.bass).toDestination(),
            drums: new Tone.Channel(volumes.drums).toDestination(),
        };

        melodySynth.current = new Tone.AMSynth().connect(channels.current.melody);


        bassVCA.current = new Tone.Volume(0).connect(channels.current.bass);
        bassSynth.current = new Tone.MonoSynth({
            oscillator: { type: 'fatsawtooth' },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.8 },
            filterEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.2, release: 0.5, baseFrequency: 200, octaves: 4 }
        }).connect(bassVCA.current);

        bassLFO.current = new Tone.LFO({
            frequency: "4n",
            min: 0,
            max: -24,
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
        }, [], '8n').start(0);

        recorder.current = new Tone.Recorder();
        Tone.getDestination().connect(recorder.current);
        
        Tone.Transport.bpm.value = tempo;
        setIsReady(true);
    }, [volumes.melody, volumes.bass, volumes.drums, tempo]);
    
    useEffect(() => {
        if (!isReady || !melodySynth.current) return;
        
        let newOptions;

        switch (melodyInstrument) {
            case 'organ':
                newOptions = {
                    harmonicity: 3,
                    envelope: { attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.3 },
                    modulationEnvelope: { attack: 0.01, decay: 0.5, sustain: 0.2, release: 0.1 }
                };
                break;
            case 'theremin':
                newOptions = {
                    harmonicity: 1, // Pure tone
                    envelope: { attack: 0.1, decay: 0, sustain: 1, release: 0.1 },
                    modulationEnvelope: { attack: 0.1, decay: 0, sustain: 1, release: 0.1 }
                };
                break;
            case 'glass':
                newOptions = {
                    harmonicity: 1.5,
                    envelope: { attack: 0.01, decay: 0.5, sustain: 0.2, release: 0.8 },
                    modulationEnvelope: { attack: 0.2, decay: 0.8, sustain: 0.5, release: 0.5 }
                };
                break;
            case 'synth':
            default:
                newOptions = {
                    harmonicity: 1.5,
                    envelope: { attack: 0.05, decay: 0.3, sustain: 0.6, release: 0.4 },
                    modulationEnvelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 0.1 }
                };
                break;
        }
        melodySynth.current.set(newOptions);

    }, [melodyInstrument, isReady]);

    const handleStartApp = async () => {
        const Tone = await import('tone');
        await Tone.start();
        await initializeAudio();
        setIsAppStarted(true);
        setIsPlaying(true);
        Tone.Transport.start();
    }
    
    const handlePlayPause = async () => {
        const Tone = await import('tone');
        if (!isReady) return;
        
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
        melodySynth.current?.triggerRelease();
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
             if (bassSynth.current) {
                bassSynth.current.triggerRelease();
            }
        }
    }

    useEffect(() => {
        if (!bassLFO.current || !bassVCA.current) return;

        const isPulsationActive = isBassPulsating || (isBassLatchOn && !!latchedBassNote);
        if (isPulsationActive) {
            bassLFO.current.connect(bassVCA.current.volume);
        } else {
            bassLFO.current.disconnect(bassVCA.current.volume);
            bassVCA.current.volume.cancelScheduledValues();
            bassVCA.current.volume.rampTo(0, 0.1); 
        }
    }, [isBassPulsating, isBassLatchOn, latchedBassNote]);
    
    useEffect(() => {
        if (!isReady || !isPlaying) return;
        const Tone = require('tone');

        if (drumSequence.current) {
            drumSequence.current.dispose();
        }

        drumSequence.current = new Tone.Sequence((time, note) => {
            if (note === 'C1') drumSynths.current?.kick.triggerAttackRelease('C1', '8n', time);
            if (note === 'C2') drumSynths.current?.snare.triggerAttackRelease('16n', time);
            if (note === 'D2') drumSynths.current?.hat.triggerAttackRelease('16n', time);
        }, activePattern.sequence, '8n');

        if (activePattern.name !== 'Off') {
            drumSequence.current.start(0);
        }
    }, [activePattern, isPlaying, isReady]);

    useEffect(() => {
        if (!isReady) return;
        const Tone = require('tone');
        Tone.Transport.bpm.value = tempo;
        if (bassLFO.current) {
            bassLFO.current.frequency.value = Tone.Transport.bpm.value / 60 * 2;
        }
    }, [tempo, isReady]);

    useEffect(() => {
        if (channels.current && isReady) {
            channels.current.melody.volume.value = volumes.melody;
            channels.current.bass.volume.value = volumes.bass;
            channels.current.drums.volume.value = volumes.drums;
        }
    }, [volumes, isReady]);
    
    useEffect(() => {
        if (!bassSynth.current || !bassVCA.current || !isPlaying) {
             if (bassSynth.current?.state === "started") {
                bassSynth.current.triggerRelease();
             }
            return;
        };

        if (latchedBassNote) {
            const minDb = -48;
            const maxDb = 0;
            const dbVolume = minDb + latchedBassNote.volume * (maxDb - minDb);

            bassSynth.current.triggerAttack(latchedBassNote.frequency);
             if (!isBassPulsating) {
                 bassVCA.current.volume.rampTo(dbVolume, 0.1);
             }
        } else {
            if (bassSynth.current.state === "started") {
               bassSynth.current.triggerRelease();
            }
        }
    }, [latchedBassNote, isPlaying, isBassPulsating]);


    const handleThereminInteraction = useCallback((type: 'melody' | 'bass', data: { frequency: number; volume: number } | null, state: 'down' | 'move' | 'up') => {
        if (!isPlaying || !audioInitialized.current) return;
    
        if (type === 'bass') {
            if (isBassLatchOn) {
                if (state === 'down') {
                    if (latchedBassNote) {
                        setLatchedBassNote(null);
                    } else if(data) {
                        setLatchedBassNote(data);
                    }
                }
                return; 
            }
    
            const synth = bassSynth.current;
            const vca = bassVCA.current;
            if (!synth || !vca) return;
    
            if (data && state !== 'up') {
                const minDb = -48;
                const maxDb = 0;
                const dbVolume = minDb + data.volume * (maxDb - minDb);
                
                if (state === 'down') {
                    synth.triggerAttack(data.frequency);
                } else if (state === 'move') {
                    synth.setNote(data.frequency);
                }
                
                if (!isBassPulsating) {
                    vca.volume.rampTo(dbVolume, 0.1);
                }
            } else if (state === 'up') {
                synth.triggerRelease();
            }
        } else if (type === 'melody') {
            const synth = melodySynth.current;
            if (!synth) return;
    
            if (data && state !== 'up') {
                const minDb = -48;
                const maxDb = -6;
                const dbVolume = minDb + data.volume * (maxDb - minDb);

                if (state === 'down') {
                    synth.triggerAttack(data.frequency);
                    synth.volume.rampTo(dbVolume, 0.05);
                } else if (state === 'move') {
                    synth.frequency.rampTo(data.frequency, 0.05);
                    synth.volume.rampTo(dbVolume, 0.05);
                }
            } else if (state === 'up') {
                synth.triggerRelease();
            }
        }
    }, [isPlaying, isBassLatchOn, latchedBassNote, isBassPulsating]);
    
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
                        onInteraction={handleThereminInteraction}
                        type="bass"
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
                        onInteraction={handleThereminInteraction}
                        type="melody"
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
                    <Button size="lg" onClick={handleStartApp} disabled={!isReady && isAppStarted}>
                        {!isReady && !isAppStarted ? 'Loading Audio...' : 'Click to Start EtherMusic'}
                    </Button>
                </div>
            )}
             {!isReady && isAppStarted && (
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
    

    

    

    

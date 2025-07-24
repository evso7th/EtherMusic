
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import type * as Tone from 'tone';
import { Button } from "@/components/ui/button";
import { ThereminPad } from '@/components/theremin-pad';
import { BeatBoxControls } from '@/components/beat-box-controls';
import { useToast } from "@/hooks/use-toast";
import { OrbitalAnimation } from '@/components/orbital-animation';
import { useIsMobile } from '@/hooks/use-mobile';
import { PlaybackControls } from '@/components/playback-controls';
import { ArrowRight } from 'lucide-react';
import { HelpGuide } from '@/components/help-guide';


type BeatPattern = {
    name: string;
    sequence: (string | null)[];
};


const beatPatterns: BeatPattern[] = [
    { name: 'Rock', sequence: ['C1', null, 'G1', null, 'C1', null, 'G1', 'D2'] },
    { name: 'House', sequence: ['C1', 'D2', 'C1', 'D2', 'G1', 'D2', 'G1', 'D2'] },
    { name: 'Hip Hop', sequence: ['C1', null, 'G1', 'D2', 'C1', null, 'G1', null] },
    { name: 'Reggae', sequence: [null, 'C1', 'D2', 'G1', null, 'C1', 'D2', null] },
    { name: 'Off', sequence: [] },
];

export type MelodyInstrument = 'synth' | 'organ' | 'theremin' | 'glass';
const melodyInstruments: MelodyInstrument[] = ['synth', 'organ', 'theremin', 'glass'];

export type MusicKey = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';
export const musicKeys: MusicKey[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export type MusicScale = 'Major' | 'Minor' | 'Major Pentatonic' | 'Minor Pentatonic';
export const musicScales: MusicScale[] = ['Major', 'Minor', 'Major Pentatonic', 'Minor Pentatonic'];

const getScaleFrequencies = (key: MusicKey, scale: MusicScale, octaves: number[]): number[] => {
    const Tone = require('tone');

    const scaleIntervals: { [key in MusicScale]: string[] } = {
        'Major': ['0', '2', '4', '5', '7', '9', '11'],
        'Minor': ['0', '2', '3', '5', '7', '8', '10'],
        'Major Pentatonic': ['0', '2', '4', '7', '9'],
        'Minor Pentatonic': ['0', '3', '5', '7', '10'],
    };

    let allFrequencies: number[] = [];
    const intervals = scaleIntervals[scale];

    octaves.forEach(octave => {
        intervals.forEach(interval => {
            const note = Tone.Frequency(key + octave).transpose(interval);
            allFrequencies.push(note.toFrequency());
        });
    });

    return allFrequencies.sort((a,b) => a - b);
};


export default function Home() {
    const { toast } = useToast();
    const isMobile = useIsMobile();
    const [isAppStarted, setIsAppStarted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    
    // Audio state
    const [tempo, setTempo] = useState(120);
    const [volumes, setVolumes] = useState({ melody: -6, bass: -12, drums: -6 });
    const [activePattern, setActivePattern] = useState<BeatPattern>(beatPatterns[4]);
    const [melodyInstrument, setMelodyInstrument] = useState<MelodyInstrument>('synth');

    // --- New Harmony State ---
    const [musicKey, setMusicKey] = useState<MusicKey>('C');
    const [musicScale, setMusicScale] = useState<MusicScale>('Major Pentatonic');
    const [allowedFrequencies, setAllowedFrequencies] = useState<number[]>([]);


    // Bass specific state
    const [isBassPulsating, setIsBassPulsating] = useState(false);
    const [isBassLatchOn, setIsBassLatchOn] = useState(false);
    const [latchedBassNotes, setLatchedBassNotes] = useState<Map<number, { frequency: number; volume: number }>>(new Map());

    // Tone.js refs
    const audioInitialized = useRef(false);
    const melodySynth = useRef<Tone.PolySynth | null>(null);
    const bassSynth = useRef<Tone.PolySynth | null>(null);
    const drumSynths = useRef<{ kick: Tone.MembraneSynth, snare: Tone.NoiseSynth, hat: Tone.MetalSynth } | null>(null);
    const channels = useRef<{ melody: Tone.Channel, bass: Tone.Channel, drums: Tone.Channel } | null>(null);
    const drumSequence = useRef<Tone.Sequence | null>(null);
    const recorder = useRef<Tone.Recorder | null>(null);
    const bassLFO = useRef<Tone.LFO | null>(null);
    const bassGain = useRef<Tone.Gain | null>(null);
    const backgroundAudioRef = useRef<HTMLAudioElement>(null);
    const activeMelodyNotes = useRef<Map<number, number>>(new Map());
    const activeBassNotes = useRef<Map<number, number>>(new Map());
    
    const initializeAudio = useCallback(async () => {
        if (audioInitialized.current) return;
        
        const Tone = await import('tone');

        await Tone.start();
        audioInitialized.current = true;
        
        channels.current = {
            melody: new Tone.Channel(volumes.melody).toDestination(),
            bass: new Tone.Channel(volumes.bass).toDestination(),
            drums: new Tone.Channel(volumes.drums).toDestination(),
        };

        melodySynth.current = new Tone.PolySynth(Tone.Synth).connect(channels.current.melody);

        bassGain.current = new Tone.Gain(1).connect(channels.current.bass);
        bassSynth.current = new Tone.PolySynth(Tone.Synth, {
            polyphony: 4,
            oscillator: { type: 'fatsawtooth' },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.8 },
        }).connect(bassGain.current);


        bassLFO.current = new Tone.LFO({
            frequency: "4n",
            min: 0,
            max: 1,
        }).start();

        drumSynths.current = {
            kick: new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 6, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: 'exponential' } }).connect(channels.current.drums),
            snare: new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.005, decay: 0.2, sustain: 0 } }).connect(channels.current.drums),
            hat: new Tone.MetalSynth({ frequency: 200, envelope: { attack: 0.001, decay: 0.1, release: 0.05 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5 }).connect(channels.current.drums)
        };
        
        drumSequence.current = new Tone.Sequence((time, note) => {
            if (note === 'C1') drumSynths.current?.kick.triggerAttackRelease('C1', '8n', time);
            if (note === 'G1') drumSynths.current?.snare.triggerAttackRelease('16n', time);
            if (note === 'D2') drumSynths.current?.hat.triggerAttackRelease('16n', time);
        }, [], '8n').start(0);

        recorder.current = new Tone.Recorder();
        Tone.getDestination().connect(recorder.current);
        
        Tone.Transport.bpm.value = tempo;
        setIsReady(true);
    }, [volumes.melody, volumes.bass, volumes.drums, tempo]);
    
    // Update allowed frequencies when key or scale changes
    useEffect(() => {
        if (!isReady) return;
        const melodyFreqs = getScaleFrequencies(musicKey, musicScale, [3, 4, 5]);
        const bassFreqs = getScaleFrequencies(musicKey, musicScale, [1, 2]);
        setAllowedFrequencies([...bassFreqs, ...melodyFreqs]);
    }, [musicKey, musicScale, isReady]);

    useEffect(() => {
        if (!isReady || !melodySynth.current) return;
        
        let newOptions;

        switch (melodyInstrument) {
            case 'organ':
                newOptions = {
                     oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
                     envelope: { attack: 0.05, decay: 0.3, sustain: 0.9, release: 0.8 },
                };
                break;
            case 'theremin':
                newOptions = {
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.1, decay: 0.1, sustain: 0.9, release: 0.3 },
                };
                break;
            case 'glass':
                newOptions = {
                     oscillator: { type: 'fmsine', harmonicity: 1.5, modulationIndex: 5 },
                     envelope: { attack: 0.01, decay: 1.2, sustain: 0, release: 1.2 },
                };
                break;
            case 'synth':
            default:
                 newOptions = {
                    oscillator: { type: 'fatsine4', spread: 40, count: 4 },
                    envelope: { attack: 0.04, decay: 0.5, sustain: 0.8, release: 0.7 },
                };
                break;
        }
        melodySynth.current.set(newOptions);

    }, [melodyInstrument, isReady]);

    const handleStartApp = async () => {
        setIsAppStarted(true);
        await initializeAudio();
        
        if (isMobile) {
            try {
                if (document.documentElement.requestFullscreen) {
                    await document.documentElement.requestFullscreen();
                } else if ((document.documentElement as any).webkitRequestFullscreen) { /* Safari */
                    await (document.documentElement as any).webkitRequestFullscreen();
                } else if ((document.documentElement as any).msRequestFullscreen) { /* IE11 */
                    await (document.documentElement as any).msRequestFullscreen();
                }
            } catch (err) {
                 console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            }
        }
        
        if (backgroundAudioRef.current && !backgroundAudioRef.current.paused) {
             backgroundAudioRef.current.pause();
             backgroundAudioRef.current.currentTime = 0;
        }

        const Tone = await import('tone');
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
        melodySynth.current?.releaseAll();
        bassSynth.current?.releaseAll();
        activeMelodyNotes.current.clear();
        activeBassNotes.current.clear();
        setIsPlaying(false);
        if (latchedBassNotes.size > 0) {
            setLatchedBassNotes(new Map());
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
        if (!checked && latchedBassNotes.size > 0) {
            bassSynth.current?.releaseAll();
            setLatchedBassNotes(new Map());
        }
    }

    useEffect(() => {
        if (!bassLFO.current || !bassGain.current) return;

        const isPulsationActive = isBassPulsating || (isBassLatchOn && latchedBassNotes.size > 0);

        if (isPulsationActive) {
            bassLFO.current.connect(bassGain.current.gain);
        } else {
            bassLFO.current.disconnect(bassGain.current.gain);
            bassGain.current.gain.cancelScheduledValues();
            bassGain.current.gain.rampTo(1, 0.1); 
        }
    }, [isBassPulsating, isBassLatchOn, latchedBassNotes]);
    
    useEffect(() => {
        if (!isReady) return;
        const Tone = require('tone');

        if (drumSequence.current) {
            drumSequence.current.dispose();
        }

        drumSequence.current = new Tone.Sequence((time: any, note: any) => {
            if (note === 'C1') drumSynths.current?.kick.triggerAttackRelease('C1', '8n', time);
            if (note === 'G1') drumSynths.current?.snare.triggerAttackRelease('16n', time);
            if (note === 'D2') drumSynths.current?.hat.triggerAttackRelease('16n', time);
        }, activePattern.sequence, '8n');

        if (isPlaying && activePattern.name !== 'Off') {
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
        if (!bassSynth.current || !isPlaying) return;
        
        latchedBassNotes.forEach((note) => {
             const velocity = note.volume;
             bassSynth.current?.triggerAttack(note.frequency, undefined, velocity);
        });

    }, [latchedBassNotes, isPlaying]);


    const getClosestFrequency = (targetFreq: number) => {
        if (allowedFrequencies.length === 0) return targetFreq;
        return allowedFrequencies.reduce((prev, curr) => {
            return (Math.abs(curr - targetFreq) < Math.abs(prev - targetFreq) ? curr : prev);
        });
    };

    const handleThereminInteraction = useCallback((type: 'melody' | 'bass', data: { frequency: number; volume: number; pointerId: number } | null, state: 'down' | 'move' | 'up') => {
        if (!isPlaying || !audioInitialized.current) return;
    
        const synth = type === 'melody' ? melodySynth.current : bassSynth.current;
        if (!synth) return;
    
        const quantizedFreq = data ? getClosestFrequency(data.frequency) : 0;
        const velocity = data ? data.volume : 0;
    
        if (type === 'bass' && isBassLatchOn) {
            if (state === 'down' && data) {
                setLatchedBassNotes(prev => {
                    const newNotes = new Map(prev);
                    const existingEntry = Array.from(newNotes.entries()).find(
                        ([_, note]) => Math.abs(note.frequency - quantizedFreq) < 1
                    );

                    if (existingEntry) {
                        const [keyToToggle] = existingEntry;
                        synth.triggerRelease(newNotes.get(keyToToggle)!.frequency);
                        newNotes.delete(keyToToggle);
                    } else if (newNotes.size < 4) {
                        newNotes.set(data.pointerId, { frequency: quantizedFreq, volume: data.volume });
                        synth.triggerAttack(quantizedFreq, undefined, velocity);
                    }
                    return newNotes;
                });
            }
            return;
        }

        const activeNotes = type === 'melody' ? activeMelodyNotes.current : activeBassNotes.current;
    
        switch (state) {
            case 'down':
                if (quantizedFreq && data) {
                    synth.triggerAttack(quantizedFreq, undefined, velocity);
                    activeNotes.set(data.pointerId, quantizedFreq);
                }
                break;
            case 'move':
                if (quantizedFreq && data && activeNotes.has(data.pointerId)) {
                    const currentFreq = activeNotes.get(data.pointerId);
                    if (currentFreq) {
                        synth.set({ note: { frequency: quantizedFreq }, volume: -24 + (velocity * 24) });
                        if (currentFreq !== quantizedFreq) {
                           activeNotes.set(data.pointerId, quantizedFreq);
                        }
                    }
                }
                break;
            case 'up':
                 if (data && activeNotes.has(data.pointerId)) {
                    const freqToRelease = activeNotes.get(data.pointerId);
                    if (freqToRelease) {
                        synth.triggerRelease(freqToRelease);
                        activeNotes.delete(data.pointerId);
                    }
                 }
                break;
        }
    }, [isPlaying, isBassLatchOn, latchedBassNotes, allowedFrequencies]);
    
    const handleStartScreenInteraction = () => {
        if (backgroundAudioRef.current && backgroundAudioRef.current.paused) {
            backgroundAudioRef.current.volume = 0.3;
            backgroundAudioRef.current.play().catch(error => console.error("Error playing background audio:", error));
        }
    };

    if (!isAppStarted) {
        return (
            <div 
                className="absolute inset-0 bg-background flex flex-col items-center justify-center z-50 p-4"
                onClick={handleStartScreenInteraction}
            >
                <div className="absolute top-4 right-4 z-20">
                    <HelpGuide showText={false} buttonVariant="ghost" buttonClassName="rounded-full w-10 h-10 hover:bg-white/10" />
                </div>
                <OrbitalAnimation />
                <audio ref={backgroundAudioRef} src="/assets/sounds/ethermusic_start.mp3" loop />
                <div className="z-10 text-center flex-grow flex flex-col items-center justify-between py-16 w-full">
                    <div>
                        <h1 className="text-5xl md:text-8xl lg:text-5xl xl:text-8xl font-bold text-primary sm:text-6xl" style={{fontSize: '48px'}}>EtherMusic</h1>
                        <p className="text-sm md:text-base text-white/80 font-light mt-2 tracking-wide">
                           Neuro Meditation Sound Processor
                        </p>
                    </div>
                    <Button size="lg" onClick={handleStartApp}>
                        Start Meditation
                        <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                </div>
                 <footer className="z-10 text-xs text-white/50 pb-4 text-center">
                    <p>Powered by theremin technology</p>
                    <p>&copy; 2005, EVS</p>
                </footer>
            </div>
        )
    }

    if (isAppStarted && !isReady) {
        return (
            <div className="absolute inset-0 bg-background flex items-center justify-center z-50">
                <div className="text-center text-white">
                    <p className="text-xl mb-4">loading your personal neuro meditation processor</p>
                    <div className='preloader'>
                        <div><div><div><div><div></div></div></div></div></div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="relative flex flex-col h-screen overflow-hidden">
            <div className="fixed inset-0 z-0">
                <OrbitalAnimation />
            </div>
            <div className="relative z-10 flex flex-col h-full p-4 md:p-6 lg:p-8">
                <header className="flex-shrink-0 flex items-center justify-between mb-4">
                    <div>
                        <h1 className="text-2xl md:text-4xl font-bold text-primary">EtherMusic</h1>
                        <p className="text-xs text-white/80 font-light -mt-1 tracking-wide">Neuro Meditation Processor</p>
                    </div>
                    <div className="flex items-center gap-1 md:gap-2">
                         <PlaybackControls
                            isPlaying={isPlaying}
                            isRecording={isRecording}
                            onPlayPause={handlePlayPause}
                            onRecord={handleRecord}
                            onStop={handleStop}
                            isReady={isReady}
                        />
                    </div>
                </header>
                <main className="flex-grow flex flex-col gap-4 overflow-hidden">
                    <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-4">
                        <ThereminPad
                            onInteraction={handleThereminInteraction}
                            type="bass"
                            frequencyRange={[55, 440]} // A1 to A4
                            color="hsl(var(--accent))"
                            isPulsating={isBassPulsating}
                            onPulsateToggle={handlePulsateToggle}
                            isLatchOn={isBassLatchOn}
                            onLatchToggle={handleLatchToggle}
                            isLatched={latchedBassNotes.size > 0}
                            latchedNotes={latchedBassNotes}
                            isPolyphonic
                        />
                        <ThereminPad
                            onInteraction={handleThereminInteraction}
                            type="melody"
                            frequencyRange={[220, 1760]} // A3 to A6
                            color="hsl(var(--primary))"
                            instruments={melodyInstruments}
                            activeInstrument={melodyInstrument}
                            onInstrumentChange={setMelodyInstrument}
                            musicKeys={musicKeys}
                            activeKey={musicKey}
                            onKeyChange={setMusicKey}
                            musicScales={musicScales}
                            activeScale={musicScale}
                            onScaleChange={setMusicScale}
                            isPolyphonic
                        />
                    </div>
                    <div className="flex-shrink-0">
                        <BeatBoxControls
                            patterns={beatPatterns}
                            activePattern={activePattern}
                            onPatternChange={setActivePattern}
                            tempo={tempo}
                            onTempoChange={setTempo}
                            volumes={volumes}
                            onVolumeChange={setVolumes}
                        />
                    </div>
                </main>
            </div>
        </div>
    );
}

    

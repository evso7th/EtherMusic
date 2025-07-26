
"use client";

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import type * as Tone from 'tone';
import { Button } from "@/components/ui/button";
import { ThereminPad } from '@/components/theremin-pad';
import { BeatBoxControls, type Tempo } from '@/components/beat-box-controls';
import { useToast } from "@/hooks/use-toast";
import { OrbitalAnimation } from '@/components/orbital-animation';
import { useIsMobile } from '@/hooks/use-mobile';
import { PlaybackControls } from '@/components/playback-controls';
import { ArrowRight } from 'lucide-react';
import { HelpGuide } from '@/components/help-guide';
import { generateAutopilotPattern } from '@/lib/music-engine';


const housePatterns = {
    groove: [
        'C1', 'E1', 'D1', 'E1', 'C1', 'E1', 'D1', 'E1',
        'C1', 'E1', 'D1', 'E1', 'C1', 'E1', 'D1', 'E1',
    ],
    fills: [
        [
            'C1', 'E2', ['C1', 'E2'], 'E2', 'C1', 'E2', ['C1', 'E2'], 'E2',
            'D1', 'E2', ['D1', 'E2'], 'E2', 'D1', 'E2', ['D1', 'E2', 'F1'], 'F1',
        ]
    ]
};

const trancePatterns = {
    groove: [
        'C1', ['E1', 'E2'], ['D1', 'E2'], ['E1', 'E2'], 'C1', ['E1', 'E2'], ['D1', 'E2'], ['E1', 'E2'],
        'C1', ['E1', 'E2'], ['D1', 'E2'], ['E1', 'E2'], 'C1', ['E1', 'E2'], ['D1', 'E2'], ['E1', 'E2'],
    ],
    fills: [
        [
            'E2', 'E2', 'E2', 'E2', 'E2', 'E2', 'E2', 'E2',
            'E1', 'E1', 'E1', 'E1', 'E1', 'E1', 'E1', 'E1',
        ]
    ]
};

const reggaePatterns = {
    groove: [
        null, ['E1', 'E2'], ['C1','D1'], ['E1', 'E2'], null, ['E1', 'E2'], ['C1','D1'], ['E1', 'E2'],
        null, ['E1', 'E2'], ['C1','D1'], ['E1', 'E2'], null, ['E1', 'E2'], ['C1','D1'], ['E1', 'E2'],
    ],
    fills: [
        [
            'G1', null, 'G2', null, 'G3', null, ['C1','D1'], null,
            'G1', 'G1', 'G2', 'G2', 'G3', 'G3', ['C1', 'D1', 'F1'], null,
        ]
    ]
};

const slowBluesPatterns = {
    groove: [
        ['C1', 'E2'], 'E1', ['D1', 'E2'], 'E1', ['C1', 'E2'], 'E1', ['D1', 'E2'], 'E1',
        ['C1', 'E2'], 'E1', ['D1', 'E2'], 'E1', ['C1', 'E2'], 'E1', ['D1', 'E2'], 'E1',
    ],
    fills: [
        [
            'G1', null, 'G1', 'G2', null, 'G2', 'G3', null,
            'G3', ['D1', 'G3'], 'D1', 'D1', ['F1', 'D1'], 'C1', 'D1', 'C1'
        ]
    ]
};

const rockPatterns = {
    groove: [
        ['C1', 'E1'], 'E2', ['D1', 'E1'], 'E2', ['C1', 'E1'], 'E2', ['D1', 'E1'], 'E2',
        ['C1', 'E1'], 'E2', ['D1', 'E1'], 'E2', ['C1', 'E1'], 'E2', ['D1', 'E1'], 'E2'
    ],
    fills: [
        [
            'G1', 'G1', 'G2', 'G2', 'G3', 'G3', ['F1', 'C1'], ['F1'],
            'G1', 'G2', 'G3', null, 'F1', 'D1', ['F1', 'C1'], ['F1', 'D1'],
        ],
        [
            'G1', 'E2', 'G1', 'E2', 'G2', 'E2', 'G2', 'E2',
            'G3', 'E2', 'G3', 'E1', ['F1', 'D1'], 'C1', ['F1', 'C1'], 'C1'
        ]
    ]
};

// --- New Meditative Patterns ---
const airPattern = {
    groove: [
        null, null, 'D1', null, null, null, null, null,
        'C1', null, null, null, null, null, 'D1', null,
    ],
    fills: [
        [
            null, 'G3', null, 'G3', null, 'G2', null, ['D1', 'F1']
        ]
    ]
};

const earthPattern = {
    groove: [
        'C1', null, null, null, 'D1', null, null, null,
        'C1', null, null, null, 'D1', null, 'G3', null,
    ],
    fills: [
        [
            'C1', null, 'D1', null, 'C1', 'G3', 'D1', 'G2'
        ]
    ]
};

const waterPattern = {
    groove: [
        'C1', null, 'D1', null, null, null, 'D1', null,
        'C1', null, 'D1', null, 'G3', 'G3', 'D1', null,
    ],
    fills: [
        [
            'C1', 'D1', 'C1', 'D1', 'G1', 'G2', 'G3', ['F1', 'D1']
        ]
    ]
};


const beatPatterns = [
    { name: 'Air', patterns: airPattern, length: '1m' },
    { name: 'Earth', patterns: earthPattern, length: '1m' },
    { name: 'Water', patterns: waterPattern, length: '1m' },
    { name: 'Rock', patterns: rockPatterns, length: '1m' },
    { name: 'House', patterns: housePatterns, length: '1m' },
    { name: 'Trance', patterns: trancePatterns, length: '1m' },
    { name: 'Reggae', patterns: reggaePatterns, length: '1m' },
    { name: 'Slow Blues', patterns: slowBluesPatterns, length: '1m' },
    { name: 'Off', patterns: { groove: [], fills: [] }, length: '1m' },
];


export const tempos: Tempo[] = [
    { name: 'Largo', bpm: 50 },
    { name: 'Adagio', bpm: 70 },
    { name: 'Andante', bpm: 90 },
    { name: 'Moderato', bpm: 110 },
    { name: 'Allegretto', bpm: 130 },
];

export type MelodyInstrument = 'synth' | 'organ' | 'theremin' | 'glass';
const melodyInstruments: MelodyInstrument[] = ['synth', 'organ', 'theremin', 'glass'];

export type MusicKey = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';
export const musicKeys: MusicKey[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export type MusicScale = 'Major' | 'Minor' | 'Major Pentatonic' | 'Minor Pentatonic';
export const musicScales: MusicScale[] = ['Major', 'Minor', 'Major Pentatonic', 'Minor Pentatonic'];

export type AutopilotStyle = 'Ambient' | 'House' | 'Wind' | 'Sequence' | 'Chimes' | 'Drone' | 'Primes';
export const autopilotStyles: AutopilotStyle[] = ['Ambient', 'House', 'Wind', 'Sequence', 'Chimes', 'Drone', 'Primes'];

export type Orb = {
    id: number;
    x: number;
    y: number;
    type: 'melody' | 'bass' | 'latch';
};


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

const MemoizedOrbitalAnimation = memo(OrbitalAnimation);
const MemoizedThereminPad = memo(ThereminPad);


export default function Home() {
    const { toast } = useToast();
    const isMobile = useIsMobile();
    const [isAppStarted, setIsAppStarted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    
    // Audio state
    const [activeTempo, setActiveTempo] = useState<Tempo>(tempos[2]);
    const [volumes, setVolumes] = useState({ melody: -9, bass: -6, drums: -9, autopilot: -9 });
    const [effects, setEffects] = useState({
        melody: { reverb: -60, delay: -60 },
        bass: { reverb: -60, delay: -60 },
        drums: { reverb: -60, delay: -60 },
        autopilot: { reverb: -60, delay: -60 },
    });
    const [activePattern, setActivePattern] = useState<any>(beatPatterns[beatPatterns.length - 1]);
    const [melodyInstrument, setMelodyInstrument] = useState<MelodyInstrument>('synth');

    // --- New Harmony State ---
    const [musicKey, setMusicKey] = useState<MusicKey>('C');
    const [musicScale, setMusicScale] = useState<MusicScale>('Major Pentatonic');
    const [allowedFrequencies, setAllowedFrequencies] = useState<{bass: number[], melody: number[]}>({ bass: [], melody: [] });


    // Bass specific state
    const [isBassPulsating, setIsBassPulsating] = useState(false);
    const [isBassLatchOn, setIsBassLatchOn] = useState(false);
    
    // --- Performance Refactoring ---
    // Use refs for high-frequency state to avoid re-renders
    const latchedBassNotes = useRef<Map<number, { x: number; y: number; frequency: number; volume: number }>>(new Map());
    const activeNotes = useRef(new Map<number, { type: 'melody' | 'bass'; freq: number; vol: number }>());
    const audioCommandQueue = useRef<Map<number, { freq: number; vol: number }>>(new Map());
    const animationFrameId = useRef<number>();
    
    // Orb State
    const [orbs, setOrbs] = useState<Orb[]>([]);

    // Autopilot state
    const [isAutopilotOn, setIsAutopilotOn] = useState(false);
    const [autopilotStyle, setAutopilotStyle] = useState<AutopilotStyle>('Ambient');

    // Tone.js refs
    const audioInitialized = useRef(false);
    const melodySynth = useRef<Tone.PolySynth | null>(null);
    const bassSynth = useRef<Tone.PolySynth | null>(null);
    const drumSamplers = useRef<Record<string, Tone.Player> | null>(null);
    const channels = useRef<{ melody: Tone.Channel, bass: Tone.Channel, drums: Tone.Channel, autopilot: Tone.Channel } | null>(null);
    const drumPart = useRef<Tone.Part | null>(null);
    const recorder = useRef<Tone.Recorder | null>(null);
    const bassLFO = useRef<Tone.LFO | null>(null);
    const bassGain = useRef<Tone.Gain | null>(null);
    const backgroundAudioRef = useRef<HTMLAudioElement>(null);
    const fx = useRef<{ reverb: Tone.Reverb, delay: Tone.FeedbackDelay } | null>(null);
    const autopilot = useRef<{bass: Tone.Part | null, melody: Tone.Part | null, melodySynth?: Tone.PolySynth, bassSynth?: Tone.PolySynth}>({ bass: null, melody: null });
    
    // Refs for stable callbacks
    const activePatternRef = useRef(activePattern);
    const measureCountRef = useRef(0);
    const conductorEventId = useRef<number | null>(null);

    useEffect(() => {
        activePatternRef.current = activePattern;
    }, [activePattern]);

    const initializeAudio = useCallback(async () => {
        if (audioInitialized.current) return;
        
        const Tone = await import('tone');

        await Tone.start();
        audioInitialized.current = true;

        fx.current = {
            reverb: new Tone.Reverb({ decay: 8, wet: 1 }).toDestination(),
            delay: new Tone.FeedbackDelay("8n", 0.5).toDestination(),
        };
        
        channels.current = {
            melody: new Tone.Channel(volumes.melody).toDestination(),
            bass: new Tone.Channel(volumes.bass).toDestination(),
            drums: new Tone.Channel(volumes.drums).toDestination(),
            autopilot: new Tone.Channel(volumes.autopilot).toDestination(),
        };

        channels.current.melody.connect(fx.current.reverb);
        channels.current.melody.connect(fx.current.delay);
        channels.current.melody.send("reverb", effects.melody.reverb);
        channels.current.melody.send("delay", effects.melody.delay);
        
        channels.current.bass.connect(fx.current.reverb);
        channels.current.bass.connect(fx.current.delay);
        channels.current.bass.send("reverb", effects.bass.reverb);
        channels.current.bass.send("delay", effects.bass.delay);
        
        channels.current.drums.connect(fx.current.reverb);
        channels.current.drums.connect(fx.current.delay);
        channels.current.drums.send("reverb", effects.drums.reverb);
        channels.current.drums.send("delay", effects.drums.delay);

        channels.current.autopilot.connect(fx.current.reverb);
        channels.current.autopilot.connect(fx.current.delay);
        channels.current.autopilot.send("reverb", effects.autopilot.reverb);
        channels.current.autopilot.send("delay", effects.autopilot.delay);

        // --- Synths for Pads ---
        melodySynth.current = new Tone.PolySynth(Tone.Synth, { polyphony: 8, portamento: 0.02 }).connect(channels.current.melody);

        bassGain.current = new Tone.Gain(1).connect(channels.current.bass);
        bassSynth.current = new Tone.PolySynth(Tone.Synth, {
            polyphony: 8,
            portamento: 0.02,
            oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.8 },
        }).connect(bassGain.current);
        
        // --- Synths for Autopilot ---
        autopilot.current.melodySynth = new Tone.PolySynth(Tone.Synth).connect(channels.current.autopilot);
        autopilot.current.bassSynth = new Tone.PolySynth(Tone.Synth, {
             oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
             envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.8 },
        }).connect(channels.current.autopilot);


        bassLFO.current = new Tone.LFO({
            frequency: "4n",
            min: 0,
            max: 1,
        }).start();

        const drumUrls = {
            C1: "/assets/sounds/kick drum.wav",
            D1: "/assets/sounds/snare.wav",
            E1: "/assets/sounds/closed hi hat accented.wav",
            E2: "/assets/sounds/closed hi hat ghost.wav",
            F1: "/assets/sounds/crash.wav",
            G1: "/assets/sounds/high tom.wav",
            G2: "/assets/sounds/mid tom.wav",
            G3: "/assets/sounds/low tom.wav",
        };
        
        drumSamplers.current = {};
        const loadingPromises = Object.entries(drumUrls).map(([note, url]) => {
            return new Promise<void>((resolve) => {
                const player = new Tone.Player(url).connect(channels.current!.drums);
                if (note === 'E1' || note === 'E2') {
                    player.volume.value = -3;
                }
                drumSamplers.current![note] = player;
                Tone.loaded().then(() => resolve());
            });
        });


        await Promise.all(loadingPromises);
        console.log('Drum samples loaded');
        setIsReady(true);
        
        drumPart.current = new Tone.Part((time, value) => {
            const notes = (value as any).notes;
            if (!notes || !drumSamplers.current) return;

            const playNote = (note: string) => {
                if (drumSamplers.current && drumSamplers.current[note]?.loaded) {
                    drumSamplers.current[note].start(time);
                }
            }
            if (Array.isArray(notes)) {
                notes.forEach(playNote);
            } else {
                playNote(notes);
            }
        }, []).start(0);
        drumPart.current.loop = true;
        drumPart.current.loopEnd = '1m';


        // The single, permanent "conductor"
        if (conductorEventId.current === null) {
            conductorEventId.current = Tone.Transport.scheduleRepeat((time) => {
                Tone.Draw.schedule(() => {
                    const currentPattern = activePatternRef.current;
                    if (!drumPart.current || currentPattern.name === 'Off' || !currentPattern.patterns?.groove?.length) {
                        drumPart.current?.clear();
                        return;
                    }
                    
                    const { groove, fills } = currentPattern.patterns;
                    const isFillMeasure = (measureCountRef.current % 4) === 3 && fills.length > 0;
                    const patternToPlay = isFillMeasure
                        ? fills[Math.floor(Math.random() * fills.length)]
                        : groove;
        
                    drumPart.current?.clear();
                    patternToPlay.forEach((notes: string | string[] | null, i: number) => {
                        if (notes) {
                            const noteTime = `0:${Math.floor(i/4)}:${i%4}`;
                            drumPart.current?.add(noteTime, { notes });
                        }
                    });
        
                    measureCountRef.current++;
                }, time);
            }, '1m');
        }


        autopilot.current.bass = new Tone.Part((time, note) => {
            autopilot.current.bassSynth?.triggerAttackRelease(note.freq, note.dur, time, note.vel);
        }, []).start(0);
        autopilot.current.bass.loop = true;
        autopilot.current.bass.loopEnd = '4m';

        autopilot.current.melody = new Tone.Part((time, note) => {
             autopilot.current.melodySynth?.triggerAttackRelease(note.freq, note.dur, time, note.vel);
        }, []).start(0);
        autopilot.current.melody.loop = true;
        autopilot.current.melody.loopEnd = '4m';


        recorder.current = new Tone.Recorder();
        Tone.getDestination().connect(recorder.current);
        
        Tone.Transport.bpm.value = activeTempo.bpm;
        
    }, [effects.autopilot, effects.bass, effects.drums, effects.melody, volumes.autopilot, volumes.bass, volumes.drums, volumes.melody]); 
    
    // --- Performance Refactoring: RAF loop for audio commands ---
    const processAudioQueue = useCallback(() => {
        if (!audioCommandQueue.current.size || !audioInitialized.current) {
            animationFrameId.current = requestAnimationFrame(processAudioQueue);
            return;
        }
        
        const Tone = require('tone');

        audioCommandQueue.current.forEach((value, pointerId) => {
            const activeNote = activeNotes.current.get(pointerId);
            if (activeNote) {
                const synth = activeNote.type === 'melody' ? melodySynth.current : bassSynth.current;
                
                if (synth) {
                     // Separate commands for frequency and volume for better performance
                    synth.set({ frequency: value.freq });
                    
                    // Directly set volume on the synth's output node for smoother changes.
                    // Convert linear gain (0-1) to dB.
                    if (synth.volume) {
                        synth.volume.value = Tone.gainToDb(value.vol * value.vol); // square for more perceptual curve
                    }

                    activeNote.freq = value.freq;
                    activeNote.vol = value.vol;
                }
            }
        });

        audioCommandQueue.current.clear();
        animationFrameId.current = requestAnimationFrame(processAudioQueue);
    }, []);

    useEffect(() => {
        if (isReady) {
            animationFrameId.current = requestAnimationFrame(processAudioQueue);
        }
        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [isReady, processAudioQueue]);

    // Update allowed frequencies when key or scale changes
    useEffect(() => {
        if (!isReady) return;
        const melodyFreqs = getScaleFrequencies(musicKey, musicScale, [3, 4, 5]);
        const bassFreqs = getScaleFrequencies(musicKey, musicScale, [1, 2]);
        setAllowedFrequencies({bass: bassFreqs, melody: melodyFreqs});
    }, [musicKey, musicScale, isReady]);

    useEffect(() => {
        if (!isReady || !melodySynth.current || !autopilot.current.melodySynth) return;
        
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
        autopilot.current.melodySynth.set(newOptions);

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
        if (!isReady || !bassSynth.current) return;

        const willBePlaying = Tone.Transport.state !== 'started';
        setIsPlaying(willBePlaying);

        if (willBePlaying) {
            await Tone.start();
            Tone.Transport.start();
            
            if (isBassLatchOn) {
                latchedBassNotes.current.forEach(note => {
                    bassSynth.current!.triggerAttack(note.frequency, undefined, note.volume);
                });
            }
        } else {
            Tone.Transport.pause();
            
            if (isBassLatchOn) {
                 bassSynth.current.releaseAll();
            }
            if (isAutopilotOn) {
                autopilot.current.bassSynth?.releaseAll();
                autopilot.current.melodySynth?.releaseAll();
            }
        }
    };

    const handleStop = useCallback(async () => {
        const Tone = await import('tone');
        if (!isReady) return;

        Tone.Transport.stop();
        
        melodySynth.current?.releaseAll();
        bassSynth.current?.releaseAll();
        autopilot.current.melodySynth?.releaseAll();
        autopilot.current.bassSynth?.releaseAll();

        activeNotes.current.clear();
        setOrbs(orbs => orbs.filter(orb => orb.type !== 'latch'));
        latchedBassNotes.current.clear();
        setOrbs([]); // Clear all visual orbs
        setIsPlaying(false);
    }, [isReady]);

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

    const handleLatchToggle = useCallback((checked: boolean) => {
        setIsBassLatchOn(checked);
        if (!checked && latchedBassNotes.current.size > 0) {
            bassSynth.current?.releaseAll();
            latchedBassNotes.current.clear();
            setOrbs(orbs => orbs.filter(orb => orb.type !== 'latch'));
        }
    }, [bassSynth]);

     const handleAutopilotToggle = () => {
        setIsAutopilotOn(prev => !prev);
    };

    useEffect(() => {
        if (!bassLFO.current || !bassGain.current) return;
        
        const isPulsationActive = isBassPulsating && isPlaying;

        if (isPulsationActive) {
            bassLFO.current.connect(bassGain.current.gain);
        } else {
            if (bassLFO.current.state === 'started') {
                 bassLFO.current.disconnect(bassGain.current.gain);
            }
            bassGain.current.gain.cancelScheduledValues();
            bassGain.current.gain.rampTo(1, 0.1); 
        }
    }, [isBassPulsating, isPlaying]);
    
    useEffect(() => {
        if (!isReady) return;
        
        measureCountRef.current = 0; // Reset measure count on pattern change
        if (drumPart.current) {
            drumPart.current.clear();
        }

    }, [activePattern, isReady]);
    
    // Autopilot logic using the new music engine
    useEffect(() => {
        const bassPart = autopilot.current.bass;
        const melodyPart = autopilot.current.melody;

        const regeneratePatterns = () => {
            if (!bassPart || !melodyPart || !allowedFrequencies.bass.length || !allowedFrequencies.melody.length) return;
            
            bassPart.clear();
            melodyPart.clear();

            const { bassPattern, melodyPattern } = generateAutopilotPattern(
                autopilotStyle,
                allowedFrequencies
            );

            bassPattern.forEach(note => bassPart.add(note.time, note));
            melodyPattern.forEach(note => melodyPart.add(note.time, note));
        };
        
        if (isAutopilotOn && isPlaying) {
            regeneratePatterns();
            bassPart?.start(0);
            melodyPart?.start(0);
        } else if (bassPart && melodyPart) {
            bassPart.stop(0).clear();
            melodyPart.stop(0).clear();
            autopilot.current.bassSynth?.releaseAll();
            autopilot.current.melodySynth?.releaseAll();
        }

    }, [isAutopilotOn, isPlaying, allowedFrequencies, autopilotStyle]);


    useEffect(() => {
        if (!isReady) return;
        const Tone = require('tone');
        Tone.Transport.bpm.value = activeTempo.bpm;
    }, [activeTempo, isReady]);

    useEffect(() => {
        if (channels.current && isReady) {
            channels.current.melody.volume.value = volumes.melody;
            channels.current.bass.volume.value = volumes.bass;
            channels.current.drums.volume.value = volumes.drums;
            channels.current.autopilot.volume.value = volumes.autopilot;
        }
    }, [volumes, isReady]);

    useEffect(() => {
        if (channels.current && isReady && fx.current) {
            channels.current.melody.send('reverb', effects.melody.reverb);
            channels.current.melody.send('delay', effects.melody.delay);
            channels.current.bass.send('reverb', effects.bass.reverb);
            channels.current.bass.send('delay', effects.bass.delay);
            channels.current.drums.send('reverb', effects.drums.reverb);
            channels.current.drums.send('delay', effects.drums.delay);
            channels.current.autopilot.send('reverb', effects.autopilot.reverb);
            channels.current.autopilot.send('delay', effects.autopilot.delay);
        }
    }, [effects, isReady]);


    const getClosestFrequency = useCallback((targetFreq: number, type: 'bass' | 'melody') => {
        const freqs = type === 'bass' ? allowedFrequencies.bass : allowedFrequencies.melody;
        if (freqs.length === 0) return targetFreq;
        return freqs.reduce((prev, curr) => {
            return (Math.abs(curr - targetFreq) < Math.abs(prev - targetFreq) ? curr : prev);
        });
    }, [allowedFrequencies]);

    const handleThereminInteraction = useCallback((type: 'melody' | 'bass', data: { frequency: number; volume: number; pointerId: number; x: number, y: number } | null, state: 'down' | 'move' | 'up') => {
        if (!audioInitialized.current) return;

        const synth = type === 'melody' ? melodySynth.current : bassSynth.current;
        if (!synth) return;

        const pointerId = data?.pointerId ?? -1;
        
        if (type === 'bass' && isBassLatchOn) {
            if (state === 'down' && data) {
                const quantizedFreq = getClosestFrequency(data.frequency, type);
                const newNotes = latchedBassNotes.current;
                const NOTE_PROXIMITY_THRESHOLD = 35;
                let existingEntryKey;
                
                for (const [key, note] of newNotes.entries()) {
                     const distance = Math.sqrt(Math.pow(note.x - data.x, 2) + Math.pow(note.y - data.y, 2));
                     if (distance < NOTE_PROXIMITY_THRESHOLD) {
                        existingEntryKey = key;
                        break;
                     }
                }

                if (existingEntryKey !== undefined) {
                    const noteToRelease = newNotes.get(existingEntryKey);
                    if (noteToRelease) {
                        synth.triggerRelease([noteToRelease.frequency]);
                    }
                    newNotes.delete(existingEntryKey);
                } else if (newNotes.size < 4) {
                    const newKey = Date.now();
                    newNotes.set(newKey, { x: data.x, y: data.y, frequency: quantizedFreq, volume: data.volume });
                    if (isPlaying) {
                        synth.triggerAttack(quantizedFreq, undefined, data.volume);
                    }
                }
                setOrbs(orbs => {
                    const latchedOrbs = Array.from(latchedBassNotes.current.entries()).map(([id, note]) => ({ id, x: note.x, y: note.y, type: 'latch' as const }));
                    return [...orbs.filter(o => o.type !== 'latch'), ...latchedOrbs];
                });
            }
            return; 
        }

        switch (state) {
            case 'down':
                if (data) {
                    const quantizedFreq = getClosestFrequency(data.frequency, type);
                    if (quantizedFreq) {
                        synth.triggerAttack(quantizedFreq, undefined, data.volume);
                        activeNotes.current.set(pointerId, { type, freq: quantizedFreq, vol: data.volume });
                        setOrbs(orbs => [...orbs, { id: pointerId, x: data.x, y: data.y, type }]);
                    }
                }
                break;
            case 'move':
                if (data && activeNotes.current.has(pointerId)) {
                    const quantizedFreq = getClosestFrequency(data.frequency, type);
                    if (quantizedFreq) {
                         audioCommandQueue.current.set(pointerId, { freq: quantizedFreq, vol: data.volume });
                         setOrbs(orbs => orbs.map(orb => orb.id === pointerId ? { ...orb, x: data.x, y: data.y } : orb));
                    }
                }
                break;
            case 'up':
                if (activeNotes.current.has(pointerId)) {
                    const activeNote = activeNotes.current.get(pointerId);
                    if (activeNote) {
                        synth.triggerRelease([activeNote.freq]);
                    }
                    activeNotes.current.delete(pointerId);
                    audioCommandQueue.current.delete(pointerId);
                    setOrbs(orbs => orbs.filter(orb => orb.id !== pointerId));

                    let hasMoreNotes = false;
                    for (const note of activeNotes.current.values()) {
                        if (note.type === type) {
                            hasMoreNotes = true;
                            break;
                        }
                    }
                    if (!hasMoreNotes) {
                        synth.releaseAll();
                    }
                }
                break;
        }
    }, [isBassLatchOn, isPlaying, getClosestFrequency]);
    
    const handleStartScreenInteraction = () => {
        if (backgroundAudioRef.current && backgroundAudioRef.current.paused) {
            backgroundAudioRef.current.volume = 0.3;
            backgroundAudioRef.current.play().catch(error => console.error("Error playing background audio:", error));
        }
    };
    
    const bassOrbs = orbs.filter(orb => orb.type === 'bass' || orb.type === 'latch');
    const melodyOrbs = orbs.filter(orb => orb.type === 'melody');

    if (!isAppStarted) {
        return (
            <div 
                className="absolute inset-0 bg-background flex flex-col items-center justify-center z-50 p-4"
                onClick={handleStartScreenInteraction}
            >
                <div className="absolute top-4 right-4 z-20">
                    <HelpGuide showText={false} buttonVariant="ghost" buttonClassName="rounded-full w-10 h-10 hover:bg-white/10" />
                </div>
                <MemoizedOrbitalAnimation isPlaying={false} tempo={activeTempo.bpm}/>
                <audio ref={backgroundAudioRef} src="/assets/sounds/ethermusic_start.mp3" loop />
                <div className="z-10 text-center flex-grow flex flex-col items-center justify-between py-16 w-full">
                    <div>
                        <h1 className="text-5xl md:text-8xl lg:text-5xl xl:text-8xl font-bold text-primary sm:text-6xl" style={{fontSize: '48px'}}>EtherMusic</h1>
                        <p className="text-sm md:text-base text-white/80 font-light mt-2 tracking-wide" style={{fontSize: '14px'}}>
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
                    <p>&copy; 2025, EVS</p>
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
                 <MemoizedOrbitalAnimation isPlaying={isPlaying} tempo={activeTempo.bpm} />
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
                        <MemoizedThereminPad
                            onInteraction={handleThereminInteraction}
                            type="bass"
                            frequencyRange={[55, 440]} // A1 to A4
                            color="hsl(var(--accent))"
                            isPulsating={isBassPulsating}
                            onPulsateToggle={handlePulsateToggle}
                            isLatchOn={isBassLatchOn}
                            onLatchToggle={handleLatchToggle}
                            orbs={bassOrbs}
                            isPolyphonic
                        />
                        <MemoizedThereminPad
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
                            orbs={melodyOrbs}
                            isPolyphonic
                        />
                    </div>
                    <div className="flex-shrink-0">
                        <BeatBoxControls
                            patterns={beatPatterns}
                            activePattern={activePattern}
                            onPatternChange={setActivePattern}
                            tempos={tempos}
                            activeTempo={activeTempo}
                            onTempoChange={setActiveTempo}
                            volumes={volumes}
                            onVolumeChange={setVolumes}
                            effects={effects}
                            onEffectChange={setEffects}
                            isAutopilotOn={isAutopilotOn}
                            onAutopilotToggle={handleAutopilotToggle}
                            autopilotStyles={autopilotStyles}
                            activeAutopilotStyle={autopilotStyle}
                            onAutopilotStyleChange={setAutopilotStyle}
                            isMobile={isMobile}
                        />
                    </div>
                </main>
            </div>
        </div>
    );
}

    
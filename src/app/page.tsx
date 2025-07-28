
"use client";

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { ThereminPad } from '@/components/theremin-pad';
import { BeatBoxControls, type Tempo } from '@/components/beat-box-controls';
import { useToast } from "@/hooks/use-toast";
import { OrbitalAnimation } from '@/components/orbital-animation';
import { useIsMobile } from '@/hooks/use-mobile';
import { PlaybackControls } from '@/components/playback-controls';
import { ArrowRight } from 'lucide-react';
import { HelpGuide } from '@/components/help-guide';
import { AudioEngine } from '@/lib/audio-engine';
import { AutopilotEngine } from '@/lib/autopilot-engine';
import { beatPatterns } from '@/lib/drum-machine';


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

export type AutopilotStyle = 'Ambient' | 'House' | 'Wind' | 'Sequence' | 'Chimes' | 'Drone' | 'Primes' | 'Toccata' | 'Promenade';
export const autopilotStyles: AutopilotStyle[] = ['Ambient', 'House', 'Wind', 'Sequence', 'Chimes', 'Drone', 'Primes', 'Toccata', 'Promenade'];

export type Orb = {
    id: number;
    x: number;
    y: number;
    type: 'melody' | 'bass' | 'latch';
};


const MemoizedOrbitalAnimation = memo(OrbitalAnimation);
const MemoizedThereminPad = memo(ThereminPad);

export default function Home() {
    const { toast } = useToast();
    const isMobile = useIsMobile();
    const [isAppStarted, setIsAppStarted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    
    // --- UI State ---
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [activeTempo, setActiveTempo] = useState<Tempo>(tempos[2]);
    const [volumes, setVolumes] = useState({ melody: -9, bass: -6, drums: -9, autopilot: -9, latch: -9 });
    const [effects, setEffects] = useState({
        melody: { reverb: -60, delay: -60 },
        bass: { reverb: -60, delay: -60 },
        drums: { reverb: -60, delay: -60 },
        autopilot: { reverb: -60, delay: -60 },
        latch: { reverb: -60, delay: -60 },
    });
    const [activePattern, setActivePattern] = useState<(typeof beatPatterns)[number]>(beatPatterns.find(p => p.name === 'Off')!);
    const [melodyInstrument, setMelodyInstrument] = useState<MelodyInstrument>('synth');
    const [musicKey, setMusicKey] = useState<MusicKey>('C');
    const [musicScale, setMusicScale] = useState<MusicScale>('Major Pentatonic');
    const [isBassLatchOn, setIsBassLatchOn] = useState(false);
    const [isAutopilotOn, setIsAutopilotOn] = useState(false);
    const [autopilotStyle, setAutopilotStyle] = useState<AutopilotStyle>('Ambient');

    // --- Audio Engine Ref ---
    const audioEngine = useRef<AudioEngine>();
    const autopilotEngine = useRef<AutopilotEngine>();
    const backgroundAudioRef = useRef<HTMLAudioElement>(null);
    

    // --- Engine Initialization ---
    const initializeAudio = useCallback(async () => {
        if (isReady || audioEngine.current) return;

        try {
            const mainEngine = new AudioEngine();
            await mainEngine.initialize();
            audioEngine.current = mainEngine;
            
            const apEngine = new AutopilotEngine();
            await apEngine.initialize(mainEngine.fx.reverb, mainEngine.fx.delay);
            autopilotEngine.current = apEngine;
            
            // Sync initial state with the engines
            mainEngine.setTempo(activeTempo.bpm);
            mainEngine.setVolumes(volumes);
            mainEngine.setEffects(effects);
            mainEngine.setMelodyInstrument(melodyInstrument);
            mainEngine.setHarmony(musicKey, musicScale);
            mainEngine.setBeatPattern(activePattern.name);
            
            apEngine.setHarmony(musicKey, musicScale);
            apEngine.setVolume(volumes.autopilot);
            apEngine.setEffects(effects.autopilot);

            setIsReady(true);
            console.log('Audio engines initialized and ready.');
        } catch(e) {
            console.error("Failed to initialize audio engines:", e);
            toast({
                title: "Audio Error",
                description: "Could not initialize the audio engine. Please refresh the page.",
                variant: "destructive"
            });
        }
    }, [isReady, activeTempo.bpm, volumes, effects, melodyInstrument, musicKey, musicScale, activePattern.name, toast]);
    

    // --- State Sync with Audio Engine ---
    useEffect(() => {
        audioEngine.current?.setTempo(activeTempo.bpm);
    }, [activeTempo]);

    useEffect(() => {
        audioEngine.current?.setVolumes(volumes);
        autopilotEngine.current?.setVolume(volumes.autopilot);
    }, [volumes]);

    useEffect(() => {
        audioEngine.current?.setEffects(effects);
        autopilotEngine.current?.setEffects(effects.autopilot);
    }, [effects]);

    useEffect(() => {
        audioEngine.current?.setBeatPattern(activePattern.name);
    }, [activePattern]);
    
    useEffect(() => {
        audioEngine.current?.setHarmony(musicKey, musicScale);
        autopilotEngine.current?.setHarmony(musicKey, musicScale);
    }, [musicKey, musicScale]);

    useEffect(() => {
        audioEngine.current?.setMelodyInstrument(melodyInstrument);
    }, [melodyInstrument]);
    
    useEffect(() => {
        audioEngine.current?.setBassLatch(isBassLatchOn);
    }, [isBassLatchOn]);

    useEffect(() => {
        if (!isReady) return;
        autopilotEngine.current?.setAutopilot(isAutopilotOn, autopilotStyle);
        if (isAutopilotOn) {
            if (!isPlaying) setIsPlaying(true);
        }
    }, [isAutopilotOn, autopilotStyle, isReady, isPlaying]);


    // --- UI Event Handlers ---
    const handleStartApp = useCallback(async () => {
        if (backgroundAudioRef.current && !backgroundAudioRef.current.paused) {
            backgroundAudioRef.current.pause();
            backgroundAudioRef.current.currentTime = 0;
        }

        const audio = new Audio('/assets/sounds/transition.webm');
        audio.play().catch(e => console.error("Error playing transition sound:", e));

        await initializeAudio();
        setIsAppStarted(true);
        
        if (isMobile) {
            try {
                if (document.documentElement.requestFullscreen) {
                    await document.documentElement.requestFullscreen();
                } else if ((document.documentElement as any).webkitRequestFullscreen) {
                    await (document.documentElement as any).webkitRequestFullscreen();
                } else if ((document.documentElement as any).msRequestFullscreen) {
                    await (document.documentElement as any).msRequestFullscreen();
                }
            } catch (err) {
                 console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            }
        }
    }, [isMobile, initializeAudio]);
    
    const handlePlayPause = useCallback(async () => {
        if (!isReady) return;
        const willBePlaying = !isPlaying;
        
        if (willBePlaying) {
            audioEngine.current?.start();
        } else {
            audioEngine.current?.pause();
        }
        setIsPlaying(willBePlaying);
    }, [isReady, isPlaying]);

    const handleStop = useCallback(async () => {
        if (!isReady) return;
        audioEngine.current?.stop();
        autopilotEngine.current?.setAutopilot(false, autopilotStyle);
        setIsPlaying(false);
        setIsAutopilotOn(false);
    }, [isReady, autopilotStyle]);

    const handleRecord = useCallback(() => {
        if (!isReady) return;
        const recording = audioEngine.current?.toggleRecording();
        setIsRecording(recording || false);
        if (recording) {
            toast({ title: "Recording Started", description: "All output is now being recorded." });
        } else {
            toast({ title: "Recording Stopped", description: "Your recording has been downloaded." });
        }
    }, [isReady, toast]);

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
    
    const handleStartScreenInteraction = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        // Prevent background audio from playing if the button is clicked
        if ((e.target as HTMLElement).closest('button')) {
            return;
        }

        if (backgroundAudioRef.current && backgroundAudioRef.current.paused) {
            backgroundAudioRef.current.volume = 0.3;
            backgroundAudioRef.current.play().catch(error => console.error("Error playing background audio:", error));
        }
    }, []);

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
                <audio ref={backgroundAudioRef} src="/assets/sounds/ethermusic_sample.mp3" loop />
                <div className="z-10 text-center flex-grow flex flex-col items-center justify-between py-16 w-full">
                    <div>
                        <h1 className="text-4xl md:text-5xl font-bold text-primary">EtherMusic</h1>
                        <p className="text-sm md:text-base text-white/80 font-light mt-2 tracking-wide">Neuro Meditation Processor</p>
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
                        {isMobile ? (
                            <Image src="/assets/images/icon.png" alt="EtherMusic Icon" width={40} height={40} />
                        ) : (
                            <>
                                <h1 className="text-4xl font-bold text-primary">EtherMusic</h1>
                                <p className="text-xs text-white/80 font-light -mt-1 tracking-wide">Neuro Meditation Processor</p>
                             </>
                        )}
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
                            frequencyRange={[55, 440]}
                            color="hsl(var(--accent))"
                            isLatchOn={isBassLatchOn}
                            onLatchToggle={setIsBassLatchOn}
                            isPolyphonic
                        />
                        <MemoizedThereminPad
                            onInteraction={handleThereminInteraction}
                            type="melody"
                            frequencyRange={[220, 1760]}
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
                            tempos={tempos}
                            activeTempo={activeTempo}
                            onTempoChange={setActiveTempo}
                            volumes={volumes}
                            onVolumeChange={setVolumes}
                            effects={effects}
                            onEffectChange={setEffects}
                            isAutopilotOn={isAutopilotOn}
                            onAutopilotToggle={setIsAutopilotOn}
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

    

    

    

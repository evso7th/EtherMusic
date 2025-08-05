
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
import { OrbManager } from '@/lib/orb-manager';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from '@/lib/utils';
import type { AutopilotPart } from '@/lib/autopilot-worker';


export const tempos: Tempo[] = [
    { name: 'Largo', bpm: 50 },
    { name: 'Adagio', bpm: 70 },
    { name: 'Andante', bpm: 90 },
    { name: 'Moderato', bpm: 110 },
    { name: 'Allegretto', bpm: 130 },
];

export type Instrument = 'synth' | 'organ' | 'theremin' | 'E-Bells' | 'mellotron' | 'G-Drops' | 'ebass';
export const instruments: Instrument[] = ['synth', 'organ', 'theremin', 'E-Bells', 'mellotron', 'G-Drops', 'ebass'];

export type MusicKey = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';
export const musicKeys: MusicKey[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export type MusicScale = 'Major' | 'Minor' | 'Major Pentatonic' | 'Minor Pentatonic';
export const musicScales: MusicScale[] = ['Major', 'Minor', 'Major Pentatonic', 'Minor Pentatonic'];

export type AutopilotStyle = 'Ambient' | 'Trance' | 'Sequence' | 'Chimes' | 'Drone' | 'Toccata' | 'Promenade' | 'Space';
export const autopilotStyles: AutopilotStyle[] = ['Ambient', 'Trance', 'Sequence', 'Chimes', 'Drone', 'Toccata', 'Promenade', 'Space'];


const MemoizedOrbitalAnimation = memo(OrbitalAnimation);
const MemoizedThereminPad = memo(ThereminPad);

const Preloader = () => (
    <div className="absolute inset-0 bg-background flex items-center justify-center z-50">
        <div className="text-center text-white">
            <div className='preloader'>
                <div><div><div><div><div></div></div></div></div></div>
            </div>
        </div>
    </div>
);

export default function Home() {
    const { toast } = useToast();
    const isMobile = useIsMobile();
    const [isClient, setIsClient] = useState(false);
    const [isAppStarted, setIsAppStarted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    
    // --- UI State ---
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [activeTempo, setActiveTempo] = useState<Tempo>(tempos[2]);
    const [activePattern, setActivePattern] = useState<(typeof beatPatterns)[number]>(beatPatterns.find(p => p.name === 'Off')!);
    const [melodyInstrument, setMelodyInstrument] = useState<Instrument>('theremin');
    const [bassInstrument, setBassInstrument] = useState<Instrument>('synth');
    const [musicKey, setMusicKey] = useState<MusicKey>('C');
    const [musicScale, setMusicScale] = useState<MusicScale>('Major Pentatonic');
    const [isBassLatchOn, setIsBassLatchOn] = useState(false);
    const [isAutopilotOn, setIsAutopilotOn] = useState(false);
    const [autopilotStyle, setAutopilotStyle] = useState<AutopilotStyle>('Ambient');
    const [autopilotInstrument, setAutopilotInstrument] = useState<Instrument>('synth');
    const [autopilotParts, setAutopilotParts] = useState<Record<AutopilotPart, boolean>>({
        bass: true,
        accompaniment: true,
        melody: true,
        effects: true
    });


    // --- Engine Ref ---
    const audioEngine = useRef<AudioEngine>();
    const autopilotEngine = useRef<AutopilotEngine>();
    const orbManager = useRef<OrbManager>();
    const backgroundAudioRef = useRef<HTMLAudioElement>(null);
    

    // --- Engine Initialization ---
    useEffect(() => {
        setIsClient(true);
    }, []);

    const initializeAudio = useCallback(async () => {
        if (isReady || audioEngine.current) return;
        
        try {
            const mainEngine = new AudioEngine();
            await mainEngine.initialize();
            audioEngine.current = mainEngine;
            orbManager.current = new OrbManager(mainEngine);
            
            const apEngine = new AutopilotEngine(mainEngine);
            autopilotEngine.current = apEngine; 
            
            // Sync initial state with the engines
            mainEngine.setTempo(tempos[2].bpm);
            mainEngine.setVolumes({ melody: -6, manualBass: -6, latch: -15, drums: -9, autopilot: -10, effects: -6, ebass: -6 });
            mainEngine.setEffects({
                melody: { reverb: -Infinity, delay: -60 },
                manualBass: { reverb: -Infinity, delay: -60 },
                latch: { reverb: -Infinity, delay: -60 },
                drums: { reverb: -Infinity, delay: -60 },
                autopilot: { reverb: -Infinity, delay: -60 },
                effects: { reverb: -6, delay: -6 },
                ebass: { reverb: -Infinity, delay: -60 }
            });
            mainEngine.setMelodyInstrument('theremin');
            mainEngine.setBassInstrument('synth');
            mainEngine.setAutopilotInstrument('synth');
            mainEngine.setHarmony('C', 'Major Pentatonic');
            mainEngine.setBeatPattern('Off');
            
            apEngine.setHarmony('C', 'Major Pentatonic');
            
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isReady, toast]);
    
    // --- UI Event Handlers ---
    const handleTempoChange = useCallback((tempo: Tempo) => {
        setActiveTempo(tempo);
        audioEngine.current?.setTempo(tempo.bpm);
    }, []);

    const handleVolumeChange = useCallback((newVolumes: any) => {
        audioEngine.current?.setVolumes(newVolumes);
    }, []);

    const handleEffectChange = useCallback((newEffects: any) => {
        audioEngine.current?.setEffects(newEffects);
    }, []);

    const handlePatternChange = useCallback((pattern: (typeof beatPatterns)[number]) => {
        setActivePattern(pattern);
        audioEngine.current?.drumMachine.setBeatPattern(pattern.name);
    }, []);

    const handleHarmonyChange = useCallback((key: MusicKey, scale: MusicScale) => {
        setMusicKey(key);
        setMusicScale(scale);
        audioEngine.current?.setHarmony(key, scale);
        autopilotEngine.current?.setHarmony(key, scale);
    }, []);
    
    const handleMelodyInstrumentChange = useCallback((instrument: Instrument) => {
        setMelodyInstrument(instrument);
        audioEngine.current?.setMelodyInstrument(instrument);
    }, []);

    const handleBassInstrumentChange = useCallback((instrument: Instrument) => {
        setBassInstrument(instrument);
        audioEngine.current?.setBassInstrument(instrument);
    }, []);

    const handleAutopilotInstrumentChange = useCallback((instrument: Instrument) => {
        setAutopilotInstrument(instrument);
        audioEngine.current?.setAutopilotInstrument(instrument);
    }, []);
    
    const handleLatchToggle = useCallback((isOn: boolean) => {
        setIsBassLatchOn(isOn);
        audioEngine.current?.setBassLatch(isOn);
    }, []);

    const handleAutopilotPartsChange = useCallback((parts: Record<AutopilotPart, boolean>) => {
        setAutopilotParts(parts);
        autopilotEngine.current?.setAutopilotParts(parts);
    }, []);

    const handleAutopilotToggle = useCallback((isOn: boolean) => {
        setIsAutopilotOn(isOn);
        autopilotEngine.current?.setAutopilot(isOn, autopilotStyle, isPlaying);
    }, [autopilotStyle, isPlaying]);

    const handleAutopilotStyleChange = useCallback((newStyle: AutopilotStyle) => {
        setAutopilotStyle(newStyle);
        autopilotEngine.current?.setStyle(newStyle);
    }, []);
    
    const handlePlayPause = useCallback(async () => {
        if (!audioEngine.current) return;
        const willBePlaying = !isPlaying;
        await audioEngine.current.setPlaying(willBePlaying);
        setIsPlaying(willBePlaying);
        autopilotEngine.current?.setAutopilot(isAutopilotOn, autopilotStyle, willBePlaying);
    }, [isPlaying, isAutopilotOn, autopilotStyle]);
    
    const handleStop = useCallback(async () => {
        if (!audioEngine.current || !autopilotEngine.current) return;
        audioEngine.current.stop();
        autopilotEngine.current.stop();
        setIsPlaying(false);
    }, []);

    const handleRecord = useCallback(() => {
        toast({ title: "Recording Unavailable", description: "This feature is temporarily disabled." });
    }, [toast]);
    
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

    const handleStartApp = useCallback(async () => {
        if (backgroundAudioRef.current && !backgroundAudioRef.current.paused) {
            backgroundAudioRef.current.pause();
            backgroundAudioRef.current.currentTime = 0;
        }
        const audio = new Audio('/assets/sounds/transition.webm');
        audio.play().catch(e => console.error("Error playing transition sound:", e));
        if (isMobile) {
             try {
                if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
                else if ((document.documentElement as any).webkitRequestFullscreen) await (document.documentElement as any).webkitRequestFullscreen();
            } catch (err) { console.error("Error fullscreening:", err); }
        }
        setIsAppStarted(true);
    }, [isMobile]);
    
    useEffect(() => {
        if (isAppStarted && !isReady) {
            initializeAudio();
        }
    }, [isAppStarted, isReady, initializeAudio]);

    const handleStartScreenInteraction = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (backgroundAudioRef.current && backgroundAudioRef.current.paused) {
            backgroundAudioRef.current.volume = 0.3;
            backgroundAudioRef.current.play().catch(error => console.error("Error playing background audio:", error));
        }
    }, []);

    // Initial state for volumes and effects to pass to the MixerControls
    const initialVolumes = useRef({ melody: -6, manualBass: -6, latch: -15, drums: -9, autopilot: -10, effects: -6, ebass: -6 });
    const initialEffects = useRef({
        melody: { reverb: -Infinity, delay: -60 },
        manualBass: { reverb: -Infinity, delay: -60 },
        latch: { reverb: -Infinity, delay: -60 },
        drums: { reverb: -Infinity, delay: -60 },
        autopilot: { reverb: -Infinity, delay: -60 },
        effects: { reverb: -6, delay: -6 },
        ebass: { reverb: -Infinity, delay: -60 }
    });

    if (!isClient) {
        return <Preloader />;
    }

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
                    <p className="mt-2">v.1.035</p>
                </footer>
            </div>
        )
    }

    if (isAppStarted && !isReady) {
        return <Preloader />;
    }

    return (
        <div className="relative flex flex-col h-screen overflow-hidden">
            <div className="fixed inset-0 z-0 animate-pulse-container">
                 <MemoizedOrbitalAnimation isPlaying={isPlaying} tempo={activeTempo.bpm} />
            </div>
            
             <div className={cn(
                "relative z-10 flex h-full",
                "portrait:flex-col portrait:p-2 md:p-6 lg:p-8",
                "landscape:flex-row landscape:p-1 landscape:gap-1"
            )}>
                <header className={cn(
                    "flex-shrink-0",
                    "portrait:flex portrait:items-center portrait:justify-between portrait:mb-2",
                    "landscape:flex landscape:flex-col landscape:items-center landscape:justify-center landscape:w-16 landscape:gap-4"
                )}>
                     <div className="portrait:block landscape:hidden">
                        {isMobile ? (
                            <Dialog>
                                <DialogTrigger asChild>
                                    <button>
                                        <Image src="/assets/images/icon.png" alt="EtherMusic Icon" width={30} height={30} />
                                    </button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>What is This?</DialogTitle>
                                    </DialogHeader>
                                    <div className="text-sm text-muted-foreground space-y-4 py-4">
                                        <p>It's a virtual music box, a "Neuro Meditation Sound Processor."</p>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        ) : (
                            <>
                                <h1 className="text-4xl font-bold text-primary">EtherMusic</h1>
                                <p className="text-xs text-white/80 font-light -mt-1 tracking-wide">Neuro Meditation Processor</p>
                             </>
                        )}
                    </div>
                    <div className={cn("flex items-center gap-1 md:gap-2", "landscape:flex-col")}>
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

                 <main className="flex-grow flex flex-col gap-2 overflow-hidden">
                     <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-2 landscape:grid-cols-2 landscape:gap-1">
                        <MemoizedThereminPad
                            onInteraction={handleThereminInteraction}
                            type="bass"
                            frequencyRange={[43.65, 261.63]}
                            color="hsl(var(--accent))"
                            isLatchOn={isBassLatchOn}
                            onLatchToggle={handleLatchToggle}
                            instruments={instruments.filter(i => i !== 'theremin' && i !== 'G-Drops')}
                            activeInstrument={bassInstrument}
                            onInstrumentChange={handleBassInstrumentChange}
                            isPolyphonic
                        />
                        <MemoizedThereminPad
                            onInteraction={handleThereminInteraction}
                            type="melody"
                            frequencyRange={[220, 1760]}
                            color="hsl(var(--primary))"
                            instruments={instruments.filter(i => i !== 'ebass')}
                            activeInstrument={melodyInstrument}
                            onInstrumentChange={handleMelodyInstrumentChange}
                            musicKeys={musicKeys}
                            activeKey={musicKey}
                            onKeyChange={(k) => handleHarmonyChange(k, musicScale)}
                            musicScales={musicScales}
                            activeScale={musicScale}
                            onScaleChange={(s) => handleHarmonyChange(musicKey, s)}
                            isPolyphonic
                        />
                    </div>
                    <div className="flex-shrink-0 portrait:block landscape:hidden">
                        <BeatBoxControls
                            patterns={beatPatterns}
                            activePattern={activePattern}
                            onPatternChange={handlePatternChange}
                            tempos={tempos}
                            activeTempo={activeTempo}
                            onTempoChange={handleTempoChange}
                            initialVolumes={initialVolumes.current}
                            onVolumeChange={handleVolumeChange}
                            initialEffects={initialEffects.current}
                            onEffectChange={handleEffectChange}
                            isAutopilotOn={isAutopilotOn}
                            onAutopilotToggle={handleAutopilotToggle}
                            autopilotStyles={autopilotStyles}
                            activeAutopilotStyle={autopilotStyle}
                            onAutopilotStyleChange={handleAutopilotStyleChange}
                            autopilotInstrument={autopilotInstrument}
                            onAutopilotInstrumentChange={handleAutopilotInstrumentChange}
                            autopilotParts={autopilotParts}
                            onAutopilotPartsChange={handleAutopilotPartsChange}
                            isMobile={isMobile}
                            instruments={instruments.filter(i => i !== 'ebass')}
                        />
                    </div>
                </main>

                <div className="portrait:hidden landscape:flex landscape:flex-col landscape:items-center landscape:justify-center landscape:w-16 landscape:gap-2">
                     <BeatBoxControls
                        patterns={beatPatterns}
                        activePattern={activePattern}
                        onPatternChange={handlePatternChange}
                        tempos={tempos}
                        activeTempo={activeTempo}
                        onTempoChange={handleTempoChange}
                        initialVolumes={initialVolumes.current}
                        onVolumeChange={handleVolumeChange}
                        initialEffects={initialEffects.current}
                        onEffectChange={handleEffectChange}
                        isAutopilotOn={isAutopilotOn}
                        onAutopilotToggle={handleAutopilotToggle}
                        autopilotStyles={autopilotStyles}
                        activeAutopilotStyle={autopilotStyle}
                        onAutopilotStyleChange={handleAutopilotStyleChange}
                        autopilotInstrument={autopilotInstrument}
                        onAutopilotInstrumentChange={handleAutopilotInstrumentChange}
                        autopilotParts={autopilotParts}
                        onAutopilotPartsChange={handleAutopilotPartsChange}
                        isMobile={isMobile}
                        isLandscape={true}
                        instruments={instruments.filter(i => i !== 'ebass')}
                    />
                </div>
            </div>
        </div>
    );
}

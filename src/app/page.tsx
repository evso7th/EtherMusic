
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
import { beatPatterns } from '@/lib/drum-machine';
import { OrbManager } from '@/lib/orb-manager';
import * as Tone from 'tone';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from '@/lib/utils';
import type { NoteEvent, WorkerResponse, AutopilotPart as WorkerAutopilotPart, NoteUpdateEvent } from '@/lib/autopilot-worker';
import { CookieConsent } from '@/components/cookie-consent';

function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
}

function setCookie(name: string, value: string, days: number) {
    if (typeof document === 'undefined') return;
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days*24*60*60*1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "")  + expires + "; path=/; SameSite=Lax";
}

const defaultVolumes = { melody: -6, manualBass: -6, latch: -15, drums: -9, autopilot: -10, accompaniment: -14, autopilotBass: -9, effects: -6 };
const defaultEffects = {
    melody: { reverb: -Infinity, delay: -60 },
    manualBass: { reverb: -Infinity, delay: -60 },
    latch: { reverb: -Infinity, delay: -60 },
    drums: { reverb: -Infinity, delay: -60 },
    autopilot: { reverb: -Infinity, delay: -60 },
    accompaniment: { reverb: -6, delay: -20 },
    autopilotBass: { reverb: -Infinity, delay: -60 },
    effects: { reverb: -6, delay: -6 },
};

function loadSettings() {
    if (typeof window === 'undefined' || getCookie("ethermusic_consent") !== 'true') {
        return { volumes: defaultVolumes, effects: defaultEffects };
    }
    try {
        const savedVolumes = getCookie("ethermusic_volumes");
        const savedEffects = getCookie("ethermusic_effects");

        const volumes = savedVolumes ? JSON.parse(savedVolumes) : defaultVolumes;
        const effects = savedEffects ? JSON.parse(savedEffects) : defaultEffects;
        
        if (typeof volumes.melody !== 'number') return { volumes: defaultVolumes, effects: defaultEffects };

        return { volumes, effects };
    } catch (e) {
        console.error("Failed to load settings from cookies", e);
        return { volumes: defaultVolumes, effects: defaultEffects };
    }
}

function saveSettings(volumes: any, effects: any) {
    if (typeof window === 'undefined' || getCookie("ethermusic_consent") !== 'true') {
        return;
    }
    try {
        setCookie("ethermusic_volumes", JSON.stringify(volumes), 365);
        setCookie("ethermusic_effects", JSON.stringify(effects), 365);
    } catch (e) {
        console.error("Failed to save settings to cookies", e);
    }
}

export const tempos: Tempo[] = [
    { name: 'Largo', bpm: 50 },
    { name: 'Adagio', bpm: 70 },
    { name: 'Andante', bpm: 90 },
    { name: 'Moderato', bpm: 110 },
    { name: 'Allegretto', bpm: 130 },
];

export type Instrument = 'synth' | 'organ' | 'theremin' | 'E-Bells' | 'mellotron' | 'G-Drops' | 'ebass' | 'autopilot_effect_star' | 'autopilot_effect_meteor' | 'autopilot_effect_bell' | 'autopilot_effect_chimes';
export const instruments: Instrument[] = ['synth', 'organ', 'theremin', 'E-Bells', 'mellotron', 'G-Drops', 'ebass'];
export const autopilotInstruments: Instrument[] = ['synth', 'organ', 'theremin', 'E-Bells', 'mellotron', 'G-Drops', 'ebass', 'autopilot_effect_star', 'autopilot_effect_meteor', 'autopilot_effect_bell', 'autopilot_effect_chimes'];

export type MusicKey = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';
export const musicKeys: MusicKey[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export type MusicScale = 'Major' | 'Minor' | 'Major Pentatonic' | 'Minor Pentatonic';
export const musicScales: MusicScale[] = ['Major', 'Minor', 'Major Pentatonic', 'Minor Pentatonic'];

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
    const [musicKey, setMusicKey] = useState<MusicKey>('G');
    const [musicScale, setMusicScale] = useState<MusicScale>('Major');
    const [isBassLatchOn, setIsBassLatchOn] = useState(false);
    const [isAutopilotOn, setIsAutopilotOn] = useState(false);
    const [autopilotPartInstruments, setAutopilotPartInstruments] = useState<Record<WorkerAutopilotPart, Instrument>>({
        melody: 'synth',
        accompaniment: 'mellotron',
        bass: 'ebass',
        effects: 'autopilot_effect_star'
    });
    const [volumes, setVolumes] = useState(() => loadSettings().volumes);
    const [effects, setEffects] = useState(() => loadSettings().effects);
    
    // --- Engine Ref ---
    const audioEngine = useRef<AudioEngine>();
    const autopilotWorker = useRef<Worker>();
    const orbManager = useRef<OrbManager>();
    const backgroundAudioRef = useRef<HTMLAudioElement>(null);
    
    // --- Engine Initialization ---
    useEffect(() => {
        setIsClient(true);
    }, []);

    const initializeAudio = useCallback(async () => {
        if (isReady || !isAppStarted) return;
        
        try {
            console.log("Initializing audio resources...");
            const om = new OrbManager();
            orbManager.current = om;

            const mainEngine = new AudioEngine();
            await mainEngine.initialize();
            mainEngine.setOrbManager(om);
            audioEngine.current = mainEngine;

            const worker = new Worker(new URL('../lib/autopilot-worker.ts', import.meta.url));
            worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
                const engine = audioEngine.current;
                if (!engine) return;

                if (e.data.type === 'playNote' && e.data.note) {
                    engine.playWorkerNotesBatch([e.data.note]);
                } else if (e.data.type === 'updateNote' && e.data.note) {
                    engine.updateWorkerNote(e.data.note);
                } else if (e.data.type === 'playNotesBatch' && e.data.notes) {
                    engine.playWorkerNotesBatch(e.data.notes);
                }
            };
            autopilotWorker.current = worker;
            
            // Set initial state from React to the audio engine and worker
            mainEngine.setTempo(activeTempo.bpm);
            mainEngine.setVolumes(volumes);
            mainEngine.setEffects(effects);
            mainEngine.setMelodyInstrument(melodyInstrument);
            mainEngine.setBassInstrument(bassInstrument);
            Object.entries(autopilotPartInstruments).forEach(([part, instrument]) => {
                mainEngine.setAutopilotInstrument(part as WorkerAutopilotPart, instrument);
            });
            mainEngine.setHarmony(musicKey, musicScale);
            
            worker.postMessage({ type: 'setHarmony', key: musicKey, scale: musicScale });
            worker.postMessage({ type: 'setTempo', bpm: activeTempo.bpm });
            
            Tone.Transport.scheduleRepeat((time) => {
                autopilotWorker.current?.postMessage({ type: 'tick', time });
            }, '16n');

            setIsReady(true);
            setIsPlaying(Tone.Transport.state === 'started');
            console.log('Audio engines and worker initialized and ready.');
        } catch(e) {
            console.error("Failed to initialize audio engines:", e);
            toast({
                title: "Audio Error",
                description: "Could not initialize the audio engine. Please refresh the page.",
                variant: "destructive"
            });
        }
    }, [isReady, isAppStarted, toast, activeTempo.bpm, volumes, effects, melodyInstrument, bassInstrument, autopilotPartInstruments, musicKey, musicScale]);
    
    // --- UI Event Handlers ---
    
    const handlePlay = useCallback(() => {
        if (!isReady) return;
        Tone.Transport.start();
        setIsPlaying(true);
    }, [isReady]);

    const handlePatternChange = useCallback((pattern: (typeof beatPatterns)[number]) => {
        setActivePattern(pattern);
        audioEngine.current?.setBeatPattern(pattern.name);
        if (pattern.name !== 'Off' && Tone.Transport.state !== 'started') {
            handlePlay();
        }
    }, [handlePlay]);
    
    const handleAutopilotToggle = useCallback((isOn: boolean) => {
        setIsAutopilotOn(isOn);
        autopilotWorker.current?.postMessage({ type: isOn ? 'start' : 'stop' });
        // If autopilot has its own drums, manage the manual drums
        if (isOn) {
            const offPattern = beatPatterns.find(p => p.name === 'Off')!;
            handlePatternChange(offPattern); 
            if (Tone.Transport.state !== 'started') {
                handlePlay();
            }
        }
    }, [handlePlay, handlePatternChange]);

    const handleTempoChange = useCallback((tempo: Tempo) => {
        setActiveTempo(tempo);
        audioEngine.current?.setTempo(tempo.bpm);
        autopilotWorker.current?.postMessage({ type: 'setTempo', bpm: tempo.bpm });
    }, []);

    const handleVolumeChange = useCallback((newVolumes: any) => {
        setVolumes(newVolumes);
        audioEngine.current?.setVolumes(newVolumes);
        saveSettings(newVolumes, effects);
    }, [effects]);

    const handleEffectChange = useCallback((newEffects: any) => {
        setEffects(newEffects);
        audioEngine.current?.setEffects(newEffects);
        saveSettings(volumes, newEffects);
    }, [volumes]);

    const handleHarmonyChange = useCallback((key: MusicKey, scale: MusicScale) => {
        setMusicKey(key);
        setMusicScale(scale);
        audioEngine.current?.setHarmony(key, scale);
        autopilotWorker.current?.postMessage({ type: 'setHarmony', key, scale });
    }, []);
    
    const handleMelodyInstrumentChange = useCallback((instrument: Instrument) => {
        setMelodyInstrument(instrument);
        audioEngine.current?.setMelodyInstrument(instrument);
    }, []);

    const handleBassInstrumentChange = useCallback((instrument: Instrument) => {
        setBassInstrument(instrument);
        audioEngine.current?.setBassInstrument(instrument);
    }, []);
    
    const handleAutopilotInstrumentChange = useCallback((part: WorkerAutopilotPart, instrument: Instrument) => {
        const newInstruments = { ...autopilotPartInstruments, [part]: instrument };
        setAutopilotPartInstruments(newInstruments);
        audioEngine.current?.setAutopilotInstrument(part, instrument);
    }, [autopilotPartInstruments]);
    
    const handleLatchToggle = useCallback((isOn: boolean) => {
        setIsBassLatchOn(isOn);
        audioEngine.current?.setBassLatch(isOn);
    }, []);

    const handlePause = useCallback(() => {
        if (!isReady) return;
        Tone.Transport.pause();
        setIsPlaying(false);
    }, [isReady]);
    
    const handleStop = useCallback(async () => {
        if (!audioEngine.current) return;
        Tone.Transport.stop();
        setIsPlaying(false);
        const offPattern = beatPatterns.find(p => p.name === 'Off')!;
        setActivePattern(offPattern);
        audioEngine.current.setBeatPattern(offPattern.name);
        audioEngine.current.stopAllSounds();
    }, []);

    const handleRecord = useCallback(() => {
        if (!audioEngine.current) return;

        if (isRecording) {
            audioEngine.current.stopRecording();
            setIsRecording(false);
            toast({ title: "Recording Stopped", description: "Your session has been saved." });
        } else {
            audioEngine.current.startRecording();
            setIsRecording(true);
            toast({ title: "Recording Started", description: "Press the record button again to stop." });
        }
    }, [isRecording, toast]);
    
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
    
    // Effect to run initialization once app is started
    useEffect(() => {
        if(isAppStarted && !isReady) {
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
                    <p>Powered by Web Audio API</p>
                    <p>&copy; 2025, EVS</p>
                    <p className="mt-2">v.2.0 "Maestro"</p>
                </footer>
                <CookieConsent />
            </div>
        )
    }

    if (isAppStarted && !isReady) {
        return <Preloader />;
    }

    return (
        <div className="relative flex flex-col h-screen overflow-hidden">
            <div className="fixed inset-0 z-0">
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
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>What is This?</DialogTitle>
                                    </DialogHeader>
                                    <div className="text-sm text-muted-foreground space-y-4 py-4">
                                        <p>This is not a professional tool, but a **virtual music box**, a "Neuro-Meditation Sound Processor."</p>
                                        <p>It's an instrument that anyone can play, designed for relaxation and self-expression. The music you create is for the here and now, to harmonize your inner state.</p>
                                        <p>It's simple enough for a child, yet engaging for adults.</p>
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
                            onPlay={handlePlay}
                            onPause={handlePause}
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
                            instruments={instruments.filter(i => i !== 'theremin' && i !== 'G-Drops' && !i.includes('effect'))}
                            activeInstrument={bassInstrument}
                            onInstrumentChange={handleBassInstrumentChange}
                            isPolyphonic
                            orbManager={orbManager.current}
                        />
                        <MemoizedThereminPad
                            onInteraction={handleThereminInteraction}
                            type="melody"
                            frequencyRange={[110, 880]}
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
                            orbManager={orbManager.current}
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
                            initialVolumes={volumes}
                            onVolumeChange={handleVolumeChange}
                            initialEffects={effects}
                            onEffectChange={handleEffectChange}
                            isAutopilotOn={isAutopilotOn}
                            onAutopilotToggle={handleAutopilotToggle}
                            autopilotInstruments={autopilotInstruments}
                            activeAutopilotInstruments={autopilotPartInstruments}
                            onAutopilotInstrumentChange={handleAutopilotInstrumentChange}
                            isMobile={isMobile}
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
                        initialVolumes={volumes}
                        onVolumeChange={handleVolumeChange}
                        initialEffects={effects}
                        onEffectChange={onEffectChange}
                        isAutopilotOn={isAutopilotOn}
                        onAutopilotToggle={handleAutopilotToggle}
                        autopilotInstruments={autopilotInstruments}
                        activeAutopilotInstruments={autopilotPartInstruments}
                        onAutopilotInstrumentChange={handleAutopilotInstrumentChange}
                        isMobile={isMobile}
                        isLandscape={true}
                    />
                </div>
            </div>
        </div>
    );
}

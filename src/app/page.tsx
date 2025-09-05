
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
import { beatPatterns } from '@/lib/drum-machine';
import type { AutopilotPart as WorkerAutopilotPart } from '@/lib/autopilot-worker';
import { CookieConsent } from '@/components/cookie-consent';
import { useAudioEngine } from '@/hooks/use-audio-engine';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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

function loadSettings() {
    if (typeof window === 'undefined' || getCookie("ethermusic_consent") !== 'true') {
        return { volumes: defaultVolumes };
    }
    try {
        const savedVolumes = getCookie("ethermusic_volumes");
        const volumes = savedVolumes ? JSON.parse(savedVolumes) : defaultVolumes;
        
        // Basic validation
        if (typeof volumes.melody !== 'number' || Object.keys(volumes).length !== Object.keys(defaultVolumes).length) {
            return { volumes: defaultVolumes };
        }

        return { volumes };
    } catch (e) {
        console.error("Failed to load settings from cookies", e);
        return { volumes: defaultVolumes };
    }
}

function saveSettings(volumes: any) {
    if (typeof window === 'undefined' || getCookie("ethermusic_consent") !== 'true') {
        return;
    }
    try {
        setCookie("ethermusic_volumes", JSON.stringify(volumes), 365);
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
    
    const {
        isAppStarted,
        isReady,
        isPlaying,
        startApp,
        play,
        pause,
        stop,
        setTempo,
        setVolumes,
        setHarmony,
        setMelodyInstrument: setEngineMelodyInstrument,
        setBassInstrument: setEngineBassInstrument,
        setAutopilotInstrument,
        setBeatPattern,
        setBassLatch,
        startRecording,
        stopRecording,
        handleThereminInteraction,
        startAutopilot,
        stopAutopilot,
        orbManager
    } = useAudioEngine();
    
    // --- UI State ---
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
    const [volumes, setLocalVolumes] = useState(() => loadSettings().volumes);

    useEffect(() => {
        setIsClient(true);
        // Set initial volumes in the engine after it's ready
        if (isReady) {
            setVolumes(volumes);
        }
    }, [isReady, setVolumes, volumes]);

    const handleStartApp = useCallback(() => {
        startApp(isMobile);
    }, [startApp, isMobile]);

    const handleStop = useCallback(() => {
        stop();
        const offPattern = beatPatterns.find(p => p.name === 'Off')!;
        setActivePattern(offPattern);
        setBeatPattern(offPattern.name);
    }, [stop, setBeatPattern]);

    const handleRecord = useCallback(() => {
        if (isRecording) {
            stopRecording();
            toast({ title: "Recording Stopped", description: "Your session has been saved." });
        } else {
            startRecording();
            toast({ title: "Recording Started", description: "Press the record button again to stop." });
        }
        setIsRecording(!isRecording);
    }, [isRecording, toast, startRecording, stopRecording]);

    const handlePatternChange = useCallback((pattern: (typeof beatPatterns)[number]) => {
        setActivePattern(pattern);
        setBeatPattern(pattern.name);
        if (pattern.name !== 'Off' && !isPlaying) {
            play();
        }
    }, [setBeatPattern, isPlaying, play]);

    const handleTempoChange = useCallback((tempo: Tempo) => {
        setActiveTempo(tempo);
        setTempo(tempo);
    }, [setTempo]);

    const handleVolumeChange = useCallback((newVolumes: any) => {
        setLocalVolumes(newVolumes);
        setVolumes(newVolumes);
        saveSettings(newVolumes);
    }, [setVolumes]);

    const handleHarmonyChange = useCallback((key: MusicKey, scale: MusicScale) => {
        setMusicKey(key);
        setMusicScale(scale);
        setHarmony(key, scale);
    }, [setHarmony]);

    const handleMelodyInstrumentChange = useCallback((instrument: Instrument) => {
        setMelodyInstrument(instrument);
        setEngineMelodyInstrument(instrument);
    }, [setEngineMelodyInstrument]);

    const handleBassInstrumentChange = useCallback((instrument: Instrument) => {
        setBassInstrument(instrument);
        setEngineBassInstrument(instrument);
    }, [setEngineBassInstrument]);
    
    const handleAutopilotInstrumentChange = useCallback((part: WorkerAutopilotPart, instrument: Instrument) => {
        setAutopilotPartInstruments(prev => {
            const newInstruments = { ...prev, [part]: instrument };
            setAutopilotInstrument(part, instrument);
            return newInstruments;
        });
    }, [setAutopilotInstrument]);
    
    const handleLatchToggle = useCallback((isOn: boolean) => {
        setIsBassLatchOn(isOn);
        setBassLatch(isOn);
    }, [setBassLatch]);
    
    const handleAutopilotToggle = useCallback((isOn: boolean) => {
        setIsAutopilotOn(isOn);
        if (isOn) {
            startAutopilot();
            // Turn off manual drums
            const offPattern = beatPatterns.find(p => p.name === 'Off')!;
            handlePatternChange(offPattern); 
            if (!isPlaying) {
                play();
            }
        } else {
            stopAutopilot();
        }
    }, [isPlaying, play, startAutopilot, stopAutopilot, handlePatternChange]);
    

    if (!isClient) {
        return <Preloader />;
    }

    if (!isAppStarted) {
        return (
            <div 
                className="absolute inset-0 bg-background flex flex-col items-center justify-center z-50 p-4"
            >
                <div className="absolute top-4 right-4 z-20">
                    <HelpGuide showText={false} buttonVariant="ghost" buttonClassName="rounded-full w-10 h-10 hover:bg-white/10" />
                </div>
                <MemoizedOrbitalAnimation isPlaying={false} tempo={activeTempo.bpm}/>
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
            
             <div className="relative z-10 flex h-full portrait:flex-col portrait:p-2 md:p-6 lg:p-8 landscape:flex-row landscape:p-1 landscape:gap-1">
                <header className="flex-shrink-0 portrait:flex portrait:items-center portrait:justify-between portrait:mb-2 landscape:flex landscape:flex-col landscape:items-center landscape:justify-center landscape:w-16 landscape:gap-4">
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
                    <div className="flex items-center gap-1 md:gap-2 landscape:flex-col">
                         <PlaybackControls
                            isPlaying={isPlaying}
                            isRecording={isRecording}
                            onPlay={play}
                            onPause={pause}
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
                            orbManager={orbManager}
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
                            orbManager={orbManager}
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

    
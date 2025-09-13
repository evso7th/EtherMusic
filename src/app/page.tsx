
"use client";

import { useState, useEffect, useCallback, memo } from 'react';
import { Button } from "@/components/ui/button";
import { BeatBoxControls } from '@/components/beat-box-controls';
import { useToast } from "@/hooks/use-toast";
import { OrbitalAnimation } from '@/components/orbital-animation';
import { useIsMobile } from '@/hooks/use-mobile';
import { PlaybackControls } from '@/components/playback-controls';
import { ArrowRight } from 'lucide-react';
import { HelpGuide } from "@/components/help-guide";
import { beatPatterns } from '@/lib/drum-machine';
import { useAudioEngine, defaultVolumes } from '@/hooks/use-audio-engine';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { getScaleFrequencies, ALL_NOTES, SCALES } from '@/lib/music';
import { melodyInstruments, defaultMelodyInstrument } from '@/lib/melody-presets';
import { bassInstruments, defaultBassInstrument } from '@/lib/bass-presets';
import type { MusicKey, MusicScale, Volumes, Instrument, BassInstrument, BeatPattern } from '@/types';
import { cn } from '@/lib/utils';
import { ThereminPads } from '@/components/theremin-pads';

const MemoizedOrbitalAnimation = memo(OrbitalAnimation);

const Preloader = () => (
    <div className="absolute inset-0 bg-background flex items-center justify-center z-50">
        <div className="text-center text-white">
            <div className='preloader'>
                <div></div><div></div><div></div><div></div>
            </div>
            <p className="text-lg animate-pulse mt-4">Loading Audio Engine...</p>
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
        audioEngine,
        startApp,
        stopAllSounds,
        setBeatPattern,
        setBassLatch,
        startRecording,
        stopRecording,
        handleThereminInteraction,
        setMelodyInstrument,
        setBassInstrument,
        orbManager,
        volumes,
        setVolumes,
        currentTempo,
    } = useAudioEngine();
    
    const [isRecording, setIsRecording] = useState(false);
    const [activePattern, setActivePattern] = useState<BeatPattern>(() => beatPatterns.find(p => p.name === 'Off')!);
    const [musicKey, setMusicKey] = useState<MusicKey>('G');
    const [musicScale, setMusicScale] = useState<MusicScale>('Minor');
    const [allowedFrequencies, setAllowedFrequencies] = useState<{melody: number[], bass: number[]}>({melody: [], bass: []});
    
    const [activeMelodyInstrument, setActiveMelodyInstrument] = useState<Instrument>(defaultMelodyInstrument);
    const [activeBassInstrument, setActiveBassInstrument] = useState<BassInstrument>(defaultBassInstrument);
    
    const [isBassLatchOn, setIsBassLatchOn] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (isReady && activeMelodyInstrument) {
            setMelodyInstrument(activeMelodyInstrument);
        }
    }, [isReady, activeMelodyInstrument, setMelodyInstrument]);

    useEffect(() => {
        if (isReady && activeBassInstrument) {
            setBassInstrument(activeBassInstrument);
        }
    }, [isReady, activeBassInstrument, setBassInstrument]);
    
    const handleHarmonyChange = useCallback((keyOrScale: MusicKey | MusicScale) => {
        const isKey = (k: string): k is MusicKey => Object.keys(ALL_NOTES).includes(k);
        const isScale = (s: string): s is MusicScale => Object.keys(SCALES).includes(s);

        if (isKey(keyOrScale)) {
            setMusicKey(keyOrScale);
        } else if (isScale(keyOrScale)) {
            setMusicScale(keyOrScale);
        }
    }, []);

    useEffect(() => {
        const bassFreqs = getScaleFrequencies(musicKey, musicScale, [2, 3]);
        const melodyFreqs = getScaleFrequencies(musicKey, musicScale, [2, 3, 4]);
        setAllowedFrequencies({ melody: melodyFreqs, bass: bassFreqs });
    }, [musicKey, musicScale]);
    
    const handleMixerApply = useCallback((newVolumes: Volumes) => {
        setVolumes(newVolumes);
    }, [setVolumes]);
    
    const handleChannelEffectChange = useCallback((
        channel: 'melody' | 'bass', 
        effect: 'reverbSend' | 'distortion', 
        value: number
    ) => {
        setVolumes(prevVolumes => {
            const newVolumes = JSON.parse(JSON.stringify(prevVolumes));
            const targetChannelKey = channel === 'bass' ? 'manualBass' : 'melody';
            
            newVolumes[targetChannelKey][effect] = value;
            return newVolumes;
        });
    }, [setVolumes]);
    
    const handleStartApp = useCallback(() => {
        startApp();
    }, [startApp]);

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

    const handlePatternChange = useCallback((pattern: BeatPattern) => {
        setActivePattern(pattern);
        setBeatPattern(pattern.name);
    }, [setBeatPattern]);



    const handleLatchToggle = useCallback((isOn: boolean) => {
        setIsBassLatchOn(isOn);
        setBassLatch(isOn);
    }, [setBassLatch]);
    
    const handleMelodyInstrumentChange = useCallback((instrumentId: Instrument) => {
        setActiveMelodyInstrument(instrumentId);
        setMelodyInstrument(instrumentId);
    }, [setMelodyInstrument]);
    
     const handleSetBassInstrument = useCallback((instrumentId: BassInstrument) => {
        setActiveBassInstrument(instrumentId);
        if (audioEngine) {
            audioEngine.setBassInstrument(instrumentId);
        }
    }, [audioEngine]);

    const handleThereminInteractionCallback = useCallback((type: 'melody' | 'bass', data: { frequency: number; volume: number; pointerId: number; x: number, y: number } | null, state: 'down' | 'move' | 'up') => {
        if (!isReady || !audioEngine) return;
        handleThereminInteraction(type, data, state);
    }, [isReady, audioEngine, handleThereminInteraction]);

    const handlePlayPause = useCallback(() => {
        if (!audioEngine) return;
        if (isPlaying) {
            audioEngine.getDrumMachine().stop();
        } else {
            audioEngine.getDrumMachine().play();
        }
    }, [audioEngine, isPlaying]);

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
                <div className="z-10 text-center flex-grow flex flex-col items-center justify-between py-16 w-full max-w-lg mx-auto">
                    <div>
                        <h1 className="text-4xl md:text-5xl font-bold text-primary">EtherMusic</h1>
                        <p className="text-sm md:text-base text-white/80 font-light mt-2 tracking-wide">Neuro Meditation Processor</p>
                    </div>
                    <div className="relative flex-grow flex items-center justify-center w-full">
                      <MemoizedOrbitalAnimation />
                    </div>
                    <Button size="lg" onClick={handleStartApp}>
                        Start Meditation
                        <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                </div>
                 <footer className="z-10 text-xs text-white/50 pb-4 text-center">
                    <p>Powered by Web Audio API</p>
                    <p>&copy; 2024, EVS</p>
                    <p className="mt-2">v.2.1 "Maestro"</p>
                </footer>
            </div>
        )
    }

    if (isAppStarted && !isReady) {
        return <Preloader />;
    }
    
    return (
        <div className="relative flex flex-col h-screen overflow-hidden bg-background">
             <div className="relative z-10 flex h-full portrait:flex-col portrait:p-2 md:p-6 lg:p-8 landscape:flex-row landscape:p-1 landscape:gap-1">
                <header className="flex-shrink-0 portrait:flex portrait:items-center portrait:justify-between portrait:mb-2 landscape:flex landscape:flex-col landscape:items-center landscape:justify-center landscape:w-16 landscape:gap-4">
                     <div className="portrait:block landscape:hidden">
                        {isMobile ? (
                             <Dialog>
                                 <DialogTrigger asChild>
                                     <Button variant="ghost" className="text-primary text-xl font-bold p-0 h-auto">EtherMusic</Button>
                                 </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>What is EtherMusic?</DialogTitle>
                                         <DialogDescription>
                                            This app is a tool for relaxation and self-expression.
                                        </DialogDescription>
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
                            onPlayPause={handlePlayPause}
                            onRecord={handleRecord}
                            onExit={stopAllSounds}
                            isReady={isReady}
                        />
                    </div>
                </header>

                 <main className="flex-grow flex flex-col gap-2 overflow-hidden">
                    <ThereminPads 
                        onInteraction={handleThereminInteractionCallback}
                        allowedFrequencies={allowedFrequencies}
                        isLatchOn={isBassLatchOn}
                        onLatchToggle={handleLatchToggle}
                        activeBassInstrument={activeBassInstrument}
                        onInstrumentChange={handleSetBassInstrument}
                        orbManager={orbManager}
                        volumes={volumes}
                        onEffectChange={handleChannelEffectChange}
                        activeMelodyInstrument={activeMelodyInstrument}
                        onMelodyInstrumentChange={handleMelodyInstrumentChange}
                        musicKey={musicKey}
                        onKeyChange={handleHarmonyChange}
                        musicScale={musicScale}
                        onScaleChange={handleHarmonyChange}
                    />
                    <div className="flex-shrink-0 portrait:block landscape:hidden">
                        <BeatBoxControls
                            activePattern={activePattern}
                            onPatternChange={handlePatternChange}
                            volumes={volumes}
                            onApply={handleMixerApply}
                            isMobile={isMobile}
                        />
                    </div>
                </main>

                <div className="portrait:hidden landscape:flex landscape:flex-col landscape:items-center justify-between landscape:w-16 landscape:gap-2 landscape:py-4">
                     <BeatBoxControls
                        activePattern={activePattern}
                        onPatternChange={handlePatternChange}
                        volumes={volumes}
                        onApply={handleMixerApply}
                        isMobile={isMobile}
                        isLandscape={true}
                    />
                </div>
            </div>
        </div>
    );
}

    
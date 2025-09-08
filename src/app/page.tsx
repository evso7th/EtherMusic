
"use client";

import { useState, useEffect, useCallback, memo } from 'react';
import { Button } from "@/components/ui/button";
import { ThereminPad } from '@/components/theremin-pad';
import { BeatBoxControls } from '@/components/beat-box-controls';
import { useToast } from "@/hooks/use-toast";
import { OrbitalAnimation } from '@/components/orbital-animation';
import { useIsMobile } from '@/hooks/use-mobile';
import { PlaybackControls } from '@/components/playback-controls';
import { ArrowRight } from 'lucide-react';
import { HelpGuide } from "@/components/help-guide";
import { beatPatterns } from '@/lib/drum-machine';
import { CookieConsent } from '@/components/cookie-consent';
import { useAudioEngine } from '@/hooks/use-audio-engine';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SleepTimer } from '@/components/sleep-timer';
import { getScaleFrequencies, ALL_NOTES, SCALES } from '@/lib/music';
import { melodyInstruments, defaultMelodyInstrument } from '@/lib/melody-presets';
import { bassInstruments, defaultBassInstrument } from '@/lib/bass-presets';
import type { MusicKey, MusicScale, Volumes, Instrument, BassInstrument, ChannelVolumes, CompressorSettings } from '@/types';
import { cn } from '@/lib/utils';


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

const defaultVolumes: Volumes = { 
    melody: { gain: 0, reverbSend: -18, distortion: 0 },
    manualBass: { gain: -3, reverbSend: -48, distortion: 5 },
    latch: { gain: -9, reverbSend: -48, distortion: 5 },
    drums: { gain: -9, reverbSend: -48, distortion: 0 },
    reverbReturn: -12,
    compressor: {
        enabled: true,
        threshold: -24,
        ratio: 12,
        attack: 0.003,
        release: 0.25
    }
};


function loadSettings() {
    if (typeof window === 'undefined') {
        return { volumes: defaultVolumes };
    }
    const consent = getCookie("ethermusic_consent") === 'true';
    if (!consent) {
        return { volumes: defaultVolumes };
    }
    try {
        const savedVolumes = getCookie("ethermusic_volumes");
        const volumes = savedVolumes ? JSON.parse(savedVolumes) : defaultVolumes;
        
        if (!volumes.melody || typeof volumes.melody.gain !== 'number' || !volumes.compressor) {
            return { volumes: defaultVolumes }; 
        }

        const ensureChannelSettings = (channel: Partial<ChannelVolumes> | undefined, defaults: ChannelVolumes): ChannelVolumes => ({
            gain: channel?.gain ?? defaults.gain,
            reverbSend: channel?.reverbSend ?? defaults.reverbSend,
            distortion: channel?.distortion ?? defaults.distortion,
        });

        const mergedVolumes: Volumes = {
            ...defaultVolumes,
            ...volumes,
            melody: ensureChannelSettings(volumes.melody, defaultVolumes.melody),
            manualBass: ensureChannelSettings(volumes.manualBass, defaultVolumes.manualBass),
            latch: ensureChannelSettings(volumes.latch, defaultVolumes.latch),
            drums: ensureChannelSettings(volumes.drums, defaultVolumes.drums),
            compressor: { ...defaultVolumes.compressor, ...volumes.compressor },
        };

        return { volumes: mergedVolumes };

    } catch (e) {
        console.error("Failed to load settings from cookies", e);
        return { volumes: defaultVolumes };
    }
}

function saveSettings(volumes: Volumes) {
    if (typeof window === 'undefined' || getCookie("ethermusic_consent") !== 'true') {
        return;
    }
    try {
        setCookie("ethermusic_volumes", JSON.stringify(volumes), 365);
    } catch (e) {
        console.error("Failed to save settings to cookies", e);
    }
}

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
    const [cookieConsent, setCookieConsent] = useState<boolean | undefined>(undefined);
    
    const [volumes, setVolumesState] = useState<Volumes>(defaultVolumes);

    useEffect(() => {
      setIsClient(true);
      const consent = getCookie("ethermusic_consent");
      setCookieConsent(consent === 'true');
    }, []);

    const onConsentChange = useCallback((consent: boolean) => {
        setCookieConsent(consent);
        if (consent) {
            const loaded = loadSettings();
            setVolumesState(loaded.volumes);
        } else {
            setVolumesState(defaultVolumes);
        }
    }, []); 

    const {
        isAppStarted,
        isReady,
        isPlaying,
        startApp,
        play,
        pause,
        stop,
        setBeatPattern,
        setBassLatch,
        startRecording,
        stopRecording,
        handleThereminInteraction,
        setSleepTimer,
        setMelodyInstrument,
        setBassInstrument,
        orbManager,
        setVolumes,
        setTempo,
    } = useAudioEngine();
    
    const [isRecording, setIsRecording] = useState(false);
    const [activePattern, setActivePattern] = useState<(typeof beatPatterns)[number]>(beatPatterns.find(p => p.name === 'Off')!);
    const [musicKey, setMusicKey] = useState<MusicKey>('G');
    const [musicScale, setMusicScale] = useState<MusicScale>('Minor');
    const [allowedFrequencies, setAllowedFrequencies] = useState<{melody: number[], bass: number[]}>({melody: [], bass: []});
    
    const [activeMelodyInstrument, setActiveMelodyInstrument] = useState<Instrument>(defaultMelodyInstrument);
    const [activeBassInstrument, setActiveBassInstrument] = useState<BassInstrument>(defaultBassInstrument);
    
    const [isBassLatchOn, setIsBassLatchOn] = useState(false);
    
    const handleTempoChange = useCallback((newTempo: number) => {
        setTempo(newTempo);
    }, [setTempo]);

    const handleHarmonyChange = useCallback((keyOrScale: MusicKey | MusicScale) => {
        let newKey = musicKey;
        let newScale = musicScale;
    
        if (Object.keys(ALL_NOTES).includes(keyOrScale)) {
            newKey = keyOrScale as MusicKey;
            setMusicKey(newKey);
        } else if (Object.keys(SCALES).includes(keyOrScale)) {
            newScale = keyOrScale as MusicScale;
            setMusicScale(newScale);
        }
        
        const currentKey = Object.keys(ALL_NOTES).includes(keyOrScale) ? keyOrScale as MusicKey : newKey;
        const currentScale = Object.keys(SCALES).includes(keyOrScale) ? keyOrScale as MusicScale : newScale;
    
        const baseBassNote = 36; // C2
        const bassFreqs = getScaleFrequencies(baseBassNote, SCALES[currentScale], [0, 1]);

        const baseMelodyNote = 48; // C3
        const melodyFreqs = getScaleFrequencies(baseMelodyNote, SCALES[currentScale], [0, 1]);
    
        setAllowedFrequencies({ melody: melodyFreqs, bass: bassFreqs });
    }, [musicKey, musicScale]);

    useEffect(() => {
        handleHarmonyChange(musicKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    
    const updateVolumes = useCallback((newVolumes: Volumes) => {
        setVolumesState(newVolumes);
        setVolumes(newVolumes);
        if (cookieConsent) {
            saveSettings(newVolumes);
        }
    }, [setVolumes, cookieConsent]);
    
    const handleMixerChange = useCallback((changedMixerVolumes: Partial<Volumes>) => {
        const newVolumes: Volumes = { ...volumes, ...changedMixerVolumes };
        updateVolumes(newVolumes);
    }, [volumes, updateVolumes]);
    
    const handleCompressorChange = useCallback((compressorSettings: CompressorSettings) => {
        const newVolumes: Volumes = {
            ...volumes,
            compressor: compressorSettings,
        };
        updateVolumes(newVolumes);
    }, [volumes, updateVolumes]);

    useEffect(() => {
        if (isReady) {
            setVolumes(volumes);
            setMelodyInstrument(activeMelodyInstrument);
            setBassInstrument(activeBassInstrument);
        }
    }, [isReady, setVolumes, volumes, setMelodyInstrument, activeMelodyInstrument, setBassInstrument, activeBassInstrument]);
    
    const handleStartApp = useCallback(() => {
        startApp();
    }, [startApp]);

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

    const handleLatchToggle = useCallback((isOn: boolean) => {
        setIsBassLatchOn(isOn);
        setBassLatch(isOn);
    }, [setBassLatch]);
    
    const handleMelodyInstrumentChange = useCallback((instrumentName: Instrument) => {
        console.log('[1. UI] page.tsx: handleMelodyInstrumentChange. Preset selected:', melodyInstruments.find(p => p.id === instrumentName));
        const preset = melodyInstruments.find(p => p.id === instrumentName);
        if (preset) {
            setActiveMelodyInstrument(instrumentName);
            setMelodyInstrument(instrumentName);
        }
    }, [setMelodyInstrument]);

    const handleBassInstrumentChange = useCallback((instrumentName: BassInstrument) => {
        const preset = bassInstruments.find(p => p.id === instrumentName);
        if (preset) {
            setActiveBassInstrument(instrumentName);
            setBassInstrument(instrumentName);
        }
    }, [setBassInstrument]);
    
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
                <div className={cn("absolute inset-0 z-0 transition-opacity duration-1000", isAppStarted ? 'opacity-100' : 'opacity-30')}>
                    <MemoizedOrbitalAnimation />
                </div>
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
                    <p>&copy; 2024, EVS</p>
                    <p className="mt-2">v.2.1 "Maestro"</p>
                </footer>
                {cookieConsent === undefined || cookieConsent === false ? (
                    <CookieConsent onConsentChange={onConsentChange} />
                ) : null}
            </div>
        )
    }

    if (isAppStarted && !isReady) {
        return <Preloader />;
    }

    return (
        <div className="relative flex flex-col h-screen overflow-hidden">
            <div className="fixed inset-0 z-0">
                 <MemoizedOrbitalAnimation isPlaying={isPlaying} tempo={90} />
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
                         <SleepTimer onTimerSet={setSleepTimer} />
                    </div>
                </header>

                 <main className="flex-grow flex flex-col gap-2 overflow-hidden">
                     <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-2 landscape:grid-cols-2 landscape:gap-1">
                        <MemoizedThereminPad
                            type="bass"
                            onInteraction={handleThereminInteraction}
                            allowedFrequencies={allowedFrequencies.bass}
                            color="hsl(var(--accent))"
                            isLatchOn={isBassLatchOn}
                            onLatchToggle={handleLatchToggle}
                            isPolyphonic
                            instruments={bassInstruments}
                            activeInstrument={activeBassInstrument}
                            onInstrumentChange={handleBassInstrumentChange}
                            orbManager={orbManager}
                        />
                        <MemoizedThereminPad
                            type="melody"
                            onInteraction={handleThereminInteraction}
                            allowedFrequencies={allowedFrequencies.melody}
                            color="hsl(var(--primary))"
                            isLatchOn={false}
                            musicKeys={Object.keys(ALL_NOTES) as MusicKey[]}
                            activeKey={musicKey}
                            onKeyChange={handleHarmonyChange}
                            musicScales={Object.keys(SCALES) as MusicScale[]}
                            activeScale={musicScale}
                            onScaleChange={handleHarmonyChange}
                            instruments={melodyInstruments}
                            activeInstrument={activeMelodyInstrument}
                            onInstrumentChange={handleMelodyInstrumentChange}
                            isPolyphonic
                            orbManager={orbManager}
                        />
                    </div>
                    <div className="flex-shrink-0 portrait:block landscape:hidden">
                        <BeatBoxControls
                            patterns={beatPatterns}
                            activePattern={activePattern}
                            onPatternChange={handlePatternChange}
                            volumes={volumes}
                            onMixerChange={handleMixerChange}
                            onCompressorChange={handleCompressorChange}
                            isMobile={isMobile}
                            setTempo={handleTempoChange}
                        />
                    </div>
                </main>

                <div className="portrait:hidden landscape:flex landscape:flex-col landscape:items-center justify-between landscape:w-16 landscape:gap-2 landscape:py-4">
                     <BeatBoxControls
                        patterns={beatPatterns}
                        activePattern={activePattern}
                        onPatternChange={handlePatternChange}
                        volumes={volumes}
                        onMixerChange={handleMixerChange}
                        onCompressorChange={handleCompressorChange}
                        isMobile={isMobile}
                        isLandscape={true}
                        setTempo={handleTempoChange}
                    />
                </div>
            </div>
        </div>
    );
}

    
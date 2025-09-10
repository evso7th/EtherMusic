
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { getScaleFrequencies, ALL_NOTES, SCALES } from '@/lib/music';
import { melodyInstruments, defaultMelodyInstrument } from '@/lib/melody-presets';
import { bassInstruments, defaultBassInstrument } from '@/lib/bass-presets';
import type { MusicKey, MusicScale, Volumes, Instrument, BassInstrument, ChannelVolumes, CompressorSettings, BeatPattern } from '@/types';
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
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "")  + expires + "; path=/; SameSite=Lax";
}

const defaultVolumes: Volumes = { 
    melody: { gain: 0, reverbSend: -18, distortion: 0 },
    manualBass: { gain: -25, reverbSend: -48, distortion: 0 },
    latch: { gain: -25, reverbSend: -48, distortion: 0 },
    drums: { gain: -20, reverbSend: -48, distortion: 0 },
    reverbReturn: -25,
    compressor: {
        enabled: true,
        threshold: -70,
        ratio: 7,
        attack: 0.003,
        release: 0.25
    },
    swing: 0.33,
    tempo: 90,
};

function loadVolumes(): Volumes {
     if (typeof window === 'undefined') return defaultVolumes;
     const consent = getCookie("ethermusic_consent") === 'true';
     if (!consent) return defaultVolumes;
     try {
        const savedVolumes = getCookie("ethermusic_volumes");
        const volumes = savedVolumes ? JSON.parse(savedVolumes) : defaultVolumes;
        
        if (!volumes.melody || typeof volumes.melody.gain !== 'number' || !volumes.compressor) {
            return defaultVolumes; 
        }

        const ensureChannelSettings = (channel: Partial<ChannelVolumes> | undefined, defaults: ChannelVolumes): ChannelVolumes => ({
            gain: typeof channel?.gain === 'number' ? channel.gain : defaults.gain,
            reverbSend: typeof channel?.reverbSend === 'number' ? channel.reverbSend : defaults.reverbSend,
            distortion: typeof channel?.distortion === 'number' ? channel.distortion : defaults.distortion,
        });

        const mergedVolumes: Volumes = {
            ...defaultVolumes,
            ...volumes,
            melody: ensureChannelSettings(volumes.melody, defaultVolumes.melody),
            manualBass: ensureChannelSettings(volumes.manualBass, defaultVolumes.manualBass),
            latch: ensureChannelSettings(volumes.latch, defaultVolumes.latch),
            drums: ensureChannelSettings(volumes.drums, defaultVolumes.drums),
            compressor: { ...defaultVolumes.compressor, ...(volumes.compressor || {}) },
            swing: typeof volumes.swing === 'number' ? volumes.swing : defaultVolumes.swing,
            tempo: typeof volumes.tempo === 'number' ? volumes.tempo : defaultVolumes.tempo,
        };
        
        return mergedVolumes;

    } catch (e) {
        console.error("Failed to load volume settings from cookies", e);
        return defaultVolumes;
    }
}

function saveVolumes(volumes: Volumes) {
    if (typeof window === 'undefined' || getCookie("ethermusic_consent") !== 'true') {
        return;
    }
    try {
        setCookie("ethermusic_volumes", JSON.stringify(volumes), 365);
    } catch (e) {
        console.error("Failed to save volume settings to cookies", e);
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
    
    // Initialize volumes once, and only on the client
    const [initialVolumes] = useState<Volumes>(loadVolumes);

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
    } = useAudioEngine(initialVolumes);
    
    const [cookieConsent, setCookieConsent] = useState<boolean | undefined>(undefined);
    const [isRecording, setIsRecording] = useState(false);
    const [activePattern, setActivePattern] = useState<BeatPattern>(beatPatterns.find(p => p.name === 'Off')!);
    const [musicKey, setMusicKey] = useState<MusicKey>('G');
    const [musicScale, setMusicScale] = useState<MusicScale>('Minor');
    const [allowedFrequencies, setAllowedFrequencies] = useState<{melody: number[], bass: number[]}>({melody: [], bass: []});
    
    const [activeMelodyInstrument, setActiveMelodyInstrument] = useState<Instrument>(defaultMelodyInstrument);
    const [activeBassInstrument, setActiveBassInstrument] = useState<BassInstrument>(defaultBassInstrument);
    
    const [isBassLatchOn, setIsBassLatchOn] = useState(false);

    const onConsentChange = useCallback((consent: boolean) => {
        setCookieConsent(consent);
        const newVolumes = consent ? loadVolumes() : defaultVolumes;
        setVolumes(newVolumes); // This comes from useAudioEngine now and updates the engine
        
        if (!consent) {
             if (typeof document !== 'undefined') {
                document.cookie = "ethermusic_volumes=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            }
        }
    }, [setVolumes]);

    useEffect(() => {
        setIsClient(true);
        const consent = getCookie("ethermusic_consent");
        if (consent !== null) {
            setCookieConsent(consent === 'true');
        } else {
            setCookieConsent(undefined);
        }
    }, []);

    useEffect(() => {
        if (isReady && cookieConsent !== undefined) {
             const newVolumes = cookieConsent ? loadVolumes() : defaultVolumes;
             setVolumes(newVolumes);
        }
    }, [isReady, cookieConsent, setVolumes]);

    useEffect(() => {
        if (isReady && activeMelodyInstrument) {
            setMelodyInstrument(activeMelodyInstrument);
        }
    }, [isReady, activeMelodyInstrument, setMelodyInstrument]);

    const handleSetBassInstrument = useCallback((instrumentId: BassInstrument) => {
        setActiveBassInstrument(instrumentId);
        setBassInstrument(instrumentId);
    }, [setBassInstrument]);

    useEffect(() => {
        if (isReady && activeBassInstrument) {
            handleSetBassInstrument(activeBassInstrument);
        }
    }, [isReady, activeBassInstrument, handleSetBassInstrument]);
    
    const handleHarmonyChange = useCallback((keyOrScale: MusicKey | MusicScale) => {
        let newKey = musicKey;
        let newScale = musicScale;
    
        const isKey = (k: string): k is MusicKey => Object.keys(ALL_NOTES).includes(k);
        const isScale = (s: string): s is MusicScale => Object.keys(SCALES).includes(s);

        if (isKey(keyOrScale)) {
            newKey = keyOrScale;
            setMusicKey(newKey);
        } else if (isScale(keyOrScale)) {
            newScale = keyOrScale;
            setMusicScale(newScale);
        }
        
        const currentKey = isKey(keyOrScale) ? keyOrScale : newKey;
        const currentScale = isScale(keyOrScale) ? keyOrScale : newScale;
    
        const bassFreqs = getScaleFrequencies(currentKey, currentScale, [2, 3]);
        const melodyFreqs = getScaleFrequencies(currentKey, currentScale, [2, 3, 4]);
    
        setAllowedFrequencies({ melody: melodyFreqs, bass: bassFreqs });
    }, [musicKey, musicScale]);

    useEffect(() => {
        if (isReady) {
            handleHarmonyChange(musicKey);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isReady]);
    
    const updateVolumesAndSave = useCallback((newVolumes: Partial<Volumes> | ((v: Volumes) => Volumes)) => {
        setVolumes(newVolumes); // This now directly calls the setter from the hook
    }, [setVolumes]);

    const handleMixerChange = useCallback((mixerState: Partial<Volumes>) => {
        updateVolumesAndSave(currentVolumes => ({
            ...currentVolumes,
            ...mixerState
        }));
    }, [updateVolumesAndSave]);
    
    const handleChannelEffectChange = useCallback((
        channel: 'melody' | 'bass', 
        effect: 'reverbSend' | 'distortion', 
        value: number
    ) => {
        setVolumes(prevVolumes => {
            // Deep copy to avoid mutation
            const newVolumes = JSON.parse(JSON.stringify(prevVolumes));
            const targetChannelKey = channel === 'bass' ? 'manualBass' : 'melody';
            
            newVolumes[targetChannelKey][effect] = value;
            if (channel === 'bass') {
                newVolumes.latch[effect] = value;
            }
            return newVolumes;
        });
    }, [setVolumes]);
    
    const handleCompressorChange = useCallback((compressorSettings: CompressorSettings) => {
        updateVolumesAndSave(prev => ({...prev, compressor: compressorSettings }));
    }, [updateVolumesAndSave]);
    
    const handleTempoChange = useCallback((newTempo: number) => {
        updateVolumesAndSave({ tempo: newTempo });
    }, [updateVolumesAndSave]);
    
    const handleSwingChange = useCallback((swingValue: number) => {
        updateVolumesAndSave({ swing: swingValue });
    }, [updateVolumesAndSave]);

    const handleStartApp = useCallback(() => {
        startApp(initialVolumes);
    }, [startApp, initialVolumes]);

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
    
    const handleThereminInteractionCallback = useCallback((type: 'melody' | 'bass', data: { frequency: number; volume: number; pointerId: number; x: number, y: number } | null, state: 'down' | 'move' | 'up') => {
        if (!isReady || !audioEngine) return;
        handleThereminInteraction(type, data, state);
    }, [isReady, audioEngine, handleThereminInteraction]);

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
                 <MemoizedOrbitalAnimation isPlaying={isPlaying} tempo={currentTempo} />
            </div>
            
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
                            isRecording={isRecording}
                            onRecord={handleRecord}
                            onExit={stopAllSounds}
                            isReady={isReady}
                        />
                    </div>
                </header>

                 <main className="flex-grow flex flex-col gap-2 overflow-hidden">
                     <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-2 landscape:grid-cols-2 landscape:gap-1">
                        <MemoizedThereminPad
                            type="bass"
                            onInteraction={handleThereminInteractionCallback}
                            allowedFrequencies={allowedFrequencies.bass}
                            color="hsl(var(--accent))"
                            isLatchOn={isBassLatchOn}
                            onLatchToggle={handleLatchToggle}
                            isPolyphonic
                            instruments={bassInstruments}
                            activeInstrument={activeBassInstrument}
                            onInstrumentChange={handleSetBassInstrument}
                            orbManager={orbManager}
                            effects={{
                                reverbSend: volumes.manualBass.reverbSend,
                                distortion: volumes.manualBass.distortion,
                            }}
                            onEffectChange={handleChannelEffectChange}
                        />
                        <MemoizedThereminPad
                            type="melody"
                            onInteraction={handleThereminInteractionCallback}
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
                            effects={{
                                reverbSend: volumes.melody.reverbSend,
                                distortion: volumes.melody.distortion,
                            }}
                            onEffectChange={handleChannelEffectChange}
                        />
                    </div>
                    <div className="flex-shrink-0 portrait:block landscape:hidden">
                        <BeatBoxControls
                            activePattern={activePattern}
                            onPatternChange={handlePatternChange}
                            volumes={volumes}
                            onMixerChange={handleMixerChange}
                            onCompressorChange={handleCompressorChange}
                            isMobile={isMobile}
                            tempo={currentTempo}
                            setTempo={handleTempoChange}
                            swing={volumes.swing || 0}
                            setSwing={handleSwingChange}
                        />
                    </div>
                </main>

                <div className="portrait:hidden landscape:flex landscape:flex-col landscape:items-center justify-between landscape:w-16 landscape:gap-2 landscape:py-4">
                     <BeatBoxControls
                        activePattern={activePattern}
                        onPatternChange={handlePatternChange}
                        volumes={volumes}
                        onMixerChange={handleMixerChange}
                        onCompressorChange={handleCompressorChange}
                        isMobile={isMobile}
                        isLandscape={true}
                        tempo={currentTempo}
                        setTempo={handleTempoChange}
                        swing={volumes.swing || 0}
                        setSwing={handleSwingChange}
                    />
                </div>
            </div>
        </div>
    );
}

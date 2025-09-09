
"use client";

import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Waves, Drum, Anchor, Blend, AudioLines, Music, Clock } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import type { Volumes, CompressorSettings, ChannelVolumes } from '@/types';
import { cn } from "@/lib/utils";

const VolumeControl = ({
    label,
    icon: Icon,
    volume,
    onVolumeChange,
    onVolumeCommit,
    min = -48,
    max = 6,
    step = 1,
    unit = 'dB'
}: {
    label: string,
    icon: React.ElementType,
    volume: number,
    onVolumeChange: (v: number) => void,
    onVolumeCommit: (v: number) => void,
    min?: number,
    max?: number,
    step?: number,
    unit?: string,
}) => (
    <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-primary flex-shrink-0" />
            <Label className="text-sm font-medium flex-1 truncate">{label}</Label>
            <span className="text-xs text-muted-foreground w-14 text-right">{volume.toFixed(1)} {unit}</span>
        </div>
        <div className="flex items-center gap-4 pl-7">
            <Slider
                min={min}
                max={max}
                step={step}
                value={[volume]}
                onValueChange={(v) => onVolumeChange(v[0])}
                onValueCommit={(v) => onVolumeCommit(v[0])}
            />
        </div>
    </div>
);

type VolumeChannel = keyof Omit<Volumes, 'compressor' | 'reverbReturn' >;

export function MixerControls({ 
    volumes: initialVolumes, 
    onMixerChange,
    onCompressorChange,
    tempo,
    setTempo,
    isAutopilotMixer = false,
}: { 
    volumes: Volumes, 
    onMixerChange: (newVolumes: Partial<Volumes>) => void,
    onCompressorChange: (compressorSettings: CompressorSettings) => void,
    tempo: number,
    setTempo: (tempo: number) => void,
    isAutopilotMixer?: boolean
}) {
    
    const [localVolumes, setLocalVolumes] = useState(initialVolumes);
    const [localTempo, setLocalTempo] = useState(tempo);
    const [compressor, setCompressor] = useState(initialVolumes.compressor);

    useEffect(() => {
        setLocalVolumes(initialVolumes);
        setCompressor(initialVolumes.compressor);
        setLocalTempo(tempo);
    }, [initialVolumes, tempo]);

    const handleChannelVolumeChange = (part: VolumeChannel, key: keyof ChannelVolumes, value: number) => {
        setLocalVolumes(prev => {
            const channel = prev[part] as ChannelVolumes;
            return {
                ...prev,
                [part]: { ...channel, [key]: value }
            }
        });
    }

    const handleChannelVolumeCommit = (part: VolumeChannel, key: keyof ChannelVolumes, value: number) => {
        const currentPartVolume = localVolumes[part] as ChannelVolumes;
        onMixerChange({ [part]: { ...currentPartVolume, [key]: value } });
    };

    const handleReverbReturnCommit = (value: number) => {
        onMixerChange({ reverbReturn: value });
    };
    
    const handleCompressorSettingChange = useCallback((setting: keyof Omit<CompressorSettings, 'enabled'>, value: number) => {
        setCompressor(prev => ({ ...prev, [setting]: value }));
    }, []);
    
    const handleCompressorCommit = useCallback(() => {
        onCompressorChange(compressor);
    }, [compressor, onCompressorChange]);
    
    const handleToggleCompressor = useCallback((enabled: boolean) => {
        const newSettings = { ...compressor, enabled };
        setCompressor(newSettings);
        onCompressorChange(newSettings);
    }, [compressor, onCompressorChange]);

    const handleTempoCommit = (value: number) => {
        setTempo(value);
    };

    return (
        <div className="space-y-6">
            {!isAutopilotMixer && (
                <>
                    <div className="space-y-4">
                        <VolumeControl 
                            label="Tempo"
                            icon={Clock}
                            volume={localTempo}
                            onVolumeChange={setLocalTempo}
                            onVolumeCommit={handleTempoCommit}
                            min={30}
                            max={200}
                            step={1}
                            unit="BPM"
                        />
                    </div>
                    <Separator />
                </>
            )}

            <div className="space-y-4">
                <h3 className="text-lg font-semibold tracking-tight text-foreground">
                    {isAutopilotMixer ? "Autopilot Levels" : "Manual Player Levels"}
                </h3>
                
                <VolumeControl 
                    label="Melody"
                    icon={Music}
                    volume={localVolumes.melody.gain}
                    onVolumeChange={(v) => handleChannelVolumeChange('melody', 'gain', v)}
                    onVolumeCommit={(v) => handleChannelVolumeCommit('melody', 'gain', v)}
                />
                 <VolumeControl 
                    label="Bass"
                    icon={Waves}
                    volume={localVolumes.manualBass.gain}
                    onVolumeChange={(v) => handleChannelVolumeChange('manualBass', 'gain', v)}
                    onVolumeCommit={(v) => handleChannelVolumeCommit('manualBass', 'gain', v)}
                />
                <VolumeControl 
                    label="Latch"
                    icon={Anchor}
                    volume={localVolumes.latch.gain}
                    onVolumeChange={(v) => handleChannelVolumeChange('latch', 'gain', v)}
                    onVolumeCommit={(v) => handleChannelVolumeCommit('latch', 'gain', v)}
                />
                <VolumeControl 
                    label="Drums"
                    icon={Drum}
                    volume={localVolumes.drums.gain}
                    onVolumeChange={(v) => handleChannelVolumeChange('drums', 'gain', v)}
                    onVolumeCommit={(v) => handleChannelVolumeCommit('drums', 'gain', v)}
                />
            </div>
            
            <Separator />
            
            <div className="space-y-4">
                <h3 className="text-lg font-semibold tracking-tight text-foreground">Master Effects</h3>
                <VolumeControl
                    label="Reverb Level"
                    icon={Blend}
                    volume={localVolumes.reverbReturn}
                    onVolumeChange={(v) => setLocalVolumes(p => ({...p, reverbReturn: v}))}
                    onVolumeCommit={handleReverbReturnCommit}
                    min={-48} max={6} step={1} unit="dB"
                />
            </div>

            {!isAutopilotMixer && (
                <>
                    <Separator />
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2">
                                <AudioLines className="w-5 h-5 text-primary" />
                                <Label htmlFor="compressor-switch" className="text-sm font-medium">Master Compressor</Label>
                            </div>
                            <Switch
                                id="compressor-switch"
                                checked={compressor.enabled}
                                onCheckedChange={handleToggleCompressor}
                            />
                        </div>
                        <div className={cn("space-y-4 transition-opacity", !compressor.enabled && "opacity-50 pointer-events-none")}>
                             <VolumeControl 
                                label="Threshold"
                                icon={Waves}
                                volume={compressor.threshold}
                                onVolumeChange={(v) => handleCompressorSettingChange('threshold', v)}
                                onVolumeCommit={handleCompressorCommit}
                                min={-100}
                                max={0}
                                step={1}
                                unit="dB"
                            />
                             <VolumeControl 
                                label="Ratio"
                                icon={Waves}
                                volume={compressor.ratio}
                                onVolumeChange={(v) => handleCompressorSettingChange('ratio', v)}
                                onVolumeCommit={handleCompressorCommit}
                                min={1}
                                max={20}
                                step={1}
                                unit=":1"
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

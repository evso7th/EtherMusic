
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

const EffectControl = ({
    label,
    icon: Icon,
    level,
    onLevelChange,
    onLevelCommit,
    min,
    max,
    step,
    unit,
}: {
    label: string,
    icon: React.ElementType,
    level: number,
    onLevelChange: (v: number) => void,
    onLevelCommit: (v: number) => void,
    min: number,
    max: number,
    step: number,
    unit: string,
}) => (
     <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-accent flex-shrink-0" />
            <Label className="text-sm font-medium flex-1 truncate">{label}</Label>
            <span className="text-xs text-muted-foreground w-12 text-right">{(level ?? 0).toFixed(1)}{unit}</span>
        </div>
        <div className="flex items-center gap-4 pl-7">
            <Slider
                min={min}
                max={max}
                step={step}
                value={[level ?? 0]}
                onValueChange={(v) => onLevelChange(v[0])}
                onValueCommit={(v) => onLevelCommit(v[0])}
            />
        </div>
    </div>
);


type VolumeChannel = keyof Omit<Volumes, 'compressor' | 'reverbReturn' | 'reverbSend' | 'distortion'>;

export function MixerControls({ 
    volumes: initialVolumes, 
    onMixerChange,
    onCompressorChange,
    setTempo
}: { 
    volumes: Volumes, 
    onMixerChange: (newVolumes: Partial<Volumes>) => void,
    onCompressorChange: (compressorSettings: CompressorSettings) => void,
    setTempo: (tempo: number) => void
}) {
    
    const [localVolumes, setLocalVolumes] = useState(initialVolumes);
    const [compressor, setCompressor] = useState(initialVolumes.compressor);

    useEffect(() => {
        setLocalVolumes(initialVolumes);
        setCompressor(initialVolumes.compressor);
    }, [initialVolumes]);

    const handleChannelVolumeCommit = (part: VolumeChannel, value: number) => {
        onMixerChange({ [part]: { gain: value }});
    };

    const handleEffectCommit = (effect: 'reverbSend' | 'reverbReturn' | 'distortion', value: number) => {
        onMixerChange({ [effect]: value });
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


    return (
        <div className="space-y-6">
             {/* Tempo Control */}
             <div className="space-y-4">
                 <VolumeControl 
                    label="Tempo"
                    icon={Clock}
                    volume={120} // This will be managed by a state from page.tsx
                    onVolumeChange={(v) => setTempo(v)}
                    onVolumeCommit={(v) => setTempo(v)}
                    min={30}
                    max={200}
                    step={1}
                    unit="BPM"
                />
            </div>

            <Separator />

            <div className="space-y-4">
                 <h3 className="text-lg font-semibold tracking-tight text-foreground">Volume Levels</h3>
                 <VolumeControl 
                    label="Melody"
                    icon={Music}
                    volume={localVolumes.melody.gain}
                    onVolumeChange={(v) => setLocalVolumes(p => ({...p, melody: {...p.melody, gain: v}}))}
                    onVolumeCommit={(v) => handleChannelVolumeCommit('melody', v)}
                />
                 <VolumeControl 
                    label="Bass"
                    icon={Waves}
                    volume={localVolumes.manualBass.gain}
                    onVolumeChange={(v) => setLocalVolumes(p => ({...p, manualBass: {...p.manualBass, gain: v}}))}
                    onVolumeCommit={(v) => handleChannelVolumeCommit('manualBass', v)}
                />
                 <VolumeControl 
                    label="Latch"
                    icon={Anchor}
                    volume={localVolumes.latch.gain}
                    onVolumeChange={(v) => setLocalVolumes(p => ({...p, latch: {...p.latch, gain: v}}))}
                    onVolumeCommit={(v) => handleChannelVolumeCommit('latch', v)}
                />
                <VolumeControl 
                    label="Drums"
                    icon={Drum}
                    volume={localVolumes.drums.gain}
                    onVolumeChange={(v) => setLocalVolumes(p => ({...p, drums: {...p.drums, gain: v}}))}
                    onVolumeCommit={(v) => handleChannelVolumeCommit('drums', v)}
                />
            </div>
            
            <Separator />
            
            <div className="space-y-4">
                <h3 className="text-lg font-semibold tracking-tight text-foreground">Effects</h3>
                <EffectControl
                    label="Reverb Send"
                    icon={Blend}
                    level={localVolumes.reverbSend}
                    onLevelChange={(v) => setLocalVolumes(p => ({...p, reverbSend: v}))}
                    onLevelCommit={(v) => handleEffectCommit('reverbSend', v)}
                    min={-48} max={0} step={1} unit="dB"
                />
                 <EffectControl
                    label="Reverb Return"
                    icon={Blend}
                    level={localVolumes.reverbReturn}
                    onLevelChange={(v) => setLocalVolumes(p => ({...p, reverbReturn: v}))}
                    onLevelCommit={(v) => handleEffectCommit('reverbReturn', v)}
                    min={-48} max={6} step={1} unit="dB"
                />
                <EffectControl
                    label="Distortion"
                    icon={Waves}
                    level={localVolumes.distortion}
                    onLevelChange={(v) => setLocalVolumes(p => ({...p, distortion: v}))}
                    onLevelCommit={(v) => handleEffectCommit('distortion', v)}
                    min={0} max={100} step={1} unit="%"
                />
            </div>

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
        </div>
    );
}

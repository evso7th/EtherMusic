
"use client";

import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Waves, Drum, Anchor, Blend, AudioLines, Music, Clock, Shuffle } from 'lucide-react';
import { useState, useCallback, useEffect, memo } from 'react';
import type { Volumes, CompressorSettings, ChannelVolumes } from '@/types';
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

const VolumeControl = memo(({
    label,
    icon: Icon,
    volume,
    onVolumeChange,
    min = -48,
    max = 6,
    step = 1,
    unit = 'dB'
}: {
    label: string,
    icon: React.ElementType,
    volume: number,
    onVolumeChange: (v: number) => void,
    min?: number,
    max?: number,
    step?: number,
    unit?: string,
}) => {
    // No console.log here to keep the console clean in production
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <Icon className="w-5 h-5 text-primary flex-shrink-0" />
                <Label className="text-sm font-medium flex-1 truncate">{label}</Label>
                <span className="text-xs text-muted-foreground w-14 text-right">{(volume ?? 0).toFixed(1)} {unit}</span>
            </div>
            <div className="flex items-center gap-4 pl-7">
                <Slider
                    min={min}
                    max={max}
                    step={step}
                    value={[volume ?? 0]}
                    onValueChange={(v) => onVolumeChange(v[0])}
                />
            </div>
        </div>
    );
});
VolumeControl.displayName = 'VolumeControl';

type VolumeChannel = keyof Omit<Volumes, 'compressor' | 'reverbReturn' | 'swing' | 'tempo' >;

interface MixerControlsProps {
    initialVolumes: Volumes;
    onApply: (newVolumes: Volumes) => void;
    closeDialog: () => void;
    isAutopilotMixer?: boolean;
}

export function MixerControls({ 
    initialVolumes, 
    onApply,
    closeDialog,
    isAutopilotMixer = false,
}: MixerControlsProps) {
    
    const [localVolumes, setLocalVolumes] = useState(initialVolumes);

    useEffect(() => {
        setLocalVolumes(initialVolumes);
    }, [initialVolumes]);

    const handleLocalVolumeChange = (update: Partial<Volumes> | ((v: Volumes) => Volumes)) => {
        setLocalVolumes(current => {
            const updated = typeof update === 'function' ? update(current) : { ...current, ...update };
            return updated;
        });
    }
    
    const handleChannelVolumeChange = (part: VolumeChannel, value: number) => {
        handleLocalVolumeChange(prev => {
            const newVolumes = JSON.parse(JSON.stringify(prev)); // Deep copy to be safe
            const newChannelVolumes = { ...(newVolumes[part] as ChannelVolumes), gain: value };
            newVolumes[part] = newChannelVolumes;

            // Sync manualBass and latch gain sliders
            if (part === 'manualBass') {
                newVolumes.latch = { ...newVolumes.latch, gain: value };
            } else if (part === 'latch') {
                newVolumes.manualBass = { ...newVolumes.manualBass, gain: value };
            }
            
            return newVolumes;
        });
    };
    
    const handleReverbReturnChange = (value: number) => {
        handleLocalVolumeChange({ reverbReturn: value });
    };
    
    const handleCompressorSettingChange = useCallback((setting: keyof CompressorSettings, value: any) => {
        handleLocalVolumeChange(prev => ({
            ...prev,
            compressor: { ...prev.compressor, [setting]: value }
        }));
    }, []);

    const handleApplyChanges = () => {
        // Apply all changes at once
        onApply(localVolumes);
        closeDialog();
    };

    return (
        <div className="space-y-6">
            {!isAutopilotMixer && (
                <>
                    <div className="space-y-4">
                        <VolumeControl 
                            label="Tempo"
                            icon={Clock}
                            volume={localVolumes.tempo}
                            onVolumeChange={(v) => handleLocalVolumeChange(prev => ({...prev, tempo: v}))}
                            min={30}
                            max={200}
                            step={1}
                            unit="BPM"
                        />
                        <VolumeControl 
                            label="Swing"
                            icon={Shuffle}
                            volume={(localVolumes.swing || 0) * 100}
                            onVolumeChange={(v) => handleLocalVolumeChange(prev => ({...prev, swing: v / 100}))}
                            min={0}
                            max={75}
                            step={1}
                            unit="%"
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
                    onVolumeChange={(v) => handleChannelVolumeChange('melody', v)}
                />
                 <VolumeControl 
                    label="Bass"
                    icon={Waves}
                    volume={localVolumes.manualBass.gain}
                    onVolumeChange={(v) => handleChannelVolumeChange('manualBass', v)}
                />
                <VolumeControl 
                    label="Latch"
                    icon={Anchor}
                    volume={localVolumes.latch.gain}
                    onVolumeChange={(v) => handleChannelVolumeChange('latch', v)}
                />
                <VolumeControl 
                    label="Drums"
                    icon={Drum}
                    volume={localVolumes.drums.gain}
                    onVolumeChange={(v) => handleChannelVolumeChange('drums', v)}
                />
            </div>
            
            <Separator />
            
            <div className="space-y-4">
                <h3 className="text-lg font-semibold tracking-tight text-foreground">Master Effects</h3>
                <VolumeControl
                    label="Reverb Level"
                    icon={Blend}
                    volume={localVolumes.reverbReturn}
                    onVolumeChange={handleReverbReturnChange}
                    min={-48} max={6} unit="dB"
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
                                checked={localVolumes.compressor.enabled}
                                onCheckedChange={(enabled) => handleCompressorSettingChange('enabled', enabled)}
                            />
                        </div>
                        <div className={cn("space-y-4 transition-opacity", !localVolumes.compressor.enabled && "opacity-50 pointer-events-none")}>
                             <VolumeControl 
                                label="Threshold"
                                icon={Waves}
                                volume={localVolumes.compressor.threshold}
                                onVolumeChange={(v) => handleCompressorSettingChange('threshold', v)}
                                min={-100}
                                max={0}
                                step={1}
                                unit="dB"
                            />
                             <VolumeControl 
                                label="Ratio"
                                icon={Waves}
                                volume={localVolumes.compressor.ratio}
                                onVolumeChange={(v) => handleCompressorSettingChange('ratio', v)}
                                min={1}
                                max={20}
                                step={1}
                                unit=":1"
                            />
                        </div>
                    </div>
                </>
            )}
             <Separator />
            <Button 
                onClick={handleApplyChanges}
                className="w-full mt-4"
            >
                Done
            </Button>
        </div>
    );
}

    
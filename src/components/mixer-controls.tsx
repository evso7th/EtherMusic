
"use client";

import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Waves, Drum, Blend, AudioLines, Music, Clock, Shuffle, Anchor } from 'lucide-react';
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

export const MixerControls = memo(function MixerControls({ 
    initialVolumes, 
    onApply,
    closeDialog,
    isAutopilotMixer = false,
}: MixerControlsProps) {
    
    const [localVolumes, setLocalVolumes] = useState(initialVolumes);

    useEffect(() => {
        setLocalVolumes(initialVolumes);
    }, [initialVolumes]);

    const handleLocalVolumeChange = useCallback((update: Partial<Volumes> | ((v: Volumes) => Partial<Volumes>)) => {
        setLocalVolumes(current => {
            const newValues = typeof update === 'function' ? update(current) : update;
            const updated = { ...current, ...newValues };
            return updated;
        });
    }, []);
    
    const handleChannelVolumeChange = useCallback((part: VolumeChannel, value: number) => {
        setLocalVolumes(prev => {
            const newVolumes = JSON.parse(JSON.stringify(prev)); // Deep copy
            (newVolumes[part] as ChannelVolumes).gain = value;
            return newVolumes;
        });
    }, []);
    
    const handleReverbReturnChange = useCallback((value: number) => {
        handleLocalVolumeChange({ reverbReturn: value });
    }, [handleLocalVolumeChange]);
    
    const handleCompressorSettingChange = useCallback((setting: keyof CompressorSettings, value: any) => {
        handleLocalVolumeChange(prev => ({
            compressor: { ...prev.compressor, [setting]: value }
        }));
    }, [handleLocalVolumeChange]);

    const handleApplyChanges = () => {
        // Sync manualBass gain to latch gain before applying
        const finalVolumes = { 
            ...localVolumes,
        };
        onApply(finalVolumes);
        closeDialog();
    };
    
    const handleBassVolumeChange = (v: number) => {
         setLocalVolumes(prev => {
            const newVolumes = JSON.parse(JSON.stringify(prev));
            newVolumes.manualBass.gain = v;
            return newVolumes;
        });
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
                            onVolumeChange={(v) => handleLocalVolumeChange({ tempo: v })}
                            min={30}
                            max={200}
                            step={1}
                            unit="BPM"
                        />
                        <VolumeControl 
                            label="Swing"
                            icon={Shuffle}
                            volume={(localVolumes.swing || 0) * 100}
                            onVolumeChange={(v) => handleLocalVolumeChange({ swing: v / 100 })}
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
                    Player Levels
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
                    onVolumeChange={handleBassVolumeChange}
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
});

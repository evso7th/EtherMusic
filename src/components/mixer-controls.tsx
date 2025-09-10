
"use client";

import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Waves, Drum, Anchor, Blend, AudioLines, Music, Clock, Shuffle } from 'lucide-react';
import type { Volumes, CompressorSettings, ChannelVolumes } from '@/types';
import { cn } from "@/lib/utils";

const VolumeControl = ({
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
    onVolumeChange: (v: number[]) => void,
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
                onValueChange={onVolumeChange}
            />
        </div>
    </div>
);

type VolumeChannel = keyof Omit<Volumes, 'compressor' | 'reverbReturn' | 'swing' >;

interface MixerControlsProps {
    volumes: Volumes;
    onMixerChange: (newVolumes: Partial<Volumes>) => void;
    onCompressorChange: (compressorSettings: CompressorSettings) => void;
    tempo: number;
    setTempo: (tempo: number) => void;
    swing: number;
    setSwing: (swing: number) => void;
    isAutopilotMixer?: boolean;
}

export function MixerControls({ 
    volumes, 
    onMixerChange,
    onCompressorChange,
    tempo,
    setTempo,
    swing,
    setSwing,
    isAutopilotMixer = false,
}: MixerControlsProps) {

    const handleChannelVolumeChange = (part: VolumeChannel, value: number) => {
       const newVolumes = {
            ...volumes,
            [part]: { ...volumes[part], gain: value }
        };
        onMixerChange(newVolumes);
    };
    
    const handleReverbReturnChange = (value: number) => {
        onMixerChange({ ...volumes, reverbReturn: value });
    };
    
    const handleCompressorSettingChange = (setting: keyof Omit<CompressorSettings, 'enabled'>, value: number) => {
        const newCompressorSettings = { ...volumes.compressor, [setting]: value };
        onCompressorChange(newCompressorSettings);
    };
    
    const handleToggleCompressor = (enabled: boolean) => {
        const newCompressorSettings = { ...volumes.compressor, enabled };
        onCompressorChange(newCompressorSettings);
    };
    
    const handleTempoChange = (newTempo: number[]) => {
      setTempo(newTempo[0]);
    };
    
    const handleSwingChange = (newSwing: number[]) => {
      setSwing(newSwing[0] / 100);
    };

    return (
        <div className="space-y-6">
            {!isAutopilotMixer && (
                <>
                    <div className="space-y-4">
                        <VolumeControl 
                            label="Tempo"
                            icon={Clock}
                            volume={tempo}
                            onVolumeChange={handleTempoChange}
                            min={30}
                            max={200}
                            step={1}
                            unit="BPM"
                        />
                        <VolumeControl 
                            label="Swing"
                            icon={Shuffle}
                            volume={swing * 100}
                            onVolumeChange={handleSwingChange}
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
                    volume={volumes.melody.gain}
                    onVolumeChange={(v) => handleChannelVolumeChange('melody', v[0])}
                />
                 <VolumeControl 
                    label="Bass"
                    icon={Waves}
                    volume={volumes.manualBass.gain}
                    onVolumeChange={(v) => handleChannelVolumeChange('manualBass', v[0])}
                />
                <VolumeControl 
                    label="Latch"
                    icon={Anchor}
                    volume={volumes.latch.gain}
                    onVolumeChange={(v) => handleChannelVolumeChange('latch', v[0])}
                />
                <VolumeControl 
                    label="Drums"
                    icon={Drum}
                    volume={volumes.drums.gain}
                    onVolumeChange={(v) => handleChannelVolumeChange('drums', v[0])}
                />
            </div>
            
            <Separator />
            
            <div className="space-y-4">
                <h3 className="text-lg font-semibold tracking-tight text-foreground">Master Effects</h3>
                <VolumeControl
                    label="Reverb Level"
                    icon={Blend}
                    volume={volumes.reverbReturn}
                    onVolumeChange={(v) => handleReverbReturnChange(v[0])}
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
                                checked={volumes.compressor.enabled}
                                onCheckedChange={handleToggleCompressor}
                            />
                        </div>
                        <div className={cn("space-y-4 transition-opacity", !volumes.compressor.enabled && "opacity-50 pointer-events-none")}>
                             <VolumeControl 
                                label="Threshold"
                                icon={Waves}
                                volume={volumes.compressor.threshold}
                                onVolumeChange={(v) => handleCompressorSettingChange('threshold', v[0])}
                                min={-100}
                                max={0}
                                step={1}
                                unit="dB"
                            />
                             <VolumeControl 
                                label="Ratio"
                                icon={Waves}
                                volume={volumes.compressor.ratio}
                                onVolumeChange={(v) => handleCompressorSettingChange('ratio', v[0])}
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



"use client";

import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Music, Waves, Drum, Bot, Anchor, Sparkles, Combine } from 'lucide-react';
import { Separator } from './ui/separator';

type Volumes = { 
    melody: number; 
    manualBass: number;
    latch: number; 
    drums: number; 
    autopilot: number;
};

type Effects = {
    melody: { reverb: number, delay: number };
    manualBass: { reverb: number, delay: number };
    latch: { reverb: number, delay: number };
    drums: { reverb: number, delay: number };
    autopilot: { reverb: number, delay: number };
};

interface MixerControlsProps {
    volumes: Volumes;
    onVolumeChange: (volumes: Volumes) => void;
    effects: Effects;
    onEffectChange: (effects: Effects) => void;
}

const EffectSlider = ({ label, value, onChange, min = -60, max = 0, step = 1 }: { 
    label: string; 
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
}) => (
    <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Slider
            min={min}
            max={max}
            step={step}
            value={[value]}
            onValueChange={(v) => onChange(v[0])}
        />
    </div>
);

const InstrumentControls = ({
    label,
    icon: Icon,
    volume,
    reverb,
    delay,
    onVolumeChange,
    onReverbChange,
    onDelayChange,
}: {
    label: string,
    icon: React.ElementType,
    volume: number,
    reverb: number,
    delay: number,
    onVolumeChange: (v: number) => void,
    onReverbChange: (v: number) => void,
    onDelayChange: (v: number) => void,
}) => (
    <div className="flex items-center gap-4">
        {/* Icon */}
        <div className="flex-shrink-0 w-8 flex justify-center">
            <Icon className="w-6 h-6 text-primary" />
        </div>

        {/* Main Volume Slider */}
        <div className="flex-grow space-y-1">
            <Label className="text-sm font-medium">{label}</Label>
            <Slider
                min={-48}
                max={6}
                step={1}
                value={[volume]}
                onValueChange={onVolumeChange}
            />
        </div>

        {/* Effects */}
        <div className="flex gap-4 w-28">
            <div className="w-12">
                <EffectSlider label="Reverb" value={reverb} onChange={onReverbChange} />
            </div>
            <div className="w-12">
                <EffectSlider label="Delay" value={delay} onChange={onDelayChange} />
            </div>
        </div>
    </div>
);


export function MixerControls({ volumes, onVolumeChange, effects, onEffectChange }: MixerControlsProps) {
    
    const handleVolumeChange = (instrument: keyof Volumes, value: number) => {
        onVolumeChange({
            ...volumes,
            [instrument]: value
        });
    };

    const handleEffectChange = (instrument: keyof Effects, effect: 'reverb' | 'delay', value: number) => {
        onEffectChange({
            ...effects,
            [instrument]: {
                // @ts-ignore
                ...effects[instrument],
                [effect]: value
            }
        });
    };

    return (
        <div className="p-1 space-y-4">
            <div>
                <div className="text-xs text-center text-muted-foreground mb-3">Manual Control</div>
                <div className="space-y-4">
                    <InstrumentControls 
                        label="Melody"
                        icon={Music}
                        volume={volumes.melody}
                        reverb={effects.melody.reverb}
                        delay={effects.melody.delay}
                        onVolumeChange={(v) => handleVolumeChange('melody', v)}
                        onReverbChange={(v) => handleEffectChange('melody', 'reverb', v)}
                        onDelayChange={(v) => handleEffectChange('melody', 'delay', v)}
                    />
                    <InstrumentControls 
                        label="Bass"
                        icon={Waves}
                        volume={volumes.manualBass}
                        reverb={effects.manualBass.reverb}
                        delay={effects.manualBass.delay}
                        onVolumeChange={(v) => handleVolumeChange('manualBass', v)}
                        onReverbChange={(v) => handleEffectChange('manualBass', 'reverb', v)}
                        onDelayChange={(v) => handleEffectChange('manualBass', 'delay', v)}
                    />
                    <InstrumentControls 
                        label="Latch"
                        icon={Anchor}
                        volume={volumes.latch}
                        reverb={effects.latch.reverb}
                        delay={effects.latch.delay}
                        onVolumeChange={(v) => handleVolumeChange('latch', v)}
                        onReverbChange={(v) => handleEffectChange('latch', 'reverb', v)}
                        onDelayChange={(v) => handleEffectChange('latch', 'delay', v)}
                    />
                    <InstrumentControls 
                        label="Drums"
                        icon={Drum}
                        volume={volumes.drums}
                        reverb={effects.drums.reverb}
                        delay={effects.drums.delay}
                        onVolumeChange={(v) => handleVolumeChange('drums', v)}
                        onReverbChange={(v) => handleEffectChange('drums', 'reverb', v)}
                        onDelayChange={(v) => handleEffectChange('drums', 'delay', v)}
                    />
                </div>
            </div>

            <Separator />
            
            <div>
                 <div className="text-xs text-center text-muted-foreground mb-3">Autopilot</div>
                 <div className="space-y-4">
                     <InstrumentControls 
                        label="Autopilot"
                        icon={Bot}
                        volume={volumes.autopilot}
                        reverb={effects.autopilot.reverb}
                        delay={effects.autopilot.delay}
                        onVolumeChange={(v) => handleVolumeChange('autopilot', v)}
                        onReverbChange={(v) => handleEffectChange('autopilot', 'reverb', v)}
                        onDelayChange={(v) => handleEffectChange('autopilot', 'delay', v)}
                    />
                 </div>
            </div>
        </div>
    );
}


"use client";

import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Music, Waves, Drum, Bot, Anchor } from 'lucide-react';
import { Separator } from './ui/separator';

interface MixerControlsProps {
    volumes: {
        melody: number;
        bass: number;
        drums: number;
        autopilot: number;
        latch: number;
    };
    onVolumeChange: (volumes: MixerControlsProps['volumes']) => void;
    effects: {
        melody: { reverb: number, delay: number };
        bass: { reverb: number, delay: number };
        drums: { reverb: number, delay: number };
        autopilot: { reverb: number, delay: number };
        latch: { reverb: number, delay: number };
    };
    onEffectChange: (effects: MixerControlsProps['effects']) => void;
}


const EffectSlider = ({ label, value, onChange, min = -60, max = 0, step = 1 }: { 
    label: string; 
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
}) => (
    <div className="grid grid-cols-4 items-center gap-2">
        <Label className="text-xs text-muted-foreground col-span-1">{label}</Label>
        <Slider
            className="col-span-3"
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
    showEffects = true,
}: {
    label: string,
    icon: React.ElementType,
    volume: number,
    reverb?: number,
    delay?: number,
    onVolumeChange: (v: number) => void,
    onReverbChange?: (v: number) => void,
    onDelayChange?: (v: number) => void,
    showEffects?: boolean,
}) => (
    <div>
        <div className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-1 w-12">
                <Icon className="w-6 h-6 text-primary" />
                <Label className="text-sm font-medium">{label}</Label>
            </div>
            <div className="flex-grow space-y-2">
                 <Slider
                    min={-48}
                    max={6}
                    step={1}
                    value={[volume]}
                    onValueChange={(v) => onVolumeChange(v[0])}
                />
                {showEffects && onReverbChange && onDelayChange && typeof reverb !== 'undefined' && typeof delay !== 'undefined' && (
                    <div className="space-y-2">
                        <EffectSlider label="Reverb" value={reverb} onChange={onReverbChange} />
                        <EffectSlider label="Delay" value={delay} onChange={onDelayChange} />
                    </div>
                )}
            </div>
        </div>
    </div>
);


export function MixerControls({ volumes, onVolumeChange, effects, onEffectChange }: MixerControlsProps) {
    
    const handleVolumeChange = (instrument: keyof MixerControlsProps['volumes'], value: number) => {
        onVolumeChange({
            ...volumes,
            [instrument]: value
        });
    };

    const handleEffectChange = (instrument: 'melody' | 'bass' | 'drums' | 'autopilot' | 'latch', effect: 'reverb' | 'delay', value: number) => {
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
        <div className="p-1 space-y-3">
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
            <Separator />
            <InstrumentControls 
                label="Bass"
                icon={Waves}
                volume={volumes.bass}
                reverb={effects.bass.reverb}
                delay={effects.bass.delay}
                onVolumeChange={(v) => handleVolumeChange('bass', v)}
                onReverbChange={(v) => handleEffectChange('bass', 'reverb', v)}
                onDelayChange={(v) => handleEffectChange('bass', 'delay', v)}
            />
             <Separator />
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
            <Separator />
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
             <Separator />
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
    );
}



"use client";

import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Music, Waves, Drum, Bot, Anchor, Sparkles } from 'lucide-react';
import { Separator } from './ui/separator';
import { cn } from '@/lib/utils';

type Volumes = { 
    melody: number; 
    manualBass: number;
    latch: number; 
    drums: number; 
    autopilot: number;
    effects: number;
};

type Effects = {
    melody: { reverb: number, delay: number };
    manualBass: { reverb: number, delay: number };
    latch: { reverb: number, delay: number };
    drums: { reverb: number, delay: number };
    autopilot: { reverb: number, delay: number };
    effects: { reverb: number, delay: number };
    ebass: { reverb: number, delay: number };
};

interface MixerControlsProps {
    volumes: Volumes;
    onVolumeChange: (volumes: Volumes) => void;
    effects: Effects;
    onEffectChange: (effects: Effects) => void;
    isMobile: boolean;
}

const EffectSlider = ({ label, value, onChange, min = -60, max = 0, step = 1, mobile = false }: { 
    label: string; 
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    mobile?: boolean;
}) => (
    <div className={cn("space-y-2", mobile && "flex-1")}>
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
    isMobile = false
}: {
    label: string,
    icon: React.ElementType,
    volume: number,
    reverb: number,
    delay: number,
    onVolumeChange: (v: number) => void,
    onReverbChange: (v: number) => void,
    onDelayChange: (v: number) => void,
    isMobile?: boolean,
}) => (
    <div className="space-y-2">
        {/* Mobile Portrait Layout */}
        {isMobile && (
             <div className="flex flex-col gap-2 portrait:flex landscape:hidden">
                 <Label className="text-sm font-medium">{label}</Label>
                 <div className="flex items-center gap-2">
                     <div className="flex-shrink-0 w-8 flex justify-center">
                        <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <Slider
                        min={-48}
                        max={6}
                        step={1}
                        value={[volume]}
                        onValueChange={onVolumeChange}
                    />
                 </div>
                 <div className="flex gap-4 pl-10">
                    <EffectSlider label="Reverb" value={reverb} onChange={onReverbChange} mobile />
                    <EffectSlider label="Delay" value={delay} onChange={onDelayChange} mobile />
                </div>
            </div>
        )}

        {/* Desktop & Mobile Landscape Layout */}
        <div className={cn("items-center gap-4", isMobile ? "portrait:hidden landscape:flex" : "flex")}>
            <div className="flex-shrink-0 w-8 flex justify-center">
                <Icon className="w-6 h-6 text-primary" />
            </div>

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

            <div className="flex gap-4 w-28">
                <div className="w-12">
                    <EffectSlider label="Reverb" value={reverb} onChange={onReverbChange} />
                </div>
                <div className="w-12">
                    <EffectSlider label="Delay" value={delay} onChange={onDelayChange} />
                </div>
            </div>
        </div>
    </div>
);


export function MixerControls({ volumes, onVolumeChange, effects, onEffectChange, isMobile }: MixerControlsProps) {
    
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
                        isMobile={isMobile}
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
                        isMobile={isMobile}
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
                        isMobile={isMobile}
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
                        isMobile={isMobile}
                    />
                </div>
            </div>

            <Separator />
            
            <div className="space-y-4">
                 <div className="text-xs text-center text-muted-foreground mb-3">Autopilot</div>
                 <InstrumentControls 
                    label="Melody / Bass"
                    icon={Bot}
                    volume={volumes.autopilot}
                    reverb={effects.autopilot.reverb}
                    delay={effects.autopilot.delay}
                    onVolumeChange={(v) => handleVolumeChange('autopilot', v)}
                    onReverbChange={(v) => handleEffectChange('autopilot', 'reverb', v)}
                    onDelayChange={(v) => handleEffectChange('autopilot', 'delay', v)}
                    isMobile={isMobile}
                />
                 <InstrumentControls 
                    label="Effects"
                    icon={Sparkles}
                    volume={volumes.effects}
                    reverb={effects.effects.reverb}
                    delay={effects.effects.delay}
                    onVolumeChange={(v) => handleVolumeChange('effects', v)}
                    onReverbChange={(v) => handleEffectChange('effects', 'reverb', v)}
                    onDelayChange={(v) => handleEffectChange('effects', 'delay', v)}
                    isMobile={isMobile}
                />
            </div>
        </div>
    );
}

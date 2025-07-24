
"use client";

import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Music, Waves, Drum, Wind, Orbit } from 'lucide-react';
import { Separator } from './ui/separator';

interface MixerControlsProps {
    volumes: {
        melody: number;
        bass: number;
        drums: number;
    };
    onVolumeChange: (volumes: { melody: number; bass: number; drums: number; }) => void;
    effects: {
        melody: { reverb: number, delay: number };
        bass: { reverb: number, delay: number };
        drums: { reverb: number, delay: number };
    };
    onEffectChange: (effects: MixerControlsProps['effects']) => void;
}

const VolumeSlider = ({ label, icon: Icon, value, onChange, min = -48, max = 6, step = 1, showValue = false }: { 
    label: string; 
    icon: React.ElementType;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    showValue?: boolean;
}) => (
    <div className="space-y-3 p-2">
        <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-primary" />
            <Label className="text-md font-medium">{label}</Label>
        </div>
        <div className="flex items-center gap-4">
            <Slider
                min={min}
                max={max}
                step={step}
                value={[value]}
                onValueChange={(v) => onChange(v[0])}
            />
            {showValue && <span className="text-sm font-mono w-12 text-center">{value.toFixed(0)}</span>}
        </div>
    </div>
);


export function MixerControls({ volumes, onVolumeChange, effects, onEffectChange }: MixerControlsProps) {
    
    const handleEffectChange = (instrument: 'melody' | 'bass' | 'drums', effect: 'reverb' | 'delay', value: number) => {
        onEffectChange({
            ...effects,
            [instrument]: {
                ...effects[instrument],
                [effect]: value
            }
        });
    };

    return (
        <div className="p-2 space-y-4">
            <div>
                <VolumeSlider 
                    label="Melody"
                    icon={Music}
                    value={volumes.melody}
                    onChange={(v) => onVolumeChange({ ...volumes, melody: v })}
                />
                 <div className="pl-8 space-y-2">
                    <VolumeSlider label="Reverb" icon={Wind} min={-60} max={0} value={effects.melody.reverb} onChange={(v) => handleEffectChange('melody', 'reverb', v)} />
                    <VolumeSlider label="Delay" icon={Orbit} min={-60} max={0} value={effects.melody.delay} onChange={(v) => handleEffectChange('melody', 'delay', v)} />
                </div>
            </div>
            <Separator />
             <div>
                <VolumeSlider 
                    label="Bass"
                    icon={Waves}
                    value={volumes.bass}
                    onChange={(v) => onVolumeChange({ ...volumes, bass: v })}
                />
                 <div className="pl-8 space-y-2">
                    <VolumeSlider label="Reverb" icon={Wind} min={-60} max={0} value={effects.bass.reverb} onChange={(v) => handleEffectChange('bass', 'reverb', v)} />
                    <VolumeSlider label="Delay" icon={Orbit} min={-60} max={0} value={effects.bass.delay} onChange={(v) => handleEffectChange('bass', 'delay', v)} />
                </div>
            </div>
            <Separator />
            <div>
                 <VolumeSlider 
                    label="Drums"
                    icon={Drum}
                    value={volumes.drums}
                    onChange={(v) => onVolumeChange({ ...volumes, drums: v })}
                />
                 <div className="pl-8 space-y-2">
                    <VolumeSlider label="Reverb" icon={Wind} min={-60} max={0} value={effects.drums.reverb} onChange={(v) => handleEffectChange('drums', 'reverb', v)} />
                    <VolumeSlider label="Delay" icon={Orbit} min={-60} max={0} value={effects.drums.delay} onChange={(v) => handleEffectChange('drums', 'delay', v)} />
                </div>
            </div>
        </div>
    );
}

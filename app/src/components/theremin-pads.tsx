
"use client";

import { memo } from 'react';
import { ThereminPad } from '@/components/theremin-pad';
import { bassInstruments } from '@/lib/bass-presets';
import { melodyInstruments } from '@/lib/melody-presets';
import { ALL_NOTES, SCALES } from '@/lib/music';
import type { OrbManager } from '@/lib/orb-manager';
import type { MusicKey, MusicScale, Instrument, BassInstrument, ChannelVolumes } from '@/types';

interface ThereminPadsProps {
    onInteraction: (type: 'melody' | 'bass', data: { frequency: number; volume: number; pointerId: number; x: number, y: number } | null, state: 'down' | 'move' | 'up') => void;
    allowedFrequencies: { melody: number[], bass: number[] };
    isBassLatchOn: boolean;
    onLatchToggle: (isOn: boolean) => void;
    activeBassInstrument: BassInstrument;
    onInstrumentChange: (instrumentId: BassInstrument) => void;
    orbManager: OrbManager | null;
    effects: {
        melody: Omit<ChannelVolumes, 'gain'>;
        bass: Omit<ChannelVolumes, 'gain'>;
    };
    onEffectChange: (channel: 'melody' | 'bass', effect: keyof Omit<ChannelVolumes, 'gain'>, value: number) => void;
    activeMelodyInstrument: Instrument;
    onMelodyInstrumentChange: (instrumentId: Instrument) => void;
    musicKey: MusicKey;
    onKeyChange: (key: MusicKey) => void;
    musicScale: MusicScale;
    onScaleChange: (scale: MusicScale) => void;
}

const ThereminPadsComponent = ({
    onInteraction,
    allowedFrequencies,
    isBassLatchOn,
    onLatchToggle,
    activeBassInstrument,
    onInstrumentChange,
    orbManager,
    effects,
    onEffectChange,
    activeMelodyInstrument,
    onMelodyInstrumentChange,
    musicKey,
    onKeyChange,
    musicScale,
    onScaleChange
}: ThereminPadsProps) => {
    return (
        <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-2 landscape:grid-cols-2 landscape:gap-1">
            <ThereminPad
                type="bass"
                onInteraction={onInteraction}
                allowedFrequencies={allowedFrequencies.bass}
                color="hsl(var(--accent))"
                isLatchOn={isBassLatchOn}
                onLatchToggle={onLatchToggle}
                isPolyphonic
                instruments={bassInstruments}
                activeInstrument={activeBassInstrument}
                onInstrumentChange={onInstrumentChange}
                orbManager={orbManager}
                effects={effects.bass}
                onEffectChange={onEffectChange}
            />
            <ThereminPad
                type="melody"
                onInteraction={onInteraction}
                allowedFrequencies={allowedFrequencies.melody}
                color="hsl(var(--primary))"
                isLatchOn={false}
                musicKeys={Object.keys(ALL_NOTES) as MusicKey[]}
                activeKey={musicKey}
                onKeyChange={onKeyChange}
                musicScales={Object.keys(SCALES) as MusicScale[]}
                activeScale={musicScale}
                onScaleChange={onScaleChange}
                instruments={melodyInstruments}
                activeInstrument={activeMelodyInstrument}
                onInstrumentChange={onMelodyInstrumentChange}
                isPolyphonic
                orbManager={orbManager}
                effects={effects.melody}
                onEffectChange={onEffectChange}
            />
        </div>
    );
};

export const ThereminPads = memo(ThereminPadsComponent);

    
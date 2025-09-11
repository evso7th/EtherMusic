
"use client";

import { memo } from 'react';
import { ThereminPad } from '@/components/theremin-pad';
import { bassInstruments } from '@/lib/bass-presets';
import { melodyInstruments } from '@/lib/melody-presets';
import { ALL_NOTES, SCALES } from '@/lib/music';
import type { OrbManager } from '@/lib/orb-manager';
import type { MusicKey, MusicScale, Instrument, BassInstrument, ChannelVolumes, Volumes } from '@/types';

interface ThereminPadsProps {
    handleThereminInteraction: (type: 'melody' | 'bass', data: { frequency: number; volume: number; pointerId: number; x: number, y: number } | null, state: 'down' | 'move' | 'up') => void;
    allowedFrequencies: { melody: number[], bass: number[] };
    isBassLatchOn: boolean;
    onLatchToggle: (isOn: boolean) => void;
    activeBassInstrument: BassInstrument;
    handleSetBassInstrument: (instrumentId: BassInstrument) => void;
    orbManager: OrbManager | null;
    volumes: Volumes;
    onEffectChange: (channel: 'melody' | 'bass', effect: keyof Omit<ChannelVolumes, 'gain'>, value: number) => void;
    activeMelodyInstrument: Instrument;
    handleMelodyInstrumentChange: (instrumentId: Instrument) => void;
    musicKey: MusicKey;
    handleHarmonyChange: (keyOrScale: MusicKey | MusicScale) => void;
    musicScale: MusicScale;
}

const ThereminPadsComponent = ({
    handleThereminInteraction,
    allowedFrequencies,
    isBassLatchOn,
    onLatchToggle,
    activeBassInstrument,
    handleSetBassInstrument,
    orbManager,
    volumes,
    onEffectChange,
    activeMelodyInstrument,
    handleMelodyInstrumentChange,
    musicKey,
    handleHarmonyChange,
    musicScale
}: ThereminPadsProps) => {
    return (
        <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-2 landscape:grid-cols-2 landscape:gap-1">
            <ThereminPad
                type="bass"
                onInteraction={handleThereminInteraction}
                allowedFrequencies={allowedFrequencies.bass}
                color="hsl(var(--accent))"
                isLatchOn={isBassLatchOn}
                onLatchToggle={onLatchToggle}
                isPolyphonic
                instruments={bassInstruments}
                activeInstrument={activeBassInstrument}
                onInstrumentChange={handleSetBassInstrument}
                orbManager={orbManager}
                effects={{
                    reverbSend: volumes.manualBass.reverbSend,
                    distortion: volumes.manualBass.distortion,
                }}
                onEffectChange={onEffectChange}
            />
            <ThereminPad
                type="melody"
                onInteraction={handleThereminInteraction}
                allowedFrequencies={allowedFrequencies.melody}
                color="hsl(var(--primary))"
                isLatchOn={false}
                musicKeys={Object.keys(ALL_NOTES) as MusicKey[]}
                activeKey={musicKey}
                onKeyChange={handleHarmonyChange}
                musicScales={Object.keys(SCALES) as MusicScale[]}
                activeScale={musicScale}
                onScaleChange={handleHarmonyChange}
                instruments={melodyInstruments}
                activeInstrument={activeMelodyInstrument}
                onInstrumentChange={handleMelodyInstrumentChange}
                isPolyphonic
                orbManager={orbManager}
                effects={{
                    reverbSend: volumes.melody.reverbSend,
                    distortion: volumes.melody.distortion,
                }}
                onEffectChange={onEffectChange}
            />
        </div>
    );
};

export const ThereminPads = memo(ThereminPadsComponent);

    
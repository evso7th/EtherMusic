
import type { AutopilotSettings } from '@/types';

export const defaultAutopilotSettings: AutopilotSettings = {
    enabled: false,
    style: 'Ambient',
    density: 0.5,
    key: 'C',
    scale: 'Minor',
    instruments: {
        melody: 'synth',
        accompaniment: 'mellotron',
        bass: 'ambientDrone'
    }
};

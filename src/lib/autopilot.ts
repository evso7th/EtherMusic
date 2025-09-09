
import type { AutopilotSettings } from '@/types';

// NOTE: Autopilot functionality is deprecated and has been moved to a separate application, AuraGroove.
// This file is retained for reference purposes.

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

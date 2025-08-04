

'use client';

import * as Tone from 'tone';
import type { Instrument, MusicKey, MusicScale } from '@/app/page';

// This is the type for the note data we expect from the worker
export type AutopilotNote = {
    part: 'bass' | 'accompaniment' | 'melody' | 'effects';
    freq: number;
    dur: Tone.Unit.Time;
    vel: number;
    time: number;
};

type Voice = {
    synth: Tone.Synth | Tone.FMSynth;
    isBusy: boolean;
};

export class AutopilotPlayer {
    isInitialized: boolean = false;
    private pools: Map<string, Voice[]> = new Map();
    private channels: {
        bass: Tone.Channel;
        accompaniment: Tone.Channel;
        melody: Tone.Channel;
        effects: Tone.Channel;
    }
    private presets: { [key: string]: any } = {};
    private currentInstrument: Instrument = 'synth';

    constructor() {
        this.channels = {
            bass: new Tone.Channel(-12).toDestination(),
            accompaniment: new Tone.Channel(-18).toDestination(),
            melody: new Tone.Channel(-15).toDestination(),
            effects: new Tone.Channel(-20).toDestination()
        };
    }

    public async initialize() {
        if (this.isInitialized) return;

        this.createPresets();
        this.createVoicePools();
        
        this.isInitialized = true;
        console.log('AutopilotPlayer Initialized');
    }

    private createPresets() {
        this.presets = {
            synth: { type: 'Synth', options: { oscillator: { type: 'fatsine4', spread: 40, count: 4 }, envelope: { attack: 0.04, decay: 0.5, sustain: 0.8, release: 0.7 } } },
            'E-Bells_melody': { type: 'FMSynth', options: { harmonicity: 1.4, modulationIndex: 20, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 1.6, sustain: 0, release: 1.6 }, modulation: { type: 'square' }, modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.4 } } },
            'E-Bells_bass': { type: 'FMSynth', options: { harmonicity: 1.4, modulationIndex: 15, oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 1.5, sustain: 0, release: 2.5 }, modulation: { type: 'square' }, modulationEnvelope: { attack: 0.01, decay: 1.0, sustain: 0, release: 1.0 } } },
            autopilot_bass: { type: 'Synth', options: { oscillator: { type: "fmsine", harmonicity: 0.5 }, filter: { Q: 1, type: 'lowpass', rolloff: -12 }, envelope: { attack: 0.1, decay: 0.3, sustain: 0.4, release: 1.2 }, filterEnvelope: { attack: 0.05, decay: 0.2, sustain: 0.1, release: 1, baseFrequency: 200, octaves: 1.5 } } },
            autopilot_effect_star: { type: 'FMSynth', options: { oscillator: { type: 'fmsine', modulationType: 'sine', harmonicity: 0.8 }, envelope: { attack: 0.01, decay: 0.8, sustain: 0, release: 0.5 } } },
        };
    }
    
    private createVoicePools() {
        const createPool = (name: string, count: number, presetKey: string, channel: Tone.Channel) => {
            const pool: Voice[] = [];
            const preset = this.presets[presetKey];
            for (let i = 0; i < count; i++) {
                const synth = preset.type === 'FMSynth' 
                    ? new Tone.FMSynth(preset.options).connect(channel)
                    : new Tone.Synth(preset.options).connect(channel);
                pool.push({ synth, isBusy: false });
            }
            this.pools.set(name, pool);
        };
        
        createPool('bass', 4, 'autopilot_bass', this.channels.bass);
        createPool('melody', 6, 'synth', this.channels.melody);
        createPool('accompaniment', 6, 'synth', this.channels.accompaniment);
        createPool('effects', 3, 'autopilot_effect_star', this.channels.effects);
    }
    
    public setAutopilotInstrument(instrument: Instrument) {
        this.currentInstrument = instrument;
        const melodyPresetKey = instrument === 'E-Bells' ? 'E-Bells_melody' : instrument;
        const accompanimentPresetKey = instrument === 'E-Bells' ? 'E-Bells_melody' : instrument;

        this.reconfigurePool('melody', this.presets[melodyPresetKey]);
        this.reconfigurePool('accompaniment', this.presets[accompanimentPresetKey]);
    }

    private reconfigurePool(poolName: string, preset: any) {
        const pool = this.pools.get(poolName);
        if (!pool || !preset) return;

        pool.forEach(voice => {
            voice.synth.set(preset.options);
        });
    }

    public playNote(note: AutopilotNote) {
        if (!this.isInitialized) return;
        
        const pool = this.pools.get(note.part);
        if (!pool) return;
        
        const voice = pool.find(v => !v.isBusy);
        if (voice) {
            voice.isBusy = true;
            voice.synth.triggerAttackRelease(note.freq, note.dur, note.time, note.vel);
            const totalDurationMs = new Tone.Time(note.dur).toMilliseconds() + new Tone.Time(voice.synth.envelope.release).toMilliseconds();
            
            // Wait for the note to finish playing, then mark the voice as not busy
            setTimeout(() => {
                voice.isBusy = false;
            }, totalDurationMs);
        }
    }
    
    public setTempo(bpm: number) {
        // The main engine controls the transport, this can be a no-op
    }

    public setVolumes(volumes: any) {
        this.channels.bass.volume.value = volumes.autopilot;
        this.channels.melody.volume.value = volumes.autopilot;
        this.channels.accompaniment.volume.value = volumes.autopilot;
        this.channels.effects.volume.value = volumes.effects;
    }
    
    public setEffects(effects: any) {
        const autopilotEffects = effects.autopilot;
        if (autopilotEffects) {
             Object.values(this.channels).forEach(channel => {
                channel.send('reverb', autopilotEffects.reverb);
                channel.send('delay', autopilotEffects.delay);
            });
        }
    }
}

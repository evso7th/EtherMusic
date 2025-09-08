
"use client";

import { cn } from '@/lib/utils';

type OrbType = 'melody' | 'bass' | 'latch';

const ORB_COLORS: Record<OrbType, string> = {
    melody: 'hsl(var(--primary))',
    bass: 'hsl(var(--accent))',
    latch: 'hsl(var(--accent))'
};

export class OrbManager {
    private orbs = new Map<number, { element: HTMLDivElement; type: OrbType }>();
    private padElements: { [key in 'melody' | 'bass']?: HTMLElement | null } = {};
    private pendingUpdates = new Map<number, { x: number; y: number }>();
    private isUpdateScheduled = false;

    constructor() {
        this.applyPendingUpdates = this.applyPendingUpdates.bind(this);
    }
    
    private getPadElement(type: OrbType): HTMLElement | null {
        const padType = (type === 'bass' || type === 'latch') ? 'bass' : 'melody';
        if (!this.padElements[padType]) {
             this.padElements[padType] = document.getElementById(`theremin-pad-${padType}`);
        }
        return this.padElements[padType];
    }

    private scheduleUpdate() {
        if (!this.isUpdateScheduled) {
            this.isUpdateScheduled = true;
            requestAnimationFrame(this.applyPendingUpdates);
        }
    }

    private applyPendingUpdates() {
        if (typeof document === 'undefined') return;
        this.pendingUpdates.forEach(({ x, y }, id) => {
            const orbData = this.orbs.get(id);
            if (orbData) {
                orbData.element.style.transform = `translate(${x}px, ${y}px)`;
            }
        });
        this.pendingUpdates.clear();
        this.isUpdateScheduled = false;
    }

    public addOrb(id: number, type: OrbType, x: number, y: number) {
        if (typeof document === 'undefined' || this.orbs.has(id)) return;

        const pad = this.getPadElement(type);
        if (!pad) {
            console.warn(`Could not find pad element for type: ${type}`);
            return;
        }

        const orbEl = document.createElement('div');
        const color = ORB_COLORS[type];

        orbEl.id = `orb-${id}`; // Assign an ID for direct lookup
        orbEl.className = cn(
            'absolute rounded-full w-8 h-8 md:w-12 md:h-12 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-300 opacity-0',
             type === 'latch' && 'animate-pulse-accent-glow border-2 border-accent'
        );
        orbEl.style.backgroundColor = color;
        orbEl.style.boxShadow = `0 0 20px ${color}, 0 0 30px ${color}`;
        orbEl.style.transform = `translate(${x}px, ${y}px)`;
        orbEl.style.willChange = 'transform, box-shadow, opacity';
        
        pad.appendChild(orbEl);
        this.orbs.set(id, { element: orbEl, type });

        requestAnimationFrame(() => {
            orbEl.style.opacity = '1';
        });
    }

    public updateOrb(id: number, x: number, y: number) {
        this.pendingUpdates.set(id, { x, y });
        this.scheduleUpdate();
    }

    public removeOrb(id: number) {
        const orb = this.orbs.get(id);
        if (orb) {
            orb.element.style.opacity = '0';
            setTimeout(() => {
                orb.element.parentElement?.removeChild(orb.element);
            }, 300);
            this.orbs.delete(id);
            this.pendingUpdates.delete(id);
        }
    }
    
    public removeAllOrbs(type?: OrbType) {
        for (const [id, orb] of this.orbs.entries()) {
             if (!type || orb.type === type) {
                this.removeOrb(id);
             }
        }
    }
}

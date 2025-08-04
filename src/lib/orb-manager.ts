

"use client";

import { cn } from '@/lib/utils';

type OrbType = 'melody' | 'bass' | 'latch';

const ORB_COLORS = {
    melody: 'hsl(var(--primary))',
    bass: 'hsl(var(--accent))',
    latch: 'hsl(var(--accent))'
};

export class OrbManager {
    private orbs = new Map<number, { element: HTMLDivElement; type: OrbType }>();
    private padElements: { [key in OrbType]?: HTMLElement | null } = {};

    constructor() {
        // Defer DOM access until methods are called
    }

    private getPadElement(type: OrbType): HTMLElement | null {
        // Use cached element if available
        if (this.padElements[type]) {
            return this.padElements[type];
        }
        // If not cached, query the DOM and cache it
        const padId = (type === 'bass' || type === 'latch') ? 'theremin-pad-bass' : 'theremin-pad-melody';
        if (typeof document === 'undefined') return null;
        const element = document.getElementById(padId);
        if (element) {
            this.padElements[type] = element;
        }
        return element;
    }

    public addOrb(id: number, type: OrbType, x: number, y: number) {
        if (typeof document === 'undefined' || this.orbs.has(id)) return;

        const pad = this.getPadElement(type);
        if (!pad) return;

        const orbEl = document.createElement('div');
        const color = ORB_COLORS[type];

        orbEl.className = cn(
            'absolute rounded-full w-8 h-8 md:w-12 md:h-12 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-300 opacity-0',
             type === 'latch' && 'animate-pulse-primary border-2 border-accent'
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
        const orb = this.orbs.get(id);
        if (orb) {
            requestAnimationFrame(() => {
                 orb.element.style.transform = `translate(${x}px, ${y}px)`;
            });
        }
    }

    public removeOrb(id: number) {
        const orb = this.orbs.get(id);
        if (orb) {
            orb.element.style.opacity = '0';
            setTimeout(() => {
                orb.element.remove();
            }, 300); 
            this.orbs.delete(id);
        }
    }

    public removeAllOrbs() {
        for (const [id] of this.orbs.entries()) {
            this.removeOrb(id);
        }
    }
}

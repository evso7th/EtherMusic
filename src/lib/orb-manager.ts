
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

    constructor() {
        if (typeof document !== 'undefined') {
            this.padElements['melody'] = document.getElementById('theremin-pad-melody');
            this.padElements['bass'] = document.getElementById('theremin-pad-bass');
        }
    }
    
    private getPadElement(type: OrbType): HTMLElement | null {
        const padType = (type === 'bass' || type === 'latch') ? 'bass' : 'melody';
        if (!this.padElements[padType]) {
             this.padElements[padType] = document.getElementById(`theremin-pad-${padType}`);
        }
        return this.padElements[padType];
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

        // Use requestAnimationFrame to ensure the element is in the DOM before animating opacity
        requestAnimationFrame(() => {
            orbEl.style.opacity = '1';
        });
    }

    public updateOrb(id: number, x: number, y: number) {
        const orb = this.orbs.get(id);
        if (orb) {
            // Use requestAnimationFrame for smooth UI updates
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
                orb.element.parentElement?.removeChild(orb.element);
            }, 300); // Wait for transition to finish
            this.orbs.delete(id);
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


"use client";

import { cn } from '@/lib/utils';

type OrbType = 'melody' | 'bass' | 'latch' | 'temp';

const ORB_COLORS: Record<OrbType, string> = {
    melody: 'hsl(var(--primary))',
    bass: 'hsl(var(--accent))',
    latch: 'hsl(var(--accent))',
    temp: 'hsl(var(--primary) / 0.7)',
};

export class OrbManager {
    private orbs = new Map<number, { element: HTMLDivElement; type: OrbType }>();
    private padElements: { [key in 'melody' | 'bass']?: HTMLElement | null } = {};
    private pendingUpdates = new Map<number, { x: number; y: number }>();
    private isUpdateScheduled = false;
    private mainContainer: HTMLElement | null;

    constructor(containerElement: HTMLElement | null = null) {
        this.mainContainer = containerElement;
        this.applyPendingUpdates = this.applyPendingUpdates.bind(this);
    }
    
    private getPadElement(type: OrbType): HTMLElement | null {
        // Temp orbs can appear on any pad, but for positioning let's default to melody if main container isn't there
        const padType = (type === 'bass' || type === 'latch') ? 'bass' : 'melody';
        
        // If a main container is specified, use it for temp orbs to span the whole area
        if (type === 'temp' && this.mainContainer) {
            return this.mainContainer;
        }

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

        // Use a small timeout to allow the element to be added to the DOM before changing opacity
        setTimeout(() => {
            orbEl.style.opacity = '1';
        }, 10); 
    }
    
    public addTempOrb(x: number, y: number, padType: 'melody' | 'bass') {
        const id = Date.now() + Math.random();
        
        const pad = this.getPadElement(padType);
        if (!pad) return;
        const rect = pad.getBoundingClientRect();
        
        // Convert normalized x/y to absolute pixel values within the target pad
        const absoluteX = rect.left + x * rect.width;
        const absoluteY = rect.top + y * rect.height;

        const orbEl = document.createElement('div');
        const color = ORB_COLORS['temp'];

        orbEl.className = cn(
            'absolute rounded-full w-4 h-4 pointer-events-none transition-all duration-1000',
            'opacity-0 scale-50'
        );
        orbEl.style.backgroundColor = color;
        orbEl.style.boxShadow = `0 0 10px ${color}`;
        orbEl.style.transform = `translate(${absoluteX}px, ${absoluteY}px)`;
        orbEl.style.willChange = 'transform, opacity, scale';
        orbEl.style.zIndex = '50';

        // Use the main container for appending temp orbs so they can appear over everything
        const appendTarget = this.mainContainer || document.body;
        appendTarget.appendChild(orbEl);

        // Animate in
        requestAnimationFrame(() => {
            orbEl.style.opacity = '1';
            orbEl.style.transform = `translate(${absoluteX}px, ${absoluteY - 40}px) scale(1.2)`;
        });

        // Animate out and remove
        setTimeout(() => {
            orbEl.style.opacity = '0';
            orbEl.style.transform = `translate(${absoluteX}px, ${absoluteY - 80}px) scale(0.5)`;
        }, 500);

        setTimeout(() => {
            orbEl.parentElement?.removeChild(orbEl);
        }, 1500);
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

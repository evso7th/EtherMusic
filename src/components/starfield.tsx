
"use client";
import React, { useRef, useEffect } from 'react';

export const Starfield = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        let stars: { x: number; y: number; z: number; size: number }[] = [];
        const numStars = 500;
        let animationFrameId: number;
        
        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            stars = [];
            for (let i = 0; i < numStars; i++) {
                stars.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    z: Math.random() * canvas.width,
                    size: Math.random() * 2 + 1,
                });
            }
        };
        
        const draw = () => {
            if (!ctx || !canvas) return;
            
            ctx.fillStyle = "hsl(var(--background))";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            for (let i = 0; i < numStars; i++) {
                const star = stars[i];
                const x = (star.x - canvas.width / 2) * (canvas.width / star.z) + canvas.width / 2;
                const y = (star.y - canvas.height / 2) * (canvas.width / star.z) + canvas.height / 2;
                const size = star.size * (canvas.width / star.z);

                ctx.beginPath();
                ctx.fillStyle = 'hsl(var(--primary) / ' + (1 - star.z / canvas.width) + ')';
                ctx.arc(x, y, size, 0, 2 * Math.PI);
                ctx.fill();
            }
        };

        const update = () => {
             if (!canvas) return;
            for (let i = 0; i < numStars; i++) {
                stars[i].z -= 1.5;
                if (stars[i].z <= 0) {
                    stars[i].x = Math.random() * canvas.width;
                    stars[i].y = Math.random() * canvas.height;
                    stars[i].z = canvas.width;
                }
            }
        };

        const animate = () => {
            draw();
            update();
            animationFrameId = requestAnimationFrame(animate);
        };

        resize();
        animate();

        window.addEventListener('resize', resize);
        
        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationFrameId);
        }
    }, []);

    return <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 0, background: 'hsl(var(--background))' }} />;
};

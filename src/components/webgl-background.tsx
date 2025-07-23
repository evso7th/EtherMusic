
"use client";

import { useEffect, useRef } from 'react';

const shader = {
  vertex: `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `,
  fragment: `
    #ifdef GL_ES
    precision mediump float;
    #endif

    uniform vec2 u_resolution;
    uniform float u_time;

    // App's color palette
    vec3 colorA = vec3(0.10, 0.02, 0.12); // --background: #1A051F
    vec3 colorB = vec3(0.54, 0.17, 0.89); // --primary: #8A2BE2
    vec3 colorC = vec3(0.0, 0.72, 0.92);  // --accent: #00B7EB

    vec3 palette(float t) {
        vec3 a = colorA;
        vec3 b = colorB;
        vec3 c = colorC;
        vec3 d = vec3(0.25, 0.40, 0.55);
        return a + b * cos(6.28318 * (c * t + d));
    }

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      
      return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
                 u.y);
    }

    float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 8; i++) { // Increased iterations for more detail
            value += amplitude * noise(p);
            p *= 2.0;
            amplitude *= 0.5;
        }
        return value;
    }

    vec2 rotate(vec2 uv, float angle) {
        float s = sin(angle);
        float c = cos(angle);
        mat2 rot = mat2(c, -s, s, c);
        return rot * uv;
    }

    void main() {
      vec2 st = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
      
      float t = u_time * 0.05; // Slower time for a more majestic feel
      
      // More complex warping
      vec2 q = vec2(fbm(st + t), fbm(st + vec2(1.2, 2.8) + t));
      vec2 r = vec2(fbm(st + q * 0.8 + vec2(5.2, 1.3) + t), fbm(st + q * 0.6 + vec2(8.3, 4.2) + t));
      st += r * 0.2;

      // Rotations for swirling effect
      st = rotate(st, t * 0.3);

      float d = length(st);
      
      // Shape generation with more peaks and valleys
      float pattern = fbm(st * 2.5 - r.x * 0.3 + t);
      pattern += sin(st.x * 10.0 + t * 2.0) * 0.1; // Add sine waves for ripples
      pattern += cos(st.y * 10.0 + t * 2.0) * 0.1;
      pattern = 1.0 / (pattern + pow(d, 2.5)); // Sharper falloff

      vec3 color = palette(d * 0.5 + t * 0.1);

      // Additive blending for a brighter core
      color += vec3(pattern * 0.5);

      // Vignette to create soft edges and handle 10% margin
      float vignette = smoothstep(1.0, 0.6, d);
      color *= vignette;
      
      // Final color with alpha for transparency
      gl_FragColor = vec4(color, vignette);
    }
  `
};

export function WebGLBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { premultipliedAlpha: false }) || canvas.getContext('experimental-webgl', { premultipliedAlpha: false });
    if (!gl) {
      console.error("WebGL not supported");
      return;
    }

    const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('An error occurred compiling the shaders:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const createProgram = (gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader) => {
      const program = gl.createProgram();
      if (!program) return null;
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Unable to initialize the shader program:', gl.getProgramInfoLog(program));
        return null;
      }
      return program;
    };

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, shader.vertex);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, shader.fragment);
    if (!vertexShader || !fragmentShader) return;

    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) return;

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.useProgram(program);

    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    const timeLocation = gl.getUniformLocation(program, 'u_time');
    
    // Enable blending for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    let startTime = performance.now();
    let animationFrameId: number;

    const render = (time: number) => {
      const elapsedTime = (time - startTime) * 0.001;
      
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform1f(timeLocation, elapsedTime);
      
      gl.clearColor(0, 0, 0, 0); 
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      
      animationFrameId = requestAnimationFrame(render);
    };

    const resize = () => {
      const { innerWidth, innerHeight, devicePixelRatio } = window;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    window.addEventListener('resize', resize);
    resize();
    render(performance.now());

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteBuffer(positionBuffer);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 0, width: '100vw', height: '100vh', background: 'transparent' }} />;
}

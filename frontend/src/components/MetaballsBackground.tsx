import { useEffect, useRef } from 'react';
import {
  useMatrixStore,
  LEGACY_ENTITY_COLORS,
  MODERN_ENTITY_COLORS,
  LEGACY_ACTION_COLORS,
  MODERN_ACTION_COLORS,
} from '../store/matrixStore';

// ═══════════════════════════════════════════════════════════════════════════════
// Vertex Shader — fullscreen quad
// ═══════════════════════════════════════════════════════════════════════════════
const VERT = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

// ═══════════════════════════════════════════════════════════════════════════════
// Fragment Shader — Metaballs with dual-color mixing (lava lamp)
// ═══════════════════════════════════════════════════════════════════════════════
const FRAG = `
precision mediump float;

uniform vec2  u_res;
uniform float u_time;
uniform vec3  u_colA;       // entity color  (top source)
uniform vec3  u_colB;       // action color  (bottom source)
uniform vec2  u_touch;
uniform float u_touchStr;

float blob(vec2 uv, vec2 c, float r) {
  vec2 d = uv - c;
  return (r * r) / dot(d, d);
}

void main() {
  vec2 st = gl_FragCoord.xy / u_res;
  float asp = u_res.x / u_res.y;
  vec2 uv = vec2(st.x * asp, st.y);
  float t = u_time;

  // ── Top blobs (entity color — emitted from header) ────────────────
  vec2 p1 = vec2((0.30 + 0.15*sin(t*0.13) + 0.08*cos(t*0.31+1.3)) * asp,
                  0.80 + 0.10*cos(t*0.11) + 0.05*sin(t*0.23+2.1));
  vec2 p2 = vec2((0.72 + 0.12*cos(t*0.17+1.2) + 0.06*sin(t*0.29)) * asp,
                  0.87 + 0.07*sin(t*0.14) + 0.04*cos(t*0.27+0.8));
  vec2 p3 = vec2((0.50 + 0.22*sin(t*0.10+2.5) + 0.07*cos(t*0.33+1.7)) * asp,
                  0.70 + 0.13*cos(t*0.09) + 0.05*sin(t*0.21+3.0));

  // ── Bottom blobs (action color — emitted from footer) ─────────────
  vec2 p4 = vec2((0.40 + 0.18*cos(t*0.12+0.5) + 0.07*sin(t*0.28+2.2)) * asp,
                  0.25 + 0.11*sin(t*0.10) + 0.05*cos(t*0.25+1.5));
  vec2 p5 = vec2((0.68 + 0.14*sin(t*0.15+2.0) + 0.06*cos(t*0.32+0.4)) * asp,
                  0.14 + 0.08*cos(t*0.13) + 0.04*sin(t*0.22+2.8));
  vec2 p6 = vec2((0.33 + 0.20*cos(t*0.08+3.5) + 0.08*sin(t*0.26+1.1)) * asp,
                  0.33 + 0.10*sin(t*0.11) + 0.05*cos(t*0.24+0.6));

  float r = 0.22;

  // ── Field from each group ─────────────────────────────────────────
  float fTop = blob(uv, p1, r) + blob(uv, p2, r*0.88) + blob(uv, p3, r*0.82);
  float fBot = blob(uv, p4, r) + blob(uv, p5, r*0.88) + blob(uv, p6, r*0.82);
  float field = fTop + fBot;

  // ── Touch ripple ──────────────────────────────────────────────────
  if (u_touchStr > 0.01) {
    vec2 tp = vec2(u_touch.x * asp, u_touch.y);
    float td = dot(uv - tp, uv - tp);
    field += u_touchStr * 0.12 / max(td, 0.0008);
  }

  // ── Metaball threshold (smooth edges) ─────────────────────────────
  float shape = smoothstep(0.45, 1.6, field);

  // ── Color mixing — proportional to top vs bottom influence ────────
  float mixR = fTop / max(field, 0.001);
  vec3 liquid = mix(u_colB, u_colA, mixR);

  // ── Ambient gradient tint (very subtle) ───────────────────────────
  vec3 ambient = mix(u_colB * 0.06, u_colA * 0.06, st.y);

  // ── Final composite ───────────────────────────────────────────────
  vec3 bg = vec3(0.039, 0.039, 0.059);
  vec3 color = mix(bg, liquid * 0.75, shape * 0.30) + ambient;

  // ── Vignette (subtle edge darkening) ──────────────────────────────
  color *= 1.0 - 0.25 * length(st - 0.5);

  gl_FragColor = vec4(color, 1.0);
}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════
function hexToRGB(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════
export default function MetaballsBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);
  const touchRef  = useRef({ x: 0.5, y: 0.5, str: 0 });

  const entidadActiva = useMatrixStore(s => s.entidadActiva);
  const accionActiva  = useMatrixStore(s => s.accionActiva);
  const colorMode     = useMatrixStore(s => s.colorMode);

  const entityColors = colorMode === 'legacy' ? LEGACY_ENTITY_COLORS : MODERN_ENTITY_COLORS;
  const actionColors = colorMode === 'legacy' ? LEGACY_ACTION_COLORS : MODERN_ACTION_COLORS;

  // Lazy-init color ref with current store values
  const colRef = useRef<{
    curA: number[]; curB: number[];
    tgtA: number[]; tgtB: number[];
  } | null>(null);
  if (!colRef.current) {
    const a = hexToRGB(entityColors[entidadActiva]);
    const b = hexToRGB(actionColors[accionActiva]);
    colRef.current = { curA: [...a], curB: [...b], tgtA: [...a], tgtB: [...b] };
  }

  // ── Smooth color transitions ──────────────────────────────────────
  useEffect(() => {
    colRef.current!.tgtA = hexToRGB(entityColors[entidadActiva]);
  }, [entidadActiva, colorMode]);

  useEffect(() => {
    colRef.current!.tgtB = hexToRGB(actionColors[accionActiva]);
  }, [accionActiva, colorMode]);

  // ── Touch events (document-level, canvas is pointer-events: none) ─
  useEffect(() => {
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      touchRef.current.x = t.clientX / window.innerWidth;
      touchRef.current.y = 1 - t.clientY / window.innerHeight;
      touchRef.current.str = 1;
    };
    window.addEventListener('touchstart', onTouch, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouch);
      window.removeEventListener('touchmove', onTouch);
    };
  }, []);

  // ── WebGL setup & render loop ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    });
    if (!gl) return;

    // Compile shaders
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERT);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, FRAG);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('Metaballs FS:', gl.getShaderInfoLog(fs));
      return;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // Full-screen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Uniform locations
    const uRes      = gl.getUniformLocation(prog, 'u_res');
    const uTime     = gl.getUniformLocation(prog, 'u_time');
    const uColA     = gl.getUniformLocation(prog, 'u_colA');
    const uColB     = gl.getUniformLocation(prog, 'u_colB');
    const uTouch    = gl.getUniformLocation(prog, 'u_touch');
    const uTouchStr = gl.getUniformLocation(prog, 'u_touchStr');

    // Low-res rendering for natural blur + performance
    const RES = 0.35;
    const resize = () => {
      const w = Math.round(canvas.clientWidth * RES);
      const h = Math.round(canvas.clientHeight * RES);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const t0 = performance.now();

    const render = () => {
      rafRef.current = requestAnimationFrame(render);
      if (document.hidden) return; // skip when tab hidden

      const t = (performance.now() - t0) / 1000;
      const c = colRef.current!;

      // Lerp colors towards target (smooth transition)
      for (let i = 0; i < 3; i++) {
        c.curA[i] += (c.tgtA[i] - c.curA[i]) * 0.035;
        c.curB[i] += (c.tgtB[i] - c.curB[i]) * 0.035;
      }

      // Decay touch strength
      touchRef.current.str *= 0.94;
      if (touchRef.current.str < 0.01) touchRef.current.str = 0;

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform3f(uColA, c.curA[0], c.curA[1], c.curA[2]);
      gl.uniform3f(uColB, c.curB[0], c.curB[1], c.curB[2]);
      gl.uniform2f(uTouch, touchRef.current.x, touchRef.current.y);
      gl.uniform1f(uTouchStr, touchRef.current.str);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: '-30px',
        width: 'calc(100% + 60px)',
        height: 'calc(100% + 60px)',
        zIndex: 0,
        pointerEvents: 'none',
        filter: 'blur(8px)',
      }}
    />
  );
}

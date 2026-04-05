"use client";

import { useEffect, useRef, useState } from "react";

// ─── GLSL ─────────────────────────────────────────────────────────────────────

const VERT = `
attribute vec2 a_pos;
attribute vec2 a_uv;
varying   vec2 v_uv;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_uv = a_uv;
}`;

/**
 * Chroma-key shader for pink / magenta backgrounds.
 *
 * Pipeline:
 *  1. Sample video with chromatic aberration (hologram sharpness)
 *  2. Convert to YCbCr — key on CbCr distance from the background hue
 *  3. Spill suppression — strip residual pink tint from edges
 *  4. Hologram tint (cyan/teal)
 *  5. Scan lines, moving band, fresnel edge glow
 *  6. Bottom projection fade + flicker
 *
 * ── Tuning ──────────────────────────────────────────────────────────────────
 *  u_bg_color   : set to the exact background RGB (sample from your video)
 *  KEY_LO/HI    : chroma-distance thresholds — tighten HI to shrink halo
 *  SPILL_STR    : 0 = no spill removal, 1 = full desaturation of background hue
 */
const FRAG = `
precision highp float;

uniform sampler2D u_tex;
uniform float     u_time;
uniform float     u_flicker;
uniform vec2      u_res;
uniform vec3      u_bg;       // background colour to key out

varying vec2 v_uv;

// ── Pseudo-random noise ───────────────────────────────────────────────────────
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
float hash1(float p) {
  return fract(sin(p) * 43758.5453);
}

// ── YCbCr conversion ──────────────────────────────────────────────────────────
vec3 rgb2ycbcr(vec3 c) {
  float Y  =  0.299*c.r + 0.587*c.g + 0.114*c.b;
  float Cb = -0.169*c.r - 0.331*c.g + 0.500*c.b + 0.5;
  float Cr =  0.500*c.r - 0.419*c.g - 0.081*c.b + 0.5;
  return vec3(Y, Cb, Cr);
}

// ── key thresholds (fraction of CbCr range, 0-1) ─────────────────────────────
const float KEY_LO    = 0.14;   
const float KEY_HI    = 0.38;   
const float SPILL_STR = 0.95;   

void main() {
  vec2 uv = v_uv;

  // ── 0. CRT Curvature ─────────────────────────────────────────────────────────
  // Removed CRT barrel distortion to keep hologram strictly rectangular

  // ── 1. Digital Glitch / Displacement ─────────────────────────────────────────
  // Occasional sharp horizontal slices based on time
  float glitchTime = floor(u_time * 6.0); // glitch update rate (slower)
  float glitchTrigger = hash1(glitchTime);
  float isGlitch = step(0.999, glitchTrigger); // Practically eliminated glitch chance
  
  float sliceY = floor(uv.y * 25.0);
  float sliceDisp = (hash(vec2(sliceY, glitchTime)) - 0.5) * 0.005; // invisible displacement
  uv.x += sliceDisp * isGlitch;

  // Blank out if UV gets distorted out of bounds
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
     gl_FragColor = vec4(0.0);
     return;
  }

  // ── 2. Chromatic aberration sample ───────────────────────────────────────────
  // Base CA + large spike during glitch
  float CA = 0.0004 + (isGlitch * 0.008 * hash1(glitchTime * 2.1));

  float r = texture2D(u_tex, uv + vec2( CA,      0.0)).r;
  float g = texture2D(u_tex, uv                     ).g;
  float b = texture2D(u_tex, uv - vec2( CA,      0.0)).b;
  // Removed green-channel mix to sharpen the core image heavily

  vec3 col = clamp(vec3(r, g, b), 0.0, 1.0);

  // ── 3. Chroma key in YCbCr space ─────────────────────────────────────────────
  vec3 ycbcr   = rgb2ycbcr(col);
  vec3 bgYcbcr = rgb2ycbcr(u_bg);

  float chromaDist = distance(ycbcr.yz, bgYcbcr.yz);
  float alpha = smoothstep(KEY_LO, KEY_HI, chromaDist);

  // Spill suppression
  float spill = 1.0 - smoothstep(KEY_HI * 0.5, KEY_HI * 1.4, chromaDist);
  float luma  = ycbcr.x;
  col = mix(col, vec3(luma), spill * SPILL_STR);

  // ── 4. Hologram tint (cyan / teal shift) ───────────────────────────────────
  vec3 holo = vec3(
    col.r * 0.18 + col.g * 0.04,
    col.g * 0.80 + col.b * 0.12 + 0.07,
    col.b * 1.25 + col.g * 0.08 + 0.12
  );
  
  // Shift colors gently during glitch
  vec2 glitchSeed = vec2(uv.y, u_time);
  holo = mix(holo, holo.gbr * 1.25, isGlitch * hash(glitchSeed));

  // Blend bright highlights back toward natural
  holo = mix(holo, col * vec3(0.55, 0.92, 1.08), smoothstep(0.50, 0.80, luma));

  // Gamma push for punchier contrast
  holo = pow(max(holo, vec3(0.0)), vec3(0.84));

  // ── 5a. CRT Scan lines & Dot matrix ────────────────────────────────────────
  float sl      = sin(uv.y * u_res.y * 3.14159 * 2.8);
  float scanMod = mix(0.65, 1.0, pow(abs(sl), 0.3)); // Deeper scan lines

  float dotMod = sin(uv.x * u_res.x * 1.5) * sin(uv.y * u_res.y * 1.5);
  scanMod *= mix(0.88, 1.0, (dotMod * 0.5 + 0.5));

  // ── 5b. Moving bright scan band & Data band ────────────────────────────────
  float bandY = mod(u_time * 0.25, 1.3) - 0.1;
  float band  = 1.0 - smoothstep(0.0, 0.06, abs(uv.y - bandY)) * 0.45;

  float dataBand = step(0.98, fract(uv.y * 6.0 - u_time * 1.5));
  holo += vec3(0.0, 0.9, 1.0) * dataBand * 0.12;

  // ── 5c. Flicker micro-jitter ───────────────────────────────────────────────
  float jitter   = sin(uv.y * 217.3 + u_time * 33.0) * 0.0007;
  jitter        *= (1.0 - u_flicker) * 9.0;
  vec3 jitterCol = texture2D(u_tex, uv + vec2(jitter, 0.0)).rgb;
  holo           = mix(holo, jitterCol * vec3(0.2, 0.9, 1.1), abs(jitter) * 55.0);

  // ── 5d. Edge fresnel glow with breathing ───────────────────────────────────
  float edgeX   = min(uv.x, 1.0 - uv.x);
  float pulse   = 0.50 + 0.15 * sin(u_time * 2.5);
  float fresnel = 1.0 + (1.0 - smoothstep(0.0, 0.12, edgeX)) * pulse;

  // ── 5e. Bottom projection fade & Additive emission ─────────────────────────
  float bottomFade = 1.0; // No bottom edge smoothing
  float em   = smoothstep(0.40, 1.0, luma);
  vec3  emit = vec3(0.0, em * 0.35, em * 0.65); // Stronger bloom

  // ── 5f. Holographic Grid Overlay ───────────────────────────────────────────
  float gridX = step(0.96, fract(uv.x * 50.0));
  float gridY = step(0.96, fract(uv.y * 50.0 + u_time));
  float grid = max(gridX, gridY);
  holo += vec3(0.0, 0.6, 0.9) * grid * 0.08 * luma;

  // ── 6. Compose ─────────────────────────────────────────────────────────────
  vec3  finalCol = (holo + emit) * scanMod * band * fresnel;
  float finalA   = alpha * scanMod * bottomFade * u_flicker;
  
  // Rectangular smooth blend (blur out edges to merge with page)
  // We keep the left edge perfectly soft, but remove the right-side fade so it organically touches the right screen edge.
  float blendLeft = smoothstep(0.0, 0.14, uv.x); 
  float blendRight = smoothstep(0.0, 0.01, 1.0 - uv.x); // tiny 1% anti-alias for right edge
  float blendX = blendLeft * blendRight;
  finalA *= blendX;

  // Random static noise on the edges
  float noise = hash(uv + vec2(u_time));
  finalCol += finalCol * (noise * 0.1 * (1.0 - fresnel));

  gl_FragColor = vec4(finalCol, finalA);
}`;

// ─── WebGL helpers ────────────────────────────────────────────────────────────
function makeShader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    console.error("[hologram shader]", gl.getShaderInfoLog(s));
  return s;
}
function makeProgram(gl: WebGLRenderingContext) {
  const p = gl.createProgram()!;
  gl.attachShader(p, makeShader(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, makeShader(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    console.error("[hologram program]", gl.getProgramInfoLog(p));
  return p;
}

// ─── Projection base disc ─────────────────────────────────────────────────────
// function ProjectionBase() {
//   return (
//     <div
//       className="pointer-events-none absolute bottom-0 left-1/2 z-10 -translate-x-1/2"
//       style={{ width: "110%", height: "32px" }}
//     >
//       <div
//         className="absolute inset-0 rounded-full"
//         style={{
//           background:
//             "radial-gradient(ellipse 90% 100% at 50% 100%, rgba(0,210,255,0.50) 0%, rgba(0,160,255,0.18) 55%, transparent 100%)",
//           animation: "projPulse 3.1s ease-in-out infinite",
//         }}
//       />
//       <div
//         className="absolute left-1/2 -translate-x-1/2"
//         style={{
//           bottom: 0, width: "68%", height: "3px", borderRadius: "50%",
//           background:
//             "radial-gradient(ellipse 100% 100% at 50% 50%, rgba(100,240,255,0.95) 0%, rgba(0,190,255,0.45) 55%, transparent 100%)",
//           boxShadow: "0 0 22px 6px rgba(0,215,255,0.60)",
//         }}
//       />
//     </div>
//   );
// }

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * BG_COLOR — the background colour to chroma-key out.
 *
 * HOW TO TUNE: open your video in any image editor, use the colour picker /
 * eye-dropper on a clean patch of background (not near the subject), then
 * convert from 0-255 to 0-1 range.
 *
 * Current value is sampled from the pink/magenta in the screenshot (~#C23070).
 *
 * If the key cuts into the subject:  lower KEY_HI in the shader.
 * If a pink halo remains:            raise KEY_HI slightly.
 * If edges are still pink-tinted:    raise SPILL_STR toward 1.0.
 */
const BG_COLOR: [number, number, number] = [0.76, 0.19, 0.44];

export default function JoiHologram() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.innerWidth <= 768);
    const handleResizeCheck = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResizeCheck);
    return () => window.removeEventListener("resize", handleResizeCheck);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!video || !canvas || !wrap) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
    });
    if (!gl) { console.error("WebGL not available"); return; }

    const prog = makeProgram(gl);
    gl.useProgram(prog);

    // full-screen quad
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const uvCoords = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);

    const posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uvBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, uvCoords, gl.STATIC_DRAW);
    const aUV = gl.getAttribLocation(prog, "a_uv");
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);

    // texture
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // uniforms
    const uTex = gl.getUniformLocation(prog, "u_tex");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uFlicker = gl.getUniformLocation(prog, "u_flicker");
    const uRes = gl.getUniformLocation(prog, "u_res");
    const uBg = gl.getUniformLocation(prog, "u_bg");

    gl.uniform1i(uTex, 0);
    gl.uniform3f(uBg, ...BG_COLOR);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const resize = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      } else {
        canvas.width = wrap.offsetWidth;
        canvas.height = wrap.offsetHeight;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };

    // flicker state
    let flickerVal = 1.0;
    let flickerTimer = 0.0;
    let nextFlicker = Math.random() * 4 + 2;
    let inFlicker = false;
    let flickerPhase = 0.0;

    let rafId = 0;
    let t = 0.0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      t += dt;

      flickerTimer += dt;
      if (!inFlicker && flickerTimer >= nextFlicker) {
        inFlicker = true; flickerPhase = 0; flickerTimer = 0;
        nextFlicker = Math.random() * 12 + 6.0; // Extensively reduced flicker rate
      }
      if (inFlicker) {
        flickerPhase += dt * 14;
        flickerVal = 0.52 + Math.abs(Math.sin(flickerPhase * Math.PI)) * 0.48;
        if (flickerPhase > 0.9) { inFlicker = false; flickerVal = 1.0; }
      }

      if (video.readyState >= 2) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      }

      gl.uniform1f(uTime, t);
      gl.uniform1f(uFlicker, flickerVal);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      rafId = requestAnimationFrame(loop);
    };

    video.muted = true;
    video.loop = true;
    video.playsInline = true;

    const onCanPlay = () => {
      video.play().catch(() => { });
      setReady(true);
      resize();
      window.addEventListener("resize", resize);
      rafId = requestAnimationFrame(loop);
    };

    if (video.readyState >= 2) onCanPlay();
    else video.addEventListener("canplay", onCanPlay, { once: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <>
      <style>{`
        @keyframes projPulse {
          0%,100% { opacity:0.55; transform:scaleX(1); }
          50%      { opacity:0.90; transform:scaleX(1.07); }
        }
        @keyframes hologramRise {
          from { opacity:0; transform:translateY(20px); filter:blur(8px); }
          to   { opacity:1; transform:translateY(0);    filter:blur(0); }
        }
      `}</style>

      <video
        ref={videoRef}
        src="/videos/joi-hologram.webm"
        style={{ display: "none" }}
        playsInline muted loop
      />

      <div
        ref={wrapRef}
        className="pointer-events-none fixed bottom-0 right-0 z-10"
        style={{
          height: "100vh",
          width: "100%",
          animation: ready
            ? "hologramRise 1.8s cubic-bezier(0.22,1,0.36,1) both"
            : "none",
        }}
      >
        <canvas 
           ref={canvasRef} 
           className="absolute inset-0 h-full w-full" 
           style={{ 
             objectFit: isMobile ? "cover" : "contain", 
             objectPosition: isMobile ? "center" : "right bottom" 
           }} 
        />

      </div>
    </>
  );
}
"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export type BlackHoleStage =
  | "pre-intro"
  | "intro"
  | "entering"
  | "expanding"
  | "greeting"
  | "home";

type BlackHoleSceneProps = {
  stage: BlackHoleStage;
  onEntered: () => void;
};

// ─── timing ──────────────────────────────────────────────────────────────────
const ENTER_SECONDS = 11;    // longer = smoother suck-in transition
const ENTER_TRIGGER = 0.82;  // when onEntered fires (just before void snap)

// Pointer → particle coupling (user asked ~5× more responsive)
const INTERACTION_GAIN = 5;

// ─── easing ──────────────────────────────────────────────────────────────────
function easeInCubic(t: number) { return t * t * t; }
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function easeInOutQuint(t: number) {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}
function easeOutQuart(t: number) { return 1 - Math.pow(1 - t, 4); }

// ─── disk points shader (per-particle size: tiny at spiral edges) ───────────
const DISK_POINT_VERT = `
attribute float size;
attribute vec3 color;
attribute float aBaseRadius;
attribute float aBaseAngle;
attribute float aSeed;
attribute float aRespawnR;

varying vec3 vColor;

uniform float uPointScale;
uniform float uTime;
uniform float uSuckDistance;

void main() {
  vColor = color;
  
  float r = aBaseRadius;
  float pullDistance = uSuckDistance * (0.35 + aBaseRadius * 0.02);
  r -= pullDistance;
  
  float currentAngle = aBaseAngle;
  if (r < 2.58) {
      float travelRange = aRespawnR - 2.58; 
      r = aRespawnR - mod((pullDistance - (aBaseRadius - 2.58)), max(travelRange, 0.1));
      currentAngle += aSeed * 100.0 * floor(pullDistance / max(travelRange, 0.1));
  }

  float omega = 0.52 + 1.35 / max(r, 0.45);
  currentAngle += uTime * omega + uSuckDistance * omega * 0.68;
  
  float x = cos(currentAngle) * r;
  float z = sin(currentAngle) * r;
  
  float wave = sin(currentAngle * 5.0 + uTime * 1.8 + aSeed) * 0.18 * (1.0 / max(r, 1.0));
  float y = wave + cos(currentAngle * 3.0 + uTime * 1.2 + aSeed * 2.0) * 0.08;
  
  vec3 pos = vec3(x, y, z);
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  
  // Gravitational Lensing (Einstein Ring effect)
  vec4 centerMv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec3 localView = mvPosition.xyz - centerMv.xyz;
  
  if (localView.z < 0.0) {
     float dXY = length(localView.xy);
     float R = 2.45; 
     float push = (R * R) / max(dXY, 0.01) * 0.45; 
     float falloff = smoothstep(-25.0, 0.0, localView.z);
     localView.xy += normalize(localView.xy + vec2(0.0001)) * push * falloff;
     mvPosition.xyz = centerMv.xyz + localView;
     mvPosition.z = max(mvPosition.z, centerMv.z + 0.1);
  }

  // ── DOPPLER BEAMING ────────────────────────────────────────────────────────
  // Calculate relative orbital velocity and its projection to the camera
  vec3 velDir = normalize(vec3(-z, 0.0, x));
  vec3 viewVel = (modelViewMatrix * vec4(velDir, 0.0)).xyz;
  vec3 viewDir = normalize(-mvPosition.xyz);
  
  float dopplerShift = dot(normalize(viewVel), viewDir);
  float beamInfluence = smoothstep(-1.0, 1.0, dopplerShift); // 0.0 receding to 1.0 approaching
  
  vec3 lColor = vColor;
  float boost = mix(0.15, 2.0, beamInfluence); // Mellow down brightness
  lColor *= boost;
  
  // White/Blue super-shift for the leading relativistic edge
  float blueShift = smoothstep(0.7, 1.0, beamInfluence) * 0.65; // Mellow blue
  lColor += vec3(0.2, 0.5, 0.8) * blueShift * boost;
  
  // Deep redshift for retreating edge
  float redShift = smoothstep(0.3, 0.0, beamInfluence) * 0.55;
  lColor += vec3(0.8, 0.1, 0.0) * redShift;
  
  vColor = min(lColor, vec3(1.8)); // HDR clamping to avoid blowout

  float d = -mvPosition.z;
  float s = size * uPointScale * (420.0 / max(d, 0.75));
  s *= mix(0.8, 1.3, beamInfluence); // Mellow size blooming
  
  gl_PointSize = clamp(s, 1.0, 128.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;
const DISK_POINT_FRAG = `
uniform float uAlphaMult;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float edge = smoothstep(1.0, 0.25, r2);
  // Base alpha is dynamically compensated if mobile particle counts are decimated
  gl_FragColor = vec4(vColor, 0.05 * uAlphaMult * edge);
}
`;

// ─── nebula canvas ───────────────────────────────────────────────────────────
function makeNebulaTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 360);
  g.addColorStop(0,    "rgba(40, 20, 80, 0.35)");
  g.addColorStop(0.35, "rgba(8, 12, 40, 0.20)");
  g.addColorStop(0.65, "rgba(2,  4, 12, 0.12)");
  g.addColorStop(1,    "rgba(0,  0,  0, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── radial‑blur / speed‑streak overlay (CSS canvas, 2‑D) ───────────────────
function makeSpeedCanvas() {
  const cvs = document.createElement("canvas");
  cvs.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;";
  return cvs;
}

function drawSpeedOverlay(
  cvs: HTMLCanvasElement,
  intensity: number,   // 0→1
  voidPull: number,    // 0→1 (near‑end black crush)
) {
  const W = cvs.width; const H = cvs.height;
  const ctx = cvs.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  if (intensity <= 0 && voidPull <= 0) return;

  const cx = W / 2; const cy = H / 2;
  const maxR = Math.max(1, Math.hypot(cx, cy));

  // ── radial streak lines (optimized: no gradients, no per-frame Math.random) ──
  // (Removed speed lines as per user request to avoid arcade/sci-fi visuals in favor of realism)

  // ── single speed ring (cheap) ───────────────────────────────────────────────
  if (intensity > 0.22) {
    const ca = (intensity - 0.22) / 0.78;
    const rr = (maxR * 0.22 + 20) * ca + maxR * 0.02;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = ca * 0.15 * (0.4 + voidPull * 0.6);
    ctx.strokeStyle = "rgba(80,200,255,1)";
    ctx.lineWidth = 1.2 + ca * 2.0;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ── centre bright hot-spot (approaching singularity) ─────────────────────
  if (intensity > 0.4) {
    const hot = (intensity - 0.4) / 0.6;
    // Photon ring / singularity corona flash right before darkness
    const hg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 280 * hot);
    
    // Core blueshifts fiercely as voidPull dominates, representing trapped ultra-highenergy photons
    const isBlue = voidPull > 0.2 ? 1.0 : 0.0;
    const shift = Math.pow(Math.min(1.0, voidPull * 2.0), 3.0);
    const gCol = 200 + shift * 55;
    const bCol = 80 + shift * 175;

    hg.addColorStop(0, `rgba(255,255,255,${hot * 0.9})`);
    hg.addColorStop(0.3, `rgba(254,${gCol},${bCol},${hot * 0.45})`);
    hg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(cx, cy, 280 * hot, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── terminal ambient plasma glow (final pull into the portal) ────────────────
  if (voidPull > 0) {
    ctx.fillStyle = `rgba(180, 210, 255, ${voidPull * 0.45})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ─── CSS blur helper ──────────────────────────────────────────────────────────
function setRendererBlur(el: HTMLCanvasElement, px: number) {
  // Avoid spamming style changes every frame (reduces GPU churn/lag)
  const anyEl = el as any;
  const last = typeof anyEl._lastBlurPx === "number" ? (anyEl._lastBlurPx as number) : -1;
  if (Math.abs(last - px) < 0.15) return;
  anyEl._lastBlurPx = px;
  el.style.filter = px > 0.25 ? `blur(${px}px)` : "";
}

export function BlackHoleScene({ stage, onEntered }: BlackHoleSceneProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const stageRef      = useRef(stage);
  const onEnteredRef  = useRef(onEntered);

  useEffect(() => { stageRef.current = stage; },      [stage]);
  useEffect(() => { onEnteredRef.current = onEntered; }, [onEntered]);

  useEffect(() => {
    if (!containerRef.current) return;

    // ── renderer ────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020208);
    scene.fog = new THREE.FogExp2(0x030510, 0.028);

    const camera = new THREE.PerspectiveCamera(
      55, window.innerWidth / Math.max(window.innerHeight, 1), 0.1, 500,
    );
    camera.position.set(0, 3, 15);

    const isMobile = window.innerWidth <= 768;

    const renderer = new THREE.WebGLRenderer({
      alpha: true, antialias: false, powerPreference: "high-performance",
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Hard cap standard mobile devices to 1.5 dpr to save massive shader pixel evaluation layout
    renderer.setPixelRatio(isMobile ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    containerRef.current.appendChild(renderer.domElement);

    // ── 2‑D speed overlay canvas ────────────────────────────────────────────
    const speedCvs = makeSpeedCanvas();
    containerRef.current.appendChild(speedCvs);
    const sizeOverlay = () => {
      speedCvs.width  = window.innerWidth;
      speedCvs.height = window.innerHeight;
    };
    sizeOverlay();

    // ── scene objects ────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.08));

    const horizon = new THREE.Mesh(
      new THREE.SphereGeometry(2.45, 72, 72),
      new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }),
    );
    scene.add(horizon);

    // (Yellow photon ring was physically removed as per request for pure geometry scaling)

    const palette = [
      new THREE.Color("#d65d0e"), new THREE.Color("#fe8019"),
      new THREE.Color("#fb4934"), new THREE.Color("#fabd2f"),
      new THREE.Color("#b16286"),
    ];

    // accretion disk — 8.5 MILLION points via GPU! True hyper-fluid density.
    // ── particle systems (Massively scaled back for Mobile devices) ──────
    const P_MULT = isMobile ? 0.08 : 1.0;
    const diskCount = Math.floor(8_500_000 * P_MULT);
    const R_DISK_MIN = 2.65;
    const R_DISK_MAX = 12.15;
    const dPos = new Float32Array(diskCount * 3);
    const dCol = new Float32Array(diskCount * 3);
    const dBaseR = new Float32Array(diskCount);
    const dBaseA = new Float32Array(diskCount);
    const dSeed = new Float32Array(diskCount);
    const dRespawnR = new Float32Array(diskCount);
    const dSize = new Float32Array(diskCount);
    for (let i = 0; i < diskCount; i++) {
      const u = Math.pow(Math.random(), 0.52);
      const r = R_DISK_MIN + u * (R_DISK_MAX - R_DISK_MIN);
      const a = Math.random() * Math.PI * 2;
      dPos[i*3] = 0; dPos[i*3+1] = 0; dPos[i*3+2] = 0;
      const c = palette[Math.floor(Math.random() * palette.length)];
      dCol[i*3]=c.r; dCol[i*3+1]=c.g; dCol[i*3+2]=c.b;
      dBaseR[i] = r;
      dBaseA[i] = a;
      dSeed[i] = Math.random() * Math.PI * 2;
      dRespawnR[i] = 9 + Math.random() * 7;
      const edge = (r - R_DISK_MIN) / (R_DISK_MAX - R_DISK_MIN);
      // Extremely tiny sizes to prevent 10M particles from blowing out the screen
      dSize[i] = THREE.MathUtils.lerp(0.006, 0.0006, Math.pow(edge, 0.95)); 
    }
    const diskGeo = new THREE.BufferGeometry();
    diskGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
    diskGeo.setAttribute("color",    new THREE.BufferAttribute(dCol, 3));
    diskGeo.setAttribute("aBaseRadius", new THREE.BufferAttribute(dBaseR, 1));
    diskGeo.setAttribute("aBaseAngle", new THREE.BufferAttribute(dBaseA, 1));
    diskGeo.setAttribute("aSeed", new THREE.BufferAttribute(dSeed, 1));
    diskGeo.setAttribute("aRespawnR", new THREE.BufferAttribute(dRespawnR, 1));
    diskGeo.setAttribute("size",     new THREE.BufferAttribute(dSize, 1));
    const diskMat = new THREE.ShaderMaterial({
      uniforms: { 
        uPointScale: { value: isMobile ? 1.4 : 1.05 }, // Slightly bigger dots on mobile to compensate for coverage
        uTime: { value: 0 },
        uSuckDistance: { value: 0 },
        uAlphaMult: { value: isMobile ? 5.0 : 1.0 } // Increases exposure 5x when particles drop to 8% density
      },
      vertexShader: DISK_POINT_VERT,
      fragmentShader: DISK_POINT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const disk = new THREE.Points(diskGeo, diskMat);
    scene.add(disk);

    // inner mist 
    const mistCount = Math.floor(1_500_000 * P_MULT);
    const mPos = new Float32Array(mistCount * 3);
    const mCol = new Float32Array(mistCount * 3);
    const mBaseR = new Float32Array(mistCount);
    const mBaseA = new Float32Array(mistCount);
    const mSeed = new Float32Array(mistCount);
    const mRespawnR = new Float32Array(mistCount);
    const mSize = new Float32Array(mistCount);
    for (let i = 0; i < mistCount; i++) {
      const r = 2.55 + Math.random() * 3.2;
      const a = Math.random() * Math.PI * 2;
      mPos[i*3] = 0; mPos[i*3+1] = 0; mPos[i*3+2] = 0;
      const c = palette[Math.floor(Math.random()*palette.length)];
      mCol[i*3]=c.r*1.1; mCol[i*3+1]=c.g*1.1; mCol[i*3+2]=c.b*1.1;
      mBaseR[i] = r;
      mBaseA[i] = a;
      mSeed[i] = Math.random() * Math.PI * 2;
      mRespawnR[i] = 4.5 + Math.random() * 2;
      mSize[i] = Math.random() * 0.004 + 0.001; // Scaled down for density
    }
    const mistGeo = new THREE.BufferGeometry();
    mistGeo.setAttribute("position", new THREE.BufferAttribute(mPos, 3));
    mistGeo.setAttribute("color",    new THREE.BufferAttribute(mCol, 3));
    mistGeo.setAttribute("aBaseRadius", new THREE.BufferAttribute(mBaseR, 1));
    mistGeo.setAttribute("aBaseAngle", new THREE.BufferAttribute(mBaseA, 1));
    mistGeo.setAttribute("aSeed", new THREE.BufferAttribute(mSeed, 1));
    mistGeo.setAttribute("aRespawnR", new THREE.BufferAttribute(mRespawnR, 1));
    mistGeo.setAttribute("size", new THREE.BufferAttribute(mSize, 1));
    // Re-use identical Material and Program to eliminate context switching and double shader compilation
    const mist = new THREE.Points(mistGeo, diskMat);
    scene.add(mist);

    // ── rotated plasma mist ring ─────────────────────────────────────────────
    const ringCount = Math.floor(100_000 * P_MULT);
    const rPos = new Float32Array(ringCount * 3);
    const rCol = new Float32Array(ringCount * 3);
    const rBaseR = new Float32Array(ringCount);
    const rBaseA = new Float32Array(ringCount);
    const rSeed = new Float32Array(ringCount);
    const rRespawnR = new Float32Array(ringCount);
    const rSize = new Float32Array(ringCount);
    for (let i = 0; i < ringCount; i++) {
      const r = 2.52 + Math.pow(Math.random(), 2) * 0.26; 
      const a = Math.random() * Math.PI * 2;
      rPos[i*3] = 0; rPos[i*3+1] = 0; rPos[i*3+2] = 0;
      const c = new THREE.Color().setHSL(0.08 + Math.random()*0.05, 0.9, 0.45 + Math.random()*0.2);
      rCol[i*3]=c.r*1.1; rCol[i*3+1]=c.g*1.1; rCol[i*3+2]=c.b*1.1;
      rBaseR[i] = r;
      rBaseA[i] = a;
      rSeed[i] = Math.random() * Math.PI * 2;
      rRespawnR[i] = r;
      rSize[i] = Math.random() * 0.005 + 0.002;
    }
    const ringGeo = new THREE.BufferGeometry();
    ringGeo.setAttribute("position", new THREE.BufferAttribute(rPos, 3));
    ringGeo.setAttribute("color",    new THREE.BufferAttribute(rCol, 3));
    ringGeo.setAttribute("aBaseRadius", new THREE.BufferAttribute(rBaseR, 1));
    ringGeo.setAttribute("aBaseAngle", new THREE.BufferAttribute(rBaseA, 1));
    ringGeo.setAttribute("aSeed", new THREE.BufferAttribute(rSeed, 1));
    ringGeo.setAttribute("aRespawnR", new THREE.BufferAttribute(rRespawnR, 1));
    ringGeo.setAttribute("size", new THREE.BufferAttribute(rSize, 1));
    const pRing = new THREE.Points(ringGeo, diskMat);
    pRing.rotation.x = 0.18;
    scene.add(pRing);

    // stars
    const starsTotal = Math.floor(26_000 * (isMobile ? 0.35 : 1.0));
    const sPos = new Float32Array(starsTotal * 3);
    const sCol = new Float32Array(starsTotal * 3);
    for (let i = 0; i < starsTotal; i++) {
      const r = 45 + Math.pow(Math.random(), 0.55) * 120;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      sPos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
      sPos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
      sPos[i*3+2] = r * Math.cos(phi);
      const warm = Math.random() > 0.55;
      const c = warm
        ? new THREE.Color().setHSL(0.08 + Math.random()*0.04, 0.35, 0.55 + Math.random()*0.25)
        : new THREE.Color().setHSL(0.58 + Math.random()*0.12, 0.25, 0.45 + Math.random()*0.35);
      sCol[i*3]=c.r; sCol[i*3+1]=c.g; sCol[i*3+2]=c.b;
    }
    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    starsGeo.setAttribute("color",    new THREE.BufferAttribute(sCol, 3));
    const starsMat = new THREE.PointsMaterial({
      size: 0.055, vertexColors: true, transparent: true, opacity: 0.92,
      sizeAttenuation: true, depthWrite: false,
    });
    const stars = new THREE.Points(starsGeo, starsMat);
    scene.add(stars);

    // nebula sky
    const nebulaTex = makeNebulaTexture();
    let nebula: THREE.Mesh | null = null;
    if (nebulaTex) {
      nebula = new THREE.Mesh(
        new THREE.SphereGeometry(180, 32, 32),
        new THREE.MeshBasicMaterial({
          map: nebulaTex, side: THREE.BackSide,
          transparent: true, opacity: 0.55,
          depthWrite: false, blending: THREE.AdditiveBlending,
        }),
      );
      scene.add(nebula);
    }

    // ── animation state ──────────────────────────────────────────────────────
    const timer = new THREE.Timer();
    if (typeof document !== "undefined") timer.connect(document);

    let rafId = 0;
    let hasEntered = false;
    let enterAccum = 0;
    let suckDistanceAccum = 0;

    // Interaction / shaking state
    let prevStage = stageRef.current;
    let enteringKick = 0; // 0→1 right after cross event horizon
    let touchNx = 0;      
    let touchNy = 0;
    let touchStrength = 0; 
    let mouseHover = 0;    
    let pointerActive = false;
    let pointerId: number | null = null;

    const animate = (timestamp: number) => {
      rafId = requestAnimationFrame(animate);
      timer.update(timestamp);

      const s = stageRef.current;
      if (s !== prevStage) {
        if (s === "entering") enteringKick = 1;
        prevStage = s;
      }
      // We no longer abort the WebGL render loop during pre-intro!
      // This forces the shader to compile instantly in the background, eliminating the massive lag spike when clicking 'initialize sequence'.
      if (s === "home") return; 

      const delta   = timer.getDelta();
      const elapsed = timer.getElapsed();
      // smooth decay so motion stays flowy
      touchStrength = Math.max(0, touchStrength - delta * 1.9);
      mouseHover    = Math.max(0, mouseHover - delta * 1.35);

      // ── passive orbit (intro) ──────────────────────────────────────────────
      stars.rotation.y -= delta * 0.012;
      stars.rotation.x -= delta * 0.004;

      // ── disk / mist physics ────────────────────────────────────────────────
      // Advanced GLSL GPU Shader replaces all independent CPU array evaluations!
      let suckMult = 1;
      if (s === "entering") {
        const t = Math.min(1, enterAccum / ENTER_SECONDS);
        suckMult = 1 + easeInCubic(t) * 18; 
      }
      suckDistanceAccum += delta * suckMult;

      diskMat.uniforms.uTime.value = elapsed;
      diskMat.uniforms.uSuckDistance.value = suckDistanceAccum;
      // mist utilizes the exact same diskMat instance natively!

      disk.rotation.y  += delta * 0.31;
      disk.rotation.z  += delta * 0.065;
      mist.rotation.y  -= delta * 0.48;
      mist.rotation.z  += delta * 0.10;
      if (nebula) nebula.rotation.y += delta * 0.003;
      pRing.rotation.y -= delta * 3.5;

      // ── camera / effects for entering ─────────────────────────────────────
      if (s === "entering") {
        enterAccum += delta;
        const t  = Math.min(1, enterAccum / ENTER_SECONDS);
        const e  = easeInOutQuint(t);
        const kickT = Math.max(0, 1 - t / 0.88);
        const kick  = enteringKick * kickT;

        // ── camera pull: smoother spiral + softer late snap ─────────────────
        const phase2 = Math.max(0, (t - 0.52) / 0.48);
        const snapE  = easeInOutCubic(phase2);

        // Dizzying vortex spin on the Z-axis (Tidal forces returning, but smoothly scaled)
        const rollAngle = easeInCubic(t / 0.9) * Math.PI * 12.0; 
        camera.up.set(Math.sin(rollAngle), Math.cos(rollAngle), 0);

        // Keplerian Spiral Dive
        const tz = easeInOutQuint(t);
        const plungeRadius = THREE.MathUtils.lerp(15, 0.18, easeOutQuart(tz));
        const orbitA = elapsed * 0.45 + Math.pow(t, 2.5) * Math.PI * 5.0; // Rapidly escalating orbit speed

        // Seamless bridge from the passive X=3.1/Z=15 viewing ellipse into the pure centered gravity well
        const xRadius = THREE.MathUtils.lerp(3.1, plungeRadius, e);
        const zRadius = THREE.MathUtils.lerp(15, plungeRadius, e);
        
        camera.position.x = Math.sin(orbitA) * xRadius;
        camera.position.y = THREE.MathUtils.lerp(2 + Math.cos(elapsed * 0.28) * 1.4, 0.05, e) + Math.cos(t * Math.PI * 3.6) * 0.42 * (1 - snapE);
        camera.position.z = Math.cos(orbitA) * zRadius;

        // The absolute mass of the singularity physically scales out directly into the viewport
        const horizonScale = 1.0 + Math.pow(t, 14.0) * 1.85;
        horizon.scale.setScalar(horizonScale);

        // ── Violent camera shake at the precipice ───────────────────────────
        const interact = Math.max(mouseHover, touchStrength);
        const shakeBase =
          kick * 0.038 +
          interact * 0.032 +
          Math.pow(t, 8.0) * 1.2; // Massive violent shaking right before the snap
        if (shakeBase > 0.00005) {
          const sx = Math.sin(elapsed * 7.1);
          const sy = Math.cos(elapsed * 8.4);
          camera.position.x += (sx * 0.11 + touchNx * 0.09) * shakeBase;
          camera.position.y += (sy * 0.10 + touchNy * 0.08) * shakeBase;
        }

        // ── Hyper FOV warp (Spaghettification suck effect) ─────────────────
        camera.fov = 55 + easeInCubic(t) * 115; // Ramps out to 170+ FOV drastically!
        camera.updateProjectionMatrix();

        camera.lookAt(0, 0, 0);

        // ── radial blur / speed overlay ─────────────────────────────────────
        // Make the “rush” peak earlier so the void snap is visible before
        // `onEntered` fires and the canvas fades out.
        const blurRamp = Math.max(0, Math.min(1, (t - 0.06) / 0.62));

        // void pull: align with longer ENTER_SECONDS
        const voidPull = Math.max(0, Math.min(1, (t - 0.68) / Math.max(1e-6, ENTER_TRIGGER - 0.68)));

        const intensity = easeInOutCubic(blurRamp) * (0.62 + 0.48 * voidPull);

        drawSpeedOverlay(speedCvs, intensity, Math.pow(voidPull, 1.15));

        // CSS blur — capped so transitions stay smooth (heavy blur = jank)
        const cssBlur = Math.min(7.2, intensity * 6.2 * (0.38 + 0.62 * voidPull));
        setRendererBlur(renderer.domElement, cssBlur);

        renderer.toneMappingExposure = 1.05 + intensity * 1.55 + voidPull * 0.55;

        if (t >= ENTER_TRIGGER && !hasEntered) {
          hasEntered = true;
          onEnteredRef.current();
        }
      } else {
        // ── passive orbit (intro phase) ────────────────────────────────────
        enterAccum = 0; hasEntered = false;
        camera.position.x = Math.sin(elapsed * 0.45) * 3.1;
        camera.position.y = 2 + Math.cos(elapsed * 0.28) * 1.4;
        camera.position.z = 15;
        camera.up.set(0, 1, 0); // Restore stable Z axis
        horizon.scale.setScalar(1.0); // True physics bounds
        camera.fov = 55;
        camera.updateProjectionMatrix();
        camera.lookAt(0, 0, 0);
        renderer.toneMappingExposure = 1.05;
        drawSpeedOverlay(speedCvs, 0, 0);
        setRendererBlur(renderer.domElement, 0);
      }

      renderer.render(scene, camera);
    };

    rafId = requestAnimationFrame(animate);

    const handleResize = () => {
      camera.aspect = window.innerWidth / Math.max(window.innerHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      sizeOverlay();
    };
    window.addEventListener("resize", handleResize);

    const setPointerFromClient = (e: PointerEvent) => {
      const nx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      const ny = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
      const near = Math.max(0, 1 - Math.hypot(nx, ny) / 0.85);
      touchNx = nx;
      touchNy = ny;
      // mouse “pointing” — no click required
      if (e.pointerType === "mouse") {
        mouseHover = Math.max(mouseHover, near * 0.58);
      }
      if (pointerActive && (pointerId === null || e.pointerId === pointerId)) {
        touchStrength = Math.max(touchStrength, near * 1.18);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (stageRef.current !== "intro" && stageRef.current !== "entering") return;
      pointerActive = true;
      pointerId = e.pointerId;
      setPointerFromClient(e);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (stageRef.current !== "intro" && stageRef.current !== "entering") return;
      setPointerFromClient(e);
    };

    const onPointerUpOrCancel = (e: PointerEvent) => {
      if (pointerId !== null && e.pointerId !== pointerId) return;
      pointerActive = false;
      pointerId = null;
    };

    renderer.domElement.style.touchAction = "none";
    containerRef.current.addEventListener("pointerdown", onPointerDown, { passive: true });
    containerRef.current.addEventListener("pointermove", onPointerMove, { passive: true });
    containerRef.current.addEventListener("pointerup", onPointerUpOrCancel, { passive: true });
    containerRef.current.addEventListener("pointercancel", onPointerUpOrCancel, { passive: true });

    return () => {
      window.removeEventListener("resize", handleResize);
      containerRef.current?.removeEventListener("pointerdown", onPointerDown);
      containerRef.current?.removeEventListener("pointermove", onPointerMove);
      containerRef.current?.removeEventListener("pointerup", onPointerUpOrCancel);
      containerRef.current?.removeEventListener("pointercancel", onPointerUpOrCancel);
      cancelAnimationFrame(rafId);
      timer.dispose();
      if (nebulaTex) nebulaTex.dispose();
      // dispose geometries / materials
      [diskGeo, mistGeo, starsGeo, ringGeo].forEach(g => g.dispose());
      [diskMat, starsMat].forEach(m => m.dispose());
      horizon.geometry.dispose(); (horizon.material as THREE.Material).dispose();
      if (nebula) { nebula.geometry.dispose(); (nebula.material as THREE.Material).dispose(); }
      renderer.dispose();
      renderer.domElement.remove();
      speedCvs.remove();
    };
  }, []);

  return (
    // pointer events are enabled for touch-driven particle pushing/shaking
    // (no cursor-pointer styling; keep normal cursor)
    <div ref={containerRef} className="relative h-full w-full cursor-default" />
  );
}

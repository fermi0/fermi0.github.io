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

// ─── Constants ──────────────────────────────────────────────────────────────
const ENTER_SECONDS = 12;
const ENTER_TRIGGER = 0.95;

// ─── Shaders ─────────────────────────────────────────────────────────────────

const DISK_VERT = `
attribute float size;
attribute vec3 color;
attribute float aAngle;
attribute float aRadius;
attribute float aSpeed;
attribute float aYOffset;
attribute float aSeed;

varying vec3 vColor;
varying float vOpacity;

uniform float uTime;
uniform float uSuck;
uniform float uPixelRatio;

void main() {
    float r = aRadius;
    float angle = aAngle + uTime * aSpeed * 1.5;
    
    float suckPower = pow(uSuck, 3.0);
    r = mix(r, 0.5, suckPower * 0.98);
    angle += suckPower * 35.0 * (1.0 / max(r - 3.7, 0.1));

    float clusterNoise = sin(angle * 7.0 + aSeed + uTime * 1.2) * cos(r * 4.0 - uTime * 0.8);
    clusterNoise += sin(angle * 14.0 + aSeed * 2.0 - uTime) * 0.18;
    r += clusterNoise * 0.35; 
    
    // Massive 3D Volumetric Thickness
    float flare = pow(max(r - 3.6, 0.0), 1.3) * 0.22; 
    float y = aYOffset * max(flare, 0.05);
    
    y += sin(angle * 2.0 + uTime * 0.3) * 0.35 * (r / 8.0);

    vec3 pos = vec3(cos(angle) * r, y, sin(angle) * r);
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float d = length(mvPosition.xyz);
    
    float rs = 4.2; 
    vec3 screenPos = mvPosition.xyz;
    if (screenPos.z < 0.0) {
        float distToCenterXY = length(screenPos.xy);
        float pull = (rs * rs * 3.8) / max(distToCenterXY, 0.1);
        screenPos.xy += normalize(screenPos.xy) * pull * smoothstep(0.0, -20.0, screenPos.z);
        mvPosition.xyz = screenPos;
        mvPosition.z = max(mvPosition.z, 0.1); 
    }

    vec3 vel = normalize(vec3(-sin(angle), 0.0, cos(angle)));
    vec3 viewDir = normalize(-mvPosition.xyz);
    float doppler = dot(vel, viewDir);
    
    vColor = color;
    float blueShift = smoothstep(0.2, 1.2, doppler);
    vColor = mix(vColor, vec3(0.55, 0.8, 1.0), blueShift * 0.7);
    vColor += vec3(0.15, 0.35, 1.0) * pow(blueShift, 3.0) * 1.5;
    
    float redShift = smoothstep(-0.2, -1.0, doppler);
    vColor = mix(vColor, vec3(0.65, 0.1, 0.0), redShift * 0.8);
    
    float beaming = pow(max(1.0 + doppler * 0.8, 0.1), 3.0);
    
    vOpacity = smoothstep(3.5, 4.2, r) * smoothstep(22.0, 16.0, r); 
    vOpacity *= beaming;
    vOpacity *= (1.0 + max(0.0, clusterNoise) * 1.1);
    vOpacity *= (1.0 - suckPower);

    float pointSize = size * uPixelRatio * (750.0 / max(d, 1.0));
    pointSize *= mix(0.5, 1.4, smoothstep(-0.5, 0.8, doppler)); 
    
    gl_PointSize = clamp(pointSize, 1.0, 180.0);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const DISK_FRAG = `
varying vec3 vColor;
varying float vOpacity;

void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r2 = dot(c, c);
    if (r2 > 0.25) discard;
    
    float core = exp(-r2 * 22.0);
    float glow = smoothstep(0.3, 0.0, r2) * 0.6;
    
    float finalAlpha = (core + glow) * vOpacity;
    vec3 hdrColor = vColor * min(finalAlpha * 2.0, 1.4);
    gl_FragColor = vec4(hdrColor, finalAlpha * 0.85);
}
`;

const STARS_VERT = `
attribute float size;
attribute vec3 color;

varying vec3 vColor;
varying float vOpacity;

uniform float uTime;
uniform float uSuck;
uniform float uWarpSpeed; 
uniform float uPixelRatio;

void main() {
    float suckPower = pow(uSuck, 2.0);
    vec3 origPos = position;
    float distToCenter = length(origPos);
    
    float drag = suckPower * 45.0 * (1.0 / max(distToCenter, 1.0));
    float angle = atan(origPos.z, origPos.x); // XZ plane
    angle += drag;
    float rXZ = length(origPos.xz);
    vec3 pos = vec3(cos(angle) * rXZ, origPos.y, sin(angle) * rXZ);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vec3 screenPos = mvPosition.xyz;
    
    float orbitalDoppler = dot(normalize(vec3(-sin(angle), 0.0, cos(angle))), normalize(-screenPos)) * min(drag * 6.0, 1.0); 
    float totalDoppler = orbitalDoppler + uWarpSpeed * 4.0;
    
    vec3 outColor = color;
    
    if (totalDoppler > 0.0) {
        outColor = mix(outColor, vec3(0.9, 0.95, 1.0), smoothstep(0.0, 1.0, totalDoppler));
        outColor = mix(outColor, vec3(0.15, 0.45, 1.0), smoothstep(1.0, 2.5, totalDoppler));
        outColor = mix(outColor, vec3(0.05, 0.05, 0.8), smoothstep(2.5, 4.0, totalDoppler));
    } else {
        outColor = mix(outColor, vec3(1.0, 0.1, 0.0), smoothstep(0.0, -1.5, totalDoppler));
        outColor = mix(outColor, vec3(0.1, 0.05, 0.0), smoothstep(-1.5, -3.0, totalDoppler));
    }
    
    vColor = outColor;
    float d = length(screenPos.xy);
    float rs = 5.2; 
    float lens = (rs * rs * 2.5) / max(d, 0.1); 
    mvPosition.xy += normalize(screenPos.xy) * lens * (1.0 + suckPower * 85.0);
    
    vOpacity = smoothstep(0.0, 1.0, size) * (1.0 - pow(uSuck, 3.0));
    
    // Slight aberration push (no point-stretching)
    float aberration = uWarpSpeed * max(0.0, 1.0 - (d / 40.0));
    vOpacity *= 1.0 + aberration * 2.0; 
    
    float pointSize = size * uPixelRatio * (600.0 / max(length(mvPosition.xyz), 1.0));
    gl_PointSize = clamp(pointSize, 0.5, 45.0);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const STARS_FRAG = `
varying vec3 vColor;
varying float vOpacity;

void main() {
    float dist = length(gl_PointCoord - 0.5);
    if (dist > 0.5) discard;
    float intensity = exp(-dist * dist * 35.0) + smoothstep(0.5, 0.0, dist) * 0.18;
    gl_FragColor = vec4(vColor, min(vOpacity * intensity * 1.2, 0.95));
}
`;

// ─── Star Trek "Volumetric Plasma Haze" Warp Bubble ─────────────────────────
// This entirely replaces discrete line streaks with a stunning volumetric mist boundary
const WARP_BUBBLE_VERT = `
varying vec3 vLocalPos;
varying float vZNorm;

void main() {
    vLocalPos = position; // local sphere coords from -1 to 1
    vZNorm = position.z;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const WARP_BUBBLE_FRAG = `
varying vec3 vLocalPos;
varying float vZNorm;

uniform float uTime;
uniform float uWarpSpeed;

// FAST 3D NOISE ALGORITHM FOR VOLUMETRIC HASHING
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) { 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; 
  vec3 x3 = x0 - D.yyy;      
  i = mod289(i); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
  float n_ = 0.142857142857; 
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}
float fbm3(vec3 x) {
    float v = 0.0; float a = 0.5; vec3 shift = vec3(100);
    for (int i = 0; i < 4; ++i) {
        v += a * snoise(x);
        x = x * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

void main() {
    if (uWarpSpeed < 0.001) discard; // Strict GPU saver
    
    // Front Bow-Shock boundary is vZNorm = -1.0. Back tail is vZNorm = 1.0
    // We smoothstep tightly against the front to create the bright dome
    float bowShock = smoothstep(-0.6, -1.0, vZNorm);
    
    // Extreme Z stretch mapping to produce long volumetric threads rather than circular clouds
    float zCoord = vZNorm * 12.0; 
    
    // Volumetric Plasma Haze (Base rolling clouds)
    vec3 hazeCoord = vec3(vLocalPos.x * 3.0, vLocalPos.y * 3.0, zCoord - uTime * 8.0);
    float haze = fbm3(hazeCoord) * 0.5 + 0.5;
    
    // Vibrating Plasma Threads (High frequency, radically stretched in Z)
    vec3 threadCoord = vec3(vLocalPos.x * 8.0, vLocalPos.y * 8.0, zCoord * 0.05 - uTime * 45.0);
    float thread1 = fbm3(threadCoord);
    
    vec3 threadCoord2 = vec3(vLocalPos.x * 12.0, vLocalPos.y * 12.0, zCoord * 0.02 - uTime * 60.0);
    float thread2 = fbm3(threadCoord2);
    
    // Intersection of threads creates the pulsing jitter weave
    float threads = pow(max(0.0, thread1 * thread2 * 2.5), 1.2);
    
    // ── Star Trek Warp Color Palette ─────────────────────────────
    vec3 shockWhite = vec3(1.0, 0.98, 0.95);
    vec3 electricCyan = vec3(0.0, 0.85, 1.0);
    vec3 deepSapphire = vec3(0.05, 0.1, 0.6);
    vec3 magentaAberration = vec3(0.8, 0.0, 0.4); // Spectral edge rainbow

    // Base color shift from deep sapphire to electric cyan
    vec3 color = mix(deepSapphire, electricCyan, haze + threads * 0.5);
    
    // Mix in the aberration (Rainbow Halo at edges of screen / periphery)
    // Distance from center radially
    float periphery = length(vLocalPos.xy);
    color = mix(color, magentaAberration, smoothstep(0.7, 1.0, periphery) * uWarpSpeed);
    
    // Explode into pure blistering white right at the front bow shock boundary
    color = mix(color, shockWhite, bowShock + (threads * bowShock * 2.0));
    
    // Opacity: Solid at the bow shock, fading out into a gas trailing into the rear
    float alpha = smoothstep(0.8, -0.5, vZNorm);
    
    // Overall Warp State Opacity
    float warpFade = smoothstep(0.0, 0.3, uWarpSpeed);
    
    // Composite HDR intensity
    float intensity = haze * 0.6 + threads * 1.5 + bowShock * 2.5;
    
    gl_FragColor = vec4(color * intensity * 1.8, alpha * intensity * warpFade * min(uWarpSpeed, 1.0));
}
`;


export function BlackHoleScene({ stage, onEntered }: BlackHoleSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef(stage);
  const onEnteredRef = useRef(onEntered);

  useEffect(() => { stageRef.current = stage; }, [stage]);
  useEffect(() => { onEnteredRef.current = onEntered; }, [onEntered]);

  useEffect(() => {
    if (!containerRef.current) return;

    // ── Setup ────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010001);
    scene.fog = new THREE.FogExp2(0x010001, 0.00065);

    const camera = new THREE.PerspectiveCamera(
      58, window.innerWidth / window.innerHeight, 0.1, 8000
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    containerRef.current.appendChild(renderer.domElement);

    scene.add(camera);

    // ── Volumetric Mist Plasma Bubble ───────────────────────────────────────
    // Completely replaces streak lines with a massive inner-facing spherical dome containing the fog
    const warpBubbleGeo = new THREE.SphereGeometry(1.0, 64, 64);
    
    const warpBubbleMat = new THREE.ShaderMaterial({
      vertexShader: WARP_BUBBLE_VERT,
      fragmentShader: WARP_BUBBLE_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide, // Renders the inner walls of the bubble
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWarpSpeed: { value: 0 },
      }
    });

    const warpBubble = new THREE.Mesh(warpBubbleGeo, warpBubbleMat);
    // Center it physically forward on the camera so the camera sits near the tail
    warpBubble.position.set(0, 0, -120); 
    // Squashing the sphere into a massive 500-unit long pill forming the warp tunnel
    warpBubble.scale.set(35, 35, 250); 
    camera.add(warpBubble); 

    // ── Accretion Disk (Sgr A* Supermassive core) ────────────────────────────
    const diskCount = 200000;
    const diskGeo = new THREE.BufferGeometry();
    const dPos = new Float32Array(diskCount * 3);
    const dCol = new Float32Array(diskCount * 3);
    const dSize = new Float32Array(diskCount);
    const dAngle = new Float32Array(diskCount);
    const dRadii = new Float32Array(diskCount);
    const dSpeed = new Float32Array(diskCount);
    const dYOffset = new Float32Array(diskCount);
    const dSeed = new Float32Array(diskCount);

    const palette = [
      new THREE.Color("#ff9900"), new THREE.Color("#ff2200"),
      new THREE.Color("#ffffff"), new THREE.Color("#ffcc66"),
      new THREE.Color("#1a0300"), 
    ];

    for (let i = 0; i < diskCount; i++) {
        const u = Math.pow(Math.random(), 2.5);
        const r = 4.0 + u * 18.0; 
        const angle = Math.random() * Math.PI * 2;

        dRadii[i] = r;
        dAngle[i] = angle;
        dSpeed[i] = 3.5 * Math.pow(r, -1.2); 
        
        const u1 = Math.random() + 0.0001; 
        const u2 = Math.random();
        const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        dYOffset[i] = (z0 * 0.8) + ((Math.random() - 0.5) * 0.5); 
        
        dSeed[i] = Math.random() * 100.0;

        let col;
        if (r < 4.6) col = palette[2]; 
        else if (r < 6.5) col = Math.random() > 0.5 ? palette[2] : palette[3]; 
        else if (r < 10.0) col = palette[0]; 
        else col = palette[1]; 
        if (Math.random() > 0.85) col = palette[4];

        dCol[i*3] = col.r; dCol[i*3+1] = col.g; dCol[i*3+2] = col.b;
        dSize[i] = (1.0 + Math.random() * 4.5) * (col === palette[4] ? 2.8 : 1.0) * (1.1 / Math.pow(r, 0.4));
    }

    diskGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
    diskGeo.setAttribute("color", new THREE.BufferAttribute(dCol, 3));
    diskGeo.setAttribute("size", new THREE.BufferAttribute(dSize, 1));
    diskGeo.setAttribute("aAngle", new THREE.BufferAttribute(dAngle, 1));
    diskGeo.setAttribute("aRadius", new THREE.BufferAttribute(dRadii, 1));
    diskGeo.setAttribute("aSpeed", new THREE.BufferAttribute(dSpeed, 1));
    diskGeo.setAttribute("aYOffset", new THREE.BufferAttribute(dYOffset, 1));
    diskGeo.setAttribute("aSeed", new THREE.BufferAttribute(dSeed, 1));

    const diskMat = new THREE.ShaderMaterial({
      vertexShader: DISK_VERT,
      fragmentShader: DISK_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSuck: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
      }
    });

    const disk = new THREE.Points(diskGeo, diskMat);
    scene.add(disk);

    // ── Event Horizon Shadow ──────────────────────────────────────────────────
    const horizonGeo = new THREE.SphereGeometry(3.8, 64, 64);
    const horizonMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const horizon = new THREE.Mesh(horizonGeo, horizonMat);
    scene.add(horizon);

    // ── Milky Way Galaxy Background (Bulge, Disc, Halo) ─────────────────────
    const starCount = 35000;
    const starsGeo = new THREE.BufferGeometry();
    const sPos = new Float32Array(starCount * 3);
    const sCol = new Float32Array(starCount * 3);
    const sSize = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
      let r, theta, y;
      const type = Math.random();
      
      if (type < 0.45) {
        r = 15.0 + Math.pow(Math.random(), 2.0) * 120.0;
        theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        sPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        sPos[i * 3 + 1] = (r * Math.sin(phi) * Math.sin(theta)) * 0.7; 
        sPos[i * 3 + 2] = r * Math.cos(phi);
        
        const col = new THREE.Color().setHSL(0.1 + Math.random()*0.05, 0.65, 0.35 + Math.random()*0.35);
        sCol[i*3] = col.r; sCol[i*3+1] = col.g; sCol[i*3+2] = col.b;
      } else if (type < 0.9) {
        r = 40.0 + Math.pow(Math.random(), 0.5) * 800.0;
        theta = Math.random() * Math.PI * 2;
        sPos[i * 3] = r * Math.cos(theta);
        y = (Math.random() - 0.5) * (Math.random() + Math.random()) * 35.0 * (1.0 + r/100.0);
        sPos[i * 3 + 1] = y;
        sPos[i * 3 + 2] = r * Math.sin(theta);
        
        const isBlue = Math.random() > 0.4;
        const col = isBlue 
            ? new THREE.Color().setHSL(0.6 + Math.random()*0.1, 0.85, 0.4 + Math.random()*0.4)
            : new THREE.Color().setHSL(0.05 + Math.random()*0.08, 0.8, 0.35 + Math.random()*0.3);
        sCol[i*3] = col.r; sCol[i*3+1] = col.g; sCol[i*3+2] = col.b;
      } else {
        r = 200.0 + Math.random() * 1200.0;
        theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        sPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        sPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        sPos[i * 3 + 2] = r * Math.cos(phi);
        
        sCol[i*3] = 0.8; sCol[i*3+1] = 0.8; sCol[i*3+2] = 0.9;
      }
      
      sSize[i] = Math.random() * 2.8 + 0.5;
      if (Math.random() > 0.97) sSize[i] *= 4.0;
    }

    starsGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    starsGeo.setAttribute("color", new THREE.BufferAttribute(sCol, 3));
    starsGeo.setAttribute("size", new THREE.BufferAttribute(sSize, 1));

    const starsMat = new THREE.ShaderMaterial({
      vertexShader: STARS_VERT,
      fragmentShader: STARS_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSuck: { value: 0 },
        uWarpSpeed: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
      }
    });

    const stars = new THREE.Points(starsGeo, starsMat);
    scene.add(stars);

    // ── Animation & Galactic Journey ─────────────────────────────────────────
    let startTime = Date.now();
    let enterStartTime = 0;
    let hasEntered = false;

    const startR = 600;
    const startY = 180;
    
    const midR = 30; 
    const midY = 6.5; 
    
    const endR = 0.05;

    const animate = () => {
      const now = Date.now();
      const elapsed = (now - startTime) / 1000;

      diskMat.uniforms.uTime.value = elapsed;
      starsMat.uniforms.uTime.value = elapsed;
      warpBubbleMat.uniforms.uTime.value = elapsed;

      const s = stageRef.current;
      const introOrbit = elapsed * 0.03;

      if (s === "entering") {
        if (enterStartTime === 0) enterStartTime = now;
        const enterElapsed = (now - enterStartTime) / 1000;
        const t = Math.min(1, enterElapsed / ENTER_SECONDS);
        
        const warpPhase = Math.min(1.0, t / 0.45);
        const warpEased = 1.0 - Math.pow(1.0 - warpPhase, 4.0);
        const warpSpeed = Math.sin(warpPhase * Math.PI) * 1.5; 
        
        const plungePhase = Math.max(0.0, (t - 0.45) / 0.55);
        const plungeEased = Math.pow(plungePhase, 3.0);

        starsMat.uniforms.uWarpSpeed.value = warpSpeed;
        warpBubbleMat.uniforms.uWarpSpeed.value = warpSpeed;

        const suckVal = Math.pow(plungePhase, 2.0); 
        diskMat.uniforms.uSuck.value = suckVal;
        starsMat.uniforms.uSuck.value = suckVal;

        if (warpPhase < 1.0) {
            const currentR = THREE.MathUtils.lerp(startR, midR, warpEased);
            camera.position.x = Math.cos(introOrbit) * currentR;
            camera.position.y = THREE.MathUtils.lerp(startY, midY, warpEased);
            camera.position.z = Math.sin(introOrbit) * currentR;
            camera.lookAt(0, 0, 0);
            
            camera.fov = 58 + warpSpeed * 12.0;
            camera.updateProjectionMatrix();
        } else {
            const currentR = THREE.MathUtils.lerp(midR, endR, plungeEased);
            const spinAngle = plungePhase * Math.PI * 8.0; 
            const orbitOrbit = introOrbit + Math.pow(plungePhase, 3.0) * Math.PI * 4.0;
            
            camera.position.x = Math.cos(orbitOrbit) * currentR;
            camera.position.y = Math.sin(plungePhase * Math.PI) * midY * (1 - plungePhase);
            camera.position.z = Math.sin(orbitOrbit) * currentR;

            camera.up.set(Math.sin(spinAngle), Math.cos(spinAngle), 0);
            
            camera.fov = 58 + Math.pow(plungePhase, 3.0) * 125;
            camera.updateProjectionMatrix();
            camera.lookAt(0, 0, 0);
        }

        horizon.scale.setScalar(1.0 + Math.pow(plungePhase, 8.0) * 35.0);
        renderer.toneMappingExposure = Math.max(0.0, 1.05 - Math.pow(plungePhase, 4.0) * 1.05);

        if (t >= ENTER_TRIGGER && !hasEntered) {
          hasEntered = true;
          onEnteredRef.current();
        }
      } else if (s === "expanding" || s === "greeting") {
        horizon.scale.setScalar(50.0);
        renderer.toneMappingExposure = 0.0; 
        
        diskMat.uniforms.uSuck.value = 1.0;
        starsMat.uniforms.uSuck.value = 1.0;
        warpBubbleMat.uniforms.uWarpSpeed.value = 0;
      } else {
        enterStartTime = 0;
        
        camera.position.x = Math.cos(introOrbit) * startR;
        camera.position.y = startY + Math.sin(elapsed * 0.05) * 20;
        camera.position.z = Math.sin(introOrbit) * startR;
        camera.up.set(0, 1, 0);
        camera.lookAt(0, 0, 0);
        camera.fov = 58;
        camera.updateProjectionMatrix();

        diskMat.uniforms.uSuck.value = 0;
        starsMat.uniforms.uSuck.value = 0;
        warpBubbleMat.uniforms.uWarpSpeed.value = 0;
        horizon.scale.setScalar(1);
        renderer.toneMappingExposure = 1.05;
      }

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("resize", handleResize);
    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      diskGeo.dispose();
      diskMat.dispose();
      horizonGeo.dispose();
      horizonMat.dispose();
      starsGeo.dispose();
      starsMat.dispose();
      warpBubbleGeo.dispose();
      warpBubbleMat.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}

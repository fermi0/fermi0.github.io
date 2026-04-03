"use client";

import { motion, useAnimation, useMotionValue, useTransform } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BlackHoleScene, type BlackHoleStage } from "@/components/blackhole/BlackHoleScene";

type BlackHoleIntroGateProps = {
  children: ReactNode;
};

export default function BlackHoleIntroGate({ children }: BlackHoleIntroGateProps) {
  const pathname = usePathname();
  const [stage, setStage] = useState<BlackHoleStage>("pre-intro");

  const handleStart       = () => setStage("intro");
  const handleEnter       = () => setStage("entering");
  const handleEnteredBlackHole = () => setStage("expanding");

  useEffect(() => {
    if (stage === "expanding") {
      const t = setTimeout(() => setStage("greeting"), 2600);
      return () => clearTimeout(t);
    }
    if (stage === "greeting") {
      const t = setTimeout(() => setStage("home"), 2800);
      return () => clearTimeout(t);
    }
  }, [stage]);

  const isRising = stage === "expanding" || stage === "greeting" || stage === "home";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#1d2021] font-sans text-[#ebdbb2] selection:bg-[#fabd2f] selection:text-[#1d2021]">

      {/* ── standby screen ─────────────────────────────────────────────────── */}
      <motion.div
        key="pre-intro"
        initial={{ opacity: 1, y: 0 }}
        animate={{
          opacity: stage === "pre-intro" ? 1 : 0,
          y: stage === "pre-intro" ? 0 : -20,
        }}
        transition={{ duration: 0.9, ease: "easeInOut" }}
        style={{ pointerEvents: stage === "pre-intro" ? "auto" : "none" }}
        className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-8 bg-[#1d2021]"
      >
        <h2 className="text-2xl font-light tracking-[0.2em] text-[#a89984] uppercase">
          System standby
        </h2>
        <button
          type="button"
          onClick={handleStart}
          className="rounded-full border border-[#504945] px-8 py-3 text-sm tracking-[0.35em] text-[#ebdbb2] uppercase transition-all duration-300 hover:border-[#fe8019] hover:bg-[#fe8019]/10 hover:text-[#fe8019]"
        >
          Initialize sequence
        </button>
      </motion.div>

      {/* ── 3-D black hole canvas ───────────────────────────────────────────── */}
      <motion.div
        className="absolute inset-0 z-0 bg-black"
        initial={{ opacity: 0, scale: 1 }}
        animate={{
          opacity: stage === "intro" || stage === "entering" ? 1 : 0,
          scale:   stage === "intro" || stage === "entering" ? 1 : 1.12,
        }}
        transition={{ 
          duration: (stage === "expanding" || stage === "greeting" || stage === "home") ? 3.2 : 1.5,
          ease: "easeOut"
        }}
        style={{
          pointerEvents: stage === "intro" || stage === "entering" ? "auto" : "none",
        }}
      >
        <BlackHoleScene stage={stage} onEntered={handleEnteredBlackHole} />
      </motion.div>

      {/* ── "cross event horizon" button ────────────────────────────────────── */}
      <motion.div
        key="intro-controls"
        initial={{ opacity: 0, y: 24 }}
        animate={{
          opacity: stage === "intro" ? 1 : 0,
          y: stage === "intro" ? 0 : 24,
          scale: stage === "intro" ? 1 : 0.96,
        }}
        transition={{ delay: stage === "intro" ? 0.9 : 0, duration: 0.9 }}
        style={{ pointerEvents: stage === "intro" ? "auto" : "none" }}
        className="absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-4"
      >
        <p className="text-sm tracking-[0.35em] text-[#a89984] uppercase">
          The void awaits
        </p>
        <button
          type="button"
          onClick={handleEnter}
          className="group relative flex items-center gap-3 overflow-hidden rounded-full border border-[#d65d0e]/45 bg-transparent px-7 py-3 text-sm font-semibold tracking-[0.2em] text-[#fe8019] uppercase transition hover:border-[#fe8019] hover:shadow-[0_0_28px_rgba(254,128,25,0.35)]"
        >
          <span className="absolute inset-0 translate-y-full bg-[#d65d0e]/15 transition-transform duration-300 ease-out group-hover:translate-y-0" />
          <span className="relative z-10 inline-block transition-transform duration-500 group-hover:rotate-90">◎</span>
          <span className="relative z-10">Cross event horizon</span>
        </button>
      </motion.div>

      {/* ── RISING PANEL — full-page emergence ──────────────────────────────── */}
      <motion.div
        key="emerge"
        className="absolute inset-0 z-20 flex min-h-screen flex-col"
        initial={{ clipPath: "circle(0% at 50% 50%)", opacity: 0 }}
        animate={{
          clipPath: isRising ? "circle(150% at 50% 50%)" : "circle(0% at 50% 50%)",
          opacity:  isRising ? 1 : 0,
        }}
        transition={{
          clipPath: { duration: 2.6, ease: [0.16, 1, 0.3, 1] }, // spring-ish ease
          opacity:  { duration: 0.6, ease: "easeOut" },
        }}
        style={{ pointerEvents: isRising ? "auto" : "none" }}
      >
        {/* ── layered background — buttery Gruvbox warm dark ────────────────── */}
        {/* base */}
        <div className="pointer-events-none absolute inset-0 bg-[#1d2021]" />

        {/* warm amber vignette — fades in after greeting */}
        <motion.div
          className="pointer-events-none absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: stage === "home" ? 1 : 0 }}
          transition={{ duration: 1.8, ease: "easeInOut", delay: 0.4 }}
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 45%, rgba(214,93,14,0.10) 0%, rgba(29,32,33,0) 70%)",
          }}
        />

        {/* subtle scanline texture overlay — depth & richness */}
        <motion.div
          className="pointer-events-none absolute inset-0 mix-blend-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: stage === "home" ? 0.04 : 0 }}
          transition={{ duration: 2.2, ease: "easeInOut", delay: 0.6 }}
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(251,241,199,0.5) 0px, rgba(251,241,199,0.5) 1px, transparent 1px, transparent 3px)",
          }}
        />

        {/* The 3D Canvas itself now natively cross-fades backwards smoothly. No artificial white mask is needed to hide glitching. */}

        {/* ── "Hi" greeting ─────────────────────────────────────────────────── */}
        <motion.div
          key="greeting-text"
          initial={{ opacity: 0, scale: 0.94, filter: "blur(12px)" }}
          animate={{
            opacity: stage === "greeting" ? 1 : 0,
            scale:   stage === "greeting" ? 1 : 1.04,
            filter:  stage === "greeting" ? "blur(0px)" : "blur(12px)",
          }}
          transition={{ duration: 1.1, ease: [0.25, 1, 0.5, 1] }}
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <h2 className="font-sans text-6xl font-extralight tracking-wider text-[#fbf1c7]/90 md:text-8xl"
              style={{ textShadow: "0 0 35px rgba(180,210,255,0.25)" }}>
            Hi
          </h2>
        </motion.div>

        {/* ── home interface ─────────────────────────────────────────────────── */}
        <motion.div
          key="home-interface"
          initial={{ opacity: 0, y: 40, filter: "blur(8px)" }}
          animate={{
            opacity: stage === "home" ? 1 : 0,
            y:       stage === "home" ? 0 : 40,
            filter:  stage === "home" ? "blur(0px)" : "blur(8px)",
          }}
          transition={{
            opacity: { duration: 1.6, ease: [0.25, 1, 0.5, 1], delay: 0.3 },
            y:       { duration: 1.6, ease: [0.25, 1, 0.5, 1], delay: 0.3 },
            filter:  { duration: 1.2, ease: "easeOut",          delay: 0.3 },
          }}
          style={{ pointerEvents: stage === "home" ? "auto" : "none" }}
          className="relative z-20 flex min-h-screen flex-col px-8 py-10 md:px-16 md:py-16"
        >
          <header className="flex items-center justify-between opacity-70 transition-opacity duration-500 hover:opacity-100">
            <Link
              href="/"
              className="text-xl font-bold tracking-[0.35em] text-[#d65d0e] transition hover:text-[#fe8019]"
            >
              SAKSHAM
            </Link>
            <nav className="flex gap-4 text-xs font-medium tracking-[0.15em] text-[#a89984] md:gap-8 md:text-sm md:tracking-[0.2em]">
              <Link href="/"      className={pathname === "/"      ? "text-[#fe8019]" : "transition-colors hover:text-[#fe8019]"}>Index</Link>
              <Link href="/about" className={pathname === "/about" ? "text-[#fe8019]" : "transition-colors hover:text-[#fe8019]"}>About</Link>
              <Link href="/blog"  className={pathname === "/blog"  ? "text-[#fe8019]" : "transition-colors hover:text-[#fe8019]"}>Blog</Link>
            </nav>
          </header>

          <div className="flex flex-1 flex-col">{children}</div>

          <footer className="mt-auto pt-10 text-center text-xs tracking-[0.35em] text-[#7c6f64] uppercase opacity-50">
            System initialized • Orbit stable
          </footer>
        </motion.div>
      </motion.div>
    </div>
  );
}

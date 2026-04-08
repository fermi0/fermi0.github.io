"use client";

import { motion, AnimatePresence } from "framer-motion";
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

  const [isMounted, setIsMounted] = useState(false);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    // const today = new Date().toDateString();
    // const lastPlayed = localStorage.getItem("blackhole_played_date");
    // if (lastPlayed === today) {
    //   setSkipped(true);
    //   setStage("home");
    // }
    setIsMounted(true);
  }, []);

  const handleStart = () => {
    setStage("intro");
    // localStorage.setItem("blackhole_played_date", new Date().toDateString());
  };

  const handleEnter = () => setStage("entering");
  const handleEnteredBlackHole = () => setStage("expanding");

  useEffect(() => {
    if (stage === "expanding") {
      // Drastically reduced delay so it flows natively into the website reveal!
      const t = setTimeout(() => setStage("greeting"), 300);
      return () => clearTimeout(t);
    }
    if (stage === "greeting") {
      // Shorter sequence to keep momentum going
      const t = setTimeout(() => setStage("home"), 1600);
      return () => clearTimeout(t);
    }
  }, [stage]);

  const isRising = stage === "expanding" || stage === "greeting" || stage === "home";

  if (!isMounted) {
    return <div className="min-h-screen bg-black" />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-black font-sans text-[#ebdbb2] selection:bg-[#fe8019] selection:text-black">

      {/* ── Standby Screen ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {!skipped && stage === "pre-intro" && (
          <motion.div
            key="pre-intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -50 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-12 bg-black"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.5, duration: 2 }}
              className="text-center"
            >
              <h2 className="text-3xl font-extralight tracking-[0.5em] text-[#a89984] uppercase mb-2">
                Singularity
              </h2>
              <div className="h-px w-32 bg-gradient-to-r from-transparent via-[#d65d0e] to-transparent mx-auto" />
            </motion.div>

            <motion.button
              whileHover={{ scale: 1.05, letterSpacing: "0.5em" }}
              whileTap={{ scale: 0.95 }}
              onClick={handleStart}
              className="group relative overflow-hidden rounded-full border border-[#504945] px-12 py-4 text-xs tracking-[0.4em] text-[#ebdbb2] uppercase transition-all duration-500 hover:border-[#fe8019] hover:text-[#fe8019]"
            >
              <span className="relative z-10">Initialize Singularity</span>
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[#fe8019]/10 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 3-D Black Hole Canvas ───────────────────────────────────────────── */}
      {!skipped && (
        <motion.div
          className="absolute inset-0 z-0"
          initial={{ opacity: 0 }}
          animate={{
            opacity: (stage === "intro" || stage === "entering") ? 1 : 0,
            scale: stage === "entering" ? 1.2 : 1
          }}
          transition={{
            opacity: { duration: 2 },
            scale: { duration: 12, ease: "easeIn" }
          }}
        >
          <BlackHoleScene stage={stage} onEntered={handleEnteredBlackHole} />
        </motion.div>
      )}

      {/* ── Intro Controls ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {!skipped && stage === "intro" && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.5, filter: "blur(20px)" }}
            transition={{ duration: 1.5 }}
            className="absolute bottom-32 left-1/2 z-10 -translate-x-1/2 flex flex-col items-center gap-6"
          >
            <p className="text-xs tracking-[0.6em] text-[#a89984] uppercase opacity-50">
              Beyond the Horizon
            </p>
            <button
              onClick={handleEnter}
              className="group relative flex items-center gap-4 overflow-hidden rounded-full border border-[#fe8019]/30 bg-black/40 backdrop-blur-md px-10 py-4 text-sm font-light tracking-[0.3em] text-[#fe8019] uppercase transition-all duration-700 hover:border-[#fe8019] hover:shadow-[0_0_40px_rgba(254,128,25,0.2)]"
            >
              <span className="relative z-10">Cross Event Horizon</span>
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="relative z-10 inline-block text-lg"
              >
                ◎
              </motion.span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Rising Panel — Website Content Emergence ────────────────────────── */}
      <motion.div
        className="absolute inset-0 z-20 flex min-h-screen flex-col"
        initial={skipped ? false : { opacity: 0 }}
        animate={{
          opacity: isRising ? 1 : 0,
          background: stage === "home" ? "#1d2021" : "black"
        }}
        transition={{ duration: 2 }}
        style={{ pointerEvents: isRising ? "auto" : "none" }}
      >
        {/* Removed jarring flash, keeping transition smooth and dark */}

        {/* Home Interface */}
        <motion.div
          initial={skipped ? false : { opacity: 0, y: 50 }}
          animate={{
            opacity: stage === "home" ? 1 : 0,
            y: stage === "home" ? 0 : 50,
          }}
          transition={{ duration: 2, delay: 0.5 }}
          className="relative z-20 flex min-h-screen flex-col px-8 py-10 md:px-16 md:py-16"
        >
          <header className="flex items-center justify-between mb-12">
            <Link
              href="/"
              className="text-2xl font-bold tracking-[0.4em] text-[#fe8019]"
            >
              SAKSHAM
            </Link>
            <nav className="flex gap-8 text-xs font-medium tracking-[0.3em] text-[#a89984]">
              <Link href="/" className={pathname === "/" ? "text-[#fe8019]" : "hover:text-[#fe8019] transition-colors"}>Index</Link>
              <Link href="/about" className={pathname === "/about" ? "text-[#fe8019]" : "hover:text-[#fe8019] transition-colors"}>About</Link>
              <Link href="/blog" className={pathname === "/blog" ? "text-[#fe8019]" : "hover:text-[#fe8019] transition-colors"}>Blog</Link>
            </nav>
          </header>

          <main className="flex-1">
            {children}
          </main>

          <footer className="mt-auto pt-12 text-center text-[10px] tracking-[0.5em] text-[#504945] uppercase">
            Singularity Traversed • Welcome to the Other Side
          </footer>
        </motion.div>
      </motion.div>
    </div>
  );
}

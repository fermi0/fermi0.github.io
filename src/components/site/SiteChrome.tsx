"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const nav = [
  { href: "/", label: "Index" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
] as const;

export default function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-8 opacity-80 transition-opacity duration-500 hover:opacity-100 md:px-12 md:py-10">
        <Link
          href="/"
          className="text-xl font-bold tracking-[0.35em] text-[#d65d0e] transition hover:text-[#fe8019]"
        >
          SAKSHAM
        </Link>
        <nav className="flex gap-6 text-sm font-medium tracking-[0.2em] text-[#a89984] md:gap-10">
          {nav.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={
                  active
                    ? "text-[#fe8019]"
                    : "transition-colors hover:text-[#fe8019]"
                }
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="flex flex-1 flex-col">{children}</div>

      <footer className="px-6 pb-10 text-center text-xs tracking-[0.35em] text-[#7c6f64] uppercase opacity-60 md:px-12">
        System initialized • Orbit stable
      </footer>
    </div>
  );
}

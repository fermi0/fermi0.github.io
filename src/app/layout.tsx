import type { Metadata } from "next";
import "./globals.css";
import BlackHoleIntroGate from "@/components/blackhole/BlackHoleIntroGate";
import SiteChrome from "@/components/site/SiteChrome";

export const metadata: Metadata = {
  title: {
    default: "Saksham",
    template: "%s • Saksham",
  },
  description: "Personal website — blogs, projects, and notes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-[#1d2021] text-[#ebdbb2] antialiased selection:bg-[#fabd2f] selection:text-[#1d2021]">
        <BlackHoleIntroGate>
          <SiteChrome>{children}</SiteChrome>
        </BlackHoleIntroGate>
      </body>
    </html>
  );
}

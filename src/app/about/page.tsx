import type { Metadata } from "next";
import AboutPageContent from "@/components/site/AboutPageContent";

export const metadata: Metadata = {
  title: "About",
  description: "About protocol — personal and professional snapshot.",
};

export default function AboutPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-6 py-12 md:px-12">
      <AboutPageContent />
    </main>
  );
}

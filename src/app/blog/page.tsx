import type { Metadata } from "next";
import BlogPageContent from "@/components/site/BlogPageContent";

export const metadata: Metadata = {
  title: "Blog",
  description: "Transmission log — writing, learning, shipping.",
};

export default function BlogPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 md:px-12">
      <BlogPageContent />
    </main>
  );
}

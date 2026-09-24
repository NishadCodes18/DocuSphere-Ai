import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocuSphere AI | Document Intelligence & Citation Studio",
  description: "Advanced citation-grounded question answering across PDF, DOCX, and PPTX with pgvector HNSW and Reciprocal Rank Fusion.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/app/ui/globals.css";
import Header from "@/components/Header"; // Import the new Header

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AISRS - Personal Knowledge Graph",
  description: "A flexible, AI-powered SRS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-shodo-paper text-shodo-ink`}>
        {/* The Header component provides navigation for all pages */}
        <Header />
        {children}
      </body>
    </html>
  );
}

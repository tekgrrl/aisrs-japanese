import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; // We'll need to create this file

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AISRS",
  description: "Personal Japanese Learning Tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-900 text-gray-100`}>
        {children}
      </body>
    </html>
  );
}

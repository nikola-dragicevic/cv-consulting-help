import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/ui/Header"; // Import the new Header

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CV-Hjälp & Jobbmatchning", // Updated title
  description: "Professionell CV-hjälp och AI-driven jobbmatchning.", // Updated description
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50`} // Added bg color
      >
        <Header /> {/* Add the Header here */}
        <main>{children}</main> {/* Wrap children in a main tag */}
      </body>
    </html>
  );
}
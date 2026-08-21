import type { Metadata } from "next";
import "./globals.css";
import "./animations.css";
export const metadata: Metadata = { title: "Bloom Rush — Tap, Water, Grow!", description: "A joyful live plant-growing tap race for teams and events." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }

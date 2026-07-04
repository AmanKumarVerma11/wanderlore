import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const SITE_URL = "https://wanderlore.amankrverma.in";
const DESCRIPTION =
  "Wanderlore is an AI cultural trip planner. Tell it where you're headed and it weaves a day-by-day journey of attractions, hidden gems, heritage, local festivals and authentic experiences — every place verified on a real OpenStreetMap map.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Wanderlore — AI cultural trip planner & destination discovery",
    template: "%s · Wanderlore",
  },
  description: DESCRIPTION,
  applicationName: "Wanderlore",
  category: "travel",
  keywords: [
    "AI travel planner",
    "cultural trip planner",
    "destination discovery",
    "hidden gems",
    "itinerary generator",
    "local festivals",
    "cultural experiences",
    "heritage travel",
    "things to do",
    "AI itinerary",
  ],
  authors: [{ name: "Aman Kumar Verma", url: "https://amankrverma.in" }],
  creator: "Aman Kumar Verma",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Wanderlore",
    title: "Wanderlore — AI cultural trip planner",
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Wanderlore — AI cultural trip planner",
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}

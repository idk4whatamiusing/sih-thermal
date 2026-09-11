import type { Metadata } from "next";

import { ExperienceScroller } from "./_components/oceanx/ExperienceScroller";
import "./oceanx.css";

export const metadata: Metadata = {
  title: "Thermal Sentinel — Every Fire From Space",
  description:
    "Classifies NASA FIRMS thermal detections into industrial vs natural sources and puts them on a live GIS map. Every fire from space. Only the industrial ones, flagged.",
  icons: {
    icon: "/static/favicon/favicon.ico",
    apple: "/static/favicon/apple-touch-icon.png",
    other: [
      { rel: "icon", url: "/static/favicon/favicon-96x96.png", sizes: "96x96" },
      { rel: "icon", url: "/static/favicon/favicon.svg", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    title: "Thermal Sentinel — Every Fire From Space",
    description:
      "Classifies NASA FIRMS thermal detections into industrial vs natural sources and puts them on a live GIS map.",
    images: ["/static/images/social-image.webp"],
  },
};

export default function Home() {
  return <ExperienceScroller />;
}

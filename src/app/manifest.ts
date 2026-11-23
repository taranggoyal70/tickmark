import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** What a phone uses when someone adds Tickmark to their home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: SITE.name,
    description: SITE.description,
    // opens on the workspace, not the landing page
    start_url: "/close",
    display: "standalone",
    background_color: "#f3f2ee",
    theme_color: "#f3f2ee",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

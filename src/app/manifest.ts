import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Belesu WhatsApp CRM",
    short_name: "WACRM",
    description: "WhatsApp Business CRM & Shared Team Inbox",
    start_url: "/inbox",
    scope: "/",
    display: "standalone",
    background_color: "#0b141a",
    theme_color: "#00a884",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

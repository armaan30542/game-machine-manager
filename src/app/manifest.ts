import type { MetadataRoute } from "next";

/**
 * Web app manifest. It lets the site be added to a phone's home screen,
 * which iPhones require before a site may send notifications.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Game Machine Manager",
    short_name: "Game Manager",
    description: "Manage game machine rentals, inventory, and revenue",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#171717",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

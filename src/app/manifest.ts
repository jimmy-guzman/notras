import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#252420",
    categories: ["productivity", "utilities"],
    description: "A minimal, personal notes app. Just write, otra vez.",
    display: "standalone",
    icons: [
      {
        purpose: "maskable",
        sizes: "192x192",
        src: "/api/icons/192",
        type: "image/png",
      },
      {
        purpose: "any",
        sizes: "192x192",
        src: "/api/icons/192",
        type: "image/png",
      },
      {
        purpose: "maskable",
        sizes: "512x512",
        src: "/api/icons/512",
        type: "image/png",
      },
      {
        purpose: "any",
        sizes: "512x512",
        src: "/api/icons/512",
        type: "image/png",
      },
    ],
    name: "notras",
    orientation: "any",
    scope: "/",
    short_name: "notras",
    start_url: "/",
    theme_color: "#252420",
  };
}

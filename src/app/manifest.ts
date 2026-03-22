import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gestión de Bloque Quirúrgico",
    short_name: "Bloque Quirúrgico",
    description: "Gestión del bloque quirúrgico - Grupo Ribera",
    start_url: "/",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#c41e3a",
    orientation: "any",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}

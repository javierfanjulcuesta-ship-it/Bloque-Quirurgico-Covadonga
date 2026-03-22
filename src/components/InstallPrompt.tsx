"use client";

/**
 * Muestra instrucciones para instalar la PWA en iOS (Safari no tiene prompt nativo).
 * Opcional: incluir en layout o página principal solo cuando no está ya instalada.
 */

import { useState, useEffect } from "react";

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const isIOSDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: boolean }).MSStream;
    setIsIOS(isIOSDevice);
    if (!standalone && isIOSDevice) setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-medium">Instalar como app</p>
      <p className="mt-1 text-amber-800">
        Toca <span className="font-semibold">Compartir</span> (icono cuadrado con flecha) y luego{" "}
        <span className="font-semibold">Añadir a pantalla de inicio</span>.
      </p>
      <button
        type="button"
        onClick={() => setShow(false)}
        className="mt-2 text-xs underline hover:no-underline"
        aria-label="Cerrar"
      >
        No mostrar de nuevo
      </button>
    </div>
  );
}

"use client";

/**
 * Página de registro.
 * Los usuarios solo pueden ser creados por el gestor desde su perfil.
 * Esta página redirige al inicio.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RegistroPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return null;
}

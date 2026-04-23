"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { InlineNotice } from "@/components/ui/InlineNotice";

export default function HomePage() {
  const router = useRouter();
  const { user: authUser, loginWithPassword } = useAuth();
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (!authUser || !router) return;
    const r = authUser.role;
    if (r === "cirujano" || r === "endoscopista") router.replace("/cirujano");
    else router.replace("/calendario");
  }, [authUser, router]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    const result = await loginWithPassword(loginEmail.trim(), loginPassword);
    setLoginLoading(false);
    if (result.ok && result.user) {
      const dest = result.user.role === "cirujano" || result.user.role === "endoscopista" ? "/cirujano" : "/calendario";
      router.replace(dest);
      return;
    }
    setLoginError(result.error ?? "Error al iniciar sesión");
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-xl items-center justify-center px-4 py-8">
      <div className="card-ribera w-full p-8">
        <h1 className="mb-1 text-2xl font-bold tracking-tight text-[var(--ribera-navy)]">Acceso a QxFlow</h1>
        <p className="mb-5 text-sm text-slate-600">Introduzca sus credenciales para acceder.</p>

        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Email</span>
            <input
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Contraseña</span>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
              autoComplete="current-password"
            />
          </label>
          {loginError && (
            <InlineNotice variant="error" role="alert">
              {loginError}
            </InlineNotice>
          )}
          <button
            type="submit"
            disabled={loginLoading}
            className="btn-ribera-primary w-full py-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loginLoading ? "Accediendo..." : "Acceder"}
          </button>
        </form>
      </div>
    </div>
  );
}

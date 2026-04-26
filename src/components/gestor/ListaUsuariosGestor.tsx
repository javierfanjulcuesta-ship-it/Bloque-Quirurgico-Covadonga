"use client";

/**
 * Lista de usuarios para gestor con Desactivar/Reactivar.
 * Solo visible para roles con user:list (GESTOR, GESTOR_ANESTESISTA).
 */

import { useState, useEffect, useCallback } from "react";
import { roleLabel } from "@/lib/types";
import type { User } from "@/lib/types";
import { fetchUsers } from "@/lib/api/users";
import { useUsers } from "@/context/UsersContext";
import { useAuth } from "@/context/AuthContext";

type Filter = "all" | "active" | "inactive";

function isUserSoftDeleted(u: User): boolean {
  return !!(u.deletedAt && String(u.deletedAt).length > 0);
}

export function ListaUsuariosGestor() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [passwordShown, setPasswordShown] = useState<{ userId: string; password: string } | null>(null);
  const { refresh } = useUsers();
  const { user: currentUser } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchUsers({ includeInactive: true, includeDeleted: true });
      setUsers(list);
    } catch {
      setError("No se pudieron cargar los usuarios");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadingKey = (userId: string, action: string) => `${userId}:${action}`;
  const isActionLoading = (userId: string, action: string) => actionLoading === loadingKey(userId, action);

  const handleDeactivate = async (user: User) => {
    setActionError(null);
    setActionLoading(loadingKey(user.id, "deactivate"));
    try {
      const res = await fetch(`/api/users/${user.id}/deactivate`, {
        method: "PATCH",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Error al desactivar");
        return;
      }
      setActionSuccess("Usuario desactivado. Ya no podrá iniciar sesión.");
      setTimeout(() => setActionSuccess(null), 4000);
      await load();
      refresh();
    } catch {
      setActionError("Error de conexión");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async (user: User) => {
    setActionError(null);
    setActionLoading(loadingKey(user.id, "reactivate"));
    try {
      const res = await fetch(`/api/users/${user.id}/reactivate`, {
        method: "PATCH",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Error al reactivar");
        return;
      }
      setActionSuccess("Usuario reactivado. Podrá iniciar sesión de nuevo.");
      setTimeout(() => setActionSuccess(null), 4000);
      await load();
      refresh();
    } catch {
      setActionError("Error de conexión");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResendInvitation = async (user: User) => {
    setActionError(null);
    setActionSuccess(null);
    setPasswordShown(null);
    setActionLoading(loadingKey(user.id, "resend"));
    try {
      const res = await fetch(`/api/users/${user.id}/resend-invitation`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = (data.error as string) ?? "Error al reenviar invitación";
        const detail = (data.detail as string) ?? "";
        const display =
          res.status === 503
            ? "Configure NEXT_PUBLIC_APP_URL y SMTP_USER/SMTP_PASS en Vercel para enviar emails."
            : detail ? `${msg}: ${detail}` : msg;
        setActionError(display);
        return;
      }
      setActionSuccess("Invitación reenviada correctamente.");
      setTimeout(() => setActionSuccess(null), 4000);
      await load();
      refresh();
    } catch {
      setActionError("Error de conexión");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRegeneratePassword = async (user: User) => {
    setActionError(null);
    setActionSuccess(null);
    setActionLoading(loadingKey(user.id, "regenpw"));
    try {
      const res = await fetch(`/api/users/${user.id}/regenerate-password`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Error al regenerar contraseña");
        return;
      }
      setPasswordShown({ userId: user.id, password: data.tempPassword ?? "" });
      setActionSuccess("Contraseña regenerada. Cópiela o compártala de forma segura.");
      setTimeout(() => setActionSuccess(null), 5000);
    } catch {
      setActionError("Error de conexión");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (
      !window.confirm(
        `¿Eliminar del directorio a ${user.name}? No se borran sus datos históricos (reservas, etc.). No podrá iniciar sesión.`
      )
    ) {
      return;
    }
    setActionError(null);
    setActionLoading(loadingKey(user.id, "delete"));
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError((data.error as string) ?? "Error al eliminar");
        return;
      }
      setActionSuccess("Usuario eliminado del directorio (baja lógica).");
      setTimeout(() => setActionSuccess(null), 4000);
      await load();
      refresh();
    } catch {
      setActionError("Error de conexión");
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = users.filter((u) => {
    const deleted = isUserSoftDeleted(u);
    const active = u.isActive !== false;
    if (filter === "active") return active && !deleted;
    if (filter === "inactive") return !active && !deleted;
    return true;
  });

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
        <p className="text-sm text-gray-500">Cargando usuarios…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-800">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700">Usuarios existentes</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilter("active")}
            className={`rounded px-2 py-1 text-xs font-medium ${filter === "active" ? "bg-[var(--ribera-red)] text-white" : "bg-gray-200 text-gray-700"}`}
          >
            Activos
          </button>
          <button
            type="button"
            onClick={() => setFilter("inactive")}
            className={`rounded px-2 py-1 text-xs font-medium ${filter === "inactive" ? "bg-[var(--ribera-red)] text-white" : "bg-gray-200 text-gray-700"}`}
          >
            Inactivos
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded px-2 py-1 text-xs font-medium ${filter === "all" ? "bg-[var(--ribera-red)] text-white" : "bg-gray-200 text-gray-700"}`}
          >
            Todos
          </button>
        </div>
      </div>
      {actionError && (
        <p className="text-sm text-red-600">{actionError}</p>
      )}
      {actionSuccess && (
        <p className="text-sm text-green-700" role="status">{actionSuccess}</p>
      )}
      <div className="max-h-80 overflow-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-100">
            <tr>
              <th className="p-2 text-left font-semibold">Nombre</th>
              <th className="p-2 text-left font-semibold">Email</th>
              <th className="p-2 text-left font-semibold">Rol</th>
              <th className="p-2 text-left font-semibold">Estado</th>
              <th className="p-2 text-right font-semibold">Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className={`border-t border-gray-100 ${u.isActive === false ? "bg-gray-50" : ""}`}>
                <td className="p-2">{u.name}</td>
                <td className="p-2 text-gray-600">{u.email}</td>
                <td className="p-2">{roleLabel(u.role)}</td>
                <td className="p-2">
                  {isUserSoftDeleted(u) ? (
                    <span className="text-red-700">Eliminado</span>
                  ) : u.isActive === false ? (
                    <span className="text-amber-700">Inactivo</span>
                  ) : (
                    <span className="text-green-700">Activo</span>
                  )}
                </td>
                <td className="p-2 text-right">
                  {isUserSoftDeleted(u) ? (
                    <button
                      type="button"
                      onClick={() => handleReactivate(u)}
                      disabled={!!actionLoading}
                      className="rounded border border-green-600 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
                    >
                      {isActionLoading(u.id, "reactivate") ? "…" : "Reactivar"}
                    </button>
                  ) : u.isActive === false ? (
                    <div className="flex flex-wrap justify-end items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleReactivate(u)}
                        disabled={!!actionLoading}
                        className="rounded border border-green-600 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
                      >
                        {isActionLoading(u.id, "reactivate") ? "…" : "Reactivar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(u)}
                        disabled={!!actionLoading || currentUser?.id === u.id}
                        className="rounded border border-red-700 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                        title={currentUser?.id === u.id ? "No puede eliminar su propio usuario" : "Baja lógica del directorio"}
                      >
                        {isActionLoading(u.id, "delete") ? "…" : "Eliminar usuario"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap justify-end items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleResendInvitation(u)}
                        disabled={!!actionLoading}
                        className="rounded border border-blue-600 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                        title="Reenviar correo con nueva contraseña temporal"
                      >
                        {isActionLoading(u.id, "resend") ? "…" : "Reenviar invitación"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegeneratePassword(u)}
                        disabled={!!actionLoading}
                        className="rounded border border-gray-500 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        title="Regenerar y ver contraseña (usuarios de prueba)"
                      >
                        {isActionLoading(u.id, "regenpw") ? "…" : "Regenerar contraseña"}
                      </button>
                      {passwordShown?.userId === u.id && (
                        <>
                          <code className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs">{passwordShown.password}</code>
                          <button
                            type="button"
                            onClick={() => navigator.clipboard?.writeText(passwordShown.password)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Copiar
                          </button>
                          <button
                            type="button"
                            onClick={() => setPasswordShown(null)}
                            className="text-xs text-gray-500 hover:text-gray-700"
                          >
                            Ocultar
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeactivate(u)}
                        disabled={!!actionLoading || currentUser?.id === u.id}
                        className="rounded border border-amber-600 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                        title={currentUser?.id === u.id ? "No puede desactivar su propio usuario" : undefined}
                      >
                        {isActionLoading(u.id, "deactivate") ? "…" : "Desactivar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(u)}
                        disabled={!!actionLoading || currentUser?.id === u.id}
                        className="rounded border border-red-700 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                        title={currentUser?.id === u.id ? "No puede eliminar su propio usuario" : "Baja lógica del directorio"}
                      >
                        {isActionLoading(u.id, "delete") ? "…" : "Eliminar usuario"}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <p className="py-4 text-center text-sm text-gray-500">
          {filter === "active" ? "No hay usuarios activos" : filter === "inactive" ? "No hay usuarios inactivos" : "No hay usuarios"}
        </p>
      )}
    </div>
  );
}

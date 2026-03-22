# Análisis de dependencias (package.json)

Objetivo: reducir tamaño y complejidad sin romper funcionalidad en una app Next.js de gestión interna.

---

## Estado actual

| Dependencia | Versión | Tamaño aprox. | Uso |
|-------------|---------|----------------|-----|
| `@azure/msal-node` | ^3.8.10 | ~2 MB | Solo en `graphOutlookAdapter.ts` si Graph configurado |
| `@microsoft/microsoft-graph-client` | ^3.0.7 | ~500 KB | Solo en `graphOutlookAdapter.ts` si Graph configurado |
| `@prisma/client` | ^6.0.0 | ~10 MB | DB, usado en toda la app |
| `bcryptjs` | ^2.4.3 | ~50 KB | `password.ts` (hash/compare) |
| `jose` | ^5.9.6 | ~100 KB | `session.ts` (JWT) |
| `next` | 16.1.6 | — | Core |
| `react` / `react-dom` | 19.2.3 | — | Core |
| `zod` | ^3.23.8 | ~100 KB | `reservation.ts` (validación API) |

---

## Recomendaciones

### ✅ Mantener (esenciales)

| Paquete | Motivo |
|---------|--------|
| `@prisma/client` | ORM central, no hay alternativa ligera viable |
| `bcryptjs` | Hash de contraseñas, usado en auth |
| `jose` | JWT, ligero y estándar |
| `zod` | Validación de API, pequeño |
| `next`, `react`, `react-dom` | Core |

### ⚠️ MSAL + Microsoft Graph (optimización recomendada)

**Situación:** `@azure/msal-node` y `@microsoft/microsoft-graph-client` se cargan siempre aunque uses mock.

- `outlookService.ts` importa `graphOutlookAdapter.ts` de forma estática.
- Cuando no hay `AZURE_*`, se usa mock, pero el módulo Graph ya está cargado en memoria.

**Propuesta: import dinámico**

1. Mover la comprobación de configuración a `outlookService.ts`:

```ts
// outlookService.ts
function isGraphConfigured(): boolean {
  return !!(
    process.env.AZURE_CLIENT_ID &&
    process.env.AZURE_CLIENT_SECRET &&
    process.env.AZURE_TENANT_ID
  );
}
```

2. Cargar el adaptador Graph solo cuando haga falta:

```ts
async function getAdapter() {
  if (_adapter) return _adapter;
  if (isGraphConfigured()) {
    const { createGraphOutlookAdapter } = await import("./graphOutlookAdapter");
    _adapter = await createGraphOutlookAdapter();
    // ...
  } else {
    _adapter = createMockOutlookAdapter();
  }
  return _adapter;
}
```

3. Quitar `isGraphConfigured` de `graphOutlookAdapter.ts` o reexportarlo desde `outlookService`.

**Beneficio:** MSAL y Graph solo se cargan cuando hay credenciales Azure. En entornos sin Graph, no se incluyen en el árbol de módulos ejecutados.

**Alternativa (opcional):** Si Graph no se usa en producción, se pueden mover a `optionalDependencies` o documentar que son opcionales.

### ❌ No quitar ninguna dependencia

Todas las dependencias actuales están justificadas:

- `@azure/msal-node` y `@microsoft/microsoft-graph-client`: envío real de correo cuando está configurado.
- Las demás: uso directo y necesario en la app.

---

## DevDependencies

| Paquete | Recomendación |
|---------|---------------|
| `@types/bcryptjs` | Mantener (tipos para bcryptjs) |
| `tsx` | Mantener (scripts, seed) |
| `prisma` | Mantener (migraciones, generate) |
| `tailwindcss`, `@tailwindcss/postcss` | Mantener |
| Resto | Mantener |

---

## Resumen

- **No eliminar dependencias**: todas se usan.
- **Optimizar MSAL/Graph**: import dinámico en `outlookService.ts` para cargar solo cuando esté configurado.
- **Opcional**: documentar MSAL/Graph como dependencias opcionales si no se usan en todos los entornos.

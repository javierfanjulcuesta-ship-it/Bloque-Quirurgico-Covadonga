# Seguridad

**Estado:** ACEPTABLE con gaps P0 · Score **55/100**  
**Alcance:** auditoría defensiva de código. Sin rotación de secretos. Sin tocar prod.

---

## 1. Secretos en el repositorio

| Patrón | Resultado |
|--------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY` / service role | **SECRET_NOT_PRESENT** |
| JWT/API keys cloud hardcoded (`sk_live`, etc.) | **SECRET_NOT_PRESENT** |
| Password de seed `Piloto2024!` en `prisma/seed.ts` | **SECRET_PRESENT** |
| `.env.example` | Placeholders (incluye email ejemplo SMTP) — no clave viva verificada |
| `.env` local | Existe en entorno de build; **no se inspeccionó ni se documenta su contenido** |
| Historial git (sample `SERVICE_ROLE` / JWT-like) | Sin coincidencias en escaneo limitado |

**Nota sobre exposición visual previa de SERVICE_ROLE:** no aparece en el árbol actual. Si se filtró fuera de Git (chat, pantalla, Vercel UI), la rotación es decisión operativa **fuera** de esta auditoría.

---

## 2. Autenticación

| Control | Estado |
|---------|--------|
| JWT HS256 (`jose`) + cookie `bloque_session` httpOnly | OK |
| `secure` en prod/Vercel, `sameSite=lax` | OK |
| Expiración 3 días | Aceptable piloto; largo para hospital |
| bcrypt 12 | OK |
| Rate limit login 5/15min IP | OK (in-memory → débil en multi-instancia) |
| Mensaje genérico credenciales | OK |
| Revalidación DB en `/api/auth/session` | OK en ese endpoint |
| Revalidación en resto de APIs | **FALTA** — usuario desactivado sigue con JWT |
| Middleware de rutas | **Ausente** |
| CSRF | Mitigado parcialmente por SameSite + JSON APIs; no hay token CSRF explícito |
| Demo mode | Solo development |

---

## 3. Autorización (resumen; detalle en `04_PERMISSIONS.md`)

- RBAC central en `permissions.ts` — buena base.
- La mayoría de mutaciones comprueban permisos + ownership.
- **IDOR P0:** `GET /api/reservations/[id]` trata `anestesista` como vista completa.

---

## 4. Endpoints sensibles

| Endpoint | Riesgo |
|----------|--------|
| `GET /api/auth/debug-session` | Dev-only (`NODE_ENV===development`) — OK si prod nunca es development |
| `POST /api/cron/release-pending-reservations` | En non-prod sin `CRON_SECRET` queda abierto; en prod exige secret |
| `POST /api/email/webhook` | Shared secret; bypass dev si secret corto/ausente |
| `POST /api/contact` | Público (spam); rate limit documentado como pendiente en SEGURIDAD-PILOTO |
| `POST …/regenerate-password` | Devuelve temp password en JSON (gestor) — canal sensible |
| `GET /api/email/preview` | Gestor; HTML con password de ejemplo |

---

## 5. Superficie de ataque

| Vector | Hallazgo |
|--------|----------|
| XSS | React escapa por defecto; emails HTML — revisar templates; no DOM dangerouslySetHTML masivo detectado en rutas críticas |
| Injection SQL | Prisma parametrizado; `$executeRawUnsafe` solo en script legacy de roles |
| Path/IDOR | Ver permisos — IDOR anestesista |
| Upload | No hay upload de archivos clínico; import planificación es preview client-side |
| Mass assignment | Zod en reservas ayuda |
| Error leakage | APIs suelen devolver mensajes genéricos; `console.error` server-side |
| Logs sensibles | Email adapters loguean `to` + subject; mock imprime cuerpo; invitation flows manejan passwords |
| NEXT_PUBLIC_* | Demo/API flags; no SERVICE_ROLE |
| Dependencias | No se ejecutó `npm audit` en esta pasada (evitar ruido/red); recomendable en fase autorizada |
| Headers seguridad | No CSP/`X-Frame-Options` custom en `next.config.ts` (vacío) |

---

## 6. Escalada

| Tipo | Evidencia |
|------|-----------|
| Vertical | `roleToFrontend` **default `"gestor"`** si rol desconocido — peligroso |
| Horizontal | Anestesista puede leer reserva ajena por ID |
| Sticky privilege | JWT conserva rol/approved hasta expirar |
| Admin | Gestores pueden regenerar passwords de cualquiera (esperado); sin dual-control |

---

## 7. P0 / P1 seguridad

### P0
1. Cerrar IDOR detalle reserva.  
2. Revalidar usuario activo (y rol) en APIs mutadoras o en helper de sesión.  
3. Evitar default-a-gestor en mapeo de roles.  
4. Asegurar `CRON_SECRET` en todos los entornos donde el cron sea alcanzable.

### P1
5. Rate limit contact + rate limit distribuido login.  
6. Forzar cambio de password en primer login.  
7. CSP y headers.  
8. No loguear cuerpos de email en mock en staging compartido.  
9. Retirar/ignorar seed passwords en cualquier BD no vacía.

---

## 8. Conclusión

La base de auth es **seria para un piloto**, no “juguete”.  
Los gaps (IDOR, sticky session, default role, gobernanza secretos/cron) son **inaceptables a medio plazo** en un bloque quirúrgico real con PII clínica.

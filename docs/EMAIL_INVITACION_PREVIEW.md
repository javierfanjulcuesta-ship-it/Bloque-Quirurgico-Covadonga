# Correos de invitación – Resumen

## Ubicación de la lógica

| Antes | Ahora |
|-------|-------|
| `getEmailSubject()` y `getEmailBody()` en `lib/emailsNuevoUsuario.ts` | `buildInvitationEmail()` en `lib/email/invitationEmail.ts` |
| Contenido disperso en constantes CUERPO_* | Función centralizada con contenido por rol |

## Refactorización

1. **`lib/email/invitationEmail.ts`**: Función `buildInvitationEmail(params)` que devuelve `{ subject, text, html }`.
2. **`lib/email/emailConstants.ts`**: `NORMAS_PROGRAMACION_BLOQUE` extraídas para evitar dependencias circulares.
3. **`lib/emailsNuevoUsuario.ts`**: `getEmailSubject` y `getEmailBody` pasan a delegar en `buildInvitationEmail` (compatibilidad con mailto).
4. **`lib/email/outlookService.ts`**: `sendNewUserInvitationEmail` usa `buildInvitationEmail` y acepta `invitedByName`.
5. **`POST /api/email/send-invitation`**: Envía `invitedByName` con el nombre del gestor autenticado.

## Cómo previsualizar

### Opción 1: Script (sin servidor)

```bash
npx tsx scripts/preview-invitation-email.ts anestesista
npx tsx scripts/preview-invitation-email.ts gestor
npx tsx scripts/preview-invitation-email.ts gestor-anestesista
```

### Opción 2: API (con servidor y sesión de gestor)

```
GET /api/email/preview?role=anestesista
GET /api/email/preview?role=gestor
GET /api/email/preview?role=gestor-anestesista
```

Requiere sesión de gestor (`user:list` o `user:create`). Devuelve JSON con `subject`, `text`, `html` y datos de ejemplo.

## GESTOR vs GESTOR_ANESTESISTA

Comparten:
- **Asunto**: "Invitación de acceso – Gestión del Bloque Quirúrgico Hospital Covadonga"
- **Estructura base**: bienvenida, funciones de gestor, acceso, seguridad.

Diferencias:
- GESTOR_ANESTESISTA incluye el párrafo: *"Además, como gestor-anestesista podrá operar en la agenda como anestesista y gestionar sus propias asignaciones cuando corresponda."*
- El perfil indicado en el cuerpo es "gestor" o "gestor-anestesista".

Para personalizar cada rol en el futuro, basta con ajustar `buildGestorBody()` en `invitationEmail.ts` y distinguir por `isGestorAnestesista`.

# Plan de integración Outlook / Microsoft 365

Buzón principal: **jfanjul@riberacare.com**

---

## 1. Arquitectura técnica (Next.js / Node)

```
┌─────────────────────────────────────────────────────────────────┐
│  Next.js App                                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ outlookService   │  │ API Routes       │  │ Cron/Webhook   │ │
│  │ (orquestación)   │  │ /api/email/*     │  │ (poll inbox)   │ │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘ │
│           │                     │                     │         │
│           ▼                     ▼                     ▼         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ outlookAdapter (Microsoft Graph o Mock)                      ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Microsoft Graph API                                            │
│  - Mail.Send (enviar)                                           │
│  - Mail.Read (leer bandeja)                                     │
│  - User.Read (perfil)                                           │
└─────────────────────────────────────────────────────────────────┘
```

**Autenticación Microsoft 365:**
- App registration en Azure AD
- Client ID + Client Secret (o certificado)
- Permisos: `Mail.Send`, `Mail.Read`, `User.Read`
- OAuth2 Client Credentials (app-only) para acceso al buzón sin usuario interactivo

**Variables de entorno:**
```
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_TENANT_ID=
GESTOR_EMAIL=jfanjul@riberacare.com
```

---

## 2. Fases de implementación

### Fase 1 ✅ (completada)
- [x] Diseño técnico
- [x] Servicio de correo (`src/lib/email/`)
- [x] Clasificación de emails (`classifyIncomingEmail`)
- [x] Parser de reservas (`parseReservationEmail`)
- [x] Modelos Prisma: `EmailMessage`, `EmailProcessingLog`
- [x] Adaptador mock para desarrollo local

### Fase 2 (pendiente)
- [ ] API para guardar correos entrantes
- [ ] Job/cron para poll de bandeja (o webhook si Microsoft lo soporta)
- [ ] Flujo de mensajes generales → `MessageToGestor` en DB
- [ ] Adaptar invitaciones de nuevos usuarios para usar `sendNewUserInvitationEmail`

### Fase 3 (pendiente)
- [ ] Flujo de reservas por correo
- [ ] Validar remitente como cirujano/endoscopista
- [ ] Crear reserva vía API existente
- [ ] Respuestas automáticas (aceptada, error, hueco ocupado, no autorizado)
- [ ] Trazabilidad correo → reserva

---

## 3. Archivos creados / modificados

| Archivo | Estado |
|---------|--------|
| `prisma/schema.prisma` | + EmailMessage, EmailProcessingLog |
| `src/lib/config.ts` | + GESTOR_EMAIL |
| `src/lib/email/types.ts` | Nuevo |
| `src/lib/email/classifyEmail.ts` | Nuevo |
| `src/lib/email/parseReservationEmail.ts` | Nuevo |
| `src/lib/email/outlookAdapter.ts` | Nuevo |
| `src/lib/email/outlookService.ts` | Nuevo |
| `src/lib/email/index.ts` | Nuevo |
| `docs/PLAN-INTEGRACION-OUTLOOK.md` | Nuevo |

---

## 4. Modelos Prisma

```prisma
model EmailMessage {
  id                String              @id
  externalId        String              @unique  // ID Outlook (evitar duplicados)
  fromEmail         String
  fromName          String?
  subject           String
  bodyPlain         String?
  bodyHtml          String?
  receivedAt        DateTime
  classification    EmailClassification
  processingStatus  EmailProcessingStatus
  senderUserId      String?
  reservationId     String?
  ...
}

model EmailProcessingLog {
  id             String   @id
  emailMessageId String
  action         String   // classified, parsed, reservation_created, reply_sent, error
  details        String?
  errorMessage   String?
  ...
}
```

---

## 5. Endpoints / jobs necesarios

| Tipo | Ruta / Nombre | Descripción |
|------|---------------|-------------|
| API | `POST /api/email/send-invitation` | Enviar invitación nuevo usuario |
| API | `GET /api/email/inbox` | Listar correos (gestor) |
| API | `POST /api/email/process-inbox` | Procesar bandeja (clasificar, guardar) |
| Cron | `process-inbox` | Ejecutar cada X minutos (Vercel Cron, etc.) |

---

## 6. Conectar Microsoft Graph con jfanjul@riberacare.com

1. **Azure Portal** → App registrations → New
2. **API permissions** → Add → Microsoft Graph:
   - `Mail.Send` (Application)
   - `Mail.Read` (Application)
   - `User.Read` (Application)
3. **Certificates & secrets** → New client secret
4. **Autenticación** con Client Credentials:
   ```js
   const msal = require("@azure/msal-node");
   const config = {
     auth: {
       clientId: process.env.AZURE_CLIENT_ID,
       authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
       clientSecret: process.env.AZURE_CLIENT_SECRET,
     },
   };
   const cca = new msal.ConfidentialClientApplication(config);
   const token = await cca.acquireTokenByClientCredential({
     scopes: ["https://graph.microsoft.com/.default"],
   });
   ```
5. **Enviar como usuario específico** (jfanjul@riberacare.com):
   - Usar `https://graph.microsoft.com/v1.0/users/jfanjul@riberacare.com/sendMail`
   - En lugar de `/me/sendMail`

---

## 7. Probar en local sin buzón real

1. El adaptador mock (`createMockOutlookAdapter`) registra envíos en consola
2. `fetchInboxMessages()` devuelve array vacío
3. Para simular correos entrantes: crear endpoint de prueba que inserte en `EmailMessage` con datos mock
4. Probar clasificación y parser con mensajes de prueba en tests unitarios

---

## 8. Seguridad y control

- **Validación remitente**: solo cirujanos/endoscopistas pueden crear reservas por correo
- **Evitar duplicados**: `externalId` único por mensaje Outlook
- **Errores de parseo**: registrar en `EmailProcessingLog` con `action: "error"`
- **Trazabilidad**: `EmailMessage.reservationId` → reserva creada
- **No autorizado**: responder con mensaje claro, no crear reserva

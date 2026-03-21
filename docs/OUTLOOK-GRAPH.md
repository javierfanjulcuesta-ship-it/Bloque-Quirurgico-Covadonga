# Envío real de correos con Microsoft Graph

Buzón: **jfanjul@riberacare.com**

---

## Variables .env

```env
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_SECRET=tu_client_secret
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
GESTOR_EMAIL=jfanjul@riberacare.com
```

- **AZURE_CLIENT_ID**: ID de la aplicación en Azure AD
- **AZURE_CLIENT_SECRET**: Secret de la aplicación (Certificates & secrets)
- **AZURE_TENANT_ID**: ID del tenant (Directorio)
- **GESTOR_EMAIL**: Buzón desde el que se envían los correos (por defecto jfanjul@riberacare.com)

---

## Permisos necesarios en Azure AD

1. **App registration** → API permissions → Add permission
2. **Microsoft Graph** → Application permissions
3. Añadir:
   - **Mail.Send** – Enviar correo como usuario
   - **User.Read** – Lectura básica de usuario (para sendMail como usuario específico)

4. **Grant admin consent** para la organización

---

## Fallback mock

Si faltan variables o Graph falla al inicializar:
- Se usa el adaptador mock
- Los correos no se envían realmente
- Se registra en consola: `[Email Mock] Simulado: { to, subject }`
- Se muestra aviso: `[Email] Faltan AZURE_... Usando mock (no se envían correos reales).`

---

## Probar envío real

1. Configurar las 4 variables en `.env`
2. Reiniciar el servidor
3. En consola debe aparecer: `[Email] Usando Microsoft Graph real (jfanjul@riberacare.com)`
4. Crear un nuevo usuario desde el gestor → la invitación se envía por correo real
5. Probar webhook de reservas por correo → la respuesta automática se envía por correo real

---

## Funciones que envían correo real

| Función | Uso |
|--------|-----|
| `sendNewUserInvitationEmail` | Invitación al crear usuario desde gestor |
| `sendReplyToReservationEmail` | Respuestas automáticas del flujo reservas por correo |
| `sendGeneralReplyEmail` | Respuestas a mensajes generales |
| `sendRecordatorioMiercolesEmail` | Recordatorio huecos sin pacientes |
| `sendPacienteNoAptoEmail` | Aviso paciente no apto en preanestesia |

---

## Lectura de bandeja (pendiente)

Para leer correos entrantes desde Outlook:
- Añadir permiso **Mail.Read** (Application)
- Implementar poll o webhook de Microsoft para recibir correos
- Conectar al webhook `/api/email/webhook` con los mensajes recibidos

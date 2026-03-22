# Prueba del flujo de invitación en producción

## Requisitos previos

1. **Variables en Vercel** (Settings → Environment Variables):
   - `NEXT_PUBLIC_APP_URL` o `NEXTAUTH_URL` con la URL pública (ej: `https://bloque-quirurgico.vercel.app`)
   - Credenciales Graph (`AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`) para envío real

2. **Usuario gestor** con permiso `user:create` en producción.

---

## Pasos para probar

### 1. Crear usuario y enviar invitación

1. Inicie sesión en la app desplegada en Vercel como gestor.
2. Vaya a **Gestión de usuarios** → **Crear usuario**.
3. Rellene:
   - Email del invitado (ej: su correo personal o de prueba)
   - Nombre
   - Rol: **GESTOR_ANESTESISTA** (o el que desee)
4. Confirme y envíe la invitación.

### 2. Verificar el correo

- Revise la bandeja del destinatario.
- El asunto debe ser: *"Invitación de acceso – Gestión del Bloque Quirúrgico Hospital Covadonga"*.
- Contenido esperado:
  - Saludo y rol asignado
  - Bloque **"Acceder a la aplicación"** con enlace clicable
  - Usuario (correo) y contraseña temporal
  - Instrucciones de instalación móvil (iPhone/Android)

### 3. Acceso desde navegador

1. Pulse el enlace del correo.
2. Debe abrir la app en Vercel (no localhost).
3. Inicie sesión con el correo y la contraseña temporal.
4. Cambie la contraseña desde "Mi perfil" si lo desea.

### 4. Acceso desde móvil (PWA)

**iPhone/iPad:**
1. Abra el correo en el móvil.
2. Pulse el enlace.
3. Cuando se abra en Safari, pulse el botón **Compartir** (cuadro con flecha).
4. Elija **"Añadir a pantalla de inicio"**.
5. Confirme. Se creará un icono de acceso directo.

**Android:**
1. Abra el correo en el móvil.
2. Pulse el enlace (hágalo abrir en Chrome).
3. Chrome detectará que es PWA y puede mostrar **"Instalar aplicación"** o **"Añadir a pantalla de inicio"**.
4. Siga las indicaciones para añadir el acceso directo.

### 5. Comprobar PWA instalada

- Desde el icono creado, abra la aplicación.
- Debe cargar sin barra de direcciones.
- Inicie sesión y use la app con normalidad.

---

## Posibles fallos

| Problema | Causa | Solución |
|---------|-------|----------|
| Error 503 al enviar invitación | Falta `NEXT_PUBLIC_APP_URL` o `NEXTAUTH_URL` en Vercel | Añadir la URL pública en Variables de entorno |
| Enlace apunta a localhost | Variable con `http://localhost:3000` | Usar la URL real de Vercel en la variable |
| No llega el correo | Graph no configurado o fallo de red | Revisar credenciales Azure; consultar logs en Vercel |
| PWA no muestra "Instalar" | Dominio no HTTPS o `manifest.json` mal configurado | Verificar que la app está en HTTPS; revisar `/manifest.json` |

---

## Cómo se obtiene appUrl en producción

- `getAppUrl()` en `src/lib/appUrl.ts` usa, por orden:
  1. `NEXT_PUBLIC_APP_URL`
  2. `NEXTAUTH_URL`
- Si ninguna está definida o una apunta a localhost en producción, se lanza error y se devuelve 503.
- Los correos de invitación siempre usan esta URL del servidor; se ignora cualquier `accessLink` enviado por el cliente.

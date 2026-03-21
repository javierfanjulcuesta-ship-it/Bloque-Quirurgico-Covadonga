# Estado del modo real

Con `NEXT_PUBLIC_DEMO_MODE=false` la app usa API, base de datos y autenticación real.

---

## Feature flags

| Variable | Uso |
|----------|-----|
| `NEXT_PUBLIC_DEMO_MODE` | `true` = demo (localStorage, sin contraseña). `false` = real (API, BD, login) |
| `NEXT_PUBLIC_USE_REAL_API` | Override opcional. Por defecto sigue a `!modoDemo` |

---

## Ya funciona en modo real

| Componente | Fuente |
|------------|--------|
| Login / logout | API `/api/auth/login`, `/api/auth/logout`, cookie de sesión |
| Sesión | `GET /api/auth/session` |
| Cambio de contraseña | `POST /api/auth/change-password` |
| Lista de usuarios | `GET /api/users` (UsersContext) |
| Reservas (cirujano) | `GET/POST /api/reservations` |
| Calendario (gestor) | `getReservations()` → API |
| Crear usuario (gestor) | `POST /api/users` |
| Asignaciones anestesistas | `GET/PUT /api/anesthetist-assignments` |
| Mi programación (anestesista) | Asignaciones API + Reservas API |

---

## Sigue usando localStorage

| Componente | localStorage | Nota |
|------------|--------------|------|
| **ValoracionPreanestesia** | `addNoApto`, `isPacienteNoApto` | Lista "no apto" siempre en localStorage |
| **MiPerfil** | `getProfile`, `setProfile` (storagePerfiles) | Datos de perfil extendido (foto, teléfono) siempre en localStorage |
| **storageAnesthetistUnavailability** | Solicitudes no disponibilidad | Sin API |
| **storageMensajesYNotificaciones** | Mensajes al gestor, notificaciones, festivos, etc. | Sin API |
| **Contactar coordinación** (modal en home) | `addMessageToGestor`, `addNotification` | Solo visible en modo demo; en real no se muestra ese flujo |

**Migrados a modo real:**
- **AsignarAnestesistas** → API `/api/anesthetist-assignments`
- **MiProgramacion** → API asignaciones + API reservas

---

## Pantallas y flujo

| Pantalla | modo real | Fuente datos |
|----------|-----------|--------------|
| Home (login) | Formulario email+contraseña | API auth |
| /cirujano | API | Reservations API (reservas pasadas a hijos) |
| /calendario | API | Reservations API + Users API (reservas pasadas a hijos) |
| Pestaña Histórico | API (vía props) | Reservas del padre = API |
| Pestaña Consulta preanestesia | API (reservas) + localStorage (no apto) | Reservas vía props; "no apto" en storage |
| Pestaña Mi programación | API (vía props) | Reservas del padre = API |
| Pestaña Asignar anestesistas | API (vía props) | Reservas del padre = API |
| Mi Perfil (datos extendidos) | localStorage | Pendiente migrar |
| Mensajes (gestor) | localStorage | Pendiente migrar |

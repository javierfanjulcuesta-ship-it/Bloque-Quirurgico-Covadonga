# Auditoría del rol Gestor – Bloque Quirúrgico

## 1. Auditoría del rol (código real)

### Pantallas que puede ver un gestor (GESTOR o GESTOR_ANESTESISTA)

| Pestaña | Condición | Contenido |
|---------|-----------|-----------|
| Calendario | `isGestor` | Vista semanal, selección de día, cuadrícula de recursos |
| Mensajes | `isGestor` | Mensajes de Contactar coordinación |
| Crear nuevo usuario | `isGestor` | Formulario crear usuario + invitación |
| Asignar anestesistas | `isGestor` | Tabla turnos × semana, consulta preanestesia |
| Contactar coordinación | Todos | Envío de mensaje a gestores |
| Mi perfil | Todos | Perfil, cambio contraseña |
| Reservar / programar | Solo **gestor-anestesista** | Redirige a /cirujano para programar |
| Mi programación | `isAnestesista` | gestor-anestesista la ve |
| Solicitar no disponibilidad | `isAnestesista` | gestor-anestesista la ve |
| Consulta preanestesia | `isAnestesista` | gestor-anestesista la ve |
| Histórico | `isAnestesista` o gestor | Todos los que pasan el redirect |

**Ruta base:** `/calendario` (cirujanos/endoscopistas van a `/cirujano`).

### Endpoints y permisos

| Endpoint | Método | Restricción |
|----------|--------|-------------|
| `/api/users` | GET | Sesión (cualquier rol) |
| `/api/users` | POST | `hasGestorAccess` |
| `/api/auth/register` | POST | `hasGestorAccess` |
| `/api/anesthetist-assignments` | GET | Sesión; anestesistas solo sus asignaciones |
| `/api/anesthetist-assignments` | PUT | `hasGestorAccess` |
| `/api/contact` | GET | `hasGestorAccess` |
| `/api/contact` | POST | Público (sin auth) |
| `/api/email/send-invitation` | POST | `hasGestorAccess` |
| `/api/reservations` | GET | Gestor: todas; cirujano: solo las suyas |
| `/api/reservations` | POST | cirujano, endoscopista, **gestor-anestesista** |
| `/api/auth/login` | POST | Público |
| `/api/auth/session` | GET | Sesión |
| `/api/auth/change-password` | POST | Sesión (cambio propia contraseña) |

### Diferencias GESTOR vs GESTOR_ANESTESISTA

| Capacidad | GESTOR | GESTOR_ANESTESISTA |
|-----------|--------|--------------------|
| Ver calendario global | Sí | Sí |
| Crear usuarios | Sí | Sí |
| Asignar anestesistas | Sí | Sí |
| Ver mensajes | Sí | Sí |
| Programar reservas (/cirujano) | No | Sí |
| Mi programación | No | Sí |
| Solicitar no disponibilidad | No | Sí |
| Consulta preanestesia | No | Sí |

---

## 2. Propuesta de perfil gestor

### Lo que DEBE poder hacer un gestor

- Crear usuarios (roles: cirujano, anestesista, gestor, gestor-anestesista, endoscopista)
- Ver calendario global (toda la programación)
- Cargar/revisar programación (gestor-anestesista puede reservar; gestor puro no)
- Asignar anestesistas por turno
- Ver recuentos (pacientes por turno, etc.)
- Consultar mensajes / contactos
- Acceso a futura pestaña "Recuento anestesistas"

### Lo que NO debería hacer (si no es necesario)

- Eliminar usuarios (no existe en la app)
- Modificar reservas de otros cirujanos directamente (el flujo es vía liberación)
- Acceso a credenciales o datos sensibles de otros usuarios

---

## 3. Permisos y seguridad

- **Rutas sensibles:** protegidas por `hasGestorAccess` en los endpoints.
- **POST /api/contact:** público por diseño (formulario de contacto).
- **Validación:** permisos en backend, no solo en frontend.
- **Anestesistas:** solo ven sus asignaciones en GET anesthetist-assignments.

---

## 4. Crear un gestor real adicional

### Script: `scripts/crear-usuario-gestor.ts`

```powershell
# Windows PowerShell - GESTOR puro
$env:GESTOR_EMAIL="nuevo.gestor@hospital.es"
$env:GESTOR_NAME="Nombre Apellidos"
$env:GESTOR_ROLE="GESTOR"
$env:GESTOR_PASSWORD="contraseña-segura-min-8-chars"
npx tsx scripts/crear-usuario-gestor.ts

# GESTOR_ANESTESISTA (puede programar + asignar)
$env:GESTOR_EMAIL="gestor.anest@hospital.es"
$env:GESTOR_NAME="Nombre"
$env:GESTOR_ROLE="GESTOR_ANESTESISTA"
$env:GESTOR_PASSWORD="contraseña-segura"
npx tsx scripts/crear-usuario-gestor.ts
```

**O vía npm:**
```bash
GESTOR_EMAIL=x@y.es GESTOR_NAME="X" GESTOR_PASSWORD=xxx npm run usuarios:gestor
```

---

## 5. Flujo operativo recomendado

1. **Script:** usar `crear-usuario-gestor.ts` para el primer gestor adicional.
2. **App:** para gestores posteriores, un gestor ya existente puede usar "Crear nuevo usuario" con rol gestor o gestor-anestesista (contraseña temporal por email).
3. **Cambio de contraseña:** el usuario puede cambiar su contraseña desde "Mi perfil" al primer acceso.

---

## 6. Checklist antes de dar acceso

- [ ] Contraseña mínima 8 caracteres, no en el repositorio
- [ ] Email corporativo válido
- [ ] Rol correcto (GESTOR o GESTOR_ANESTESISTA)
- [ ] `approved=true` (el script lo establece)
- [ ] Comunicar credenciales de forma segura (no por email sin cifrar si es sensible)

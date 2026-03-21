# Plan de migración: DEMO → Sistema real

## 1. Inventario de código DEMO

### 1.1 Usuarios mock
| Archivo | Elemento |
|---------|----------|
| `src/lib/dataHelpers.ts` | `MOCK_USERS`, `getUsers()` |

### 1.2 localStorage (claves en `demoReset.ts`)
| Clave | Uso |
|-------|-----|
| `bloque_quirurgico_mensajes_gestor` | Mensajes al gestor |
| `bloque_quirurgico_notificaciones` | Notificaciones in-app |
| `bloque_quirurgico_pacientes_no_apto` | Pacientes no aptos preanestesia |
| `bloque_quirurgico_recordatorio_semana` | Recordatorio semana |
| `bloque_quirurgico_huecos_liberados_semana` | Huecos liberados |
| `bloque_quirurgico_festivos` | Festivos |
| `bloque_quirurgico_reservations` | Reservas |
| `bloque_quirurgico_anesthetist_unavailability` | No disponibilidad anestesistas |
| `bloque_quirurgico_v2_perfiles` | Perfiles usuario |
| `bloque_quirurgico_anesthetist_assignments` | Asignaciones anestesistas |

### 1.3 Autenticación simulada
| Archivo | Elemento |
|---------|----------|
| `src/context/AuthContext.tsx` | `getStoredUser()`, `setStoredUser()`, `login(user)` sin contraseña |
| `sessionStorage` | `bloque_quirurgico_v2_session_user` |

### 1.4 Lógica demo
| Archivo | Elemento |
|---------|----------|
| `src/app/page.tsx` | Selector usuario demo, "Restablecer demo", "Cargar datos de ejemplo" |
| `src/lib/demoReset.ts` | `resetDemoStorage()` |
| `src/lib/demoSeed.ts` | `loadDemoSeed()` |

---

## 2. Arquitectura real mínima

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                        │
│  - UI actual (sin cambios visuales)                              │
│  - AuthContext: demoMode ? sessionStorage : API /api/auth/session│
│  - getUsers(): demoMode ? MOCK_USERS : fetch /api/users           │
│  - Reservas, mensajes, etc.: demoMode ? localStorage : API       │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API ROUTES (Next.js App Router)                │
│  /api/auth/login     POST    { email, password }                  │
│  /api/auth/logout    POST    (cookie)                            │
│  /api/auth/session   GET     → { user } o 401                    │
│  /api/auth/register  POST    (solo gestor) { email, password, name, role } │
│  /api/users          GET     → User[]                             │
│  /api/reservations   GET, POST, PUT, DELETE                       │
│  ... (fases posteriores)                                          │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PRISMA (ORM) + SQLite → PostgreSQL             │
│  - User, UserProfile, Reservation, PatientInBlock, etc.          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Modelos de datos iniciales (Prisma)

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  passwordHash String
  name      String
  role      String   // cirujano | anestesista | gestor | gestor-anestesista | endoscopista
  approved  Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Reservation {
  id          String   @id @default(cuid())
  resourceId  String
  date        String
  shift       String
  slotIndex   Int
  surgeonId   String
  status      String   @default("pending")
  createdAt   DateTime @default(now())
  patients    PatientInBlock[]
}

model PatientInBlock {
  id                      String
  reservationId           String
  numeroHistoria          String
  procedure               String
  estimatedDurationMinutes Int
  anesthesiaType          String
  entidadFinanciadora     String
  ...
}
```

---

## 4. Fases de migración

| Fase | Descripción | Estado |
|------|-------------|--------|
| **1** | Config demoMode, Prisma, User, API auth (login/session), getUsers() | En curso |
| **2** | API /api/reservations, migrar reservas | Pendiente |
| **3** | API mensajes, notificaciones, asignaciones | Pendiente |
| **4** | Migrar resto de localStorage | Pendiente |
| **5** | Eliminar demo (opcional) | Pendiente |

---

## 5. Estructura de carpetas

```
src/
  app/
    api/
      auth/
        login/route.ts
        logout/route.ts
        session/route.ts
        register/route.ts
      users/
        route.ts
    page.tsx
    ...
  lib/
    config.ts
    db/
      prisma.ts
    api/
      client.ts
      users.ts
    auth/
      session.ts
      password.ts
    dataHelpers.ts
prisma/
  schema.prisma
```

---

## 6. Feature flag

```ts
// src/lib/config.ts
export const modoDemo = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
```

`.env.local`:
```
NEXT_PUBLIC_DEMO_MODE=true   # demo
NEXT_PUBLIC_DEMO_MODE=false  # real
```

---

## 7. Endpoints (ejemplos)

### POST /api/auth/login
```json
// Request
{ "email": "cirujano@hospital.es", "password": "***" }

// Response 200
{ "user": { "id", "name", "email", "role", "approved" } }

// Response 401
{ "error": "Credenciales inválidas" }
```

### GET /api/auth/session
```json
// Response 200 (cookie válida)
{ "user": { ... } }

// Response 401
{ "error": "No autenticado" }
```

### GET /api/users
```json
// Response 200
{ "users": [ { "id", "name", "email", "role", "approved" }, ... ] }
```

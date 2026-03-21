# API de Reservas

## Setup

Si el cliente Prisma no está actualizado (error al importar Reservation/PatientInBlock):

```bash
# Detener el servidor de desarrollo (Ctrl+C) y ejecutar:
npx prisma generate
npm run dev
```

Si ya tenías usuarios con roles en formato antiguo (gestor, cirujano...):

```bash
npm run db:migrate-roles
```

---

## Schema Prisma completo

```prisma
enum UserRole {
  GESTOR
  ANESTESISTA
  CIRUJANO
  ENDOSCOPISTA
  GESTOR_ANESTESISTA
}

enum Shift {
  MORNING
  AFTERNOON
}

enum ReservationStatus {
  PENDING
  CONFIRMED
  RELEASED
  CANCELLED
}

model User {
  id           String        @id @default(cuid())
  email        String        @unique
  passwordHash String
  name         String
  role         UserRole
  approved     Boolean       @default(false)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  reservations Reservation[] @relation("SurgeonReservations")
}

model Reservation {
  id            String             @id @default(cuid())
  date          DateTime
  resourceId    String
  shift         Shift
  slotIndex     Int
  surgeonId     String
  status        ReservationStatus  @default(PENDING)
  anesthetistId String?
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt
  surgeon       User               @relation("SurgeonReservations", fields: [surgeonId], references: [id])
  patients      PatientInBlock[]
  @@unique([date, resourceId, shift, slotIndex])
}

model PatientInBlock {
  id                       String      @id @default(cuid())
  reservationId            String
  historyNumber            String
  fullName                 String?
  procedure                String
  estimatedDurationMinutes Int
  anesthesiaType           String
  insuranceType            String
  admissionType            String?
  orderIndex               Int
  notes                    String?
  solicitudRecursos        String?
  reservation              Reservation @relation(fields: [reservationId], references: [id], onDelete: Cascade)
}
```

---

## Rutas

### POST /api/reservations

Crea una reserva. **Solo cirujanos y endoscopistas pueden crear.** El `surgeonId` se obtiene del usuario autenticado (no se envía en el payload).

**Headers:** Cookie de sesión (httpOnly)

**Payload esperado (sin surgeonId):**

```json
{
  "date": "2025-03-24",
  "resourceId": "Q1",
  "shift": "morning",
  "slotIndex": 0,
  "patients": [
    {
      "historyNumber": "HC-001",
      "fullName": "Juan Pérez",
      "procedure": "Artroscopia rodilla",
      "estimatedDurationMinutes": 60,
      "anesthesiaType": "Regional",
      "insuranceType": "SNS",
      "admissionType": "ambulatorio",
      "orderIndex": 0,
      "notes": ""
    }
  ]
}
```

**Payload mínimo (reserva sin pacientes):**

```json
{
  "date": "2025-03-24",
  "resourceId": "Q2",
  "shift": "afternoon",
  "slotIndex": 1
}
```

**Respuesta 200:**

```json
{
  "reservation": {
    "id": "clxxx...",
    "date": "2025-03-24",
    "resourceId": "Q1",
    "shift": "morning",
    "slotIndex": 0,
    "surgeonId": "clxxx...",
    "status": "pending",
    "createdAt": "2025-03-14T10:00:00.000Z",
    "patients": [
      {
        "id": "clxxx...",
        "historyNumber": "HC-001",
        "fullName": "Juan Pérez",
        "procedure": "Artroscopia rodilla",
        "estimatedDurationMinutes": 60,
        "anesthesiaType": "Regional",
        "insuranceType": "SNS",
        "admissionType": "ambulatorio",
        "orderIndex": 0
      }
    ]
  }
}
```

**Errores:**
- 400: Datos inválidos (fecha, resourceId, shift, slotIndex, pacientes con duración <= 0)
- 401: No autenticado
- 403: Solo cirujanos y endoscopistas pueden crear reservas
- 409: Hueco ya ocupado

---

### GET /api/reservations

Lista reservas con filtros. Requiere sesión.

**Query params:**
- `dateFrom` (opcional): YYYY-MM-DD
- `dateTo` (opcional): YYYY-MM-DD
- `resourceId` (opcional): Q1 | Q2 | Q3 | procedimientos-menores | tecnicas-dolor
- `surgeonId` (opcional): ID del cirujano

**Ejemplo:** `GET /api/reservations?dateFrom=2025-03-24&dateTo=2025-03-28`

**Respuesta 200:**

```json
{
  "reservations": [
    {
      "id": "clxxx...",
      "date": "2025-03-24",
      "resourceId": "Q1",
      "shift": "morning",
      "slotIndex": 0,
      "surgeonId": "clxxx...",
      "status": "pending",
      "createdAt": "2025-03-14T10:00:00.000Z",
      "patients": []
    }
  ]
}
```

**Nota:** Cirujanos y endoscopistas solo ven sus propias reservas. Gestores ven todas.

---

## Validaciones

- **date:** YYYY-MM-DD, fecha válida (compatible con DateTime)
- **resourceId:** Q1 | Q2 | Q3 | procedimientos-menores | tecnicas-dolor
- **shift:** morning | afternoon (enum)
- **slotIndex:** 0-5 (mañana), 0-4 (tarde)
- **surgeonId:** no se envía; se obtiene del usuario autenticado
- **estimatedDurationMinutes:** > 0 para cada paciente

---

## Pasos siguientes para conectar el frontend

1. **Crear cliente API** en `src/lib/api/reservations.ts`:
   - `fetchReservations(params)` → GET
   - `createReservation(data)` → POST

2. **Crear capa de abstracción** en `src/lib/reservations.ts`:
   - `getReservations(dateFrom?, dateTo?)` que use API en modo real y localStorage en demo

3. **Actualizar componentes** que usan `getStoredReservations` / `addOrUpdateStoredReservation`:
   - `src/app/cirujano/page.tsx`
   - `src/app/calendario/page.tsx`
   - `src/components/gestor/VistaSemanal.tsx`
   - etc.

4. **Mapear campos** entre API y tipos del frontend:
   - API: `historyNumber`, `fullName`, `insuranceType`, `orderIndex`
   - Frontend: `numeroHistoria`, `name`, `entidadFinanciadora`, `order`

5. **Feature flag:** Usar `modoDemo` para elegir entre localStorage y API.

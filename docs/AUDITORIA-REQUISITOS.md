# Auditoría de requisitos – Bloque Quirúrgico V2

Revisión de implementación frente a los requisitos solicitados.

---

## 1. Cirujanos que puedan programar en cualquier recurso

**Estado: Implementado**

- `getAllowedResourcesForRole` en `src/lib/constants.ts` (líneas 71–79) permite a cirujanos reservar en Q1, Q2, Q3, procedimientos menores y técnicas del dolor.
- El cirujano reserva en cualquier recurso desde el calendario (`/cirujano`).
- El endoscopista solo puede usar procedimientos menores y técnicas del dolor.

**Referencias:** `constants.ts`, `cirujano/page.tsx`, `reservations` API.

---

## 2. Introducir limitación de recursos (solicitud por procedimiento)

**Estado: Implementado**

Opciones de solicitud de recursos por paciente:

- Rayo
- Mesa de mano
- Posicionamiento de cadera
- Caja instrumental PTC/PTR
- Mesa de hombro
- Ninguno de ellos

**Ubicaciones:**

- `src/lib/constants.ts`: `SOLICITUD_RECURSOS_OPTIONS` (líneas 81–89).
- `src/lib/types.ts`: `SolicitudRecursosId`, `PatientInBlock.solicitudRecursos` (líneas 82–98).
- `ProgramarPacientesModal.tsx`: selector por paciente (líneas 62–63, 295–296).
- API y Prisma: campo `solicitudRecursos` en `PatientInBlock`.

---

## 3. Calendario: distinguir reservado vs ocupado y mostrar casos/pacientes

### 3.1 Calendario general (gestor y anestesista)

**Estado: Implementado**

- `buildSlotViews` en `dataHelpers.ts`: `status: "reserved" | "occupied"` según si hay pacientes (líneas 72, 105).
- `SlotCell.tsx`: colores distintos (ámbar reservado, gris ocupado).
- `DaySlotGrid.tsx`: leyenda "Reservado" / "Ocupado" (líneas 117–119).
- Se muestran nombres de cirujano y pacientes cuando `asGestor: true`.

### 3.2 Asignar anestesistas (perfil gestor)

**Estado: Parcialmente implementado**

- Se muestran NHC, procedimiento y cirujano cuando hay pacientes (`getSlotPatientInfo`, `AsignarAnestesistas.tsx`).
- No se distingue explícitamente **reservado** vs **ocupado** en huecos sin pacientes: esos slots quedan vacíos.
- Faltaría mostrar “Reservado” cuando existan reservas sin pacientes en ese (recurso, fecha, turno).

---

## 4. Anestesista: ver quirófanos asignados

**Estado: Implementado**

- `MiProgramacion.tsx` lista los recursos asignados por turno (Q1, Q2, Q3, etc.).
- `programacionRows` incluye `resources` y `resourceLabel`.
- La tabla y el export muestran “Recursos” con Q1/Q2/Q3, “Turno completo”, etc. (líneas 311, 255–260).
- `patientsAttended` incluye `resourceLabel` por paciente.

---

## 5. Perfil gestor-anestesista: número de pacientes programados por la aplicación

**Estado: No implementado**

- No hay ningún contador de “X pacientes programados” en la vista de gestor-anestesista.
- El cirujano sí ve sus propios pacientes en “Pacientes programados en sus reservas” (`cirujano/page.tsx`).
- Falta un resumen global tipo “N pacientes programados esta semana / este periodo” en el dashboard del gestor-anestesista.

---

## 6. Exploraciones (sin implementación concreta)

Estos puntos están en fase de diseño/exploración; no hay código que los implemente:

| Tema | Estado | Observación |
|------|--------|-------------|
| Gestionar abrir quirófano para procedimientos no rentables | No implementado | No hay modelo ni flujo para rentabilidad |
| Gestionar urgencias diferidas | No implementado | No hay concepto de urgencia diferida |
| Métodos punitivos (reservar ampliamente y no ocupar, superar tiempos previstos) | Parcialmente documentado | `emailsNuevoUsuario.ts` describe “uso del tiempo reservado” y recordatorios; no hay penalizaciones automáticas en la app |
| Alimentar con datos de costes, precios | No implementado | Solo mención en `FLUJO_RESERVAS_EMAIL.md`; no hay modelo de costes/precios |

---

## Resumen

| # | Requisito | Estado |
|---|-----------|--------|
| 1 | Cirujanos programan en cualquier recurso | ✅ Implementado |
| 2 | Limitación de recursos (Rayo, Mesa mano, etc.) | ✅ Implementado |
| 3a | Calendario: reservado/ocupado + casos/pacientes | ✅ Implementado |
| 3b | Asignar anestesistas: reservado/ocupado + pacientes | ⚠️ Parcial (falta marcar reservado) |
| 4 | Anestesista ve quirófanos asignados | ✅ Implementado |
| 5 | Gestor-anestesista: número pacientes programados | ❌ No implementado |
| 6 | Quirófano no rentable, urgencias, punitivos, costes | ❌ Exploración / no implementado |

---

## Acciones recomendadas

1. **Asignar anestesistas – Reservado vs ocupado**  
   Mostrar “Reservado” en celdas con reserva sin pacientes cuando `patientInfo.length === 0` pero existan reservas para ese (recurso, fecha, turno).

2. **Gestor-anestesista – Contador de pacientes**  
   Añadir un bloque/tarjeta en la vista del gestor-anestesista con el número total de pacientes programados (p.ej. en la semana actual o en el rango visible).

3. **Exploraciones (rentabilidad, urgencias, punitivos, costes)**  
   Definir especificaciones y prioridades antes de desarrollo.

# Plan de apertura del bloque quirúrgico

Implementación de la lógica de apertura del bloque: no abrir recursos sin carga mínima, reservar capacidad para urgencias y bloquear reservas normales cuando invaden esa capacidad.

---

## 1. Modelo de datos

### BlockOpeningPlan (Prisma)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | String | CUID |
| date | DateTime | Fecha (YYYY-MM-DD) |
| shift | Shift | MORNING \| AFTERNOON |
| resourceId | String | Q1, Q2, Q3, procedimientos-menores, tecnicas-dolor |
| status | BlockOpeningStatus | OPEN \| CLOSED \| URGENT_RESERVED |
| minRequiredMinutes | Int | Umbral mínimo para considerar apertura justificada (default 0) |
| reservedUrgentMinutes | Int | Minutos reservados para urgencias (default 0) |
| notes | String? | Notas |
| approvedByUserId | String? | Usuario que aprobó el plan |
| createdAt, updatedAt | DateTime | Auditoría |

**Clave única:** `(date, resourceId, shift)` – un plan por recurso y turno por día.

---

## 2. Reglas funcionales

- **CLOSED**: No se puede reservar. El recurso está cerrado para ese turno.
- **URGENT_RESERVED**: No se puede reservar por usuarios normales (cirujano/endoscopista). Capacidad reservada para urgencias. Solo el gestor puede asignar ahí.
- **OPEN** (o sin plan): Se pueden hacer reservas. Por defecto, si no hay plan se asume OPEN.

**Gestor**: Puede reservar en CLOSED o URGENT_RESERVED (no implementado aún el flujo de “excepción” explícita; por ahora el gestor solo gestiona los planes).

---

## 3. Cálculo “no justificable”

Un recurso es **no justificable** cuando:
- `status === "OPEN"`
- `minRequiredMinutes > 0`
- `minutosProgramados < minRequiredMinutes`

**Minutos programados** = suma, para todas las reservas de ese (date, resourceId, shift), de:
- `estimatedDurationMinutes + TRANSITION_MINUTES_PER_PROCEDURE` por cada paciente.

La vista de gestión marca con “No justificable” las celdas que cumplen estas condiciones.

---

## 4. Protección de capacidad para urgencias

- **URGENT_RESERVED** protege todo el turno (date, resourceId, shift).
- Los cirujanos y endoscopistas no ven esos slots como libres y no pueden reservarlos.
- En el calendario se muestran como “Urgencias” o “Cerrado”.
- Solo el gestor puede cambiar el estado (por ejemplo a OPEN) para liberar capacidad.

---

## 5. Integración con reservas

En `POST /api/reservations`:
1. Se comprueba `canReserveSlot(date, resourceId, shift, isGestor)`.
2. Si el usuario **no** es gestor y el plan tiene status CLOSED o URGENT_RESERVED, se devuelve 403 con mensaje explícito.
3. Si todo es correcto, se continúa con la lógica habitual de creación de reserva.

---

## 6. Vista del gestor (Apertura bloque)

**Pestaña**: “Apertura bloque” en el calendario (solo gestores).

**Contenido**:
- Tabla: filas = recursos (Q1, Q2, …), columnas = días × (Mañana | Tarde).
- Por celda:
  - Minutos programados.
  - Indicador “No justificable” si aplica.
  - Selector de estado: OPEN / CLOSED / URGENT_RESERVED.
  - Umbral mínimo (minRequiredMinutes) editable.
- Navegación semanal.
- Guardado inmediato al cambiar estado o umbral.

---

## 7. Archivos modificados/creados

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | Modelo BlockOpeningPlan + enum BlockOpeningStatus |
| `src/lib/types.ts` | BlockOpeningPlan, BlockOpeningStatus, SlotStatus "blocked", blockReason en SlotView |
| `src/lib/blockOpeningPlan.ts` | **Nuevo**: canReserveSlot, getProgrammedMinutes, isBelowJustificationThreshold, getBlockOpeningPlan |
| `src/lib/dataHelpers.ts` | buildSlotViews: blockPlans, asGestorForBlocks, blockReason |
| `src/lib/api/blockOpeningPlan.ts` | **Nuevo**: fetchBlockPlans, upsertBlockPlan |
| `src/app/api/block-opening-plan/route.ts` | **Nuevo**: GET, PUT |
| `src/app/api/reservations/route.ts` | Comprobación canReserveSlot antes de crear |
| `src/components/calendar/SlotCell.tsx` | Estado "blocked", estilos y texto |
| `src/components/calendar/DaySlotGrid.tsx` | Leyenda Cerrado/Urgencias |
| `src/components/gestor/GestionarApertura.tsx` | **Nuevo**: vista gestor |
| `src/app/calendario/page.tsx` | Tab “Apertura bloque”, fetch blockPlans |
| `src/app/cirujano/page.tsx` | Fetch blockPlans, pasar a buildSlotViews y resolveSlotsToSameRoom |

---

## 8. Migración

```bash
npx prisma db push
# o, si usas migraciones:
npx prisma migrate dev --name add_block_opening_plan
```

---

## 9. Uso en modo demo

En `modoDemo`, la API de block-opening-plan puede fallar si no hay backend. Los planes se cargan con array vacío y los slots se muestran como libres (comportamiento anterior).

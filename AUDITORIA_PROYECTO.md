# Auditoría – Bloque Quirúrgico (app real, entorno sanitario)

Prioridad: funcionalidad → seguridad backend → estabilidad → claridad → mantenimiento → rendimiento. No se prioriza optimización de tamaño si afecta robustez.

---

## A. HALLAZGOS PRIORIZADOS

### CRÍTICO

#### C1. Falta API para actualizar/cancelar reservas

**Problema:** Solo existe POST (crear) y GET (listar) de reservas. No hay PATCH ni DELETE. El permiso `booking:update` y `booking:cancel` están definidos pero no tienen endpoint asociado.

**Importancia:** En modo API real, si un cirujano reserva un hueco vacío y después quiere añadir pacientes, al guardar se llama a `createReservation` y falla con "El hueco ya está ocupado" porque ese hueco ya es suyo. En demo (localStorage) sí funciona con `addOrUpdateStoredReservation`.

**Solución mínima:**
- Añadir `PATCH /api/reservations/[id]` para actualizar pacientes (con `canAccessBooking` y `booking:update`).
- Añadir `DELETE /api/reservations/[id]` o `PATCH ... status: CANCELLED` para cancelar (con `canAccessBooking` y `booking:cancel`).

**Implementación:** Requiere diseño del payload de PATCH y lógica de merge de pacientes. Se puede abordar en un segundo paso.

---

### IMPORTANTE

#### I1. `block-opening-plan` PUT no valida resourceId

**Problema:** Se acepta cualquier `resourceId` sin comprobar si es uno de los recursos definidos (Q1, Q2, Q3, procedimientos-menores, tecnicas-dolor).

**Importancia:** Se pueden crear planes para recursos inexistentes, afectando la lógica de apertura y la UI.

**Solución:** Validar `resourceId` contra `RESOURCES` (o una constante compartida) antes del upsert. Devolver 400 si no es válido.

---

#### I2. `anesthetist-assignments` PUT no valida que anesthetistId sea anestesista

**Problema:** Se acepta cualquier `anesthetistId` sin comprobar que el usuario tenga rol ANESTESISTA o GESTOR_ANESTESISTA.

**Importancia:** Un gestor podría asignar un cirujano u otro rol a un turno de quirófano, generando datos incoherentes.

**Solución:** Antes de insertar, comprobar en la tabla User que `anesthetistId` pertenezca a un usuario con rol ANESTESISTA o GESTOR_ANESTESISTA. Devolver 400 si no.

---

#### I3. Contact POST sin rate limit

**Problema:** El formulario de contacto es público y no tiene límite de peticiones por IP.

**Importancia:** Riesgo de spam, abuso o DoS ligero en el endpoint público.

**Solución:** Aplicar rate limit (por ejemplo 5–10 peticiones por IP cada 15 minutos), reutilizando la lógica de `rateLimit.ts` o una variante.

---

#### I4. send-invitation expone mensaje interno en errores

**Problema:** `{ error: err instanceof Error ? err.message : "Error al enviar invitación" }` puede devolver mensajes internos (rutas, credenciales, etc.).

**Importancia:** Posible fuga de información sensible vía mensajes de error.

**Solución:** En producción, devolver siempre un mensaje genérico (p. ej. "Error al enviar invitación") y guardar el detalle solo en logs.

---

### RECOMENDABLE

#### R1. Login: select explícito sin passwordHash

**Problema:** `findUnique` sin `select` trae todos los campos, incluido `passwordHash`.

**Importancia:** Defensa en profundidad: reducir superficie por si hay logging o filtrado incorrecto.

**Solución:** Usar `select` y excluir `passwordHash`, o al menos no exponerlo nunca.

---

#### R2. anesthetist-assignments PUT: riesgo en replace-all

**Problema:** `deleteMany({})` borra todas las asignaciones antes de crear las nuevas. Si la transacción falla tras el delete, se pierden todas las asignaciones.

**Importancia:** El patrón replace-all es correcto para el diseño actual, pero fallos parciales pueden dejar datos inconsistentes.

**Solución:** Mantener la transacción actual. Opcionalmente, añadir un check de que `toUpsert` no esté vacío por error antes de borrar, o validar el tamaño del payload.

---

#### R3. Reservations GET: validar surgeonId cuando canViewAll

**Problema:** Con `booking:view:all`, el parámetro `surgeonId` se usa directamente sin validar que exista en la BD.

**Importancia:** Baja: solo afecta al filtrado; devolver vacío si el ID no existe no es grave, pero conviene validar para consistencia.

**Solución:** Opcional: si se pasa `surgeonId`, verificar que el usuario exista antes de filtrar.

---

### OPCIONAL

#### O1. Índices Prisma

**Problema:** Reservations se filtra por `date`, `resourceId`, `surgeonId`, `status`. Conviene revisar índices para rangos temporales.

**Solución:** Añadir índices compuestos si hay consultas lentas, por ejemplo:
- `@@index([date, resourceId, shift, slotIndex])` (ya existe unique)
- `@@index([surgeonId, date])` para listados por cirujano
- `@@index([date, status])` para rangos temporales

---

#### O2. Duplicación de `toApiReservation`

**Problema:** `toApiReservation` se define en `reservations/route.ts` y en `reservations/[id]/route.ts`.

**Solución:** Extraer a un helper en `lib/` y reutilizarlo (mantenibilidad).

---

## B. RESUMEN DE ACCIONES POR HALLAZGO

| ID  | Severidad | Acción |
|-----|-----------|--------|
| C1  | Crítico   | Implementar PATCH y cancelación de reservas |
| I1  | Importante| Validar resourceId en block-opening-plan PUT |
| I2  | Importante| Validar rol de anesthetistId en asignaciones |
| I3  | Importante| Rate limit en Contact POST |
| I4  | Importante| No exponer err.message en send-invitation |
| R1  | Recomendable | select explícito en login |
| R2  | Recomendable | Revisar estrategia replace-all (opcional) |
| R3  | Recomendable | Validar surgeonId (opcional) |
| O1  | Opcional | Revisar índices Prisma |
| O2  | Opcional | Extraer toApiReservation |

---

## C. CAMBIOS IMPLEMENTADOS EN ESTA AUDITORÍA

Se han aplicado las correcciones de bajo riesgo y alto impacto:

1. **block-opening-plan PUT:** Validación de `resourceId` contra lista permitida.
2. **send-invitation:** Mensaje de error genérico, sin exponer detalles internos.
3. **Login:** `select` explícito excluyendo `passwordHash`.
4. **anesthetist-assignments PUT:** Comprobación de que `anesthetistId` sea ANESTESISTA o GESTOR_ANESTESISTA.
5. **Contact POST:** Rate limit básico (5 peticiones / 15 min por IP).

---

## D. NO APLICADO (POR DECISIÓN)

- **Optimizaciones de tamaño** que reduzcan claridad o robustez.
- **Refactors grandes** o reescrituras sin beneficio claro.
- **Cambios cosméticos** sin impacto funcional.

---

## E. CONSERVADOR / DUDA

- **C1 (PATCH/DELETE reservas):** Es el cambio más importante. Conviene definir bien el contrato de PATCH y la política de cancelación antes de implementarlo.
- **Webhook dev bypass:** El bypass `dev-local-testing-bypass` solo aplica en desarrollo. En producción, si `EMAIL_WEBHOOK_SECRET` está definido, el bypass no se usa. Mantener documentación clara para evitar malentendidos.

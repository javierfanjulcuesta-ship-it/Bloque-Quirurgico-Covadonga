# Perfil anestesista – Mi programación

Vista de programación del anestesista con datos reales (asignaciones en BD, reservas API).

## Pestañas

- **Mi semana**: Grid visual (días × mañana/tarde) con recursos asignados, consulta preanestesia y procedimientos.
- **Pacientes**: Listado de pacientes atendidos en el periodo con filtros.
- **Resumen**: Turnos totales, mañanas, tardes, pacientes; resúmenes por mes, recurso y tipo de anestesia.

---

## Concepto de turno

**Regla:** Un turno = una mañana **o** una tarde.

Aunque el anestesista esté asignado a varios quirófanos/recursos en el mismo turno (p. ej. Q1 y Q2 por la mañana), cuenta como **1 turno**.

El recuento se hace por pares únicos `(fecha, turno)` en los que el anestesista tiene al menos una asignación.

---

## Datos utilizados

| Dato | Fuente |
|------|--------|
| Asignaciones | API `GET /api/anesthetist-assignments` (BD real) |
| Reservas | API `GET /api/reservations` |
| Pacientes | `PatientInBlock` dentro de las reservas |

---

## Funcionalidades

1. **Resumen de turnos**
   - Total de turnos en el periodo
   - Mañanas
   - Tardes
   - Pacientes atendidos

2. **Filtros**
   - Rango de fechas (desde / hasta)
   - Turno (todos / mañana / tarde)
   - Recurso (todos / Q1, Q2, etc.)

3. **Tabla de programación**
   - Fecha, turno, recursos asignados, consulta preanestesia, número de pacientes

4. **Pacientes atendidos**
   - Pacientes de reservas en recursos donde el anestesista está asignado
   - Sin duplicados por reserva
   - Campos: NHC, nombre, procedimiento, tipo de anestesia, seguro

5. **Exportar**
   - Botón "Copiar tabla" para pegar en Excel u otro

6. **Resúmenes**
   - Por mes
   - Por recurso
   - Por tipo de anestesia

---

## Cálculo de turnos

```
Para cada asignación (date, shift, slotType, anesthetistId):
  key = date + "|" + shift
  Si key ya está en el conjunto → no sumar (varios recursos mismo turno)
  Si no → sumar 1 al total, y a mañanas o tardes según shift
```

---

## Pacientes atendidos

```
Para cada asignación del anestesista (excluyendo consulta-preanestesia):
  Buscar reservas con (date, shift, resourceId) = asignación
  Para cada paciente en esas reservas:
    Si no está en "vistos" (por reserva+patient) → añadir a la lista
```

---

## Asignaciones en BD

Modelo `AnesthetistAssignment`:

- `date` (YYYY-MM-DD)
- `shift` (MORNING | AFTERNOON)
- `slotType` (Q1, Q2, consulta-preanestesia, etc.)
- `anesthetistId`

El gestor guarda asignaciones desde **Asignar anestesistas** → `PUT /api/anesthetist-assignments`.

---

## Estados visuales en el calendario

| Estado | Color | Descripción |
|--------|-------|-------------|
| Libre | Verde | Sin reserva |
| Reservado (sin pacientes) | Amarillo | Reserva sin pacientes programados |
| Ocupado (con pacientes) | Blanco/gris | Reserva con pacientes |
| Privado | Naranja | Algún paciente con financiación privada |

Los slots donde el anestesista está asignado muestran un borde resaltado.

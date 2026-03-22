# Análisis de "use client"

Objetivo: identificar componentes que usan `"use client"` sin necesitarlo y proponer conversión a Server Component o extracción en componentes cliente pequeños.

---

## Criterios

- **Necesita "use client":** hooks (`useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`), event handlers (`onClick`, `onChange`, etc.), `useRouter`, `useContext`, o acceso a APIs del navegador.
- **No necesita "use client":** componente puramente presentacional que solo recibe props y renderiza, sin hooks ni manejadores de eventos.

---

## Lista priorizada

### Prioridad ALTA – Quitar "use client" (cambio directo)

#### 1. `ConsultaPreanestesiaRow.tsx`

| Campo        | Valor                                                |
|-------------|-------------------------------------------------------|
| **Hooks**   | Solo `useMemo` para `getWeekDays(weekStart)`          |
| **Eventos** | Ninguno                                               |
| **Uso**     | Solo presentación (tabla consulta preanestesia)        |

**Propuesta:** Sustituir `useMemo` por cálculo directo y eliminar `"use client"`.

```tsx
// Antes
const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);

// Después (eliminar useMemo e import)
const weekDays = getWeekDays(weekStart);
```

`getWeekDays` es una función pura; el cálculo es barato. Al quitar `useMemo` el componente deja de necesitar "use client".

---

### Prioridad MEDIA – Redundancia (se puede quitar)

#### 2. `DaySlotGrid.tsx`

| Campo        | Valor                                                |
|-------------|-------------------------------------------------------|
| **Hooks**   | Ninguno                                               |
| **Eventos** | Solo pasa `onSlotSelect` a `SlotCell`; no maneja eventos directamente |
| **Uso**     | Presentacional; la interactividad está en `SlotCell`  |

**Propuesta:** Eliminar `"use client"` de `DaySlotGrid`.

Siempre se usa desde páginas con "use client" (`cirujano/page.tsx`, `calendario/page.tsx`), por lo que el límite ya está en el padre. Sin "use client", el componente sigue ejecutándose en cliente como hijo de un Client Component. Si en el futuro se refactoriza la página a Server Component con un wrapper cliente pequeño, `DaySlotGrid` podría llegar a ser Server Component sin cambios adicionales.

---

### Prioridad BAJA – Extraer subcomponentes presentacionales

#### 3. `VistaSemanal.tsx` → extraer `ReservationBlock`

| Campo   | Valor                                                                 |
|---------|-----------------------------------------------------------------------|
| **Uso** | `ReservationBlock` es un subcomponente interno puro; no usa hooks ni eventos |

**Propuesta:** Extraer `ReservationBlock` a un archivo separado sin `"use client"` y reutilizarlo desde `VistaSemanal`.

- Beneficio: código más modular y posible reutilización desde un Server Component.
- Impacto: bajo; el bloque sigue siendo hijo de un Client Component.

---

#### 4. `BloqueEstadoGrid.tsx`

| Campo        | Valor                                                               |
|-------------|---------------------------------------------------------------------|
| **Hooks**   | `useMemo` (weekDays, getCellInfo, rows)                            |
| **Eventos** | `onClick` en celdas                                                  |

**Propuesta:** Mantener `"use client"` (interactividad real).

Opcional: extraer la lógica de estilos/celdas a helpers o componentes puros para simplificar el componente, pero sigue necesitando "use client" por `onClick`.

---

## Componentes que DEBEN mantener "use client"

| Componente                   | Motivo principal                                                |
|-----------------------------|------------------------------------------------------------------|
| `AuthContext.tsx`           | `useContext`, estado de autenticación                            |
| `UsersContext.tsx`          | `useContext`                                                    |
| `page.tsx` (raíz)           | `useState`, `useRouter`, formularios                             |
| `cirujano/page.tsx`         | `useState`, `useRouter`, lógica de UI                            |
| `calendario/page.tsx`       | `useState`, `useRouter`, navegación                              |
| `registro/page.tsx`          | Formulario de registro                                          |
| `SlotCell.tsx`              | `onClick`, interactividad por celda                              |
| `WeekNavigation.tsx`        | Botones de navegación (onClick)                                  |
| `WeekGridCalendar.tsx`      | `useMemo`, botones de periodo, `onSelectDay`                     |
| `WeekCalendar.tsx`          | Integra componentes interactivos                                 |
| `VistaSemanal.tsx`          | `useState`, `useMemo`                                           |
| `GestionarApertura.tsx`      | `useState`, `useMemo`, `useEffect`, `useCallback`                |
| `AsignarAnestesistas.tsx`   | Gestión de asignaciones                                         |
| `CrearNuevoUsuario.tsx`     | Formulario                                                      |
| `ProgramarPacientesModal.tsx` | Modal y formulario                                             |
| `MiPerfil.tsx`              | `useState`, `useEffect`, `useRef`, formulario y foto             |
| `HistoricoView.tsx`         | `useState`, `useMemo`, filtros de fecha                         |
| `ContactarCoordinacion.tsx` | Formulario de contacto                                          |
| `MiProgramacion.tsx`        | Lista interactiva                                               |
| `SolicitarNoDisponibilidad.tsx` | Formulario                                                 |
| `ValoracionPreanestesia.tsx` | Formulario                                                     |

---

## Resumen de acciones sugeridas

| Prioridad | Archivo                | Acción                                              |
|-----------|------------------------|-----------------------------------------------------|
| ALTA      | `ConsultaPreanestesiaRow.tsx` | Eliminar `useMemo`, quitar `"use client"`           |
| MEDIA     | `DaySlotGrid.tsx`      | Quitar `"use client"` (redundante)                 |
| BAJA      | `VistaSemanal.tsx`     | Extraer `ReservationBlock` a archivo sin "use client" |

---

## Nota sobre jerarquía

En Next.js, todo componente hijo de un Client Component se ejecuta en el cliente. Quitar `"use client"` solo aporta beneficio cuando el componente puede ser hijo directo de un Server Component. De momento, todas las páginas son Client Components, así que el ahorro será limitado. Las acciones propuestas preparan el código para futuras refactorizaciones y reducen la superficie innecesaria de "use client".

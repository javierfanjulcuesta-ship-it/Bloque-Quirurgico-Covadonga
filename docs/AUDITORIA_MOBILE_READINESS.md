# Auditoría: preparación para experiencia tipo app móvil (PWA)

## Contexto

- App operativa con PWA (manifest + iconos ya implementados)
- Vista móvil prioritaria para CIRUJANO y ANESTESISTA
- GESTOR puede seguir siendo más de escritorio
- Enfoque conservador, sin reescribir la app

---

## 1. Mobile readiness general

### Lo que ya está bien

| Elemento | Estado |
|----------|--------|
| Viewport | `device-width`, `initialScale: 1` configurado |
| Layout base | `p-4`, `max-w-7xl`, `flex-wrap` en navs |
| Formularios login | `max-w-md`, inputs estándar |
| Modales | `fixed inset-0`, `p-4`, `max-w-*` con scroll interno |
| Contactar coordinación | Formulario simple, adaptable |
| DaySlotGrid | `overflow-x-auto` para scroll horizontal |
| UltimasLiberacionesView | Tabla con `overflow-x-auto` |
| NormasProgramacionView | Contenido vertical, cards, legible |

### Problemas principales

| Problema | Impacto |
|----------|---------|
| Nav cirujano: 7+ pestañas | Se apilan; en móvil pequeño puede requerir scroll vertical largo |
| Tablas anchas (640–900px) | Scroll horizontal obligatorio; poco natural en móvil |
| SlotCell compact: `p-1 text-xs` | Celdas muy pequeñas; difícil pulsar con el dedo |
| WeekGridCalendar: botones `h-9 w-9` (36px) | Por debajo del mínimo táctil recomendado (44px) |
| Mis pacientes: botón Cancelar `px-2 py-1 text-xs` | Target táctil demasiado pequeño |
| ProgramarPacientesModal | Formulario largo; en móvil `max-w-2xl` puede quedar apretado |

---

## 2. Flujos críticos para móvil

### Login / pantalla de acceso

| Aspecto | Estado | Notas |
|---------|--------|-------|
| Layout | ✓ Aceptable | `max-w-md`, centrado, `px-4` |
| Inputs | ✓ | Tamaño estándar |
| Botones | ✓ | `py-3` en principal |
| Modal contacto | ✓ | `max-w-lg`, `p-4` |
| Demo (selector usuario) | ⚠️ | Labels pequeños; usable pero ajustado |

**Clasificación:** Lista para móvil (con posible mejora menor en demo)

---

### Área CIRUJANO

#### Pestaña "Reservar / programar"

| Componente | Estado | Problema |
|------------|--------|----------|
| Nav pestañas | ⚠️ | 7 botones; flex-wrap ayuda pero se apilan |
| WeekGridCalendar | ⚠️ | Botones 36×36px; calendario 7 cols × 5 semanas; celdas pequeñas |
| DaySlotGrid | ⚠️ | Tabla min-w 400px; scroll horizontal aceptable |
| SlotCell | ❌ | `compact`: p-1, text-xs; celdas muy pequeñas para tocar |
| Leyenda colores | ✓ | Texto legible |
| Botón "Reservar y programar" | ✓ | Tamaño correcto |

**Clasificación:** Usable con pequeños cambios (aumentar targets táctiles)

#### Mis pacientes

| Aspecto | Estado |
|---------|--------|
| Tabla | ⚠️ min-w 640px, scroll horizontal |
| Botón Cancelar | ❌ px-2 py-1 text-xs (muy pequeño) |
| Modal confirmación | ✓ max-w-md, botones ok |

**Clasificación:** Necesita pequeños cambios (botón Cancelar)

#### Cancelar paciente

| Aspecto | Estado |
|---------|--------|
| Modal | ✓ Centrado, legible |
| Botones Volver / Confirmar | ✓ px-4 py-2 |

**Clasificación:** Lista para móvil

#### Normas de programación

| Aspecto | Estado |
|---------|--------|
| Contenido | ✓ Cards verticales, texto legible |
| Scroll | ✓ Natural |

**Clasificación:** Lista para móvil

#### Últimas liberaciones

| Aspecto | Estado |
|---------|--------|
| Tabla | ⚠️ min-w 400px, overflow-x-auto |
| Botón "Ir a Reservar" | ✓ |

**Clasificación:** Usable con scroll horizontal

#### Contactar coordinación

**Clasificación:** Lista para móvil

#### Histórico

| Aspecto | Estado |
|---------|--------|
| Tabla | overflow-x-auto presente; revisar min-w |

**Clasificación:** Usable (depende de HistoricoView; tiene overflow-x-auto)

---

### Área ANESTESISTA

#### Mi programación

| Componente | Estado |
|------------|--------|
| Tabs internos (mi-semana, pacientes, resumen) | ⚠️ Varios filtros y tabs |
| Tabla "Mi semana" | ❌ min-w 600px, columnas min-w 120px; scroll horizontal |
| Tabla "Pacientes atendidos" | ⚠️ min-w 600px |
| WeekNavigation | ✓ |

**Clasificación:** Necesita rediseño parcial (tablas anchas)

#### Valoración preanestesia

| Tabla | min-w 560px |

**Clasificación:** Usable con scroll horizontal

#### Solicitar no disponibilidad

| Aspecto | ✓ Formulario, layout flexible |

**Clasificación:** Lista o con cambios muy menores

#### Consulta preanestesia

| Tabla | min-w 400px |

**Clasificación:** Usable

---

### Área GESTOR

| Pantalla | Estado |
|----------|--------|
| Calendario principal | WeekCalendar min-w 800px – muy ancho |
| Asignar anestesistas | Tablas min-w 640px |
| Gestionar apertura | min-w 900px |
| Crear usuario / Lista usuarios | Formularios y tabla |

**Clasificación:** Mejor dejar para escritorio (Fase 3 o no priorizar)

---

## 3. Componentes problemáticos

### Tablas anchas

| Componente | min-width | overflow-x | Acción recomendada |
|------------|-----------|------------|---------------------|
| DaySlotGrid | 400px | ✓ | Dejar tal cual (scroll ok) |
| UltimasLiberacionesView | 400px | ✓ | Dejar tal cual |
| Mis pacientes (cirujano) | 640px | ✓ | Dejar tal cual en Fase 1 |
| MiProgramacion (anestesista) | 600px | ✓ | Dejar tal cual en Fase 2 |
| ValoracionPreanestesia | 560px | ✓ | Dejar tal cual |
| WeekCalendar (gestor) | 800px | ✓ | No tocar Fase 1–2 |
| GestionarApertura | 900px | ✓ | No tocar |
| AsignarAnestesistas | 640px | ✓ | No tocar |

### Calendarios

| Componente | Problema | Cambio mínimo |
|-------------|----------|---------------|
| WeekGridCalendar | Botones 36×36px | Aumentar a min-h-11 min-w-11 (44px) |
| WeekGridCalendar | grid-cols-7 con gap-1 | En móvil, aumentar gap |

### Grids / celdas

| Componente | Problema |
|------------|----------|
| SlotCell (compact) | p-1 text-xs; celda demasiado pequeña para tap |
| DaySlotGrid | 5 recursos × ~11 filas; celdas pequeñas |

### Modales

| Modal | Estado |
|-------|--------|
| ProgramarPacientesModal | max-w-2xl, max-h-90vh; en móvil ocupa bien la pantalla |
| Cancelar paciente | max-w-md; adecuado |
| Contacto (login) | max-w-lg; adecuado |

### Formularios

| Formulario | Estado |
|------------|--------|
| Login | ✓ |
| Contactar coordinación | ✓ |
| ProgramarPacientesModal | sm:grid-cols-2; en móvil columna única; ok |
| Solicitar no disponibilidad | ✓ |

### Botones demasiado pequeños

| Ubicación | Clase actual | Recomendación |
|-----------|--------------|---------------|
| Mis pacientes – Cancelar | px-2 py-1 text-xs | min-h-10 px-4 py-2 text-sm |
| WeekGridCalendar día | h-9 w-9 | min-h-11 min-w-11 |
| SlotCell (compact) | p-1 | p-2 (o min-h-10) en móvil |
| Algunos nav secundarios | text-xs | Mantener; no críticos |

---

## 4. Clasificación por zonas

### Lista para móvil

- Login (modo real)
- Normas de programación
- Contactar coordinación
- Modal cancelar paciente
- Solicitar no disponibilidad (anestesista)
- Pestaña Resumen (MiProgramacion) – cards y números

### Usable con pequeños cambios

- Reservar / programar (cirujano): aumentar SlotCell y WeekGridCalendar
- Mis pacientes: botón Cancelar más grande
- Últimas liberaciones: aceptar scroll horizontal
- Valoración preanestesia: aceptar scroll horizontal

### Necesita rediseño parcial

- Mi programación (anestesista): tablas "Mi semana" y "Pacientes"; considerar vista simplificada móvil (cards por turno)
- Consulta preanestesia: tabla ancha

### Mejor dejar para escritorio

- Gestionar apertura (min-w 900px)
- Asignar anestesistas (complejidad alta)
- Crear usuario + lista (muchos campos)
- WeekCalendar gestor (800px)
- Normas gestor (edición)

---

## 5. Plan conservador por fases

### Fase 1: CIRUJANO móvil (prioridad)

**Objetivo:** Que un cirujano pueda usar la app en móvil de forma cómoda para flujos habituales.

| Cambio | Archivo | Esfuerzo |
|--------|---------|----------|
| SlotCell: min tap target 44px en móvil | SlotCell.tsx | Bajo |
| WeekGridCalendar: botones 44×44px | WeekGridCalendar.tsx | Bajo |
| Botón Cancelar en Mis pacientes: min-h-10 px-4 | cirujano/page.tsx | Bajo |
| Nav cirujano: considerar scroll horizontal o menú colapsable | cirujano/page.tsx | Medio |

**No tocar en Fase 1:**

- Estructura de DaySlotGrid (scroll horizontal aceptable)
- ProgramarPacientesModal (ya usable)
- UltimasLiberacionesView
- Normas, Contactar coordinación, Histórico

---

### Fase 2: ANESTESISTA móvil

**Objetivo:** Anestesista pueda ver su programación y acciones clave en móvil.

| Cambio | Archivo | Esfuerzo |
|--------|---------|----------|
| MiProgramacion: asegurar overflow-x en todas las tablas | Ya presente | — |
| ValoracionPreanestesia: revisar legibilidad en móvil | ValoracionPreanestesia.tsx | Bajo |
| Considerar vista "Resumen" por defecto en móvil | MiProgramacion.tsx | Medio |
| Tabs Mi programación: botones más grandes en móvil | MiProgramacion.tsx | Bajo |

**No tocar en Fase 2:**

- Rediseño completo de tablas a cards
- Gestionar apertura, Asignar anestesistas

---

### Fase 3: Gestor (solo donde compense)

**Objetivo:** Usos básicos del gestor en tablet/móvil grande.

| Cambio | Prioridad | Notas |
|--------|-----------|-------|
| Calendario gestor: mejora scroll | Baja | WeekCalendar ya tiene overflow-x |
| Mensajes: lista legible | Media | Revisar en móvil |
| Crear usuario: formulario responsive | Baja | Ya tiene max-w-md |

**No tocar en Fase 3:**

- Gestionar apertura (900px)
- Asignar anestesistas (complejidad)
- Normas gestor (edición)

---

## 6. Resumen ejecutivo

### Lista priorizada de cambios

| # | Cambio | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 1 | SlotCell: min 44px tap target en móvil | Alto | Bajo |
| 2 | WeekGridCalendar: botones 44×44px | Alto | Bajo |
| 3 | Mis pacientes – botón Cancelar más grande | Medio | Bajo |
| 4 | Nav cirujano: menú hamburguesa o scroll horizontal | Medio | Medio |
| 5 | MiProgramacion: tabs y botones más táctiles | Medio | Bajo |
| 6 | ProgramarPacientesModal: revisar en viewports muy pequeños | Bajo | Bajo |

### Cambios mínimos recomendados (Fase 1)

1. **SlotCell.tsx:** Añadir `min-h-[44px] min-w-[44px]` o `p-2` cuando `compact` en viewport móvil (p. ej. `@media (max-width: 640px)` o clase `min-[640px]:p-1` y por defecto `p-2`).
2. **WeekGridCalendar.tsx:** Cambiar `h-9 w-9` a `min-h-11 min-w-11` (44px).
3. **cirujano/page.tsx (Mis pacientes):** Botón Cancelar de `px-2 py-1 text-xs` a `min-h-10 px-4 py-2 text-sm`.

### Qué dejar tal cual

- DaySlotGrid: scroll horizontal
- UltimasLiberacionesView: scroll horizontal
- Tabla Mis pacientes: scroll horizontal
- NormasProgramacionView
- Contactar coordinación
- Modal cancelar paciente
- Login

### Qué no tocar todavía

- Gestionar apertura
- Asignar anestesistas
- WeekCalendar (gestor)
- Rediseño de tablas a cards
- Nav gestor (muchas pestañas)
- ListaUsuariosGestor / CrearNuevoUsuario

### Edge cases a vigilar

1. **Teclado virtual:** Formularios extensos (ProgramarPacientesModal) pueden desplazar botones fuera de vista; asegurar scroll o anclaje de acciones.
2. **Orientación horizontal:** Tablas muy anchas en landscape siguen requiriendo scroll; no es crítico.
3. **PWA standalone:** Sin barra de direcciones; confirmar que los modales y mensajes de error siguen siendo visibles.
4. **Zoom:** `user-scalable` no restringido en viewport; correcto para accesibilidad.

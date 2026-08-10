# UX / UI

**Score:** 52/100  
**Referencia previa útil:** `docs/AUDITORIA_MOBILE_READINESS.md` (sigue vigente en lo esencial)

---

## 1. Modelo de navegación

- Pocas rutas reales; **muchas pestañas** dentro de `/calendario` y `/cirujano`.
- Gestor: densidad alta (calendario, mensajes, usuarios, anestesistas, normas, cuadro, perfil, enlace reservar).
- Cirujano: reservar, pacientes, histórico, normas, liberaciones, contacto, perfil.
- Anestesista: calendario, programación, indisponibilidad, preanestesia, histórico (stub), perfil.

**Problema estructural:** demasiadas acciones al mismo nivel → carga cognitiva y wrap en móvil.

---

## 2. Pantallas clave

### `/calendario`
- Fortaleza: visión operativa semanal, leyenda de estados, refresh.
- Debilidad: grids anchos (`min-w` altos), scroll horizontal; gestor desktop-first.
- Loading/empty: presentes; redirects de cirujano pueden flash vacío.

### `/cirujano` · Reservar/programar
- Flujo principal claro (día → slots → reservar/programar).
- Targets táctiles pequeños (`SlotCell` compact, week cells ~36px).
- Multi-select / drag orientado a ratón.

### Programar pacientes (modal)
- `max-h-[90vh] overflow-y-auto` mitiga desborde (mejora vs modales sin scroll).
- Formulario largo; acciones al fondo pueden quedar lejos.
- **Bug UX:** soft-fail en `onSave` puede **cerrar el modal** (no lanza throw).
- Falta `aria-modal` / focus trap / Escape consistente.

### Asignación anestesistas
- Tabla densa; usable en desktop; móvil solo con scroll.
- Confirmaciones de límite/indisponibilidad; botón confirm no siempre disable en saving.

### Preanestesia
- Valoración y filas de consulta; depende de datos de reservas.
- Autocita es backend/invisible — poca transparencia al usuario de “qué se ha citado”.

### Gestión usuarios
- Flujos crear / lista / baja / reinvitar — aceptables en desktop.
- Passwords temporales por UI/JSON — cuidado de exposición visual.

### Histórico
- Cirujano: filtro sobre reservas cargadas.
- Anestesista: “en desarrollo”.

### Cuadro de mando
- Muy potente y **muy denso** (~2800 líneas UI).
- Múltiples tabs de decisión; no es móvil-first (aceptable si se declara desktop-only).

### Normas
- Lectura cirujano vs edición gestor.
- Riesgo UX: usuario cree que editar norma cambia el motor (no siempre).

### Perfil / mensajes
- Perfil y contacto razonables.
- Mensajes reales vía ContactMessage; demo localStorage.

---

## 3. Responsive · Desktop / Tablet / Móvil

| Aspecto | Desktop | Tablet | Móvil |
|---------|---------|--------|-------|
| Login | Bueno | Bueno | Bueno |
| Calendario gestor | Bueno | Regular | Débil |
| Cirujano reservar | Bueno | Regular | Débil (targets) |
| Modales | Regular | Regular | Mejorable (sticky actions) |
| Cuadro mando | Bueno | Pesado | No prioritario |
| Asignar anest. | Bueno | Regular | Débil |

---

## 4. Feedback y estados

| Patrón | Evaluación |
|--------|------------|
| Loading | Presente en shells principales; Asignar sin loading claro |
| Error | InlineNotice; a veces variant confuso (info en rojo) |
| Empty | Generalmente con copy |
| Success | Auto-dismiss corto — puede pasar desapercibido |
| Confirmaciones destructivas | Sí en cancelaciones |
| Double-submit | Parcial (saving flags) |

---

## 5. Accesibilidad

- Labels en formularios: mayormente OK.
- Dialog semantics: inconsistente.
- SlotCell como botón sin teclado.
- Contraste helpers slate bajos.
- Targets &lt; 44px en controles críticos.

---

## 6. Qué simplificar (prioridad UX)

1. **Separar** “operación del día” vs “administración” en gestor (menos tabs simultáneas).  
2. **Sticky footer** en modal programar + no cerrar en soft-fail.  
3. **Aumentar hit areas** de slots en móvil (modo “touch”).  
4. Declarar Cuadro de mando **solo desktop**.  
5. Histórico anestesista: o implementar mínimo o ocultar tab.  
6. Unificar vocabulario estados (PENDING/CONFIRMED/RELEASED) en leyenda siempre visible.  
7. Quitar/ocultar features stub (apertura bloque) del mental model.  
8. Reducir botones duplicados (quick actions vs tabs).

---

## 7. PWA

- Manifest presente; theme colors ligeramente inconsistentes con layout.
- Iconos referenciados **ausentes** en `public/`.
- Sin service worker (installable limitada).
- `InstallPrompt` no montado.

---

## Conclusión

UX **válida para piloto desktop**; **no lista** como app móvil hospitalaria pulida. El mayor ROI: flujos cirujano táctiles + modal programar robusto + recorte de navegación gestor.

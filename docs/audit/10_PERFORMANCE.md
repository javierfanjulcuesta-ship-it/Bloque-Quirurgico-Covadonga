# Performance

**Score:** 60/100  
**Enfoque:** cuellos reales/previsibles — sin micro-optimizar.

---

## 1. Hallazgos

### Base de datos / Prisma
- Listado de reservas por rango de fechas (bien: se exige rango).
- Includes de `patients` en selects amplios → **overfetch** para pintar calendario.
- Cron: N updates secuenciales + N eventos.
- Unique/indexes en slots y assignments: buenos para paths calientes.
- Falta índice compuesto frecuente `(date, status)` podría ayudar al cron/listados (medir antes).
- `anesthetistId` sin FK/índice dedicado en Reservation.

### API
- Multi-slot = N round-trips HTTP desde el cliente.
- PUT asignaciones borra y recrea todo el set (OK a escala pequeña).
- Sin paginación en listados de usuarios/reservas de rangos grandes.

### Frontend
- `CuadroDeMando.tsx` (~2800 líneas): cálculos pesados en cliente (`optimizationEngine`, economía).
- Shells recargan reservas y derivan muchas vistas.
- Riesgo re-render: hooks lint (conditional useMemo, deps) sugieren fricción React Compiler / calidad.
- Grids con `min-w` altos: coste de layout/scroll, no CPU crítico.

### Bundles
- `xlsx`, `pdfjs-dist` para import planificación — deben ir code-split / solo esa ruta (verificar que no contaminen login).
- Metrics libs importadas desde cuadro — OK si solo gestor carga esa tab (hoy puede estar en mismo chunk del shell).

### Polling / leaks
- No hay polling agresivo detectado; refresh manual/timestamp.
- Timers de auto-dismiss de notices — leves.

### Serverless
- Prisma singleton presente (adecuado).
- Cold start + `prisma generate` en build (OK).
- Timeouts: cron con muchas PENDING puede acercarse al límite.

---

## 2. Cuellos previsibles al crecer

| Escala | Riesgo |
|--------|--------|
| Más quirófanos / semanas en rango | Payload reservas+pacientes grande |
| Cuadro de mando sobre meses | CPU browser + memoria |
| Muchos gestores concurrentes | Last-write-wins assignments; locks BD |
| Email webhook picos | Procesado síncrono en request |

---

## 3. Recomendaciones (priorizadas, no implementar aún)

1. Selects por rol (anestesista/cirujano: menos campos PII/métricas).  
2. Endpoint batch multi-slot.  
3. Mover agregaciones del cuadro a API/SQL o precomputar.  
4. Dynamic import de xlsx/pdfjs y de CuadroDeMando.  
5. Medir con query logging Prisma en staging antes de índices nuevos.  
6. Paginar histórico/usuarios.

---

## 4. Conclusión

Para piloto actual el rendimiento es **aceptable**. El riesgo no es “lento hoy”, sino **payloads clínicos grandes + dashboard monolítico** cuando crezca el uso.

# Edge cases (≥50)

Clasificación basada en evidencia de código (2026-08-10).  
**C** = cubierto · **P** = parcialmente · **N** = no cubierto

| # | Edge case | Estado |
|---|-----------|:------:|
| 1 | Usuario pierde sesión a mitad de programar | P (API 401; UI puede mostrar error genérico) |
| 2 | Dos cirujanos reservan el mismo hueco | C (unique + P2002) |
| 3 | Anestesista deja de estar disponible | P (aviso UI localStorage; no bloqueo server) |
| 4 | Paciente se cancela (último) antes de cierre | C → PENDING |
| 5 | Paciente se cancela (último) después de cierre | C → RELEASED |
| 6 | Reserva queda sin paciente (hold) | C (PENDING vacío permitido) |
| 7 | Relación Prisma nullable (`anesthetistId`, fullName…) | C (modelo); P (integridad) |
| 8 | Fecha cambia por timezone (CET/CEST) | P/N (mezcla UTC/local/Madrid) |
| 9 | Cambio horario verano/invierno cerca de deadline | P |
| 10 | Reserva cruza cierre semanal | C/P (reglas retention) |
| 11 | Petición HTTP repetida create vacío | C (idempotente same surgeon) |
| 12 | Double click guardar pacientes | C/P (saving flag) |
| 13 | Refresh a mitad de operación | P (estado cliente perdido; server puede quedar parcial multi-slot) |
| 14 | Email falla (SMTP/Graph) | P (mock fallback / logs; release notification status) |
| 15 | BD temporalmente inaccesible | P (500 genéricos) |
| 16 | Supabase/Neon pausado | N (no degradación elegante documentada en UI) |
| 17 | Vercel function timeout en cron largo | P (loop secuencial) |
| 18 | Soft-fail modal cierra igual | N |
| 19 | Backdrop cierra modal mientras saving | N |
| 20 | Multi-slot: falla el 2º POST | N (parcial) |
| 21 | Concurrent add patients a PENDING vacío | N |
| 22 | Reuso concurrente CANCELLED/RELEASED | P |
| 23 | Overflow TOCTOU | P |
| 24 | Cancel reservation ya CANCELLED | P (re-log) |
| 25 | Cancel sin force con pacientes | C (409) |
| 26 | Force cancel | C |
| 27 | Anesthetist PUT vacío con datos | C (409) |
| 28 | Dos gestores overwrite asignaciones | N |
| 29 | SESPA sin anestesista canSespa | C |
| 30 | Endoscopista en quirófano no permitido | C/P (reglas UI/recursos) |
| 31 | Programar con duración > huecos | C (over flag) |
| 32 | `cualquier-quirofano` sin OR libre | C (mensaje); P (cierre modal) |
| 33 | JWT tras deactivate | N (sticky) |
| 34 | Anestesista GET reserva ajena por ID | N (IDOR) |
| 35 | Cron sin CRON_SECRET en preview | N/P |
| 36 | Webhook secret inválido | C (401) |
| 37 | Contact spam flooding | P (rate limit pendiente) |
| 38 | Login brute force | C (rate limit memoria) |
| 39 | Schema drift patientEmail | N históricamente (P2022) |
| 40 | Enum event value ausente en BD | N (insert event falla) |
| 41 | PWA icon 404 | N |
| 42 | Demo mode en production build | C (bloqueado) |
| 43 | Usuario sin approved intenta API | P (login bloquea; JWT viejo no) |
| 44 | Soft-delete user con reservas | P (restrict surgeon FK) |
| 45 | Cascade delete anesthetist assignments al borrar user | C (peligroso si hard delete) |
| 46 | Preanestesia sin slots libres | C (evento NO_SLOT / deferred) |
| 47 | Urgencia diferida | C (phase2) |
| 48 | Circuit email dry-run vs real | C (dry-run only) |
| 49 | Norma transition_minutes editada | N (no efecto runtime) |
| 50 | Apertura bloque CLOSED | N (stub always OPEN) |
| 51 | Import planificación escribe BD | C (no escribe — preview) |
| 52 | Historico anestesista | N (stub) |
| 53 | WeekCalendar date key UTC vs local | N riesgo |
| 54 | Teclado en SlotCell | N |
| 55 | Modal Escape/focus trap | N |
| 56 | Auto-dismiss error &lt; lectura | P |
| 57 | Fetch asignaciones falla → UI vacía | P |
| 58 | Password regenerate expuesto en pantalla | P (operativo) |
| 59 | Concurrent cron + program same slot | P |
| 60 | Reserva PENDING con pacientes inconsistente | P (status CONFIRMED al programar) |
| 61 | Double submit alarm confirm asignar | N |
| 62 | Rol desconocido → mapea gestor | N (fail-open) |
| 63 | Logs email con destinatario | P (minimización) |
| 64 | Showcase reset en prod por error | N (riesgo operativo scripts) |
| 65 | Migración phase2 reaplicada | N (falla si columnas existen) |

---

## Prioridad de mitigación

1. IDOR, sticky JWT, default rol (seguridad).  
2. Multi-slot atómico + empty-hold race.  
3. Timezone Madrid unificado.  
4. Modal soft-fail / saving guards.  
5. Tests que fijen C como regresión.

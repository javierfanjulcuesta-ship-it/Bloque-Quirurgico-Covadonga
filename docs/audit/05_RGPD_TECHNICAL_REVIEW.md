# RGPD — Revisión técnica (no dictamen legal)

**Importante:** análisis técnico orientado a minimización, least privilege, trazabilidad y confidencialidad. **No** es una conclusión jurídica ni un DPIA.

**Score orientativo de postura técnica:** 45/100

---

## 1. Qué datos de paciente se almacenan

En `PatientInBlock` (PostgreSQL):

| Dato | Campo | ¿Necesario operativo? |
|------|-------|------------------------|
| Nº historia | `historyNumber` | Sí (identificación clínica operativa) |
| Nombre completo | `fullName` | Probable; valorar minimización |
| Procedimiento | `procedure` | Sí |
| Duración estimada | `estimatedDurationMinutes` | Sí |
| Tipo anestesia | `anesthesiaType` | Sí |
| Mutua/seguro | `insuranceType` | Operativo/financiación |
| Ingreso | `admissionType` | Operativo |
| Notas | `notes` | Riesgo alto de exceso |
| Recursos | `solicitudRecursos` | Operativo |
| Email paciente | `patientEmail` | Circuito preanestesia futuro |
| Teléfono | `patientPhone` | Idem |
| Estados circuito | workflow/preanes/financing | Proceso |
| Cita preanestesia | `preanesthesiaAppointmentAt` | Proceso |
| Urgencia diferida / motivo | `isDeferredUrgency`, `specialCircuitReason` | Proceso |

También: cirujano, quirófano, fecha/turno, anestesista asignado (en assignment o campo suelto).

---

## 2. Dónde circulan

| Canal | Contenido típico |
|-------|------------------|
| BD PostgreSQL | Fuente de verdad |
| API JSON al navegador | Casi todos los campos anteriores en reservas |
| Estado React / memoria cliente | Listas de reservas y pacientes en shells |
| localStorage (demo/aux) | Mensajes, notificaciones, indisponibilidades — **no** debería haber pacientes en modo real |
| Emails | Invitaciones usuarios; liberaciones (slots, no necesariamente PII paciente); circuit **dry-run** (loguea `wouldSendTo`) |
| `ReservationEvent.detailsJson` | Puede incluir patientId, emails en dry-run |
| `EmailMessage` | Cuerpos de correo entrantes (posible PII) |
| Logs servidor | `console.error`, email `to`+subject; mock imprime cuerpo |
| URLs | IDs de reserva en paths API; no NH en query típica |
| Histórico UI | Reusa reservas cargadas (PII en cliente) |

---

## 3. Quién puede acceder (técnico)

| Rol | Alcance PII pacientes |
|-----|------------------------|
| GESTOR / GESTOR_ANESTESISTA | Global en rango consultado |
| CIRUJANO / ENDOSCOPISTA | Propias; ajenas stripped en listado |
| ANESTESISTA | Listado restringido; **detalle por ID potencialmente global (IDOR)** |
| Cron / webhook | Sistema |

Least privilege: **parcial**. Gestores ven todo (esperable). Anestesista detalle: **exceso**.

---

## 4. Retención / borrado

| Mecanismo | Estado |
|-----------|--------|
| TTL automático pacientes | **No implementado** |
| Soft-delete usuarios | Sí (`deletedAt`) |
| Cascade borrar reserva → pacientes | Sí (pérdida irreversible de PII al cancelar con force) |
| Políticas documentadas | Hay docs de retención/cierre de **huecos**, no de caducidad de PII |
| Derecho de acceso/supresión | No hay flujos técnicos específicos |

---

## 5. Minimización — hallazgos

1. Email/teléfono paciente ya en modelo aunque el envío real del circuito sea dry-run.  
2. `notes` / `specialCircuitReason` texto libre sin clasificación.  
3. Over-fetch: calendario carga pacientes para pintar slots.  
4. Cuadro de mando / métricas pueden procesar PII en cliente innecesariamente según selects.  
5. Seed/showcase scripts pueden crear datos ficticios — riesgo si se ejecutan en prod.  
6. Eventos dry-run guardan `patientEmail` en `detailsJson`.

---

## 6. Confidencialidad / trazabilidad

| Principio | Postura |
|-----------|---------|
| Confidentiality | Cookie httpOnly ayuda; IDOR y sesión sticky debilitan |
| Traceability | `ReservationEvent` parcial; `UserAuditEvent` no-op |
| Integrity | Unique slot ayuda; races multi-slot debilitan |
| Availability | Dependencia Supabase/Neon (histórico de pausa) |

---

## 7. Recomendaciones técnicas (no legales)

1. Cerrar IDOR y revisar selects por rol (mínimos campos).  
2. No persistir email/teléfono hasta que el circuito real lo necesite — o cifrar/restringir acceso.  
3. Activar auditoría de accesos a detalle de paciente (quién leyó qué).  
4. Política de retención + job de anonimización post-alta.  
5. Evitar PII en logs y en `detailsJson` de dry-runs (usar IDs).  
6. Inventario de tratamientos + base legal: trabajo con DPO (fuera de esta auditoría).

---

## 8. Conclusión técnica

La app **almacena y distribuye datos clínicos identificables** de forma coherente con un bloque quirúrgico, pero **aún no demuestra minimización estricta ni trazabilidad de acceso**. Prioridad: least privilege en APIs + dejar de ensanchar el modelo de contacto hasta gobernar migraciones y permisos.

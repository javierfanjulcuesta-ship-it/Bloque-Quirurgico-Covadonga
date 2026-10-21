# Estado actual

La rama de trabajo es `hardening/integration`. `main` (`c905836`) es un checkpoint de mayo y no describe esta aplicación.

## Política de datos de pacientes

Los datos identificativos de pacientes reales solo pueden vivir en el Excel maestro, fuera de la aplicación. La base de esta app no es el archivo clínico.

La importación de `1_PROGRAMA` y `DATOS_IQ` se hace en memoria en la misma petición:

- valida las hojas y rechaza una columna DNI, NIE o NIF sin guardar el valor;
- marca `FUENTE_INCOMPLETA` si un fichero posterior trae menos casos de esas fechas;
- marca `NOMBRE_DIVERGENTE` si la misma historia llega con otro nombre, sin fusionar;
- calcula solapes y el resto de alertas de programa;
- devuelve el parte (solo iniciales) en la respuesta, sin guardarlo.

Si existe `INTAKE_FINGERPRINT_SALT` (24 caracteres o más, fuera del repositorio), se guarda `IntakeBatch` + `IntakeFingerprint`: recuentos, fechas y HMAC-SHA256. No se guarda nombre, iniciales, historia, DNI, teléfono ni email. Sin esa sal no se escribe nada: la revisión vale solo para la sesión.

La respuesta al gestor que acaba de subir el fichero tampoco devuelve nombre ni historia. El parte de esa respuesta lleva iniciales y no se almacena.

## Modelos que todavía guardan datos de paciente

Estas tablas ya existían para la reserva por tramo. Este corte no las vacía: dejar de escribirlas de golpe rompería el calendario actual. La dirección propuesta es dejar de aceptar altas con identificadores y, en una migración posterior, separar el dato clínico del dato operativo.

| Modelo | Qué guarda hoy | Límite propuesto |
| --- | --- | --- |
| `PatientInBlock` | historia, nombre, procedimiento, teléfono, email, notas | Dejar de escribir historia, nombre, teléfono y email. Conservar solo duración, estado de circuito y un identificador interno. El nombre vive en el Excel de la sesión. |
| `EmailMessage` | remitente y cuerpo del correo, que puede incluir pacientes | No crear reservas desde el webhook. El cuerpo ya recibido sigue en la tabla; no indexar ni reexportar historia o teléfono. |
| `OutboundDraft` | texto del parte, con iniciales, y email del destinatario profesional | El parte del maestro ya no se guarda. Los borradores antiguos deberían caducar sin copiarse a nuevos listados. |
| `Proposal.payloadJson` | iniciales, historia y procedimiento si el correo los traía | El agente ya elimina teléfono y email. Quitar también la historia del payload y guardar solo el id de la propuesta. |
| `ScheduleChange` | JSON de antes/después; una suspensión puede incluir la historia | Guardar solo tipo, motivo y ids internos. La exportación semanal ya no vuelca ese JSON. |
| `ContactMessage` | nombre y email de quien escribe a la pantalla de acceso | Es contacto profesional o de acceso, no un paciente. No mezclarlo con el Excel clínico. |

`scripts/lib/seedShowcaseImplementation.ts` es anterior a estos PR y aún inserta nombres de demostración que parecen personas. No debe ejecutarse contra una base real. Conviene sustituirlos por `Paciente Prueba NN` y `TEST-00NN` antes de cualquier semilla de prueba.

## Cómo probar en una base que no sea producción

No usar la base de Vercel. Hace falta un Postgres local y las variables `DATABASE_URL` y `DIRECT_URL` apuntando a él. No hace falta semilla.

```bash
npx prisma migrate deploy
```

Eso reconstruye el esquema desde las migraciones, incluida `20261021150000_intake_fingerprints`, que borra `IntakeRow` y `PatientIdentity` si llegaron a crearse.

Para comparar dos Excel hace falta exportar `INTAKE_FINGERPRINT_SALT` en ese entorno, con un valor largo que no se sube al repositorio. Sin esa variable, la revisión del maestro funciona y no escribe.

# Estado actual

La rama de trabajo es `hardening/integration`. `main` (`c905836`) es un checkpoint de mayo y no describe esta aplicación. Los documentos `AUDITORIA_PROYECTO.md`, `NOTA-LOCALSTORAGE-VS-BASE-DATOS.md`, `docs/AUDITORIA-*` y la revalidación `docs/audit/15_MAIN_REVALIDATION.md` quedan marcados como históricos: describen localStorage o ese checkpoint, no el código de esta rama.

La aplicación ya persiste en Postgres (reservas, usuarios, asignaciones, ausencias, reglas, borradores). El modo demo con localStorage sigue existiendo solo para desarrollo local.

## Política de datos de pacientes

Los datos identificativos de pacientes reales solo pueden vivir en el Excel maestro, fuera de la aplicación. La base de esta app no es el archivo clínico.

La importación de `1_PROGRAMA` y `DATOS_IQ` se hace en memoria en la misma petición:

- valida las hojas y rechaza una columna DNI, NIE o NIF sin guardar el valor;
- marca `FUENTE_INCOMPLETA` si un fichero posterior trae menos casos de esas fechas;
- marca `NOMBRE_DIVERGENTE` si la misma historia llega con otro nombre, sin fusionar;
- calcula solapes y el resto de alertas de programa;
- devuelve el parte (solo iniciales) en la respuesta, sin guardarlo.

Si existe `INTAKE_FINGERPRINT_SALT` (24 caracteres o más, fuera del repositorio), se guarda `IntakeBatch` + `IntakeFingerprint`: recuentos, fechas y HMAC-SHA256 de historia, nombre y caso. No se guarda nombre, iniciales, historia, DNI, teléfono ni email. Sin esa sal no se escribe nada: la revisión vale solo para la sesión.

La respuesta al gestor que acaba de subir el fichero tampoco devuelve nombre ni historia. El parte de esa respuesta lleva iniciales y no se almacena. No se crea una reserva desde el Excel.

Los partes de cirujano que ya estaban en bandeja se generan desde la reserva existente y solo se envían si un gestor pulsa enviar en un borrador concreto. El webhook de correo crea una propuesta, no una reserva ni un envío.

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

La hoja **Semana para imprimir** lee `PatientInBlock` que ya está en la reserva, calcula las iniciales en ese momento y no las guarda. No imprime historia, teléfono ni email. Hasta aplicar la migración de la tabla, ese cálculo sigue dependiendo de que el nombre esté en la reserva. No es un almacén nuevo.

`scripts/lib/seedShowcaseImplementation.ts` es anterior a estos PR y aún inserta nombres de demostración que parecen personas. No debe ejecutarse contra una base real. Conviene sustituirlos por `Paciente Prueba NN` y `TEST-00NN` antes de cualquier semilla de prueba. No lanzar `db:seed`, `usuarios:prueba` ni `seed:showcase` contra Vercel.

## Endoscopias

`ENDO` es un recurso propio, con etiqueta Endoscopias. El parser del maestro y del correo reconocen «endoscopias» o `ENDO` y no los mandan a procedimientos menores ni a Q1. El endoscopista puede usar ENDO, procedimientos menores y técnicas del dolor. El cupo, las asignaciones y el parte tratan ENDO como sala: hace falta anestesista si hay casos, y salta la alerta de sala vacía si hay anestesista y no hay pacientes. Una asignación antigua con recurso `endoscopias` cuenta como cobertura de ENDO. Aprobar o importar el maestro no crea filas `PatientInBlock`.

## Reglas de programación

`src/lib/programmingRules.ts` lee la tabla `ProgrammingRule`. Si la tabla no tiene ninguna fila, usa las constantes (cierre el jueves, 10 minutos de transición, 4 semanas). Si hay filas, solo vale la fila activa de esa clave. Una clave ausente o inactiva devuelve vacío y no cae a la constante.

## CI

`.github/workflows/pr-checks.yml` corre en cualquier pull request, también si la base es otra rama `cursor/*`:

- typecheck, `npm test` y `npm run build`;
- eslint comparado con `scripts/ci/eslint-error-baseline.json` (20 errores ya conocidos de hooks y un `any`). Falla si aparece un error nuevo. No desactiva reglas;
- Postgres 16 vacío: `prisma migrate deploy`, `migrate status`, `migrate diff` y las pruebas `test:*integration`. Comprueba que `IntakeFingerprint` existe y que `IntakeRow` y `PatientIdentity` no. La cadena ya tiene `0_baseline_production_20260811`; no hace falta otro baseline si ese job pasa.

Ese job de Postgres no se ejecutó en la máquina donde se escribió el workflow.

## Orden de revisión

Los PR están encadenados. Conviene mirarlos en este orden, cada uno contra su base, sin mezclarlos en `main`:

1. Alertas de programa, sin caer a Q1.
2. Cupo de anestesia en servidor y ausencias en Postgres.
3. Turno y quirófano habitual como sugerencia, sin grabarlos solos.
4. Bandeja: el envío y la reserva solo salen de una acción explícita.
5. Importación del Excel maestro. Este PR todavía diseñaba filas identificativas; lo sustituye el siguiente.
6. Reglas leídas de `ProgrammingRule`.
7. Importación en memoria, sin guardar nombre, historia, teléfono ni email.
8. Endoscopias como recurso ENDO.
9. CI de pull request.
10. Semana para imprimir.
11. Este documento y las marcas de obsoleto.

## Cómo probar en una base que no sea producción

No usar la base de Vercel ni ejecutar semillas. Hace falta un Postgres vacío de prueba y `DATABASE_URL` / `DIRECT_URL` apuntando a él.

```bash
npx prisma migrate deploy
npx prisma migrate status
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
npm test
```

`migrate deploy` aplica la cadena completa, crea `IntakeRow` y `PatientIdentity` y, en la migración siguiente, las borra. Al terminar no deben existir. Para comparar dos Excel en local:

```bash
export INTAKE_FINGERPRINT_SALT="una-sal-de-prueba-de-24-caracteres-minimo"
```

Ese valor no se sube al repositorio. Sin la variable, la revisión del maestro funciona y no escribe.

Qué mirar en cada bloque, con datos ficticios (`Paciente Prueba 01`, historia `TEST-0001`):

- Alertas: solape real de minutos, paciente sin quirófano, día y turno con pacientes y sin anestesista de sala, más de tres cirujanos, y que un quirófano desconocido no se convierta en Q1.
- Anestesia: el tope por defecto es 2 quirófanos a la vez. El tope 3 de Cárcelen y Fanjul, y el 2 de Dura, están en datos de catálogo, no en un `if` con el apellido. Guardar asignaciones sustituye solo la semana. Una ausencia vive en Postgres. Si alguien está en Endoscopias o menores sin pacientes, hay alerta y no se le mueve solo.
- Hábitos: Muel, Huéscar y Corona sugieren mañana; Blanco, tarde; Huéscar, Q2. La sugerencia marca `TURNO_INFERIDO` o `QUIROFANO_INFERIDO` y no rellena la reserva si el dato falta.
- Bandeja: suspender no borra al paciente. Los motivos son sin seguro, proceso catarral, cancelación del cirujano y otro. Reprogramar un hueco inválido responde 409. El parte usa la línea `día DD/MM · HH:MM · TURNO · I.N.I. — procedimiento`, la firma del gestor, el teléfono `603 618 877` y `quirofano.covadonga@riberacare.com`. El correo sale solo al pulsar enviar en ese borrador. `GET /api/agent/week` con token de servicio no devuelve teléfono ni email.
- Excel: subir `1_PROGRAMA` o `DATOS_IQ`. Un segundo fichero con menos casos de esas fechas marca `FUENTE_INCOMPLETA`. La misma historia con otro nombre marca `NOMBRE_DIVERGENTE` y no fusiona. Una columna DNI rechaza el fichero. La descarga de la semana es agregada (fecha, turno, hora, quirófano, cirujano, procedimiento, minutos), sin historia ni iniciales. Con sal, en base solo hay huellas. Sin sal, no hay filas nuevas.
- ENDO: una fila de endoscopia queda en ENDO, pide anestesista y puede ir al parte del endoscopista. No crea un `PatientInBlock` al importar.
- Imprimir: pestaña **Semana para imprimir**, cambiar de semana y usar el diálogo de impresión del navegador. Deben salir quirófano, cirujano, iniciales, procedimiento, hora y anestesista. No deben salir historia, teléfono ni email, y recargar la aplicación no debe haber creado una copia de la hoja.
- Reglas: con la tabla vacía, el cierre sigue siendo el jueves y la transición 10 minutos. Con una fila activa, manda esa fila. Con filas de otras claves, una clave ausente no vuelve a la constante.

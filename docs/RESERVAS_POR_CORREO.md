# Reservas que llegan por correo

Un cirujano escribe al buzón del bloque. El programa prepara una propuesta y una respuesta. Una persona de coordinación decide. El correo no sale solo y no se crea una reserva al aprobar la propuesta.

`STORE_PATIENT_IDENTITY` sigue apagado. `AUTO_REPLY` también. No activar ninguno sin una decisión explícita.

## Piezas

1. **Buzón.** `MailboxProvider` tiene dos modos. `file` no llama a Microsoft y es el de los tests. `graph` lee la bandeja y crea borradores. Las variables y los permisos están en `docs/BUZON.md`.
2. **Propuesta.** Cada correo clasificado como reserva crea una propuesta `SURGEON_EMAIL` en la bandeja. El resumen lleva cirujano, procedimiento, fecha, turno, duración, seguro o mutua y material especial, más la lista de lo que falta. El cuerpo del correo no se copia. La propuesta guarda `sourceMessageId`, un id interno, para localizar después la dirección de respuesta que ya estaba en `EmailMessage`.
3. **Huecos.** Con el cirujano, la duración y el turno preferido, el motor devuelve huecos libres por quirófano y día. Respeta el turno habitual, el cupo de anestesia por persona, los choques por minutos y que una endoscopia vaya a ENDO. La ocupación son bloques (fecha, sala, inicio, fin). Se puede alimentar con filas ya revisadas del Excel, sin volver a leer el libro ni cambiar la importación del maestro.
4. **Checklist.** Antes de dar una reserva por confirmada hacen falta enfermería y TCAE en el turno, el material o la prótesis, y la autorización del seguro cuando no es SNS o SESPA. Si falta algo, la respuesta puede decirlo. Confirmar de verdad sigue siendo otro paso.
5. **Respuesta y apartado.** Aprobar la propuesta crea un borrador `PENDING_APPROVAL` y, si hay hueco, un `ProvisionalHold` de 48 horas. No es una reserva. El texto propone hasta cinco huecos y dice que hay que pulsar Enviar.
6. **Auditoría.** `MailboxAudit` anota `ingested`, `draft_created` y `hold_created`. El detalle no lleva cuerpo, historia, nombre ni dirección.

## Recorrido

1. Llega el correo. Se guarda el mensaje con el texto identificativo ya vaciado (etiqueta «Correo recibido») y la dirección del remitente, que es el buzón del cirujano.
2. Se crea la propuesta en la bandeja, con el resumen estructurado y lo que falta.
3. Coordinación pulsa **Aprobar**. Si no hay buzón de respuesta, la propuesta sigue pendiente y la API responde 409.
4. Si se puede, se preparan el borrador y el apartado de 48 horas. No se crea una fila `Reservation` y no se envía nada.
5. Coordinación pulsa **Enviar** en ese borrador. Ese clic es el único envío.

Rechazar la propuesta no crea borrador ni apartado.

## AUTO_REPLY

La variable solo se considera encendida si vale exactamente `true`. El valor por defecto es apagado.

Aunque alguien la encienda, este módulo no transmite el mensaje. La función solo marcaría como candidato un caso simple: sin datos pendientes, sin choque y con el checklist completo. Un caso con falta de datos, choque o checklist incompleto queda fuera. El borrador sigue exigiendo el clic de Aprobar, y el envío sigue exigiendo el clic de Enviar.

No activar `AUTO_REPLY` hasta que coordinación e informática decidan que esos casos simples pueden salir sin el segundo clic. Hoy no está hecho.

## Qué tiene que aprobar informática

Registrar una aplicación y conceder solo estos permisos de aplicación sobre el buzón del bloque:

- `Mail.Read`, para leer.
- `Mail.ReadWrite`, para crear y editar borradores.

No conceder `Mail.Send`. El conector Graph de este circuito no envía. El envío que ya existía en la bandeja es otro camino y solo corre al pulsar Enviar.

Variables, fuera del repositorio:

| Variable | Uso |
| --- | --- |
| `MAILBOX_PROVIDER` | `file` si no se define. `graph` para Microsoft. |
| `GRAPH_TENANT_ID` | Inquilino. |
| `GRAPH_CLIENT_ID` | Aplicación. |
| `GRAPH_CLIENT_SECRET` | Secreto. |
| `GRAPH_MAILBOX_USER` | Buzón del bloque. |
| `AUTO_REPLY` | Dejar sin definir. |

Sin las cuatro variables de Graph, `MAILBOX_PROVIDER=graph` no arranca. No hay credenciales de ejemplo en el código.

## RGPD

- La base de la aplicación no guarda el cuerpo del correo ni la identidad del paciente. `STORE_PATIENT_IDENTITY` permanece apagado. Qué haría falta para encenderlo está en `docs/ACTIVAR_DATOS_IDENTIFICATIVOS.md`.
- La propuesta, el apartado y la auditoría guardan bloques de agenda y el resumen de la solicitud (cirujano del plantel, procedimiento, fecha, turno, minutos, seguro, material). La etiqueta de caso es `Caso 1`.
- La dirección a la que se contesta es la del buzón del cirujano, ya guardada en `EmailMessage` para poder responder. No es un dato de paciente.
- El apartado provisional caduca a las 48 horas y no confirma la intervención.
- Los pacientes reales siguen solo en el Excel maestro, fuera de la aplicación. La importación de ese Excel no cambia con este circuito.

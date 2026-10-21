# Activar datos identificativos

Hoy la aplicación no guarda el texto identificativo del paciente. El flag `STORE_PATIENT_IDENTITY` sale apagado. Aunque alguien lo ponga a `true`, no se guarda nada en claro y tampoco se cifra nada hasta que se cumplan las cuatro condiciones de abajo. Esta guía dice qué habría que hacer, más adelante, para encenderlo de verdad. No lo enciende.

## Qué queda preparado

Las columnas de `EmailMessage` (`fromName`, `subject`, `bodyPlain`, `bodyHtml`, `bodySummary`) y de `ContactMessage` (`fromName`, `subject`, `body`) siguen en el esquema. Borrarlas obligaría a recrearlas el día que haga falta guardar identidad. Las escrituras nuevas las dejan vacías o con una etiqueta fija (`Correo recibido`, `Solicitante`, `[redactado]`).

`fromEmail` del correo se conserva porque sirve para saber qué usuario escribió. `fromEmail` del formulario de acceso se conserva porque es la dirección a la que se contesta una solicitud de acceso, no una historia clínica.

Dos tablas nuevas están vacías mientras el flag siga apagado:

- `PatientIdentityRecord`: un campo cifrado (AES-256-GCM), con versión de clave y fecha de retención.
- `IdentityAccessAudit`: quién guardó o leyó, con el rol y la acción. No lleva el texto del paciente.

La etiqueta del calendario sigue siendo `Caso N`. La identidad, el día que exista, sería otra fila cifrada, no el nombre en la reserva.

## Las cuatro condiciones

Hace falta las cuatro a la vez. Con una sola, `isPatientIdentityStorageActive` sigue en falso y no se inserta ciphertext.

| Variable | Qué exige |
| --- | --- |
| `STORE_PATIENT_IDENTITY` | El valor exacto `true`. Por defecto no está definida. |
| `PATIENT_IDENTITY_ARMED` | El valor exacto `true`. Evita que un flag suelto baste. |
| `PATIENT_IDENTITY_ENCRYPTION_KEY` | 32 caracteres o más. Vive fuera de git y fuera de `CREDENCIALES.txt` versionado. |
| `PATIENT_IDENTITY_LEGAL_BASIS` | 12 caracteres o más. Un texto que nombre la base legal, no un sí genérico. |

`PATIENT_IDENTITY_RETENTION_DAYS` es opcional. Si no está, la retención prevista es 365 días. Solo se aplica cuando el cifrado está activo.

Roles que la función de lectura admite, y solo con el cifrado activo: `gestor` y `gestor-anestesista`. Ninguna pantalla llama todavía a esa lectura. El listado de contacto sigue mostrando `Solicitante` y `[redactado]`.

## Purga del histórico

`scripts/privacy/purge-identifying-text.ts` es opcional y manual. No está en `package.json`, no está en el workflow de CI y la migración `20261021170000_identity_storage_ready` no hace `UPDATE` ni `DELETE` de textos ya guardados.

Para lanzarla, en una base marcada como prueba (localhost o un nombre con preview, test, ci o local) y distinta de `PRODUCTION_DATABASE_URL`:

```bash
export CONFIRM_PURGE_IDENTIFYING_TEXT=purga-manual
npx tsx scripts/privacy/purge-identifying-text.ts
```

Vacía cuerpos y asuntos de correo, sustituye el contacto por la ficha operativa (conserva el email de respuesta), quita de los JSON de eventos y de logs las claves de historia, nombre, teléfono o email, y cambia un mensaje de error largo o con pinta de identificador por «Mensaje operativo redactado». No borra `PatientIdentityRecord`: esa tabla es el cajón cifrado, no el histórico en claro.

No lance este script contra la base de producción de Vercel.

## Qué haría falta para encenderlo

No ponga estas variables en producción hasta completar este trabajo. Guardar identidad de pacientes, y más si el texto puede incluir datos de salud, entra en el RGPD.

1. Base legal. Artículo 6 para los datos identificativos y, si el contenido es de salud, artículo 9. La base tiene que estar escrita y encajar con lo que hace el hospital, no solo con esta aplicación.
2. Delegado de protección de datos. Consultarlo antes de activar el flag y dejar constancia de su criterio.
3. Evaluación de impacto. Una DPIA (evaluación de impacto relativa a la protección de datos) porque el tratamiento puede afectar a datos de salud a escala de un servicio clínico.
4. Registro de actividades de tratamiento actualizado, con finalidad, categorías de datos, destinatarios y plazos.
5. Información a las personas. Quién es el responsable, para qué se guarda, cuánto tiempo y cómo ejercer los derechos.
6. Retención. Fijar `PATIENT_IDENTITY_RETENTION_DAYS` y un procedimiento para borrar lo vencido. El campo `retentionUntil` ya está en la tabla; el borrado automático no está activado.
7. Custodia de la clave. Quién la genera, dónde se guarda, cómo se rota y qué pasa si se pierde. Perder la clave deja el ciphertext ilegible. No la meta en el repositorio.
8. Acceso por rol. Decidir qué roles leen, revisar `canReadPatientIdentity` y no ampliarlo sin ese acuerdo. Cada lectura futura debe escribir `IdentityAccessAudit` con la acción `read`.
9. Revisión de auditoría. Alguien del servicio mira esos registros. La tabla sola no sustituye esa revisión.
10. Encargados. Contrato con quien aloje la base (Vercel u otro) si tratan datos por cuenta del hospital.
11. Purga previa. Conviene ejecutar la purga manual del texto en claro que ya exista antes de armar el cifrado, para no dejar copias antiguas al lado del cajón nuevo.
12. Prueba. Activar primero en la base de `docs/ENTORNO_PRUEBAS.md`, con pacientes ficticios (`Paciente Prueba`, `TEST-00NN`), y comprobar que el calendario sigue mostrando `Caso N`.

Hasta entonces el valor correcto es no definir `STORE_PATIENT_IDENTITY`.

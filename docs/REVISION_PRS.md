# Orden para revisar los PR

Ninguno de estos PR está fusionado. No van a `main`. El destino, cuando alguien los integre, es `hardening/integration`, y solo en el orden de esta lista. Cada rama contiene la anterior: si se salta una, el diff mezcla cambios que no son suyos.

Los datos de paciente de esta tanda son ficticios (`Paciente Prueba NN`, `TEST-00NN`). La etiqueta del calendario es `Caso N`. No hace falta la base de producción de Vercel para revisar el código. El job de Postgres del CI no se lanzó en la máquina donde se escribieron estos PR.

## Cómo mirar un PR

1. Abra el PR y compruebe que la base es la rama de la fila anterior. Si GitHub dice `hardening/integration` y la fila de abajo dice otra cosa, el diff incluye PR anteriores.
2. Eso pasa hoy en los PR 131, 132, 133 y 134: el código sí está encadenado, pero la base registrada en GitHub sigue siendo `hardening/integration`. Para ver solo ese cambio: `git log --oneline origen-anterior..rama` o cambiar la base del PR a la rama anterior antes de comentarlo.
3. Del 135 en adelante la base de GitHub ya es la rama anterior.
4. No lance `db:seed`, `usuarios:prueba` ni `seed:showcase` contra Vercel.

## Del 130 al 145

| Orden | PR | Rama | Qué hace | Depende de | Riesgo |
| --- | --- | --- | --- | --- | --- |
| 1 | [#130](https://github.com/javierfanjulcuesta-ship-it/Bloque-Quirurgico-Covadonga/pull/130) | `cursor/alertas-programa-743e` | Alertas de solo lectura del programa. Una sala no reconocida no cae a Q1. | `hardening/integration` | No graba reservas. Si la alerta se lee como un bloqueo, no lo es. |
| 2 | [#131](https://github.com/javierfanjulcuesta-ship-it/Bloque-Quirurgico-Covadonga/pull/131) | `cursor/anestesia-cupo-743e` | El cupo de anestesia se valida en servidor. Se guarda la semana, no un histórico suelto. | 130 | La base en GitHub es `hardening/integration`; el código incluye el 130. |
| 3 | [#132](https://github.com/javierfanjulcuesta-ship-it/Bloque-Quirurgico-Covadonga/pull/132) | `cursor/turno-habitual-743e` | Sugiere turno y quirófano habitual. No graba la reserva por esa sugerencia. | 131 | Misma salvedad de base. Una sugerencia no es una asignación. |
| 4 | [#133](https://github.com/javierfanjulcuesta-ship-it/Bloque-Quirurgico-Covadonga/pull/133) | `cursor/bandeja-borradores-743e` | Partes y propuestas quedan en bandeja hasta que un gestor envía o reserva. | 132 | Misma salvedad de base. El envío sigue siendo un gesto explícito. |
| 5 | [#134](https://github.com/javierfanjulcuesta-ship-it/Bloque-Quirurgico-Covadonga/pull/134) | `cursor/import-excel-maestro-743e` | Primera importación del Excel maestro y exportación de la semana. | 133 | Diseñaba filas identificativas. Lo sustituyen el 136 y el 141. No integrar este diseño de tablas. |
| 6 | [#135](https://github.com/javierfanjulcuesta-ship-it/Bloque-Quirurgico-Covadonga/pull/135) | `cursor/reglas-programacion-743e` | Lee `ProgrammingRule`. Las constantes solo valen si la tabla está vacía. | 134 | Una clave inactiva no cae a la constante. |
| 7 | [#136](https://github.com/javierfanjulcuesta-ship-it/Bloque-Quirurgico-Covadonga/pull/136) | `cursor/import-sin-datos-743e` | La revisión del maestro es en memoria. No guarda nombre, historia, teléfono ni email. | 135 | Sin `INTAKE_FINGERPRINT_SALT` (fuera del repo, 24 caracteres o más) no se escriben ni los HMAC. |
| 8 | [#137](https://github.com/javierfanjulcuesta-ship-it/Bloque-Quirurgico-Covadonga/pull/137) | `cursor/endoscopias-endo-743e` | `ENDO` es una sala. No se manda a Q1 ni a procedimientos menores. | 136 | Hace falta anestesista si hay casos. Una asignación vieja `endoscopias` cuenta como ENDO. |
| 9 | [#138](https://github.com/javierfanjulcuesta-ship-it/Bloque-Quirurgico-Covadonga/pull/138) | `cursor/ci-pr-743e` | CI en cada PR: typecheck, tests, build, lint y `migrate deploy` sobre un Postgres vacío. | 137 | No crea nada en Vercel. El job de Postgres no se ejecutó en local. |
| 10 | [#139](https://github.com/javierfanjulcuesta-ship-it/Bloque-Quirurgico-Covadonga/pull/139) | `cursor/semana-imprimir-743e` | Hoja de la semana para imprimir. | 138 | No guarda el parte. Las iniciales, si salen, salen del Excel de esa sesión. |
| 11 | [#140](https://github.com/javierfanjulcuesta-ship-it/Bloque-Quirurgico-Covadonga/pull/140) | `cursor/docs-estado-actual-743e` | `docs/ESTADO_ACTUAL.md` y marcas de que las auditorías viejas no describen esta rama. | 139 | `main` sigue siendo el checkpoint de mayo. |
| 12 | [#141](https://github.com/javierfanjulcuesta-ship-it/Bloque-Quirurgico-Covadonga/pull/141) | `cursor/caso-etiqueta-743e` | `PatientInBlock` guarda `Caso N`. Quita historia, nombre, teléfono y email. | 140 | Migración real. Los borradores de parte caducan a los 7 días. |
| 13 | [#142](https://github.com/javierfanjulcuesta-ship-it/Bloque-Quirurgico-Covadonga/pull/142) | `cursor/pacientes-prueba-743e` | La demo y los fixtures pasan a `Paciente Prueba NN` y `TEST-00NN`. | 141 | El CI falla si un fixture trae columna DNI, NIE, NIF o teléfono. |
| 14 | [#143](https://github.com/javierfanjulcuesta-ship-it/Bloque-Quirurgico-Covadonga/pull/143) | `cursor/lint-limpio-743e` | `npm run lint` tiene que terminar sin errores. Se quitó el tope de errores. | 142 | Quedan avisos. Un aviso no tumba el job; un error sí. |
| 15 | [#144](https://github.com/javierfanjulcuesta-ship-it/Bloque-Quirurgico-Covadonga/pull/144) | `cursor/entorno-pruebas-743e` | Documenta una base de prueba y un humo en memoria. El script de migraciones se niega si la URL no parece de prueba. | 143 | No crea la base de preview en Vercel. Hay que hacerla a mano si se quiere. Ver `docs/ENTORNO_PRUEBAS.md`. |
| 16 | [#145](https://github.com/javierfanjulcuesta-ship-it/Bloque-Quirurgico-Covadonga/pull/145) | `cursor/identidad-apagada-743e` | No guarda texto identificativo en las escrituras nuevas. Deja preparada una caja cifrada, apagada. | 144 | `STORE_PATIENT_IDENTITY` apagado. La purga es manual y no está en CI. Ver `docs/ACTIVAR_DATOS_IDENTIFICATIVOS.md`. |
| 17 | [#146](https://github.com/javierfanjulcuesta-ship-it/Bloque-Quirurgico-Covadonga/pull/146) | `cursor/guia-revision-743e` | Esta guía. | 145 | Si se edita en un PR posterior, el número de las filas nuevas tiene que actualizarse aquí. |
| 18 | [#147](https://github.com/javierfanjulcuesta-ship-it/Bloque-Quirurgico-Covadonga/pull/147) | `cursor/choque-quirofano-743e` | Aviso de choque por minutos, quirófano alternativo y pestaña de capacidad. | 146 | El aviso no bloquea el guardado. No muestra pacientes. |

## Lo que sigue encima de esta guía

Falta `docs/ACTUALIZAR_COPIA_LOCAL.md`: cómo actualizar una copia de Windows a `origin/hardening/integration` sin perder cambios locales y sin tocar `CREDENCIALES.txt`. Cuando tenga número, hay que añadirlo a esta tabla. Hasta entonces no está en `hardening/integration`.

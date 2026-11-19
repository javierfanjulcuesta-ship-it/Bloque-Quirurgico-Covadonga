# QxFlow — demostración por perfiles

QxFlow es la aplicación de gestión del bloque quirúrgico del Hospital Ribera Covadonga. Esta guía explica cómo enseñarla **sin backend de producción, sin base de datos real y sin contraseñas**.

La demo vive en el navegador: reservas, asignaciones, mensajes y el trabajo de Gestión de citas se guardan en `localStorage`. No se envía correo y, en el despliegue aislado, cualquier ruta `/api` responde bloqueada.

Todos los pacientes de la semana de ejemplo son **ficticios** (historias `HC-DEMO-…`, correos `@example.test`, teléfonos `+34 600 000 …`). Los nombres de cirujanos y anestesistas del selector también son inventados.

## Perfiles que existen en la aplicación

No hay un perfil de supervisión ni de enfermería. Los perfiles reales son estos:

| Perfil | Cómo entrar | A dónde entra | Qué enseñar |
|---|---|---|---|
| **Cirujano** | Cirujano Demo | `/cirujano` | Su parte del bloque: reservas propias, hueco amarillo sin pacientes (lunes, Q1) y pacientes de cirugía general. No ve el listado de otros cirujanos. El buzón (campana) trae un aviso ficticio de autorización denegada. En «Mis pacientes» está el enlace a anulaciones locales. |
| **Endoscopista** | Endoscopista Demo | `/cirujano` | Solo procedimientos menores y técnicas del dolor: colonoscopias, gastroscopias y técnicas de dolor. No puede reservar Q1–Q3. |
| **Anestesista** | Anestesista Demo | `/calendario` | Calendario, «Mi programación» (Q1 y procedimientos menores el lunes; consulta de preanestesia el jueves), «Consulta preanestesia» con los pacientes de la semana y «Solicitar no disponibilidad» (el viernes por la tarde ya figura como no disponible). No reserva quirófanos. |
| **Gestor** | Gestor Demo | `/calendario` | Vista global del bloque, nombres de todos los cirujanos, casos SESPA y privados (naranja), asignación de anestesistas, mensajes de coordinación, cuadro de mando y resumen de Gestión de citas. El alta de usuarios reales y la edición de normas aparecen como no disponibles: no hay backend. |
| **Gestor/Anestesista** | Gestor Anestesista Demo | `/calendario` | Une las pestañas de gestor y de anestesista. Está asignado, por ejemplo, a Q3 y técnicas del dolor el lunes por la mañana y a la consulta de preanestesia del lunes. |
| **Gestión de citas** | Gestión de Citas Demo | `/gestion-citas` | Lista operativa de la semana siguiente: falta de contacto, autorización denegada, preanestesia futura, anestesia local que no precisa anestesista, no apto y no localizado. Puede anotar confirmación y autorización. El correo no sale: queda en «Correo simulado». No entra al calendario clínico. |

Debajo de esos seis perfiles, el selector incluye un equipo ficticio de la misma semana (Dra. Elena Vega, Dr. Martín Soler, Dra. Nuria Campos y Dra. Lucía Ferrer). Sirve para enseñar que cada cirujano solo ve sus pacientes y que Ferrer **no** está habilitada para SESPA: el gestor no debe asignarla a un quirófano con paciente SESPA.

Para cambiar de perfil: **Cerrar sesión**. Vuelve al selector. No hay contraseñas.

## Qué hay cargado

Al abrir la demo por primera vez se carga sola una semana laboral (lunes a viernes de la semana en curso) más la semana siguiente para Gestión de citas.

En la semana en curso hay actividad en Q1, Q2, Q3, procedimientos menores y técnicas del dolor, mañana y tarde: quirófanos ocupados, algún hueco solo reservado (amarillo), casos SESPA, un caso privado, una autorización denegada, un paciente no apto y huecos libres. La semana siguiente concentra las incidencias que revisa Gestión de citas.

**Restablecer semana de ejemplo** borra lo que se haya hecho en el navegador y vuelve a dejar esa semana. **Cargar datos de ejemplo** la reescribe sin cerrar la sesión.

## Arranque local

Hace falta Node.js 20 o superior.

```bash
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000). En desarrollo la demo está activa sola: no hace falta base de datos ni `DATABASE_URL`.

En esta rama el build de producción ya queda aislado, sin copiar variables:

```bash
npm run build
npm run start
```

`env.demo.example` solo hace falta si se quiere forzar el mismo modo en otra rama. La URL de Postgres que aparece ahí es falsa y `prisma generate` no se conecta.

Comprobación rápida del aislamiento:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/reservations
```

Tiene que responder `503` con el código `ISOLATED_DEMO_BACKEND_DISABLED`.

## Despliegue público (lo tiene que pulsar el propietario)

Desde aquí no hay un enlace público. Las vistas previas de los proyectos `bloque-quirurgico-covadonga` y `bloque-quirurgico-covadonga-awdb` piden cuenta de Vercel. No hay que cambiar sus variables ni su protección: pueden apuntar a la base real.

La rama `cursor/demo-aislada-a622` (y una rama que se llame exactamente `demo`) se construye siempre en modo aislado, sin variables. Aunque el proyecto tenga `DATABASE_URL`, ese build no crea el cliente de Prisma y `/api` responde 503. Hace falta un proyecto nuevo, o un enlace compartido de esa rama, para que lo vea alguien sin cuenta.

### Opción recomendada: proyecto nuevo y URL pública

1. En Vercel: **Add New… → Project**. Importar este mismo repositorio.
2. **Production Branch:** `cursor/demo-aislada-a622`.
3. **Environment Variables:** no añadir ninguna. No pulsar «Import» desde los proyectos existentes.
4. Deploy.
5. En ese proyecto nuevo: **Settings → Deployment Protection → Vercel Authentication → Disabled**. No tocar esa opción en los proyectos de producción.
6. Abrir la URL `*.vercel.app` del proyecto nuevo. Tiene que salir «Acceso de demostración», no el formulario de contraseña.
7. Abrir `https://<esa-url>/api/reservations`. Tiene que responder 503 y `ISOLATED_DEMO_BACKEND_DISABLED`.

Esa URL se puede enviar. Cada navegador guarda su semana. No usa la base de datos.

### Si no se quiere un proyecto nuevo

En el deployment de la rama `cursor/demo-aislada-a622` (no en el de producción): **Share → Anyone with the link**. Ese enlace salta la protección solo de ese deployment. No cambia variables. Sirve después de que Vercel haya construido el commit que fuerza el modo aislado; los enlaces anteriores siguen detrás del acceso de Vercel y no deben compartirse.

El despliegue de **producción** (migraciones, correo, secretos) está en `docs/DEPLOY-VERCEL.md` y no forma parte de esta demo.

## Guion breve de la visita

1. En la portada, enseñar que no hay contraseña y que la semana ya está cargada.
2. **Cirujano Demo.** Elegir el lunes. En Q1 se ve la colecistectomía, la hernia y un tramo reservado sin pacientes. En «Mis pacientes» no aparecen la rodilla de Soler ni las endoscopias. Abrir el buzón.
3. Cerrar sesión y entrar como **Dra. Elena Vega**. El lunes en Q2 es suyo (tiroidectomía privada); no ve los pacientes del cirujano demo.
4. **Endoscopista Demo.** El lunes solo salen procedimientos menores y dolor.
5. **Anestesista Demo.** «Mi programación» lista sus turnos. «Consulta preanestesia» permite marcar un paciente como no apto; queda solo en este navegador. «Solicitar no disponibilidad» muestra el viernes por la tarde.
6. **Gestor Demo.** Calendario global del lunes, con el caso privado en naranja. «Asignar anestesistas»: Lucía Ferrer está en Q2 (sin SESPA) y no debe pasar a un quirófano SESPA. «Mensajes» tiene tres avisos ficticios. «Gestión de citas» (barra superior) son recuentos, sin historia clínica. «Gestión de usuarios» lista el directorio y explica que el alta real no está en la demo.
7. **Gestor Anestesista Demo.** Mismas pestañas de gestión más «Mi programación» y preanestesia.
8. **Gestión de Citas Demo.** Pestaña «Pendientes»: Paula Benítez sin teléfono y con autorización denegada, Marcos Vidal con preanestesia aún por delante, Clara Méndez no apta. Cambiar un estado y abrir «Correo simulado» para ver que el mensaje no ha salido de QxFlow.
9. Volver a la portada y pulsar **Restablecer semana de ejemplo** si se quiere dejar la visita como al principio.

## Límites conocidos

- Normas editables, altas de usuario, invitaciones y la importación que escriba en base de datos no forman parte de la demo. La importación de planificación, si se abre, solo previsualiza el archivo en el navegador.
- Las anulaciones de la demo están en `/demo/anulaciones`, enlazadas desde «Mis pacientes», no en los botones del modo real.
- Los datos no se comparten entre dos ordenadores: no hay servidor detrás.

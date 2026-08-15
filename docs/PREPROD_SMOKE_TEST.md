# QxFlow — checklist de humo para preproducción aislada

Objetivo: validar `preprod/isolated-demo` con datos exclusivamente ficticios y sin acceso a backend real, Supabase, correo, webhook o cron.

## Precondiciones

- Despliegue de Vercel en estado `READY` para la rama `preprod/isolated-demo`.
- `NEXT_PUBLIC_DEPLOYMENT_MODE=isolated-demo` activo durante el build.
- `QXFLOW_ISOLATED_DEMO=true` activo en runtime.
- No introducir nombres, NHC, correos, teléfonos ni otros datos reales durante la prueba.
- No usar credenciales reales. En DEMO el acceso es mediante selector de perfiles sin contraseña.

## Perfiles de prueba disponibles

- Gestor Anestesista Demo (`gestor-anestesista@demo`)
- Gestor Demo (`gestor@demo`)
- Anestesista Demo (`anestesista@demo`)
- Cirujano Demo (`cirujano@demo`)
- Endoscopista Demo (`endoscopista@demo`)

## Frontera de aislamiento — obligatorio antes de probar funciones

- [ ] Abrir `/` y confirmar que aparece selector de perfiles DEMO, no formulario de contraseña real.
- [ ] Abrir una ruta `/api/*` de forma deliberada y confirmar respuesta de bloqueo `ISOLATED_DEMO_BACKEND_DISABLED` sin ejecutar lógica de aplicación.
- [ ] Confirmar que ninguna acción DEMO abre `mailto:` ni intenta enviar correo.
- [ ] Confirmar que normas/liberaciones/gestión de usuarios que no tienen fixture local muestran un estado neutral de “No disponible en modo demostración” y no llaman a `/api`.
- [ ] Confirmar que el reset DEMO elimina reservas, mensajes, asignaciones, indisponibilidades y auditoría sintética del navegador.

## Datos iniciales

- [ ] Pulsar “Cargar datos de ejemplo”.
- [ ] Confirmar que solo aparecen pacientes y usuarios claramente ficticios.
- [ ] Recargar el navegador y comprobar persistencia local del estado DEMO.
- [ ] Ejecutar “Restablecer demo” y confirmar vuelta a estado vacío/selector de usuario.

## Cirujano / Endoscopista

- [ ] Entrar como Cirujano Demo.
- [ ] Revisar calendario y reservas propias.
- [ ] Crear una reserva ficticia en un hueco permitido.
- [ ] Añadir uno o más pacientes ficticios.
- [ ] Editar los datos de un paciente y confirmar que persisten al recargar.
- [ ] Verificar que no aparecen pacientes de otros perfiles fuera del alcance previsto.
- [ ] Revisar “Normas de programación” y “Últimas liberaciones”: en DEMO deben degradar de forma segura si no hay fixture local.
- [ ] Repetir navegación básica como Endoscopista Demo.

## Cancelaciones DEMO

El núcleo local de cancelación está implementado. La validación de interfaz debe hacerse solo cuando los controles estén visibles en el DEMO.

- [ ] Cancelar un paciente de una reserva con varios pacientes y confirmar que solo desaparece ese paciente.
- [ ] Cancelar el último paciente dentro del plazo de retención y confirmar que el hueco queda reservado vacío.
- [ ] Cancelar el último paciente fuera del plazo de retención y confirmar que el hueco se libera según la política existente.
- [ ] Cancelar una reserva completa y confirmar que el hueco queda marcado como cancelado/libre en DEMO.
- [ ] Confirmar que ninguna cancelación ejecuta `/api/*`.

## Gestor

- [ ] Entrar como Gestor Demo.
- [ ] Revisar calendario global y visibilidad por roles.
- [ ] Crear/programar una reserva ficticia para un cirujano ficticio si la UI DEMO lo permite.
- [ ] Comprobar que gestión de usuarios reales está bloqueada/no disponible en DEMO.
- [ ] Comprobar que “Contactar coordinación” permanece local y no abre destinatarios reales ni `mailto:`.

## Anestesia

- [ ] Entrar como Anestesista Demo.
- [ ] Revisar asignaciones de anestesistas.
- [ ] Marcar una indisponibilidad ficticia y confirmar persistencia local.
- [ ] Revisar preanestesia con pacientes ficticios.
- [ ] Marcar un paciente “NO APTO” y confirmar que queda localmente registrado.
- [ ] Confirmar que preanestesia no lee correos persistidos ni abre/envía correo en DEMO.
- [ ] Entrar como Gestor Anestesista Demo y revisar permisos combinados.

## Auditoría sintética

- [ ] Crear una reserva y comprobar evento `reservation.created`.
- [ ] Editar un paciente y comprobar evento `patient.updated`.
- [ ] Cancelar un paciente y comprobar evento `patient.cancelled`.
- [ ] Cancelar una reserva y comprobar evento `reservation.cancelled`.
- [ ] Confirmar que la auditoría DEMO no contiene nombre, historia clínica, procedimiento, contacto, notas ni PHI.
- [ ] Restablecer DEMO y confirmar que la auditoría queda vacía.

## Integridad de programación

- [ ] Intentar reservar un hueco ya ocupado y confirmar que no se produce solapamiento.
- [ ] Probar selección de varios tramos y confirmar contigüidad cuando corresponda.
- [ ] Comprobar cálculo de duración/ocupación en varios tramos.
- [ ] Verificar que reservas canceladas no bloquean huecos futuros en DEMO.

## Criterio de salida

La preproducción se considera apta para entrega al usuario cuando:

1. El despliegue está `READY` y accesible mediante URL estable/compartible.
2. La portada muestra acceso DEMO por perfiles ficticios.
3. `/api/*` queda bloqueado por la frontera de servidor.
4. No existe envío ni borrador de correo desde DEMO.
5. Crear/editar/cancelar reservas y pacientes funciona de forma local o queda explícitamente identificado como pendiente de UI.
6. Asignaciones, indisponibilidad y preanestesia funcionan con datos sintéticos.
7. Reset y auditoría local funcionan sin restos entre sesiones.
8. No se ha usado Supabase de producción ni ningún dato real durante la prueba.

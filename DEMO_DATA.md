# Datos de ejemplo de la DEMO

Este documento describe el conjunto de datos que se cargan al usar **Cargar datos de ejemplo** en la pantalla de acceso. Todos los datos son **ficticios o anonimizados**; no se usa información real ni sensible.

## Qué se carga

- **Reservas** (semana laboral actual): varias reservas en Q1, Q2, Q3 y procedimientos menores, con y sin pacientes.
- **Asignaciones de anestesistas**: asignación de anestesistas a turnos de quirófano y a la consulta de preanestesia (lunes y jueves).
- **Mensajes al gestor**: 2 mensajes de ejemplo (cirujano y usuario sin acceso).
- **Notificaciones**: 2 notificaciones para el gestor asociadas a esos mensajes.

No se modifican: sesión, perfiles de usuario, no disponibilidad de anestesistas, pacientes no aptos, festivos ni recordatorios.

## Escenarios que quedan disponibles

Tras **Restablecer demo** y **Cargar datos de ejemplo**, al entrar con cualquier usuario demo podrá mostrar:

### 1. Calendario / Estado del bloque

- **Quirófano libre:** Hay huecos sin reserva (por ejemplo otros días o tramos de la semana).
- **Reserva sin pacientes (parcial):** Q1 el lunes por la mañana, primer tramo — reservado por Cirujano Demo, sin pacientes programados (aparece como reservado/amarillo).
- **Reserva con un paciente:** Q2 el lunes por la mañana, segundo tramo — un paciente ficticio (HC-DEMO-001, cirugía menor ejemplo).
- **Reserva con varios pacientes y uno privado:** Q3 el martes por la mañana — dos pacientes; uno con financiación **Privado** para ver el resaltado en naranja en calendario y en asignar anestesistas.
- **Endoscopista:** Procedimientos menores el miércoles con un paciente de ejemplo (HC-DEMO-004).

### 2. Asignar anestesistas (gestor)

- Anestesista Demo asignado a Q1 y Q2 el lunes por la mañana.
- Gestor Anestesista Demo asignado a consulta de preanestesia el lunes y a Q3 el martes.
- Anestesista Demo asignado a consulta de preanestesia el jueves.
- Las celdas muestran los procedimientos programados; el turno con paciente privado (Q3 martes) aparece en naranja.

### 3. Mi programación (anestesista)

- El anestesista ve los procedimientos a los que está asignado (Q1 y Q2 lunes, consulta preanestesia jueves).
- El gestor-anestesista ve Q3 martes y consulta preanestesia lunes.

### 4. Consulta de preanestesia (anestesista / gestor-anestesista)

- Pacientes de la semana asignados a consulta (lunes y jueves, mañana); se pueden marcar como "No apto" en la demo.

### 5. Mensajes (gestor)

- Dos mensajes recibidos: uno de Cirujano Demo (consulta de disponibilidad) y otro de usuario sin acceso (solicitud de acceso), ambos con asunto y cuerpo de ejemplo.

### 6. Notificaciones

- El gestor tiene dos notificaciones no leídas asociadas a esos mensajes (visibles si la app muestra listado de notificaciones por usuario).

## Nombres y datos ficticios

- **Pacientes:** HC-DEMO-001 a HC-DEMO-004; nombres "Paciente ejemplo 1", etc.; procedimientos "Cirugía menor ejemplo", "Procedimiento ejemplo A/B", "Endoscopia ejemplo".
- **Entidad financiadora:** "SNS" o "Privado" (solo para resaltar en naranja).
- **Mensajes:** Asuntos y cuerpos genéricos ("Consulta de disponibilidad (ejemplo)", "Solicitud de acceso (ejemplo)").

Las fechas de las reservas y asignaciones son siempre la **semana laboral actual** (lunes a viernes a partir del lunes de la semana en que se carga la demo), para que los datos sean visibles al abrir el calendario.

# Diseño: Reserva de quirófano por correo electrónico

**Bloque Quirúrgico Covadonga · Propuesta técnica**

---

## 1. Objetivo

Permitir que un cirujano envíe un correo electrónico a una cuenta vinculada a la aplicación con una solicitud de reserva cumplimentada. La aplicación:

- **Si hay hueco y los datos son correctos** → crea la reserva y responde con confirmación.
- **Si faltan datos** → responde indicando qué falta.
- **Si no hay hueco** → responde sugiriendo alternativas (otras fechas, recursos o turnos).

---

## 2. Plantilla de correo (cuestionario)

El cirujano rellena y envía un correo con el siguiente formato en el **cuerpo del mensaje** (asunto libre, p. ej. "Solicitud reserva quirófano"):

```
=== SOLICITUD RESERVA BLOQUE QUIRÚRGICO ===

-- Datos del cirujano --
Correo: ( )
Nombre: ( )

-- Preferencias de reserva --
Fecha preferida: YYYY-MM-DD ( )
Turno: Mañana / Tarde ( )
Sala: Q1 / Q2 / Q3 / Procedimientos menores / Técnicas del dolor / Cualquier quirófano ( )
¿Solo reservar hueco (sin pacientes)?: Sí / No ( )

-- Paciente 1 --
NHC: ( )
Procedimiento: ( )
Entidad gestora: ( )
Tipo anestesia: Local / Regional / General / Sedación ( )
Ingreso/Ambulatorio: Ingreso / Ambulatorio ( )
Tiempo estimado (min): ( )
Solicitud recursos: Rayo / Mesa de mano / Posicionamiento de cadera / Caja instrumental PTC/PTR / Mesa de hombro / Ninguno de ellos ( )
Notas: ( )

-- Paciente 2 (opcional, repetir bloque) --
NHC: ( )
Procedimiento: ( )
...

=== FIN SOLICITUD ===
```

**Ejemplo cumplimentado:**
```
Correo: ( juan.garcia@hospital.es )
Turno: Mañana / Tarde ( Mañana )
Recurso: Q1 / Q2 / Q3 / Procedimientos menores / Técnicas del dolor ( Q1 )
Tipo anestesia: Local / Regional / General / Sedación ( General )
Solicitud recursos: Rayo / Mesa de mano / Posicionamiento de cadera / Caja instrumental PTC/PTR / Mesa de hombro / Ninguno de ellos ( Mesa de mano )
```

### Campos obligatorios

| Campo | Valores válidos | Ejemplo |
|-------|-----------------|---------|
| Correo | Email del cirujano registrado | juan.garcia@hospital.es |
| Nombre | Texto | Dr. Juan García |
| Fecha preferida | YYYY-MM-DD o DD/MM/YYYY | 2025-03-25 |
| Turno | Mañana, Tarde | Mañana |
| Sala | Q1, Q2, Q3, Procedimientos menores, Técnicas del dolor, Cualquier quirófano | Q1 |
| ¿Solo reservar? | Sí, No | No |
| NHC | Texto | HC-2025-00123 |
| Procedimiento | Texto | Colecistectomía |
| Entidad gestora | Texto | SAS, Mutua, Privado... |
| Tipo anestesia | Local, Regional, General, Sedación | General |
| Ingreso/Ambulatorio | Ingreso, Ambulatorio | Ambulatorio |
| Tiempo estimado (min) | Número 1-300 | 60 |
| Solicitud recursos | Rayo, Mesa de mano, Posicionamiento de cadera, Caja instrumental PTC/PTR, Mesa de hombro, Ninguno de ellos | Mesa de mano |

### Reglas de parseo

- El bloque comienza con `=== SOLICITUD RESERVA BLOQUE QUIRÚRGICO ===` y termina con `=== FIN SOLICITUD ===`.
- Cada campo: `Nombre del campo: valor`.
- Pacientes adicionales: bloques `-- Paciente 2 --`, `-- Paciente 3 --`, etc.
- Si "¿Solo reservar hueco?" = Sí, no se requieren datos de pacientes.

---

## 3. Flujo de procesamiento

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Cirujano envía  │────▶│  Servicio recibe │────▶│  Webhook a API      │
│  correo          │     │  (SendGrid/etc.) │     │  /api/email-reserva │
└─────────────────┘     └──────────────────┘     └──────────┬──────────┘
                                                            │
                                                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         PROCESAMIENTO                                    │
│  1. Verificar remitente (email en lista de cirujanos)                    │
│  2. Extraer y parsear campos del cuerpo                                  │
│  3. Validar campos obligatorios                                         │
│  4. Si faltan datos → responder con lista de errores                    │
│  5. Si OK → buscar hueco libre (fecha, turno, recurso, duración)         │
│  6. Si hay hueco → crear reserva → responder confirmación                │
│  7. Si no hay hueco → buscar alternativas → responder con sugerencias    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Respuestas automáticas por correo

### 4.1 Confirmación (reserva creada)

**Asunto:** `[Bloque Quirúrgico] Reserva confirmada - [fecha] [recurso]`

**Cuerpo:**
```
Estimado/a Dr./Dra. [Nombre],

Su solicitud de reserva ha sido procesada correctamente.

RESERVA CONFIRMADA
- Fecha: [fecha]
- Recurso: [recurso]
- Turno: [mañana/tarde]
- Pacientes: [NHC1 - Procedimiento1], [NHC2 - Procedimiento2], ...

Puede consultar los detalles en la aplicación del Bloque Quirúrgico.

Saludos,
Sistema Bloque Quirúrgico Covadonga
```

### 4.2 Faltan datos

**Asunto:** `[Bloque Quirúrgico] Solicitud incompleta - revise los datos`

**Cuerpo:**
```
Estimado/a Dr./Dra. [Nombre],

No hemos podido procesar su solicitud porque faltan o son incorrectos los siguientes datos:

- [Campo 1]: [descripción del error]
- [Campo 2]: [descripción del error]

Por favor, reenvíe el correo con todos los campos cumplimentados según la plantilla.

Plantilla de ejemplo: [enlace a documentación o plantilla]

Saludos,
Sistema Bloque Quirúrgico Covadonga
```

### 4.3 No hay hueco – sugerencias

**Asunto:** `[Bloque Quirúrgico] Sin disponibilidad - alternativas sugeridas`

**Cuerpo:**
```
Estimado/a Dr./Dra. [Nombre],

En la fecha y recurso solicitados ([fecha], [recurso]) no hay huecos disponibles para el tiempo total requerido ([X] min).

ALTERNATIVAS SUGERIDAS:

Opción 1:
- Fecha: [fecha alt 1]
- Recurso: [recurso]
- Turno: [mañana/tarde]
- Huecos libres: [descripción]

Opción 2:
- Fecha: [fecha alt 2]
- Recurso: [recurso alt]
...

Puede confirmar una de estas opciones respondiendo a este correo con "Confirmo opción 1" o realizar la reserva desde la aplicación.

Saludos,
Sistema Bloque Quirúrgico Covadonga
```

---

## 5. Arquitectura técnica propuesta

### 5.1 Recepción de correos

| Opción | Servicio | Configuración |
|--------|----------|---------------|
| A | SendGrid Inbound Parse | Dominio → webhook POST a `/api/email-reserva` |
| B | Mailgun Inbound | Similar |
| C | Microsoft Graph API | Job programado que lee buzón y procesa |

**Recomendación:** SendGrid o Mailgun por simplicidad y webhooks nativos.

### 5.2 Endpoint API

```
POST /api/email-reserva
Content-Type: application/json

{
  "from": "juan.garcia@hospital.es",
  "subject": "Solicitud reserva quirófano",
  "text": "... cuerpo del correo ...",
  "html": "..." // opcional, priorizar text para parseo
}
```

### 5.3 Lógica del endpoint

1. **Parsear** cuerpo con regex o parser por líneas (`Campo: valor`).
2. **Validar** correo del remitente contra usuarios con rol `cirujano` o `endoscopista`.
3. **Validar** campos obligatorios; si falla → generar respuesta 4.2.
4. **Consultar disponibilidad** en el almacén de reservas (API/DB).
5. **Crear reserva** si hay hueco; si no, **buscar alternativas** (misma semana, otros recursos).
6. **Enviar respuesta** por correo (SendGrid/Mailgun SMTP).

### 5.4 Almacenamiento

- La app actual usa `localStorage` (demo). En producción se necesitará:
  - Base de datos o API para reservas.
  - El endpoint de email debe usar la misma fuente de datos.
- Para una primera versión: API route que lea/escriba en el mismo `localStorage` vía server-side (con limitaciones) o migrar a una API/DB real.

---

## 6. Seguridad

| Medida | Descripción |
|--------|-------------|
| Verificación remitente | Solo procesar si `from` coincide con un cirujano/endoscopista registrado |
| Validación webhook | Verificar firma/token de SendGrid/Mailgun para evitar suplantación |
| Rate limiting | Máximo N solicitudes por correo/hora para evitar abuso |
| Logs | Registrar todas las solicitudes (email, fecha, resultado) para auditoría |

---

## 7. Fases de implementación sugeridas

### Fase 1 – MVP
- [ ] Configurar cuenta de correo y webhook (SendGrid/Mailgun).
- [ ] Endpoint `/api/email-reserva` que parsea plantilla y valida.
- [ ] Respuesta "faltan datos" con lista de errores.
- [ ] Integración con almacén de reservas (API/DB existente).

### Fase 2 – Reserva automática
- [ ] Búsqueda de hueco libre según fecha, recurso, turno y duración.
- [ ] Creación de reserva si hay disponibilidad.
- [ ] Correo de confirmación.

### Fase 3 – Sugerencias
- [ ] Búsqueda de alternativas (otras fechas, recursos, turnos).
- [ ] Correo con sugerencias cuando no hay hueco.
- [ ] (Opcional) Confirmación por respuesta al correo: "Confirmo opción 1".

---

## 8. Plantilla descargable para cirujanos

Se puede ofrecer un documento (Word/PDF) o página web con la plantilla para copiar y pegar:

```
=== SOLICITUD RESERVA BLOQUE QUIRÚRGICO ===

-- Datos del cirujano --
Correo: ( )
Nombre: ( )

-- Preferencias de reserva --
Fecha preferida: YYYY-MM-DD ( )
Turno: Mañana / Tarde ( )
Sala: Q1 / Q2 / Q3 / Procedimientos menores / Técnicas del dolor / Cualquier quirófano ( )
¿Solo reservar hueco (sin pacientes)?: Sí / No ( )

-- Paciente 1 --
NHC: ( )
Procedimiento: ( )
Entidad gestora: ( )
Tipo anestesia: Local / Regional / General / Sedación ( )
Ingreso/Ambulatorio: Ingreso / Ambulatorio ( )
Tiempo estimado (min): ( )
Solicitud recursos: Rayo / Mesa de mano / Posicionamiento de cadera / Caja instrumental PTC/PTR / Mesa de hombro / Ninguno de ellos ( )
Notas: ( )

-- Paciente 2 (opcional, repetir bloque) --
NHC: ( )
Procedimiento: ( )
...

=== FIN SOLICITUD ===
```

Enviar a: **reservas-bloque@hospital.es** (ejemplo)

---

## 9. Resumen

| Aspecto | Propuesta |
|---------|-----------|
| Formato | Plantilla de texto en cuerpo del correo |
| Recepción | SendGrid/Mailgun Inbound → webhook |
| Validación | Remitente + campos obligatorios |
| Respuestas | Confirmación / Faltan datos / Sugerencias |
| Integración | Endpoint API que usa el mismo modelo de reservas que la app |

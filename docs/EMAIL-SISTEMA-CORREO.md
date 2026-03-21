# Sistema de correo del gestor – Reservas por email

Buzón principal: **jfanjul@riberacare.com**

---

## 1. Seguridad del webhook

**Variable de entorno (.env):**
```
EMAIL_WEBHOOK_SECRET=tu_token_secreto_minimo_16_caracteres
```

Para pruebas locales:
```
EMAIL_WEBHOOK_SECRET=local-dev-secret-16chars
```

**Validación:**
- Header: `x-email-webhook-secret: <EMAIL_WEBHOOK_SECRET>`
- Query: `?webhookSecret=<EMAIL_WEBHOOK_SECRET>`

En desarrollo sin secret configurado, se acepta el valor fijo `dev-local-testing-bypass` en el header para pruebas.

---

## 2. Formato soportado para reservas por correo

### Campos obligatorios

| Campo | Variantes aceptadas | Ejemplo |
|-------|---------------------|---------|
| **Fecha** | YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY | 2025-03-25, 25/03/2025 |
| **Quirófano/Recurso** | Q1, Q2, Q3, procedimientos menores, técnicas del dolor, Quirófano 1, Recurso Q1 | Q1 |
| **Turno** | mañana, manana, morning, tarde, afternoon, am, pm, matutino, vespertino | Turno: mañana |
| **Slot/Tramo** | slot 0, tramo 1, Slot: 2, Tramo: 0 | Slot: 0 |

### Pacientes (opcional)

Formato por línea:
- `HC-001234: Juan Pérez, Artroscopia rodilla, 60 min`
- `Historia: HC-001234, Procedimiento: Meniscectomía, 45 min`
- `nº hist. 001234 - Artroscopia - 60 min`

Campos por paciente:
- **numeroHistoria** (obligatorio si hay pacientes)
- **procedure** (procedimiento)
- **estimatedDurationMinutes** (> 0)
- **anesthesiaType**: Local, Regional, General, Sedación
- **entidadFinanciadora**: SNS, Privado, Mutua
- **admissionType**: ingreso, ambulatorio

---

## 3. Ejemplos de bodyPlain válidos

### Mínimo (sin pacientes)
```
Fecha: 2025-03-25
Quirófano: Q1
Turno: mañana
Slot: 0
```

### Con un paciente
```
Fecha: 2025-03-25
Recurso: Q2
Turno: tarde
Tramo: 1

Pacientes:
- HC-001234: Juan Pérez, Artroscopia rodilla, 60 min, General, SNS
```

### Con varios pacientes
```
Fecha: 25/03/2025
Quirófano: Q1
Turno: morning
Slot: 0

Pacientes:
HC-001234: María García, Artroscopia, 60 min, General, SNS, ambulatorio
HC-001235: Pedro López, Meniscectomía, 45 min, Regional, Privado
HC-001236: Ana Ruiz, Cirugía menor, 30 min, Local, SNS
```

### Variantes de formato
```
Turno: afternoon
Tramo: 2
Fecha: 2025-03-26
Procedimientos menores
```

---

## 4. Errores posibles

| Error | Causa |
|-------|-------|
| `Faltan campos obligatorios: Fecha...` | No se detectó fecha en formato válido |
| `Faltan campos obligatorios: Quirófano/Recurso...` | No se detectó Q1, Q2, Q3, procedimientos menores o técnicas del dolor |
| `Faltan campos obligatorios: Turno...` | No se detectó mañana/morning o tarde/afternoon |
| `Paciente X: duración estimada debe ser > 0` | estimatedDurationMinutes <= 0 |
| `Remitente no registrado como usuario` | fromEmail no existe en la BD como usuario |
| `Solo cirujanos y endoscopistas pueden crear reservas por correo` | Usuario existe pero no tiene rol cirujano/endoscopista |
| `El hueco ya está ocupado` | Slot ya reservado por otro |

---

## 5. Respuestas automáticas

El sistema envía respuesta automática al remitente en todos los casos:

- **reservation_created**: Reserva confirmada con referencia
- **format_not_recognized**: Formato no reconocible + indicaciones
- **sender_not_registered**: Remitente no registrado
- **role_not_authorized**: Solo cirujanos/endoscopistas
- **slot_occupied**: Hueco ocupado, consultar disponibilidad

Las respuestas se envían vía `sendReplyToReservationEmail` (mock en desarrollo, Outlook real cuando esté conectado).

---

## 6. Trazabilidad

- **EmailMessage.resultMessage**: Mensaje de resultado (ej. "Reserva creada: clxxx", "Remitente no registrado")
- **EmailMessage.reservationId**: ID de la reserva creada (si aplica)
- **EmailMessage.processingStatus**: PENDING, PROCESSED, FAILED, SKIPPED
- **EmailProcessingLog**: Acciones (classified, parsed, reservation_created, reply_sent, error)

---

## 7. Probar localmente

### Con secret configurado
```bash
# .env: EMAIL_WEBHOOK_SECRET=local-dev-secret-16chars

curl -X POST http://localhost:3000/api/email/webhook \
  -H "Content-Type: application/json" \
  -H "x-email-webhook-secret: local-dev-secret-16chars" \
  -d '{
    "id": "test-1",
    "fromEmail": "cirujano@ejemplo.com",
    "subject": "Reserva Q1",
    "bodyPlain": "Fecha: 2025-03-25\nQuirófano: Q1\nTurno: Mañana\nSlot: 0"
  }'
```

### Sin secret (solo desarrollo)
```bash
curl -X POST http://localhost:3000/api/email/webhook \
  -H "Content-Type: application/json" \
  -H "x-email-webhook-secret: dev-local-testing-bypass" \
  -d '{"id":"test-2","fromEmail":"EMAIL_DE_CIRUJANO_EN_BD","subject":"Reserva","bodyPlain":"Fecha: 2025-03-25\nQ1\nTurno: mañana\nSlot: 0"}'
```

El `fromEmail` debe ser un usuario cirujano o endoscopista existente en la BD.

### Ejemplo con varios pacientes
```bash
curl -X POST http://localhost:3000/api/email/webhook \
  -H "Content-Type: application/json" \
  -H "x-email-webhook-secret: local-dev-secret-16chars" \
  -d '{
    "id": "test-3",
    "fromEmail": "cirujano@ejemplo.com",
    "subject": "Reserva con pacientes",
    "bodyPlain": "Fecha: 2025-03-26\nQ2\nTurno: tarde\nTramo: 0\n\nPacientes:\nHC-001: Ana García, Artroscopia, 60 min\nHC-002: Pedro López, Meniscectomía, 45 min"
  }'
```

---

## 8. Conectar jfanjul@riberacare.com real

**Pasos pendientes:**

1. **Azure AD**: Registrar app con permisos Mail.Send, Mail.Read
2. **Variables .env**:
   ```
   AZURE_CLIENT_ID=...
   AZURE_CLIENT_SECRET=...
   AZURE_TENANT_ID=...
   GESTOR_EMAIL=jfanjul@riberacare.com
   ```
3. **Dependencias**: `npm install @azure/msal-node @microsoft/microsoft-graph-client`
4. **Webhook real**: Configurar Microsoft Graph para enviar correos entrantes al webhook (o poll de bandeja + POST al webhook)
5. **EMAIL_WEBHOOK_SECRET**: Token seguro para producción (mín. 16 caracteres)

El adaptador mock registra envíos en consola. Con Graph configurado, las respuestas automáticas se enviarán desde jfanjul@riberacare.com.

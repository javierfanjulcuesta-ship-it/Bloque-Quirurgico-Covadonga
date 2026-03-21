# Flujo de entrada de reservas por correo electrónico

Guía paso a paso para que las reservas de quirófano puedan llegar por email y la aplicación las procese.

---

## Resumen del flujo

```
Cirujano envía email → Servicio de correo (SendGrid/Mailgun) → Webhook de la app → Parser → Base de datos → App muestra la reserva
```

1. El cirujano envía un correo a una dirección dedicada (ej. `reservas@hospital.es`).
2. Un servicio de correo recibe el email y lo reenvía a una URL de tu aplicación (webhook).
3. La aplicación parsea el contenido, identifica al cirujano por su email y crea la reserva.
4. La reserva queda guardada y visible en el calendario.

---

## Paso 1: Tener la API de reservas

Las reservas deben guardarse en base de datos, no en localStorage. Hay que:

1. **Añadir modelos en Prisma** (`Reservation`, `PatientInBlock`).
2. **Crear API** `POST /api/reservations` para crear reservas.
3. **Conectar el frontend** a esa API en lugar de localStorage.

Sin esto, el webhook no tiene dónde guardar las reservas.

---

## Paso 2: Elegir un servicio de correo con webhook

Necesitas un servicio que reciba emails y los envíe a una URL. Opciones habituales:

| Servicio | Uso | Coste aproximado |
|----------|-----|------------------|
| **SendGrid Inbound Parse** | Recibe emails y hace POST a tu URL | Gratis hasta cierto volumen |
| **Mailgun** | Rutas que reenvían a webhook | Gratis tier disponible |
| **Resend** | Recepción de emails | Plan de pago |
| **Cloudflare Email Workers** | Recepción y webhook | Según plan |

Para empezar, SendGrid o Mailgun son buenas opciones.

---

## Paso 3: Crear la dirección de correo

1. Crea un subdominio para el correo (ej. `reservas.tuhospital.es` o usa el dominio del servicio).
2. Configura los registros MX para que el correo llegue al servicio elegido.
3. En el panel del servicio, define la URL del webhook (ej. `https://tu-app.com/api/webhooks/email`).

---

## Paso 4: Crear el endpoint webhook en la app

Crear una ruta en Next.js que reciba el POST del servicio:

```
src/app/api/webhooks/email/route.ts
```

El webhook debe:

1. Verificar que la petición viene del servicio (token, firma, etc.).
2. Leer el cuerpo del email (subject, body, from).
3. Parsear el contenido según el formato acordado.
4. Buscar al cirujano por email (remitente).
5. Crear la reserva en la base de datos.
6. Responder 200 para que el servicio no reintente.

---

## Paso 5: Definir el formato del email

Para que el parser pueda extraer los datos, conviene un formato fijo. Ejemplo:

**Asunto:** `Reserva quirófano - Fecha - Recurso`

**Cuerpo (ejemplo):**

```
RESERVA QUIRÓFANO

Fecha: 2025-03-20
Quirófano: Q1
Turno: mañana
Tramo: 1

PACIENTES:
1. HC-001 | Juan Pérez | Artroscopia rodilla | 60 min | Regional | SNS | Ambulatorio
2. HC-002 | María García | Meniscectomía | 45 min | General | SNS | Ambulatorio
```

O un formato más compacto:

```
RESERVA
2025-03-20 | Q1 | mañana | 0
HC-001 | Juan Pérez | Artroscopia | 60 | Regional | SNS | Ambulatorio
HC-002 | María García | Meniscectomía | 45 | General | SNS | Ambulatorio
```

O JSON para máxima precisión:

```json
{
  "fecha": "2025-03-20",
  "recurso": "Q1",
  "turno": "morning",
  "tramo": 0,
  "pacientes": [
    {"hc": "HC-001", "nombre": "Juan Pérez", "procedimiento": "Artroscopia", "duracion": 60, "anestesia": "Regional", "financiador": "SNS" }
  ]
}
```

---

## Paso 6: Implementar el parser

El parser debe:

1. Extraer fecha, recurso, turno y tramo.
2. Extraer la lista de pacientes con sus campos.
3. Validar que el recurso existe (Q1, Q2, Q3, Procedimientos menores, Técnicas del dolor).
4. Validar que el tramo está libre.
5. Mapear el email del remitente a un `User` en la base de datos (cirujano o endoscopista).

---

## Paso 7: Resolver el cirujano por email

El remitente del correo debe ser un usuario de la app con rol `cirujano` o `endoscopista`:

```ts
const user = await prisma.user.findUnique({
  where: { email: fromEmail, role: { in: ["cirujano", "endoscopista"] } }
});
```

Si no existe, devolver error y no crear la reserva.

---

## Paso 8: Crear la reserva

Con los datos parseados y el `surgeonId`:

1. Comprobar que el hueco no está ocupado.
2. Crear `Reservation` en la base de datos.
3. Crear los `PatientInBlock` asociados.
4. Opcional: enviar notificación al gestor.

---

## Paso 9: Documentar el flujo para los cirujanos

Incluir en el documento para cirujanos:

- Dirección de correo para reservas.
- Formato exacto del email (asunto y cuerpo).
- Ejemplo completo.
- Qué hacer si no reciben confirmación.

---

## Paso 10: Probar el flujo

1. Enviar un email de prueba a la dirección configurada.
2. Revisar logs del webhook.
3. Comprobar que la reserva aparece en la aplicación.
4. Ajustar el parser si algo falla.

---

## Orden recomendado de implementación

| Orden | Tarea | Estado |
|-------|-------|--------|
| 1 | Modelos Prisma + API de reservas | Pendiente |
| 2 | Frontend usa API en lugar de localStorage | Pendiente |
| 3 | Endpoint webhook `/api/webhooks/email` | Pendiente |
| 4 | Parser del formato de email | Pendiente |
| 5 | Configurar SendGrid/Mailgun | Manual |
| 6 | Documentar para cirujanos | Pendiente |

---

## Ejemplo de webhook (esqueleto)

```ts
// src/app/api/webhooks/email/route.ts
export async function POST(request: Request) {
  // 1. Verificar token/firma
  const authHeader = request.headers.get("x-webhook-token");
  if (authHeader !== process.env.WEBHOOK_EMAIL_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Parsear payload (formato depende del servicio)
  const body = await request.json();
  const from = body.from || body.sender;
  const subject = body.subject || "";
  const text = body.text || body["body-plain"] || "";

  // 3. Parsear contenido según formato
  const parsed = parseReservationEmail(text);

  // 4. Buscar cirujano por email
  const surgeon = await prisma.user.findUnique({
    where: { email: from, role: { in: ["cirujano", "endoscopista"] } }
  });
  if (!surgeon) {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  // 5. Crear reserva
  await createReservationFromParsed(parsed, surgeon.id);

  return Response.json({ ok: true });
}
```

---

## Notas de seguridad

- Usar `WEBHOOK_EMAIL_SECRET` para validar que el POST viene del servicio de correo.
- No exponer el webhook sin validación.
- Registrar emails rechazados o con errores para revisión.

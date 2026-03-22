# Configurar envío de correos con Gmail SMTP en Vercel

## Prioridad del sistema de correo

1. **SMTP** (Gmail) – si `SMTP_USER` y `SMTP_PASS` están definidos
2. **Graph** (Outlook) – si hay credenciales Azure
3. **Mock** – si no hay ninguna de las dos

---

## Variables en Vercel

En **Project → Settings → Environment Variables** añade:

| Variable    | Valor                    | Entorno      |
|------------|--------------------------|--------------|
| SMTP_HOST  | `smtp.gmail.com`         | Production   |
| SMTP_PORT  | `465`                    | Production   |
| SMTP_SECURE| `true`                   | Production   |
| SMTP_USER  | `javier.fanjul.cuesta@gmail.com` | Production   |
| SMTP_PASS  | *Contraseña de aplicación* | Production   |

---

## Obtener contraseña de aplicación (Gmail)

Gmail no permite usar la contraseña habitual con SMTP. Hay que crear una **contraseña de aplicación**:

1. Activa la **verificación en dos pasos** en tu cuenta Google.
2. Ve a [Google Account → Security → App passwords](https://myaccount.google.com/apppasswords).
3. Crea una contraseña de aplicación para "Mail" / "Otro".
4. Copia el código de 16 caracteres (ej: `abcd efgh ijkl mnop`).
5. Usa ese valor en `SMTP_PASS` (puedes escribirlo sin espacios).

---

## Logs en producción

Tras el despliegue, en los logs de Vercel verás:

- `[Email] Usando SMTP (Gmail) – correos reales` → envío real por Gmail
- `[Email] Enviado vía SMTP:` → cada correo enviado correctamente
- `[Email] MOCK – Configure SMTP o Azure para envío real` → modo simulado (sin SMTP ni Graph)

---

## Seguridad

- No uses `SMTP_PASS` en el código; solo en variables de entorno.
- En Vercel, las variables de entorno están encriptadas.
- Los errores de envío no muestran credenciales; solo mensajes genéricos.

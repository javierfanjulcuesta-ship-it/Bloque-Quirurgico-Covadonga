# Buzón para reservas por correo

Este conector lee mensajes y crea borradores. No envía. El envío sigue dependiendo de un clic en la bandeja.

`MAILBOX_PROVIDER` vale `file` si no se define. Ese modo no llama a Microsoft y es el que usan los tests.

Para Graph hacen falta estas variables, fuera del repositorio y fuera de `CREDENCIALES.txt` versionado:

| Variable | Uso |
| --- | --- |
| `MAILBOX_PROVIDER` | `graph` |
| `GRAPH_TENANT_ID` | Inquilino de Microsoft |
| `GRAPH_CLIENT_ID` | Aplicación registrada |
| `GRAPH_CLIENT_SECRET` | Secreto de esa aplicación |
| `GRAPH_MAILBOX_USER` | Buzón del bloque, por ejemplo el de coordinación |

Permisos de aplicación que informática tiene que conceder, y ningún otro de correo:

- `Mail.Read`, para leer la bandeja.
- `Mail.ReadWrite`, para crear y editar borradores.

No hace falta `Mail.Send`. Este módulo no llama a `sendMail`.

Sin esas variables, `MAILBOX_PROVIDER=graph` se niega a arrancar. No hay credenciales de ejemplo en el código.

# Demo – Bloque Quirúrgico Covadonga

Aplicación de demostración para médicos y gestores. Funciona solo en el navegador (cliente + localStorage); **no hay backend ni autenticación real**.

## Acceso en modo DEMO

El acceso es por **selección de usuario**: no se usan contraseñas.

1. Abra **http://localhost:3000**
2. En la pantalla inicial verá el mensaje: *"Esta es una versión DEMO. Seleccione un usuario para entrar."*
3. Elija uno de los usuarios de la lista (nombre, correo y rol).
4. Pulse **"Entrar en modo demo"**.
5. La aplicación guarda la sesión en `sessionStorage` y le redirige al panel según el rol.

Lista de usuarios: ver **DEMO_USERS.md**.

## Cómo iniciar la demo

```bash
npm install
npm run dev
```

Abrir en el navegador: **http://localhost:3000**

## Roles y pantallas

| Rol | Pantalla principal | Qué puede hacer |
|-----|--------------------|------------------|
| **Cirujano** | `/cirujano` | Ver estado del bloque, reservar huecos, programar pacientes, ver sus pacientes, histórico, contactar coordinación. |
| **Endoscopista** | `/cirujano` | Igual que cirujano (recursos: procedimientos menores y técnicas del dolor). |
| **Anestesista** | `/calendario` | Ver calendario, consulta preanestesia, mi programación, solicitar no disponibilidad, histórico. |
| **Gestor** | `/calendario` | Calendario, asignar anestesistas, mensajes, crear nuevo usuario, ver listado de la semana. |
| **Gestor/Anestesista** | `/calendario` | Unión de gestor y anestesista: ve todas las pestañas de ambos. |

Las rutas siguen protegidas por rol: si un cirujano intenta entrar en `/calendario`, se redirige a `/cirujano`; si un gestor o anestesista intenta entrar en `/cirujano`, se redirige a `/calendario`.

## Flujos principales para probar

### 1. Cirujano: reservar y programar pacientes
- Seleccione **Cirujano Demo** y pulse "Entrar en modo demo".
- Pestaña **"Estado actual del bloque quirúrgico"**: elija un día, seleccione huecos (clic en celdas verdes).
- **"Solo reservar"** o **"Reservar y programar pacientes"** para añadir pacientes.
- Compruebe **"Mis pacientes programados"**.

### 2. Gestor: calendario y asignar anestesistas
- Seleccione **Gestor Demo** o **Gestor Anestesista Demo** y entre.
- Pestaña **Calendario**: elija un día; use **"Refrescar calendario"** si hace cambios en otra pestaña.
- Pestaña **Asignar anestesistas**: asigne anestesistas por turno y recurso.

### 3. Anestesista: no disponibilidad y consulta
- Seleccione **Anestesista Demo** y entre.
- **Solicitar no disponibilidad**: clic en un día y elija turno(s).
- **Consulta preanestesia**: ver pacientes de la semana y marcar "No apto" si procede.

### 4. Mensajes
- Cualquier usuario puede **Contactar coordinación** (Mi perfil). Los gestores ven los mensajes en **Mensajes**.

## Datos y persistencia

- **Sesión**: `sessionStorage`; al cerrar la pestaña se cierra la sesión.
- **Reservas, asignaciones, perfiles**: `localStorage` del mismo navegador.
- No se guardan contraseñas; el acceso demo es solo por selección de usuario.

## Restablecer demo

En la pantalla inicial hay un enlace **"Restablecer demo"** (también visible en el panel verde cuando tiene sesión iniciada).

**Qué hace:**

- **Limpia** la sesión actual (`sessionStorage`) y **todas** las claves de la app en `localStorage` (reservas, mensajes, notificaciones, asignaciones de anestesistas, perfiles, etc.).
- **No carga** ningún dato: deja la app vacía. Tras restablecer, puede elegir un usuario y entrar para ver pantallas vacías, o usar **Cargar datos de ejemplo** antes de entrar.

**Cuándo usarla:** Para dejar todo a cero (por ejemplo antes de cargar datos de ejemplo limpios) o si la app se queda en un estado raro.

---

## Cargar datos de ejemplo

En la pantalla inicial hay un enlace **"Cargar datos de ejemplo"**. Añade un conjunto coherente de datos ficticios para enseñar los flujos sin tener que crearlos a mano.

**Qué hace:**

- **Escribe** en `localStorage`: reservas de la semana actual (huecos libres, reservados sin pacientes, con pacientes, uno con financiación privada), asignaciones de anestesistas, mensajes al gestor y notificaciones. Todos los nombres y datos son ficticios (ver **DEMO_DATA.md**).
- **No borra** la sesión ni el resto de datos: si ya había reservas o mensajes, se **sustituyen** por los de ejemplo (reservas y mensajes/notificaciones se reemplazan; el resto no se toca). Para tener solo datos de ejemplo, use primero **Restablecer demo** y después **Cargar datos de ejemplo**.

**Cuándo usarla:** Tras **Restablecer demo**, pulse "Cargar datos de ejemplo", luego seleccione un usuario y "Entrar en modo DEMO" para ver calendario con reservas, mensajes, asignaciones y consulta de preanestesia ya rellenados.

**Diferencia con Restablecer demo:**

| Acción | Restablecer demo | Cargar datos de ejemplo |
|--------|------------------|--------------------------|
| Sesión | Se cierra | No se modifica |
| Reservas / mensajes / asignaciones / notificaciones | Se borran todo | Se sustituyen por datos de ejemplo |
| Objetivo | Dejar la app vacía y usable | Tener datos listos para enseñar flujos |

## Solución de problemas

- **Pantalla en blanco al entrar**: espere a que cargue la sesión; si el rol no corresponde a la ruta, se redirige automáticamente.
- **No veo las últimas reservas**: en la pestaña Calendario pulse **"Refrescar calendario"**.

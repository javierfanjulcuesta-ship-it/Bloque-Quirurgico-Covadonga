# Setup del backend (modo real)

## Requisitos

- Node.js 18+
- npm

## Pasos

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Copia `.env.example` a `.env`:

```bash
cp .env.example .env
```

Edita `.env`:

```env
# SQLite (archivo local)
DATABASE_URL="file:./dev.db"

# Modo: true = demo, false = backend real
NEXT_PUBLIC_DEMO_MODE=false

# JWT (obligatorio en modo real). Generar con: openssl rand -base64 32
JWT_SECRET=tu-clave-secreta-de-al-menos-32-caracteres
```

### 3. Inicializar la base de datos

```bash
npm run db:setup
```

Esto ejecuta `prisma db push` (crea tablas) y `prisma db seed` (crea usuario inicial).

### 4. Usuario inicial

Tras el seed, existe un usuario:

- **Email:** `gestor@hospital.es`
- **Contraseña:** `gestor123`

### 5. Arrancar la aplicación

```bash
npm run dev
```

Abre `http://localhost:3000`. Con `NEXT_PUBLIC_DEMO_MODE=false` verás el formulario de login real.

---

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Login (email + contraseña) |
| POST | `/api/auth/register` | Registro de usuario |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET | `/api/auth/session` | Obtener sesión actual |
| GET | `/api/users` | Lista de usuarios (requiere sesión) |

## Autenticación

- **Contraseñas:** hash bcrypt (12 rounds)
- **Sesión:** cookie httpOnly `bloque_session` con JWT firmado (7 días)

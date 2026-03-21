# Crear segundo gestor real para el piloto

## Variables en PowerShell

Definir antes de ejecutar el script:

```
GESTOR_EMAIL    → Email del nuevo gestor (obligatorio)
GESTOR_NAME     → Nombre completo (obligatorio)
GESTOR_ROLE     → GESTOR o GESTOR_ANESTESISTA (por defecto: GESTOR)
GESTOR_PASSWORD → Contraseña, mínimo 8 caracteres (obligatorio)
```

## Comando exacto para producción (Neon)

El script usa `DATABASE_URL` del archivo `.env`. En producción, asegúrate de tener `.env` con la cadena de conexión de Neon, o pásala inline:

**Opción A: Con .env ya configurado**
```powershell
$env:GESTOR_EMAIL="nuevo.gestor@hospital.es"
$env:GESTOR_NAME="Nombre Apellidos"
$env:GESTOR_ROLE="GESTOR"
$env:GESTOR_PASSWORD="TuContrasenaSegura123"
npx tsx scripts/crear-usuario-gestor.ts
```

**Opción B: Una sola línea**
```powershell
$env:GESTOR_EMAIL="nuevo.gestor@hospital.es"; $env:GESTOR_NAME="Nombre Apellidos"; $env:GESTOR_ROLE="GESTOR"; $env:GESTOR_PASSWORD="TuContrasenaSegura123"; npx tsx scripts/crear-usuario-gestor.ts
```

**Opción C: Usando npm script**
```powershell
$env:GESTOR_EMAIL="nuevo.gestor@hospital.es"
$env:GESTOR_NAME="Nombre Apellidos"
$env:GESTOR_PASSWORD="TuContrasenaSegura123"
npm run usuarios:gestor
```
(GESTOR_ROLE por defecto = GESTOR)

## Verificar en Neon que quedó creado

1. Conecta al proyecto en [Neon Console](https://console.neon.tech)
2. SQL Editor → ejecuta:
```sql
SELECT id, email, name, role, approved, "createdAt" 
FROM "User" 
WHERE role IN ('GESTOR', 'GESTOR_ANESTESISTA')
ORDER BY "createdAt" DESC;
```
3. Debe aparecer el nuevo usuario con `approved = true` y el rol indicado.

## Qué puede hacer ese gestor

- Ver calendario global
- Ver mensajes de contacto
- Crear usuarios (cirujanos, anestesistas, etc.)
- Asignar anestesistas
- Contactar coordinación
- Mi perfil / cambiar contraseña

## Qué NO puede hacer (GESTOR puro)

- Programar reservas (no tiene acceso a /cirujano)
- Ver Mi programación de anestesista
- Solicitar no disponibilidad

## GESTOR_ANESTESISTA adicional

Si usas `GESTOR_ROLE="GESTOR_ANESTESISTA"`, el usuario podrá además:
- Programar reservas (acceso a /cirujano)
- Ver Mi programación
- Consulta preanestesia
- Solicitar no disponibilidad

# Roles, permisos de visión y acceso – Bloque Quirúrgico Covadonga

Documento de referencia para implementar en la aplicación V2. Extraído del proyecto original.

---

## 1. Roles del sistema (`UserRole`)

| Rol | Descripción |
|-----|-------------|
| `cirujano` | Reserva y programa en **quirófanos Q1, Q2, Q3**. Calendario, mis reservas, pacientes programados, procedimientos realizados. |
| `endoscopista` | Reserva y programa solo en **Procedimientos menores** y **Técnicas del dolor** (no Q1, Q2, Q3). Misma pantalla que cirujano pero con recursos restringidos. |
| `anestesista` | Área anestesista: programación, consulta preanestesia, unidad dolor, procedimientos, agenda, histórico, indisponibilidad. |
| `gestor` | Área gestión: calendario, usuarios, mensajes, festivos, asignación anestesistas, etc. Sin acceso al área anestesista. |
| `gestor-anestesista` | Tiene **ambos** accesos: gestión y anestesista. Tras login va al dashboard y elige "Acceder a Gestión" o "Acceder a Área Anestesista". |

---

## 2. Funciones de acceso (qué puede ver / a qué ruta puede ir)

- **`hasGestorAccess(role)`**  
  `true` para `gestor` y `gestor-anestesista`.  
  Permite ver la zona de **Gestión** y rutas como `/gestor`.

- **`hasAnesthetistAccess(role)`**  
  `true` para `anestesista` y `gestor-anestesista`.  
  Permite ver la **Área Anestesista** y rutas como `/anestesista`.

- **`hasProgrammingAccess(role)`**  
  `true` para `cirujano` y `endoscopista`.  
  Permite ver la pantalla de **programación** (calendario, reservas, pacientes) y la ruta `/cirujano`.

- **`getAllowedResourcesForRole(role)`** (recursos que puede reservar):
  - **cirujano:** `["Q1", "Q2", "Q3"]`
  - **endoscopista:** `["procedimientos-menores", "tecnicas-dolor"]`
  - Otros roles (gestor/anestesista): no reservan; si se usara en contexto “todos”, sería `["Q1","Q2","Q3","procedimientos-menores","tecnicas-dolor"]`.

---

## 3. Redirección tras login (dashboard)

- Sin usuario → redirigir a `/` (login).
- **gestor-anestesista** → quedarse en `/dashboard` y mostrar **elección**: “Acceder a Gestión” (→ `/gestor`) o “Acceder a Área Anestesista” (→ `/anestesista`).
- **cirujano** o **endoscopista** → redirigir a `/cirujano`.
- **anestesista** → redirigir a `/anestesista`.
- **gestor** → redirigir a `/gestor`.

---

## 4. Control por ruta (quién puede entrar)

- **`/` (login)**  
  Cualquiera puede ver. Si ya hay usuario logueado, redirigir a `/dashboard`.

- **`/dashboard`**  
  Solo si hay usuario. Si no hay usuario → `/`.  
  Luego redirigir según rol como en el apartado 3.

- **`/cirujano`**  
  Solo si `user` existe y `hasProgrammingAccess(user.role)` (cirujano o endoscopista).  
  Si no → mostrar mensaje tipo: “No tiene acceso a esta área. Inicie sesión como cirujano o endoscopista.”

- **`/gestor`**  
  Solo si `user` existe y `hasGestorAccess(user.role)` (gestor o gestor-anestesista).  
  Si no → mensaje tipo: “No tiene acceso a esta área. Inicie sesión como gestor.”

- **`/anestesista`**  
  Solo si `user` existe y `hasAnesthetistAccess(user.role)` (anestesista o gestor-anestesista).  
  Si no → mensaje tipo: “No tiene acceso a esta área. Inicie sesión como anestesista.”

---

## 5. Detalles por rol en la app original

### Cirujano
- Ve: Calendario (solo Q1, Q2, Q3), Mis reservas, Mis pacientes programados, Procedimientos realizados, Mi perfil.
- Puede reservar solo en días laborables y hasta 4 semanas; norma 3 sem/50 % (si se libera >50 % del tiempo reservado, solo programar en huecos libres hasta revisión).
- Endoscopista ve la misma estructura pero solo recursos Procedimientos menores y Técnicas del dolor.

### Gestor
- Ve: Calendario/vista semanal, usuarios (añadir/editar/eliminar), mensajes, festivos, asignación de anestesistas, etc.
- Pestañas visibles según rol: si es solo `gestor` no ve “Pacientes programados” ni “Análisis cirujanos”; si es `gestor-anestesista` sí.
- Solo gestor/gestor-anestesista pueden crear nuevos usuarios (“+ Nuevo usuario”).

### Gestor-anestesista
- En `/gestor`: mismas pestañas que gestor y además “Pacientes programados” y “Análisis cirujanos”.
- Puede elegir en dashboard entre ir a Gestión o a Área Anestesista.

### Anestesista
- Ve: Mi programación, Consulta preanestesia, Unidad dolor, Procedimientos, Agenda (estado programación), Histórico, Indisponibilidad, Mi perfil.
- Asignaciones: máximo 2 quirófanos a la vez; si hay paciente complejo o niño en un quirófano, no asignar al mismo anestesista en otro a la vez.

---

## 6. Usuario (`User`) y aprobación

- Campos: `id`, `name`, `email`, `role`, `approved`.
- Solo usuarios con `approved: true` pueden hacer login.
- En login se comprueba `user.approved`; si es `false` → mensaje “Su acceso aún no está activado. El gestor debe aprobarle.”

---

## 7. Etiquetas para mostrar (`roleLabel`)

- `gestor-anestesista` → "Gestor/Anestesista"
- `endoscopista` → "Endoscopista/otros"
- `cirujano` → "Cirujano"
- `anestesista` → "Anestesista"
- `gestor` → "Gestor"

---

## 8. Recursos del bloque (`ResourceId`)

- `Q1`, `Q2`, `Q3` (quirófanos)
- `procedimientos-menores`
- `tecnicas-dolor`

Usar estas mismas constantes y `getAllowedResourcesForRole(role)` para restringir por rol en la nueva app.

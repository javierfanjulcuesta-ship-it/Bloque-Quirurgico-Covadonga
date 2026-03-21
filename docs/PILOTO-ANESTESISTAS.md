# Piloto: Crear dos anestesistas reales

Guía para añadir dos usuarios ANESTESISTA en producción y arrancar el piloto controlado.

---

## 1. Flujo actual

- **Script**: `scripts/crear-usuarios-desde-lista.ts` → lee `scripts/emails-anestesistas.txt`
- **Alternativa**: Crear usuario desde la app (Calendario → Crear nuevo usuario → Anestesista)

**Recomendación:** Usar el script para los dos a la vez. Más rápido y auditable.

---

## 2. Pasos exactos

### Paso 1: Editar el archivo

**Archivo:** `scripts/emails-anestesistas.txt`

Reemplaza o descomenta las líneas con los dos emails reales, uno por línea:

```
email1@dominio.com
email2@dominio.com
```

Las líneas que empiecen con `#` se ignoran.

### Paso 2: Verificar DATABASE_URL

El script usa `DATABASE_URL` de tu `.env`. Debe ser la misma URL de Neon producción (la de Vercel).

### Paso 3: Ejecutar el comando

```powershell
cd "c:\Users\usuario\Desktop\Ribera\Aplicacion V2\bloque-quirurgico-v2"
npx tsx scripts/crear-usuarios-desde-lista.ts anestesistas
```

O con npm:

```powershell
npm run usuarios:anestesistas
```

### Paso 4: Contraseñas

- El script **genera automáticamente** una contraseña temporal de 10 caracteres por usuario.
- Las imprime en la terminal y en una tabla al final.
- **Copiar** cada contraseña y enviarla al anestesista correspondiente por canal seguro (WhatsApp, presencial, etc.). No por correo sin cifrar si hay datos sensibles.

### Paso 5: Comprobar en Neon

En Neon SQL Editor:

```sql
SELECT email, role, approved FROM "User" WHERE role = 'ANESTESISTA' ORDER BY email;
```

Deben aparecer los dos usuarios con `approved = true`.

---

## 3. Permisos en la primera fase

| Pueden | No deben (por ahora) |
|--------|----------------------|
| Ver Mi programación | Crear reservas |
| Ver Mi semana | Editar asignaciones |
| Ver pacientes asignados | Crear usuarios |
| Consultar calendario | Modificar programación |

**Rol ANESTESISTA:** por diseño solo tiene acceso de consulta a su programación. El gestor asigna turnos; el anestesista consulta.

---

## 4. Riesgos a minimizar

- **Contraseña**: Entregar por canal seguro; pedir que la cambien en Mi perfil al primer acceso.
- **Datos**: Cargar asignaciones de prueba antes de dar acceso, para que vean contenido real.
- **Comunicación**: Indicar que es piloto; cualquier incidencia contactar al coordinador.

---

## 5. Checklist corto

- [ ] Editar `scripts/emails-anestesistas.txt` con los dos emails reales
- [ ] `DATABASE_URL` en `.env` apunta a Neon producción
- [ ] Ejecutar `npm run usuarios:anestesistas`
- [ ] Copiar contraseñas de la salida del script
- [ ] Cargar asignaciones para las semanas del piloto (Calendario → Asignar anestesistas)
- [ ] Enviar contraseñas a cada anestesista por canal seguro
- [ ] Comprobar en Neon que los usuarios existen
- [ ] Probar login con un anestesista (Mi programación visible)

# Auditoría perfil Cirujano – viabilidad piloto real

## 1. Qué puede hacer un cirujano en modo real (`NEXT_PUBLIC_DEMO_MODE=false`)

| Acción | Estado | Detalle |
|--------|--------|---------|
| **Login** | ✅ | Email + contraseña, API `/api/auth/login` |
| **Ver disponibilidad** | ✅ | `getReservations` → API, filtro por surgeonId, vista día con verde/rojo/ámbar |
| **Reservar huecos** | ✅ | `createReservationEntry` → POST /api/reservations, pacientes vacíos |
| **Programar pacientes** | ✅ | Mismo POST, con pacientes. Validación tiempo total |
| **Conflictos de hueco** | ✅ | API devuelve 409 "El hueco ya está ocupado" |
| **Mensajes de error** | ✅ | `ReservationsApiError`, setErrorNotification, 6s |
| **Ver lo reservado** | ✅ | GET reservas propias, pestaña Mis pacientes |
| **Editar reserva existente** | ❌ | No hay PATCH/update. Solo crear |
| **Cancelar/liberar reserva** | ❌ | No hay flujo en la app |

---

## 2. Dependencias de localStorage / lógica antigua

| Componente | Modo real | Comentario |
|------------|-----------|------------|
| Reservas | API | `getReservations` y `createReservationEntry` usan API cuando `!modoDemo` |
| Usuarios | API | `UsersContext` → `/api/users` |
| Autenticación | API | `loginWithPassword` → `/api/auth/login` |
| Asignaciones anestesistas | API | El cirujano no las modifica |
| `getUsers()` en ProgramarPacientesModal | API | Viene de `getUsersCache` ← `/api/users` |

**Conclusión:** En modo real el flujo cirujano depende de la API y la BD; no usa localStorage.

---

## 3. Riesgos operativos actuales

| Riesgo | Nivel | Descripción |
|--------|-------|-------------|
| No puede editar pacientes | Medio | Si se equivoca al programar, no hay corrección sin gestor |
| No puede cancelar reserva | Medio | Cambios de plan requieren gestor o contacto coordinación |
| Regla “semana siguiente cerrada” | Bajo | `isNextWeekReserveClosed` es lógica de negocio a validar |
| Race condition en hueco | Bajo | Dos cirujanos a la vez: uno obtiene 409 |
| Sesión expirada | Bajo | Mensaje “Sesión expirada. Inicie sesión de nuevo” |

---

## 4. Checklist mínimo antes de abrir acceso a 1 cirujano

- [ ] `NEXT_PUBLIC_DEMO_MODE=false` en Vercel
- [ ] `DATABASE_URL` en Vercel apuntando a Neon
- [ ] Usuario cirujano creado con `approved=true`
- [ ] Probar login real
- [ ] Probar reservar hueco vacío
- [ ] Probar programar pacientes
- [ ] Probar conflicto (mismo hueco dos veces)
- [ ] Acordar con el cirujano: correcciones vía gestor o coordinación

---

## 5. Recomendación

**Sí, es viable abrir acceso a 1 cirujano** para piloto controlado.

**Condiciones:**
- Piloto con 1 cirujano
- Comunicar que no puede editar ni cancelar reservas por su cuenta
- Para cambios: contactar coordinación o que el gestor gestione en BD si hace falta
- Revisar con el gestor los huecos reservados/programados las primeras semanas

---

# Flujo para publicar cambios hasta la web en Vercel

## 1. En Cursor
- Hacer los cambios en el código
- Guardar archivos (Ctrl+S)
- Opcional: `npx tsc --noEmit` para revisar tipos

## 2. En GitHub Desktop (o terminal)
```
git add .
git status          ← revisar qué se sube
git commit -m "Descripción del cambio"
git push origin main
```

## 3. En GitHub
- No hace falta nada más
- El push ya envía los cambios al remoto

## 4. Lo que hace Vercel automáticamente
- Detecta el push en la rama conectada (p. ej. `main`)
- Ejecuta el build (`prisma generate` + `next build`)
- Si el build va bien, despliega la nueva versión
- La web pública se actualiza en 1–3 minutos

## 5. Comprobar que la web está actualizada
1. Vercel dashboard → proyecto → Deployments → último deployment “Ready”
2. Abrir la URL de la app en una ventana privada o con Ctrl+Shift+R
3. Probar el flujo afectado por el cambio

## Cambios de base de datos
Si cambias `schema.prisma`:
```
npx prisma db push
```
(con `DATABASE_URL` de producción en `.env` o en Vercel; si usas la misma DB, se aplica a prod)

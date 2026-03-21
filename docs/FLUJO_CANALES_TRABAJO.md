# Flujo de canales de trabajo – Cirujanos y Anestesistas

## Resumen

**Solo el gestor puede añadir nuevos usuarios.** No hay registro público.

| Canal | Lista de correos | Acción | Documento |
|-------|-----------------|--------|-----------|
| **Cirujanos** | `scripts/emails-cirujanos.txt` | Crear usuarios aprobados | `docs/DOCUMENTO_CIRUJANOS.md` |
| **Anestesistas** | `scripts/emails-anestesistas.txt` | Crear usuarios aprobados | `docs/DOCUMENTO_ANESTESISTAS.md` |

Cualquier correo en la lista = usuario aprobado con acceso inmediato.

**Formas de añadir usuarios (solo gestor):**
1. **Desde el perfil gestor** (Calendario → pestaña "Crear nuevo usuario"): crear usuario uno a uno, se genera contraseña temporal y se abre el correo con la invitación.
2. **Script por lotes**: editar las listas de correos y ejecutar `npm run usuarios:cirujanos` o `npm run usuarios:anestesistas`.

---

## Canal 1: Cirujanos

### Pasos

1. **Recopilar correos** de los cirujanos que tendrán acceso.

2. **Editar** `scripts/emails-cirujanos.txt`:
   - Un correo por línea
   - Las líneas que empiezan con `#` se ignoran
   - Ejemplo:
     ```
     juan.garcia@hospital.es
     maria.lopez@hospital.es
     ```

3. **Ejecutar el script:**
   ```bash
   npm run usuarios:cirujanos
   ```

4. **Copiar la tabla de salida** (email + contraseña temporal) que imprime el script.

5. **Preparar el documento** `docs/DOCUMENTO_CIRUJANOS.md`:
   - Sustituir `[URL_DE_LA_APLICACION]` por la URL real (ej. `https://bloque.hospital.es`)
   - Para cada cirujano: enviar el documento con su contraseña temporal en `[CONTRASENA_INICIAL]`

6. **Enviar el correo** a cada cirujano con:
   - Asunto: *Organización de la programación del bloque quirúrgico y nueva función de contacto*
   - Cuerpo: contenido del documento + acceso (email del destinatario + contraseña temporal)

---

## Canal 2: Anestesistas

### Pasos

1. **Recopilar correos** de los anestesistas.

2. **Editar** `scripts/emails-anestesistas.txt`:
   - Un correo por línea
   - Ejemplo:
     ```
     ana.martinez@hospital.es
     carlos.ruiz@hospital.es
     ```

3. **Ejecutar el script:**
   ```bash
   npm run usuarios:anestesistas
   ```

4. **Copiar la tabla de salida** (email + contraseña temporal).

5. **Preparar el documento** `docs/DOCUMENTO_ANESTESISTAS.md`:
   - Sustituir `[URL_DE_LA_APLICACION]` por la URL real
   - Para cada anestesista: enviar el documento con su contraseña temporal

6. **Enviar el correo** a cada anestesista con:
   - Asunto: *Acceso a la aplicación de programación del bloque quirúrgico – Anestesia*
   - Cuerpo: contenido del documento + acceso

---

## Notas

- Los usuarios pueden **cambiar la contraseña** desde la aplicación en "Mi perfil".
- Si un correo ya existe en la BD, el script lo omite (no sobrescribe).
- El nombre inicial se genera a partir del correo (ej. `juan.garcia` → "Juan Garcia"). El usuario puede completar su perfil después.

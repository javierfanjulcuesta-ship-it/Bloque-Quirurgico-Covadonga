# Implementación: Normas editables por gestor

## Resumen

- **Modelo** `ProgrammingRule` en Prisma
- **API** GET (lectura) y PATCH (solo gestores)
- **UI** Pestaña "Normas" en calendario para GESTOR/GESTOR_ANESTESISTA
- **Integración** `normas_texto_completo` en correos de invitación y pestaña Cirujano

---

## Archivos tocados

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | Modelo `ProgrammingRule` |
| `src/lib/auth/permissions.ts` | Permiso `rules:edit` (GESTOR, GESTOR_ANESTESISTA) |
| `src/lib/programmingRules.ts` | Helper `getProgrammingRule`, `getNormasTextoCompleto` |
| `src/app/api/programming-rules/route.ts` | GET desde BD (gestor: todas; cirujano: solo advisory) |
| `src/app/api/programming-rules/[id]/route.ts` | PATCH con Zod |
| `src/components/gestor/NormasGestorView.tsx` | Nuevo componente UI |
| `src/app/calendario/page.tsx` | Pestaña "Normas" para gestor |
| `src/lib/email/invitationEmail.ts` | Parámetro `normasTexto` opcional |
| `src/lib/email/outlookService.ts` | Parámetro `normasTexto` en invitación |
| `src/app/api/email/send-invitation/route.ts` | Usa `getNormasTextoCompleto()` para cirujano/endoscopista |
| `scripts/seed-programming-rules.ts` | Nuevo script de seed |
| `package.json` | Script `rules:seed` |

---

## Pasos para activar

1. **Aplicar schema a la BD:**
   ```bash
   npx prisma db push
   # o: npx prisma migrate dev --name add_programming_rule
   ```

2. **Seed de reglas iniciales:**
   ```bash
   npm run rules:seed
   ```

3. **Verificar:** Entrar como gestor → Calendario → pestaña "Normas".

---

## Modelo mínimo

```prisma
model ProgrammingRule {
  id              String    @id @default(cuid())
  key             String    @unique
  name            String
  description     String?   @db.Text
  category        String    @default("scheduling")
  valueJson       String?   @db.Text
  isActive        Boolean   @default(true)
  updatedAt       DateTime  @updatedAt
  updatedByUserId String?

  @@index([category])
  @@index([isActive])
}
```

---

## Reglas seedeadas

| key | Descripción |
|-----|-------------|
| normas_texto_completo | Texto normas (correos, pestaña cirujano) |
| scheduling_deadline_day | Día cierre (4 = jueves) |
| scheduling_deadline_hour | Hora cierre |
| scheduling_deadline_minute | Minuto cierre |
| transition_minutes | Minutos transición por procedimiento |
| max_weeks_ahead | Semanas máximas por delante |

**Nota:** Las reglas numéricas (deadline, transition, max_weeks) se guardan en BD y se pueden editar, pero la lógica de cierre (`schedulingDeadline.ts`, `utils.ts`) sigue usando las constantes en código. Para conectarlas habría que usar `getProgrammingRule()` en puntos de uso (requiere refactor async).

---

## Seguridad

- PATCH solo si `hasPermission(role, "rules:edit")` → GESTOR, GESTOR_ANESTESISTA
- Validación Zod: `valueJson` opcional, `isActive` opcional
- Validadores por key: rangos numéricos, formato texto para normas
- Cirujano/Endoscopista: solo ven reglas `category === "informational"`

---

## Próximos pasos (opcionales)

1. Conectar `scheduling_deadline_*`, `transition_minutes`, `max_weeks_ahead` a la lógica de cierre (sustituir constantes por `getProgrammingRule` en contextos async).
2. Auditoría: `updatedByUserId` ya existe; se puede añadir relación a User y mostrar quién editó.
3. Historial de cambios si se requiere trazabilidad completa.

# Propuesta: App Móvil sin Navegador Tradicional

## Resumen ejecutivo

**Recomendación: PWA instalable** como primera fase, sin service worker ni offline por ahora.

- **Coste:** Cero (solo cambios de configuración)
- **Riesgo:** Mínimo
- **Impacto en código:** 2 archivos nuevos + iconos
- **Despliegue:** Igual que hoy en Vercel, sin cambios

---

## Comparativa rápida

| Criterio | PWA | Capacitor | Otra |
|----------|-----|-----------|------|
| Coste | 0€ | Medio (builds nativos, certificados) | - |
| Esfuerzo | 1–2 días | 1–2 semanas | - |
| App Store | No | Sí (si se quiere) | - |
| Offline | Opcional (fase 2) | Sí | - |
| Push | Opcional (fase 3) | Sí | - |
| Mantenimiento | Muy bajo | Medio | - |

**Conclusión:** PWA es la opción más conservadora y adecuada para tu contexto.

---

## Cambios mínimos (Fase 1 – PWA básica)

### Archivos a crear

1. **`src/app/manifest.ts`** – Manifest con nombre, colores e iconos
2. **`public/icon-192x192.png`** y **`public/icon-512x512.png`** – Iconos de la app

### Archivos a modificar

- **Ninguno obligatorio.** Next.js detecta `manifest.ts` y lo expone automáticamente.  
- El `layout.tsx` ya tiene `viewport` y `themeColor` configurados.

### Service worker

- **No necesario** para poder instalar la app en la pantalla de inicio.
- La documentación oficial indica que se puede usar el prompt de instalación sin soporte offline.
- Si más adelante quieres offline o push, se añade un service worker en una fase posterior.

---

## Estado actual de la app para móvil

### Lo que ya está bien

- Viewport configurado (`device-width`, `initialScale: 1`)
- `themeColor` definido
- Uso de Tailwind con utilidades responsivas (`flex-wrap`, `max-w-*`, `overflow-x-auto` en varias tablas)
- Rutas principales: `/`, `/cirujano`, `/calendario`, `/registro`

### Pantallas que necesitan scroll horizontal en móvil

Las tablas usan `min-w-[400px]`–`min-w-[900px]`. En móvil (~375–428px) habrá scroll horizontal (ya previsto con `overflow-x-auto` en varios sitios):

| Pantalla | min-width | Envoltorio overflow |
|----------|-----------|---------------------|
| DaySlotGrid | 400px | Sí |
| WeekCalendar | 800px | Sí |
| Cirujano (Mis pacientes) | 640px | Verificar |
| GestionarApertura | 900px | Verificar |
| AsignarAnestesistas | 640px | Verificar |
| MiProgramacion | 600px | Verificar |
| ValoracionPreanestesia | 560px | Verificar |

**Recomendación:** En Fase 1 aceptar scroll horizontal. En Fase 2, revisar las tablas que no tengan `overflow-x-auto` y, si procede, añadirlo o alternativas (vista de tarjetas, etc.).

---

## Limitaciones iOS y Android

### iOS (Safari)

- No hay `beforeinstallprompt`: el usuario debe usar **Compartir → Añadir a pantalla de inicio**
- Soporte push: iOS 16.4+ para PWAs instaladas
- Sin barra de direcciones cuando está en modo standalone
- Algunas restricciones de almacenamiento (localStorage, etc.)
- Puede recargar la app al cambiar pestañas en Safari (según versión)

### Android (Chrome)

- Sí muestra el prompt nativo "Instalar app"
- Soporte push completo
- Comportamiento muy similar a una app nativa instalada

### Ambas plataformas

- La app se abre en ventana standalone (sin barra del navegador)
- Requiere HTTPS (Vercel ya lo cumple)
- Sin acceso a hardware especial (bluetooth, NFC, etc.) salvo APIs web estándar

---

## Plan por fases

### Fase 1 – PWA instalable (1–2 días) – prioridad

1. Crear `manifest.ts`
2. Añadir iconos 192×192 y 512×512
3. Desplegar en Vercel
4. Probar instalación en Android (Chrome) e iOS (Safari)
5. Opcional: componente `InstallPrompt` para indicar en iOS cómo instalar

**Resultado:** Usuario puede instalar la app desde el navegador y abrirla como app standalone.

---

### Fase 2 – Mejoras móvil (si hace falta)

1. Revisar tablas sin `overflow-x-auto` y envolverlas
2. Revisar modales en pantallas pequeñas
3. Ajustar tamaños de tap/click (mínimo 44×44 px)
4. Añadir `overflow-x-auto` donde falte

---

### Fase 3 – Opcional: offline básico

1. Integrar Serwist u otra solución de service worker
2. Cache de shell y rutas principales
3. Página offline simple con mensaje "Sin conexión"

---

### Fase 4 – Opcional: push

1. Generar claves VAPID
2. Crear service worker con push
3. Server Actions para suscripciones y envío

---

## Riesgos y limitaciones

| Riesgo | Mitigación |
|--------|------------|
| Usuarios iOS no saben instalar | Banner o texto con instrucciones "Compartir → Añadir a pantalla de inicio" |
| Tablas anchas difíciles en móvil | Scroll horizontal aceptable en Fase 1; mejoras en Fase 2 |
| Push no disponible en todos los dispositivos | Solo implementar si realmente se necesita |
| Service worker desactualizado | Si se añade, usar estrategia "network first" para contenido crítico |

---

## Si se elige PWA: checklist de implementación

- [x] Crear `src/app/manifest.ts`
- [x] Añadir `public/icon-192x192.png` y `public/icon-512x512.png`
- [ ] Probar en Android (Chrome): menú → Instalar app
- [ ] Probar en iOS (Safari): compartir → Añadir a pantalla de inicio
- [x] Componente `InstallPrompt` creado (opcional: añadir en layout o página inicial)
- [ ] Documentar internamente cómo instalar la app en móvil

No hace falta service worker ni cambios en `next.config` para la Fase 1.

---

## Implementación realizada (Fase 1)

1. **`src/app/manifest.ts`** – Manifest con colores Ribera (#c41e3a), display standalone
2. **`public/icon-192x192.png`** y **`public/icon-512x512.png`** – Iconos generados con marca
3. **`src/components/InstallPrompt.tsx`** – Componente opcional para mostrar instrucciones en iOS

Para activar el InstallPrompt en la página de login, añade en `page.tsx`:

```tsx
import { InstallPrompt } from "@/components/InstallPrompt";

// Dentro del JSX, p. ej. antes del formulario:
<InstallPrompt />
```

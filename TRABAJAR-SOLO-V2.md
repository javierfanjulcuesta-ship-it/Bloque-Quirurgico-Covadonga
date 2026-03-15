# Trabajar solo con la versión 2 (V2)

Este proyecto es la **única versión activa** del Bloque Quirúrgico. La carpeta "Gestion Bloque quirurgico" (versión 1) se mantiene solo como **referencia** para copiar lógica o pantallas que ya funcionaban bien; no se debe desarrollar ni ejecutar en el día a día.

---

## Cómo entrar y ver la versión 2

1. **Abrir el proyecto en Cursor/VS Code**
   - Ruta del proyecto V2:  
     `C:\Users\usuario\Desktop\Ribera\Aplicacion V2\bloque-quirurgico-v2`
   - Abre esta carpeta como raíz del workspace (File → Open Folder).

2. **Instalar dependencias** (solo la primera vez o si cambias `package.json`):
   ```bash
   cd "C:\Users\usuario\Desktop\Ribera\Aplicacion V2\bloque-quirurgico-v2"
   npm install
   ```

3. **Arrancar la aplicación**:
   ```bash
   npm run dev
   ```
   - La app se abre en: **http://localhost:3000**
   - Para ver el **calendario por rangos horarios, días y colores** (libre/reservado/ocupado) y la vista gestor con pacientes privados remarcados: **http://localhost:3000/calendario**

4. **Compilar para producción** (opcional):
   ```bash
   npm run build
   npm start
   ```

---

## Evitar duplicidades y errores

- **Solo edita y ejecuta** el código dentro de `Aplicacion V2\bloque-quirurgico-v2`.
- **No copies archivos** desde "Gestion Bloque quirurgico" sin adaptarlos: V2 usa Next.js 16, Tailwind v4 y estructura en `src/`. Si necesitas algo de la V1, cópialo aquí y ajusta imports y estilos.
- **No mezcles** dependencias ni configuraciones de la V1 en la V2 (por ejemplo, no uses el `package.json` ni el `tailwind.config` de la V1).
- La V1 puede seguir en el disco como referencia; si quieres evitar confusiones, no la abras como proyecto principal y no ejecutes `npm run dev` dentro de esa carpeta.

---

## Estructura rápida de V2

- `src/app/` – Rutas y páginas (App Router).
- `src/components/` – Componentes reutilizables (calendario, gestor, etc.).
- `src/lib/` – Tipos, constantes, utilidades, almacenamiento, emails.
- La estética (rojo/blanco Ribera) y los colores de huecos (libre/reservado/ocupado) están en `src/app/globals.css`.

Si tienes dudas sobre qué carpeta es la de trabajo, comprueba que la ruta del proyecto sea `...\Aplicacion V2\bloque-quirurgico-v2`.

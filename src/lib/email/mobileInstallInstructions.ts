/**
 * Instrucciones de instalación PWA para incluir en correos.
 * Reutilizable en invitación y otros correos.
 */

export interface MobileInstallInstructionsResult {
  text: string;
  html: string;
}

/**
 * Genera el bloque de texto e HTML con instrucciones para instalar la app en móvil (PWA).
 */
export function buildMobileInstallInstructions(appUrl: string): MobileInstallInstructionsResult {
  const url = appUrl.trim();
  const text = `
Acceso desde móvil (aplicación instalable)

Puede utilizar la aplicación desde su teléfono móvil como acceso directo:

• iPhone/iPad: Abra el enlace en Safari y pulse Compartir → Añadir a pantalla de inicio.

• Android: Abra el enlace en Chrome y pulse "Instalar aplicación" o "Añadir a pantalla de inicio" cuando aparezca el aviso.
`.trim();

  const html = `
<p style="margin-top: 1.5em; margin-bottom: 0.5em;"><strong>Acceso desde móvil (aplicación instalable)</strong></p>
<p style="margin-bottom: 0.5em;">Puede utilizar la aplicación desde su teléfono móvil como acceso directo:</p>
<ul style="margin: 0.5em 0; padding-left: 1.5em;">
  <li><strong>iPhone/iPad:</strong> Abra el enlace en Safari y pulse Compartir → Añadir a pantalla de inicio.</li>
  <li><strong>Android:</strong> Abra el enlace en Chrome y pulse "Instalar aplicación" o "Añadir a pantalla de inicio" cuando aparezca el aviso.</li>
</ul>
`.trim();

  return { text, html };
}

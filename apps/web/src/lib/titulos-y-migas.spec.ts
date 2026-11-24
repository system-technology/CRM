import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Títulos de documento y migas de pan (T-633, ADR-0032 §4).
 *
 * El ADR ya lo exigía —«los detalles lo sobrescriben con `tituloDeDocumento(nombre)`»— y, medido el
 * 2026-11-24, **ninguna página de detalle lo hacía**: `/bandeja/<id>`, `/contactos/<id>` y
 * `/cotizaciones/<id>` no tocaban el título. Seis conversaciones abiertas en seis pestañas decían las
 * seis «Conversaciones · ViajaPro».
 *
 * Y las migas contaban otra historia que el menú:
 *  - `/bandeja/<id>` decía **«Bandeja»** donde el menú, el H1 y el título dicen «Conversaciones».
 *  - `/seguimientos` tenía un `<nav>` **escrito a mano** con un nivel **«CRM»** que enlazaba a
 *    `/contactos` pero se llamaba de otra forma: ni es una pantalla ni es el nombre de ninguna.
 *
 * Esta guarda existe porque las dos cosas son texto suelto: se desincronizan del menú en cuanto
 * alguien renombra algo, y nada avisa. La regla de la propia tarea es la que se vigila aquí: **las
 * etiquetas salen de la tabla de navegación, no se escriben a mano.**
 */

const RAIZ_REPO = path.resolve(__dirname, '../../../..');
const leer = (rel: string) => readFileSync(path.join(RAIZ_REPO, rel), 'utf8');

const DETALLES = [
  'apps/web/src/app/(app)/bandeja/[id]/page.tsx',
  'apps/web/src/app/(app)/contactos/[id]/page.tsx',
  'apps/web/src/app/(app)/cotizaciones/[id]/page.tsx',
] as const;

describe('Títulos de detalle y migas (T-633)', () => {
  it('las tres pantallas de detalle ponen en la pestaña lo que se está viendo', () => {
    for (const pagina of DETALLES) {
      expect(leer(pagina), `${pagina} fija el título del detalle`).toContain(
        'useFijarTituloDeDetalle(',
      );
    }
  });

  it('el marco sigue siendo el único que pinta el <title>', () => {
    const marco = leer('apps/web/src/components/comun/marco-de-trabajo.tsx');
    // Un segundo `<title>` en el detalle no ganaría: React eleva todos y el navegador toma el primero.
    expect(marco).toContain('<title>{titulo}</title>');
    expect(marco).toContain('ProveedorDeTituloDeDetalle');
    for (const pagina of DETALLES) {
      expect(leer(pagina), `${pagina} no pinta su propio <title>`).not.toContain('<title>');
    }
  });

  it('el gancho se llama antes de cualquier retorno temprano', () => {
    // Puesto después, React cuenta un hook distinto en el render que carga y en el que pinta, y
    // rompe con «Rendered more hooks than during the previous render». Pasó, y lo cazaron las
    // pruebas de la ficha de contacto.
    for (const pagina of DETALLES) {
      const texto = leer(pagina);
      const hook = texto.indexOf('useFijarTituloDeDetalle(');
      const primerRetorno = texto.search(/\n {2}if \([^)]*\) \{\n {4}return/);
      if (primerRetorno !== -1) {
        expect(hook, `${pagina}: el gancho va antes del primer retorno temprano`).toBeLessThan(
          primerRetorno,
        );
      }
    }
  });

  it('las migas usan las etiquetas de la tabla de navegación, no texto a mano', () => {
    const bandeja = leer('apps/web/src/app/(app)/bandeja/[id]/page.tsx');
    // Decía «Bandeja»; el menú dice «Conversaciones».
    expect(bandeja).toContain("entradaDe('conversaciones').etiqueta");
    expect(bandeja).not.toContain("etiqueta: 'Bandeja'");

    const seguimientos = leer('apps/web/src/app/(app)/seguimientos/page.tsx');
    expect(seguimientos).toContain('MigasDePan');
    expect(seguimientos).toContain("entradaDe('seguimientos').etiqueta");
    // «CRM» no es una pantalla, y era un nivel inventado.
    expect(seguimientos).not.toMatch(/>\s*CRM\s*</);
  });
});

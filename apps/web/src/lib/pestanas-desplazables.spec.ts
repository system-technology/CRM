import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Tiras de pestañas que no caben (T-631).
 *
 * Medido el 2026-11-24 a 390 px: `/configuracion` tiene **nueve** pestañas que ocupan 1414 px en un
 * hueco de 342 —**siete quedan fuera**— y `/catálogo`, una de tres fuera. Se podían desplazar, pero
 * **nada decía que hubiera más**, así que el usuario no sabía que existían.
 *
 * Y apareció algo que la tarea no decía: **las dos pantallas no estaban igual de mal.**
 * `/catálogo` ya tenía semántica de pestañas completa (`role="tab"`, `aria-selected`,
 * `aria-controls`, `type="button"`); `/configuracion` era un `<nav>` de botones planos donde **la
 * activa solo se distinguía por el color**, sin `aria-selected` ni `aria-current`. Quien usara un
 * lector de pantalla no podía saber en qué sección estaba.
 *
 * Esta guarda vigila el contrato, porque son clases y atributos: si desaparecen, no avisa nadie.
 * Es una lista exacta y corta, como la de `lenguaje-de-interfaz`, no un barrido.
 *
 * Lo que NO prueba: que el desvanecido se vea. Es una máscara con animación de línea de tiempo de
 * scroll, que jsdom no evalúa; se comprobó con el navegador a 390 px.
 */

const RAIZ_REPO = path.resolve(__dirname, '../../../..');
const leer = (rel: string) => readFileSync(path.join(RAIZ_REPO, rel), 'utf8');

describe('Tiras de pestañas desplazables (T-631)', () => {
  it('las dos tiras usan la utilidad que las desvanece', () => {
    const css = leer('apps/web/src/app/globals.css');
    // La utilidad y sus dos propiedades registradas: sin `@property` los desvanecidos no interpolan.
    expect(css).toContain('.tira-desplazable');
    expect(css).toContain('@property --desvanecido-inicio');
    expect(css).toContain('@property --desvanecido-fin');
    expect(css).toContain('animation-timeline: scroll(self inline)');

    for (const pagina of [
      'apps/web/src/app/(app)/configuracion/page.tsx',
      'apps/web/src/app/(app)/catalogo/page.tsx',
    ]) {
      const texto = leer(pagina);
      expect(texto, `${pagina} usa la tira desplazable`).toContain('tira-desplazable');
      // Y deja de pedir `overflow-x-auto` a mano: lo pone la utilidad.
      expect(texto, `${pagina} no duplica overflow-x en la tira`).not.toMatch(
        /tira-desplazable[^"]*overflow-x-auto/,
      );
      expect(texto, `${pagina} lleva la activa a la vista`).toContain('usarPestanaALaVista');
    }
  });

  it('en Configuración la pestaña activa se anuncia, no solo se colorea', () => {
    const texto = leer('apps/web/src/app/(app)/configuracion/page.tsx');
    // Antes era un `<nav>` de botones planos: la activa solo cambiaba de color.
    expect(texto).toContain('aria-label="Secciones de la configuración"');
    const conAriaCurrent = texto.match(/aria-current=\{tabActiva === '/g) ?? [];
    expect(conAriaCurrent.length, 'cada pestaña dice si es la activa').toBeGreaterThanOrEqual(9);

    // `type="button"`: sin él, una pestaña dentro de un formulario lo enviaría.
    const onClicks = texto.match(/onClick=\{\(\) => setTabActiva\('/g) ?? [];
    expect(conAriaCurrent.length, 'tantas marcas de activa como pestañas').toBe(onClicks.length);
  });

  it('en Catálogo se conserva la semántica de pestañas que ya tenía', () => {
    const texto = leer('apps/web/src/app/(app)/catalogo/page.tsx');
    expect(texto).toContain('role="tab"');
    expect((texto.match(/aria-selected=\{pestañaActiva === '/g) ?? []).length).toBe(3);
  });

  it('el gancho reconoce las dos formas de marcar la activa', () => {
    const texto = leer('apps/web/src/lib/usar-pestana-a-la-vista.ts');
    // `/catálogo` usa `aria-selected`; `/configuracion`, `aria-current`.
    expect(texto).toContain('aria-selected="true"');
    expect(texto).toContain('aria-current="true"');
    // `block: 'nearest'` es lo que evita que la página salte en vertical.
    expect(texto).toContain("block: 'nearest'");
  });
});

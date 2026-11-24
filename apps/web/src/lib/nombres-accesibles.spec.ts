import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Nombre accesible de los controles de solo icono (T-632).
 *
 * Medido el 2026-11-24 en las once pantallas, calculando el nombre en el navegador y no por `grep`:
 * hay **68 controles de solo icono** y **52 están bien**. Los **16 que fallaban estaban todos en
 * `/contactos`** —los dos enlaces de cada una de las ocho filas— y fallaban **por partida doble**:
 *
 *  1. Su nombre salía **solo de `title`**. En un teléfono no hay `hover`, así que en el aparato
 *     principal de la asesora esos iconos **no tenían nombre en la práctica**.
 *  2. El nombre **se repetía ocho veces**: «Abrir chat en bandeja» ×8 y «Abrir Ficha 360» ×8. Un
 *     lector de pantalla no podía distinguir el chat de Juan del de Ana.
 *
 * Por eso la etiqueta lleva **a quién pertenece la fila**, y no un texto genérico: es lo que arregla
 * las dos cosas a la vez. Y de paso sale «Ficha 360», que no está en el lenguaje ubicuo.
 *
 * Lo que NO prueba: el resto de los 68. Esos se midieron en el navegador y están correctos; vigilarlos
 * aquí exigiría una lista que se desactualiza sola. Si alguien añade un icono sin nombre, lo caza la
 * medición del navegador, no esta guarda.
 */

const RAIZ_REPO = path.resolve(__dirname, '../../../..');

describe('Nombres accesibles de los controles de solo icono (T-632)', () => {
  it('los dos enlaces de cada fila de Contactos nombran a su contacto', () => {
    const texto = readFileSync(
      path.join(RAIZ_REPO, 'apps/web/src/app/(app)/contactos/page.tsx'),
      'utf8',
    );

    // `aria-label`, no solo `title`: en táctil no hay hover.
    expect(texto).toContain('aria-label={`Abrir el chat con ${aQuien}`}');
    expect(texto).toContain('aria-label={`Ver la ficha de ${aQuien}`}');

    // El nombre del contacto es lo que distingue una fila de otra.
    expect(texto, 'la fila sabe a quién pertenece').toMatch(/const aQuien =/);

    // Y lo que había antes no vuelve: un nombre genérico repetido ocho veces.
    expect(texto).not.toContain('title="Abrir chat en bandeja"');
    expect(texto).not.toContain('title="Abrir Ficha 360"');
  });

  it('`title` y `aria-label` dicen lo mismo, para que el ratón y el lector no discrepen', () => {
    const texto = readFileSync(
      path.join(RAIZ_REPO, 'apps/web/src/app/(app)/contactos/page.tsx'),
      'utf8',
    );
    for (const frase of ['Abrir el chat con ${aQuien}', 'Ver la ficha de ${aQuien}']) {
      const veces = (texto.match(new RegExp(frase.replace(/[${}]/g, '\\$&'), 'g')) ?? []).length;
      expect(veces, `«${frase}» está en aria-label y en title`).toBe(2);
    }
  });
});

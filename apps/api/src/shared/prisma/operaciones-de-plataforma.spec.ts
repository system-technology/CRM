/**
 * Que la vía de escape sin tenant no se normalice dentro de un módulo de negocio.
 *
 * El ADR-0003 dice de `sinTenantPorqueEsPlataforma` que es «deliberadamente incómoda de nombrar»
 * y que **si aparece dentro de un módulo de negocio, es un defecto**. Eso estaba escrito en un
 * comentario, que es donde las reglas se mueren: nadie lee el comentario de un método mientras
 * autocompleta su nombre.
 *
 * Aquí se vuelve comprobable. Un módulo que necesite correr sin tenant —y los hay, el webhook es
 * uno— lo declara en `operaciones-de-plataforma.ts` y usa `sinTenantDeclarado`. La diferencia es
 * que la declaración se ve en una revisión; una llamada suelta dentro de un adaptador, no.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPERACIONES_DE_PLATAFORMA, motivoDeclarado } from './operaciones-de-plataforma.js';

const MODULOS = join(process.cwd(), 'src', 'modules');

function fuentesDeNegocio(dir: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      encontrados.push(...fuentesDeNegocio(ruta));
      continue;
    }
    // Las pruebas quedan fuera: un arnés que siembra agencias para probarlas necesita
    // legítimamente mirar por encima de los tenants, y es código que nunca corre en producción.
    if (
      entrada.name.endsWith('.ts') &&
      !entrada.name.endsWith('.spec.ts') &&
      !entrada.name.endsWith('.e2e-spec.ts')
    ) {
      encontrados.push(ruta);
    }
  }
  return encontrados;
}

describe('Las operaciones de plataforma', () => {
  it('declaran un motivo que explica algo, no una etiqueta', () => {
    for (const operacion of Object.keys(OPERACIONES_DE_PLATAFORMA) as Array<
      keyof typeof OPERACIONES_DE_PLATAFORMA
    >) {
      // Un motivo de tres palabras no sirve a quien lo encuentre dentro de seis meses, que es
      // la única persona para la que se escribe esto.
      expect(motivoDeclarado(operacion).length).toBeGreaterThan(40);
      expect(motivoDeclarado(operacion)).toMatch(/ADR-\d{4}/);
    }
  });

  it('ningún módulo de negocio usa la vía de escape sin declarar', () => {
    const culpables = fuentesDeNegocio(MODULOS)
      .filter((ruta) => readFileSync(ruta, 'utf8').includes('sinTenantPorqueEsPlataforma'))
      .map((ruta) => ruta.slice(MODULOS.length + 1));

    expect(
      culpables,
      culpables.length === 0
        ? ''
        : 'Estos módulos de negocio saltan el aislamiento sin declararlo:\n' +
            culpables.map((c) => `  · ${c}`).join('\n') +
            '\n\nDeclara la operación en operaciones-de-plataforma.ts y usa sinTenantDeclarado.',
    ).toHaveLength(0);
  });
});

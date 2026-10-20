import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS sin tipos, compartido con el script
import { evaluarGuarda } from '../scripts/guarda-base-desechable.mjs';

type Entrada = { desechable?: string; url: string; baseActual?: string };
const evaluar = evaluarGuarda as (e: Entrada) => { ok: boolean; motivo: string };
const NEON = 'postgresql://u:p@ep-abc-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require';

describe('guarda de las mutaciones de aislamiento', () => {
  it('rechaza Neon aunque la variable esté puesta', () => {
    expect(evaluar({ desechable: '1', url: NEON }).ok).toBe(false);
  });
  it('rechaza sin la variable explícita, incluso en localhost', () => {
    expect(evaluar({ url: 'postgresql://u:p@localhost:5432/neondb' }).ok).toBe(false);
    expect(evaluar({ desechable: 'true', url: 'postgresql://u:p@localhost/x' }).ok).toBe(false);
  });
  it('acepta el service container de CI: localhost aunque la base se llame neondb', () => {
    expect(evaluar({ desechable: '1', url: 'postgresql://u:p@localhost:5432/neondb' }).ok).toBe(
      true,
    );
    expect(evaluar({ desechable: '1', url: 'postgresql://u:p@127.0.0.1:5432/neondb' }).ok).toBe(
      true,
    );
  });
  it('un host ajeno solo pasa con base de nombre propio', () => {
    expect(evaluar({ desechable: '1', url: 'postgresql://u:p@db.interno/neondb' }).ok).toBe(false);
    expect(evaluar({ desechable: '1', url: 'postgresql://u:p@db.interno/efimera_7' }).ok).toBe(
      true,
    );
  });
  it('una URL ilegible se rechaza', () => {
    expect(evaluar({ desechable: '1', url: 'no es una url' }).ok).toBe(false);
  });
});

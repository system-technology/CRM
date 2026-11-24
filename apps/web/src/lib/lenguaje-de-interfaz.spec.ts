import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Lenguaje de la interfaz (T-629).
 *
 * El propietario miró las once pantallas y dijo «veo todo igual». El diagnóstico (T-618) encontró
 * por qué: **la misma cosa no se llamaba igual dos veces**. Al medirlo para arreglarlo resultó peor
 * de lo que decía la tarea — la lista de contactos tenía **cuatro** nombres, no tres:
 *
 *   «Contactos» (menú y H1) · «Directorio comercial» (bajada) ·
 *   «Directorio de Contactos» (ficha) · «Directorio de Clientes» (paleta de módulos)
 *
 * Y la interfaz hablaba nuestra jerga, no la del asesor: «SLA Vencido» en la bandeja, «SLA y
 * Tiempos» en Configuración, «Opt-In Marketing» en Contactos, y —lo peor— «Cero PII en Títulos
 * (R10)» en el panel de avisos, que enseña una sigla técnica y el número de una regla interna.
 *
 * Esta guarda existe porque **nada de eso avisaba**: son cadenas, y una cadena que vuelve no rompe
 * nada. Es el mismo fallo mudo de T-561, T-569, T-627 y T-626. Dos pruebas sí vigilaban dos de
 * estas cadenas y se pusieron rojas al cambiarlas; las otras ocho no las miraba nadie.
 *
 * Deliberadamente es una **lista exacta y corta**, no un barrido por palabras: «CRM» es legítimo en
 * la marca («CRM para Agencias de Turismo») y «CSV» nombra el fichero que el asesor de verdad
 * descarga. Un barrido daría falsos positivos y acabaría desactivado, que es peor que no tenerlo.
 */

const RAIZ_REPO = path.resolve(__dirname, '../../../..');

/** Ficheros de interfaz, sin pruebas: lo que el asesor puede llegar a leer en pantalla. */
function ficherosDeInterfaz(): string[] {
  const salida = execFileSync('git', ['ls-files', '-z', 'apps/web/src'], {
    cwd: RAIZ_REPO,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return salida.split('\0').filter((f) => /\.tsx$/.test(f) && !f.includes('.spec.'));
}

/** Cadenas que estaban en pantalla y no deben volver, con lo que se puso en su lugar. */
const DESTERRADAS: ReadonlyArray<{ cadena: string; porQue: string }> = [
  { cadena: 'Directorio de Contactos', porQue: 'la lista se llama «Contactos»' },
  { cadena: 'Directorio de Clientes', porQue: 'la lista se llama «Contactos»' },
  { cadena: 'Directorio comercial', porQue: 'la bajada describía, pero renombraba la pantalla' },
  { cadena: 'SLA Vencido', porQue: 'en pantalla es «Fuera de plazo»' },
  { cadena: 'SLA y Tiempos', porQue: 'en pantalla es «Plazos de respuesta»' },
  { cadena: 'Opt-In Marketing', porQue: 'en pantalla es «Aceptan promociones»' },
  { cadena: 'Meta Opt-In', porQue: 'en pantalla se dice «permiso expreso»' },
  { cadena: 'Cero PII en Títulos', porQue: 'ni «PII» ni el número de una regla interna' },
  { cadena: 'protección PII', porQue: '«PII» es jerga nuestra, no del asesor' },
];

describe('Lenguaje de la interfaz (T-629)', () => {
  it('ninguna de las cadenas desterradas vuelve a la interfaz', () => {
    const archivos = ficherosDeInterfaz();
    expect(archivos.length, 'se encontraron ficheros de interfaz que revisar').toBeGreaterThan(50);

    const reincidencias: string[] = [];
    for (const archivo of archivos) {
      const texto = readFileSync(path.join(RAIZ_REPO, archivo), 'utf8');
      for (const { cadena, porQue } of DESTERRADAS) {
        if (texto.includes(cadena)) {
          reincidencias.push(`${archivo}: «${cadena}» — ${porQue}`);
        }
      }
    }

    expect(reincidencias, reincidencias.join('\n')).toEqual([]);
  });

  it('la ficha de un contacto y la paleta de módulos llaman «Contactos» a la lista', () => {
    const ficha = readFileSync(
      path.join(RAIZ_REPO, 'apps/web/src/app/(app)/contactos/[id]/page.tsx'),
      'utf8',
    );
    expect(ficha).toContain('Volver a Contactos');

    const paleta = readFileSync(
      path.join(RAIZ_REPO, 'apps/web/src/components/comun/iconos-modulos.tsx'),
      'utf8',
    );
    expect(paleta).toContain("nombre: 'Contactos'");
  });

  it('las vigencias del catálogo se escriben con el formato de la casa, no en ISO', () => {
    const ficha = readFileSync(
      path.join(RAIZ_REPO, 'apps/web/src/components/catalogo/ficha-detalle-paquete.tsx'),
      'utf8',
    );
    // Antes imprimía `{vigenciaActiva.desde}` en crudo: «2027-06-15» en vez de «15 jun 2027».
    expect(ficha).not.toMatch(/\{vigenciaActiva\.(desde|hasta)\}/);
    expect(ficha).not.toMatch(/\$\{v\.(desde|hasta)\}/);
    expect(ficha).toContain('formatearFecha(vigenciaActiva.desde)');
    // El aviso de vigencia imprimía la fecha cruda Y «(UTC)». R9: la zona del tenant es de
    // presentación, así que al asesor no se le enseña UTC.
    expect(ficha).not.toMatch(/\{vigencia\.proximoVencimiento\}/);
    expect(ficha).not.toContain('(UTC)');

    const lista = readFileSync(
      path.join(RAIZ_REPO, 'apps/web/src/app/(app)/catalogo/page.tsx'),
      'utf8',
    );
    // «Vigente hasta 2027-06-15» en la tarjeta de cada tarifario.
    expect(lista).not.toMatch(/\{vigencia\.proximoVencimiento\}/);
    expect(lista).toContain('formatearFecha(vigencia.proximoVencimiento)');
    expect(lista).not.toMatch(/\$\{sal\.fecha\}/);
  });
});

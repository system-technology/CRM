/**
 * La compuerta del fallo más silencioso que tiene este proyecto.
 *
 * **Qué pasa sin ella.** Nest resuelve las dependencias de un constructor leyendo los metadatos
 * `design:paramtypes` que emite el compilador. El transpilador que usamos en desarrollo **no los
 * emite**. Cuando faltan, Nest no se queja: construye la clase **con cero dependencias** y
 * arranca en verde. El fallo aparece en la primera petición real, como un `undefined` en mitad
 * del manejador —`Cannot read properties of undefined (reading 'conTenant')`— y a esa altura ya
 * no se parece en nada a su causa.
 *
 * Pasó el 2026-10-13 con los cuatro casos de uso de `quoting` y costó una tarde. Se arregló
 * poniendo `@Inject(Token)` explícito, que no depende de los metadatos. Y hoy, 2026-10-14, al
 * barrer el resto del código apareció **`CatalogoController` con el mismo agujero todavía
 * abierto**: la corrección anterior se aplicó donde dolía y no donde podía volver a doler.
 *
 * Por eso esto es una prueba y no una nota en la cola. Una convención que solo vive en la
 * cabeza de quien la escribió se pierde con el primer archivo nuevo.
 *
 * **Por qué se lee el código fuente y no se arranca Nest.** Arrancar el módulo entero exige
 * PostgreSQL, Redis y variables de entorno, y aun así solo probaría que las clases se
 * *construyen*: el defecto es que se construyen **bien, pero vacías**. Lo que hay que afirmar
 * es sintáctico, así que se comprueba donde vive.
 *
 * **La salida:** una clase que se instancia a mano —`new ZodValidationPipe(esquema)`— no pasa
 * por el inyector y pedirle un token sería absurdo. Esas llevan `@inyeccion-manual` en un
 * comentario, que es una decisión declarada y revisable, no una excepción invisible.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(process.cwd(), 'src');

/** Todo `.ts` de producción bajo `src/`. Las pruebas no construyen nada por inyección. */
function fuentes(dir: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      encontrados.push(...fuentes(ruta));
    } else if (
      entrada.name.endsWith('.ts') &&
      !entrada.name.endsWith('.spec.ts') &&
      !entrada.name.endsWith('.e2e-spec.ts')
    ) {
      encontrados.push(ruta);
    }
  }
  return encontrados;
}

/** El texto entre el paréntesis de apertura y el que lo cierra, contando anidados. */
function parametrosDesde(texto: string, aperturaEn: number): string | null {
  let profundidad = 0;
  for (let i = aperturaEn; i < texto.length; i += 1) {
    const c = texto[i];
    if (c === '(') profundidad += 1;
    else if (c === ')') {
      profundidad -= 1;
      if (profundidad === 0) return texto.slice(aperturaEn + 1, i);
    }
  }
  return null;
}

/**
 * Parte la lista de parámetros por las comas **de primer nivel**.
 *
 * Partir por `,` a secas rompe `@Inject(forwardRef(() => X)) private readonly x: Y`, que es
 * exactamente la forma que más falta hace que siga funcionando.
 */
function partirParametros(lista: string): string[] {
  const partes: string[] = [];
  let profundidad = 0;
  let actual = '';
  for (const c of lista) {
    if (c === '(' || c === '[' || c === '<') profundidad += 1;
    else if (c === ')' || c === ']' || c === '>') profundidad -= 1;
    if (c === ',' && profundidad === 0) {
      partes.push(actual);
      actual = '';
      continue;
    }
    actual += c;
  }
  partes.push(actual);
  return partes.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** `private readonly x: T` es una propiedad de parámetro: Nest tiene que resolverla. */
const ES_PROPIEDAD_DE_PARAMETRO = /(^|\s)(private|protected|public)\s/;

const DECORADOR_DE_CLASE = /@(Injectable|Controller)\s*\(/g;

interface Hueco {
  archivo: string;
  clase: string;
  parametro: string;
}

function huecosDe(ruta: string): Hueco[] {
  const texto = readFileSync(ruta, 'utf8');
  // Declarada una vez por archivo: una clase que se instancia a mano no convive con otra que no.
  if (texto.includes('@inyeccion-manual')) return [];

  const huecos: Hueco[] = [];
  for (const decorador of texto.matchAll(DECORADOR_DE_CLASE)) {
    const desde = decorador.index ?? 0;
    const declaracion = /export\s+(?:abstract\s+)?class\s+(\w+)/.exec(texto.slice(desde));
    if (!declaracion) continue;
    const clase = declaracion[1] ?? '?';

    // El constructor de ESTA clase: el primero después de su declaración y antes de la
    // siguiente. Un archivo con dos clases decoradas se mira por separado.
    const cuerpoDesde = desde + (declaracion.index ?? 0) + declaracion[0].length;
    const siguienteClase = texto.slice(cuerpoDesde).search(/\n@(Injectable|Controller)\s*\(/);
    const cuerpo = texto.slice(
      cuerpoDesde,
      siguienteClase === -1 ? texto.length : cuerpoDesde + siguienteClase,
    );

    const constructorEn = cuerpo.indexOf('constructor(');
    if (constructorEn === -1) continue;

    const lista = parametrosDesde(cuerpo, constructorEn + 'constructor'.length);
    if (lista === null || lista.trim().length === 0) continue;

    for (const parametro of partirParametros(lista)) {
      if (!ES_PROPIEDAD_DE_PARAMETRO.test(parametro)) continue;
      if (parametro.includes('@Inject')) continue;
      huecos.push({ archivo: ruta.slice(RAIZ.length + 1), clase, parametro });
    }
  }
  return huecos;
}

describe('Toda dependencia inyectada lleva su token explícito', () => {
  const archivos = fuentes(RAIZ);

  it('encuentra código que mirar, para que un verde no sea un barrido vacío', () => {
    // Sin esto, un cambio de `cwd` o de extensión dejaría la prueba en verde examinando cero
    // archivos — que es el mismo fallo silencioso que viene a impedir, una capa más arriba.
    expect(archivos.length).toBeGreaterThan(20);
    expect(archivos.some((a) => a.includes('controller'))).toBe(true);
  });

  it('ni una sola clase de Nest confía en los metadatos del decorador', () => {
    const huecos = archivos.flatMap(huecosDe);

    const detalle = huecos
      .map((h) => `  · ${h.archivo} → ${h.clase}: ${h.parametro.replace(/\s+/g, ' ')}`)
      .join('\n');

    expect(
      huecos,
      huecos.length === 0
        ? ''
        : 'Estas dependencias se resolverían por metadatos de decorador, y con nuestro ' +
            'transpilador Nest construiría la clase VACÍA sin avisar:\n' +
            `${detalle}\n\n` +
            'Ponles @Inject(Token) delante. Si la clase se instancia a mano con `new`, ' +
            'declara @inyeccion-manual en un comentario del archivo y di por qué.',
    ).toHaveLength(0);
  });
});

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contraste de los tokens de color (T-561).
 *
 * El propietario reportó que «el toque de contraste negro hace que se pierdan un poco los textos»,
 * en la barra lateral, las pantallas de trabajo y el conjunto. Al medirlo resultó que ningún par
 * declarado incumplía AA: lo que fallaba es que `ok` y `alerta` estaban declarados SOLO en tres
 * tonos (50, 600, 700) y el código usaba otros catorce. En Tailwind v4 una familia de `@theme`
 * solo genera las clases de los tonos declarados, así que `dark:text-alerta-300` no emitía CSS y
 * en oscuro sobrevivía el color de claro. El botón de borrar una etiqueta quedaba en #b91c1c sobre
 * #262626: 2,34:1.
 *
 * Esta prueba cubre las dos mitades de ese fallo:
 *  - `tonos declarados`: ningún tono de una familia propia se usa sin declararse (es la causa raíz,
 *    y se comprueba sola, sin lista que mantener).
 *  - `contraste de los pares reales`: los pares fondo/texto que la aplicación usa de verdad, con la
 *    resolución EFECTIVA — la que el navegador aplica, no la que el autor quiso.
 *
 * Umbrales WCAG 2.1 AA: 4,5:1 texto normal; 3:1 texto grande (≥ 24 px, o ≥ 18,66 px en negrita) y
 * anillos de foco. Los bordes `border-ok-*` / `border-alerta-*` NO entran: en los ocho sitios donde
 * aparecen son el borde de un panel o insignia que ya se identifica por su fondo y su texto, nunca
 * el único límite de un control, que es lo que WCAG 1.4.11 exige a 3:1. Si algún día uno de ellos
 * delimita un `input` o un `button`, hay que medirlo aquí.
 */

const RAIZ_WEB = path.resolve(__dirname, '..');
const css = readFileSync(path.join(RAIZ_WEB, 'app/globals.css'), 'utf8');

/** Familias de color propias de ViajaPro: las que `@theme` define y Tailwind no trae de fábrica. */
const FAMILIAS_PROPIAS = [
  'acento',
  'ok',
  'aviso',
  'alerta',
  'turquesa',
  'oceano',
  'coral',
  'atardecer',
  'arena',
  'resalte',
  'dorado',
] as const;

// ---------------------------------------------------------------- tokens

function bloque(selector: string): string {
  const inicio = css.indexOf(selector);
  expect(inicio, `no se encontró ${selector} en globals.css`).toBeGreaterThan(-1);
  return css.slice(inicio, css.indexOf('\n}', inicio));
}

function tokensDe(texto: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const m of texto.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g)) {
    mapa.set(m[1] as string, m[2] as string);
  }
  return mapa;
}

const TOKENS_CLARO = tokensDe(bloque('@theme {'));
const TOKENS_OSCURO = new Map([...TOKENS_CLARO, ...tokensDe(bloque('.dark {'))]);

/** Paleta de fábrica de Tailwind, leída de la versión instalada (neutral, red, amber…). */
const PALETA_TAILWIND = (() => {
  const requerir = createRequire(path.join(RAIZ_WEB, '../package.json'));
  const tema = readFileSync(requerir.resolve('tailwindcss/theme.css'), 'utf8');
  const mapa = new Map<string, string>();
  for (const m of tema.matchAll(/--color-([a-z0-9-]+):\s*(oklch\([^)]+\)|#[0-9a-fA-F]{3,8})/g)) {
    mapa.set(m[1] as string, m[2] as string);
  }
  return mapa;
})();

// ---------------------------------------------------------------- color

/** oklch(97.1% 0.013 17.38) → sRGB lineal. La L puede venir en %, y el tono puede ser `none`. */
function oklchASrgb(valor: string): [number, number, number] {
  const partes = valor
    .replace(/^oklch\(|\)$/g, '')
    .trim()
    .split(/[\s/]+/)
    .slice(0, 3);
  const numero = (v: string | undefined, i: number): number => {
    if (v === undefined || v === 'none') return 0;
    const n = Number.parseFloat(v);
    if (Number.isNaN(n)) return 0;
    return i === 0 && v.includes('%') ? n / 100 : n;
  };
  const [L, C, H] = partes.map(numero) as [number, number, number];
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v))) as [number, number, number];
}

function aSrgb(color: string): [number, number, number] {
  if (color.startsWith('oklch')) return oklchASrgb(color);
  let h = color.slice(1);
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

function luminancia(color: string): number {
  const [r, g, b] = aSrgb(color).map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (oscuro + 0.05);
}

function aHex(color: string): string {
  if (!color.startsWith('oklch')) return color.toLowerCase();
  return (
    '#' +
    oklchASrgb(color)
      .map((v) => {
        const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
        return Math.round(Math.min(1, Math.max(0, s)) * 255)
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
  );
}

type Tema = 'claro' | 'oscuro';

/**
 * El color que una clase genera, o `null` si NO genera ninguna.
 *
 * Es el caso que importa: si el tono es de una familia propia y nadie lo declaró, Tailwind no emite
 * la clase. Escribir `dark:text-alerta-300` entonces no cambia nada.
 */
function colorDeClase(token: string, tema: Tema): string | null {
  if (token === 'blanco') return '#ffffff';
  const propios = tema === 'claro' ? TOKENS_CLARO : TOKENS_OSCURO;
  if (propios.has(token)) return aHex(propios.get(token) as string);

  const familia = token.replace(/-\d+$/, '');
  if ((FAMILIAS_PROPIAS as readonly string[]).includes(familia)) return null;

  const tw = PALETA_TAILWIND.get(token);
  expect(tw, `Tailwind no tiene el color ${token}`).toBeDefined();
  return aHex(tw as string);
}

/**
 * Lo que la pantalla pinta de verdad en oscuro.
 *
 * Un elemento lleva las dos clases: `text-alerta-700 dark:text-alerta-300`. Si la de oscuro no
 * existe, no la sustituye nada: **sigue aplicando la de claro**. Por eso el respaldo es el token
 * del par CLARO, no el mismo nombre de token buscado en claro. Modelarlo de la otra forma es lo
 * que hacía que esta prueba dijera «no genera clase» y nunca enseñara el 2,34:1 real.
 */
function colorEfectivoOscuro(
  tokenOscuro: string,
  tokenClaro: string,
): {
  hex: string;
  inerte: boolean;
} {
  const deOscuro = colorDeClase(tokenOscuro, 'oscuro');
  if (deOscuro !== null) return { hex: deOscuro, inerte: false };
  const deClaro = colorDeClase(tokenClaro, 'claro');
  expect(deClaro, `ni ${tokenOscuro} ni ${tokenClaro} generan clase`).not.toBeNull();
  return { hex: deClaro as string, inerte: true };
}

// ---------------------------------------------------------------- guarda 1

/** Utilidades de Tailwind que toman un color y que el proyecto usa. */
const UTILIDADES =
  'bg|text|border|ring|from|to|via|divide|outline|decoration|fill|stroke|placeholder';

function clasesDeColorUsadas(): Map<string, string[]> {
  // `git ls-files` evita recorrer node_modules y ata la prueba a lo versionado.
  const salida = execFileSync('git', ['ls-files', '-z', 'apps/web/src', 'packages/ui'], {
    cwd: path.resolve(RAIZ_WEB, '../../..'),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const archivos = salida.split('\0').filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('.spec.'));
  const patron = new RegExp(
    `\\b(?:[a-z-]+:)*(?:${UTILIDADES})-([a-z]+)-(\\d{2,3})(?:\\/\\d+)?\\b`,
    'g',
  );
  const encontrados = new Map<string, string[]>();
  const raiz = path.resolve(RAIZ_WEB, '../../..');
  for (const archivo of archivos) {
    const src = readFileSync(path.join(raiz, archivo), 'utf8');
    for (const m of src.matchAll(patron)) {
      const familia = m[1] as string;
      if (!(FAMILIAS_PROPIAS as readonly string[]).includes(familia)) continue;
      const token = `${familia}-${m[2]}`;
      const lista = encontrados.get(token) ?? [];
      if (!lista.includes(archivo)) lista.push(archivo);
      encontrados.set(token, lista);
    }
  }
  return encontrados;
}

describe('tonos declarados: una clase que no genera CSS es un token roto', () => {
  it('todo tono de una familia propia que el código usa está declarado en globals.css', () => {
    const usados = clasesDeColorUsadas();
    expect(
      usados.size,
      'el escaneo no encontró ninguna clase: el patrón está roto',
    ).toBeGreaterThan(10);
    const sinDeclarar = [...usados.entries()]
      .filter(([token]) => !TOKENS_OSCURO.has(token))
      .map(
        ([token, archivos]) =>
          `  ${token} — usado en ${archivos.length} archivo(s), p. ej. ${archivos[0]}`,
      )
      .sort();
    expect(
      sinDeclarar,
      `Estos tonos se usan pero no existen en @theme, así que Tailwind no emite su clase y el\n` +
        `estilo se pierde en silencio (en oscuro sobrevive el color de claro):\n${sinDeclarar.join('\n')}\n`,
    ).toEqual([]);
  });
});

describe('familias existentes: una familia que no es de nadie no emite CSS (T-569)', () => {
  /** Las que trae Tailwind v4 de fábrica; las propias están en FAMILIAS_PROPIAS. */
  const FAMILIAS_DE_TAILWIND = new Set([
    'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime',
    'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia',
    'pink', 'rose',
  ]);

  it('toda familia de color usada en las clases es de Tailwind o está en @theme', () => {
    const raiz = path.resolve(RAIZ_WEB, '../../..');
    const salida = execFileSync('git', ['ls-files', '-z', 'apps/web/src', 'packages/ui'], {
      cwd: raiz,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const patron = new RegExp(
      `\\b(?:[a-z-]+:)*(?:${UTILIDADES})-([a-z]+)-(\\d{2,3})(?:\\/\\d+)?\\b`,
      'g',
    );
    const desconocidas = new Map<string, string>();
    for (const archivo of salida.split('\0')) {
      if (!/\.(ts|tsx)$/.test(archivo) || archivo.includes('.spec.')) continue;
      for (const m of readFileSync(path.join(raiz, archivo), 'utf8').matchAll(patron)) {
        const familia = m[1] as string;
        if ((FAMILIAS_PROPIAS as readonly string[]).includes(familia)) continue;
        if (FAMILIAS_DE_TAILWIND.has(familia)) continue;
        desconocidas.set(familia, archivo);
      }
    }
    expect(
      [...desconocidas.entries()].map(([f, a]) => `  ${f} — p. ej. ${a}`),
      'Estas familias no existen ni en @theme ni en Tailwind: sus clases no emiten CSS.',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------- guarda 2

/**
 * Pares fondo/texto que la aplicación usa de verdad, con dónde viven.
 *
 * La lista es explícita a propósito. Derivarla automáticamente de las cadenas de clases no sirve
 * de compuerta: las dos ramas de un ternario dentro de una misma plantilla (`bg-acento-700 …` /
 * `text-neutral-600 …`) parecen un par y nunca coinciden en un elemento, y un fondo con alfa
 * (`bg-acento-500/10`) no es el color sólido. Ese escaneo sirvió para encontrar los pares; la
 * compuerta son estos, revisados uno a uno contra el componente que los pinta.
 */
const PARES = [
  // --- navegación y superficies de acento (lo que el propietario llamó «la barra lateral») ---
  {
    donde: 'módulo activo de la barra lateral',
    claro: ['acento-100', 'acento-800'],
    oscuro: ['acento-950', 'acento-300'],
  },
  {
    donde: 'fila seleccionada y chips de acento',
    claro: ['acento-50', 'acento-700'],
    oscuro: ['acento-950', 'acento-300'],
  },
  {
    donde: 'insignia de acento secundaria',
    claro: ['acento-100', 'acento-700'],
    oscuro: ['acento-900', 'acento-300'],
  },
  {
    donde: 'avatar de agencia',
    claro: ['acento-100', 'acento-800'],
    oscuro: ['acento-950', 'acento-300'],
  },
  {
    donde: 'icono de acento sobre tarjeta',
    claro: ['acento-50', 'acento-600'],
    oscuro: ['acento-950', 'acento-400'],
  },
  {
    donde: 'texto fuerte sobre acento claro',
    claro: ['acento-50', 'acento-900'],
    oscuro: ['acento-950', 'acento-200'],
  },
  {
    donde: 'título sobre acento-100',
    claro: ['acento-100', 'acento-900'],
    oscuro: ['acento-950', 'acento-200'],
  },
  {
    donde: 'texto sobre acento-50 profundo',
    claro: ['acento-50', 'acento-800'],
    oscuro: ['acento-950', 'acento-400'],
  },

  // --- estados semánticos del CRM ---
  {
    donde: 'insignia «en plazo» / ventana de 24 h abierta',
    claro: ['ok-50', 'ok-700'],
    oscuro: ['ok-950', 'ok-300'],
  },
  {
    donde: 'insignia de éxito con texto fuerte',
    claro: ['ok-50', 'ok-800'],
    oscuro: ['ok-950', 'ok-400'],
  },
  {
    donde: 'aviso de «por vencer»',
    claro: ['aviso-50', 'aviso-700'],
    oscuro: ['aviso-50', 'aviso-700'],
  },
  {
    donde: 'panel de error / alerta',
    claro: ['alerta-50', 'alerta-700'],
    oscuro: ['alerta-950', 'alerta-300'],
  },
  {
    donde: 'panel de error con texto fuerte',
    claro: ['alerta-50', 'alerta-950'],
    oscuro: ['alerta-950', 'alerta-200'],
  },
  {
    donde: 'icono de error sobre su chip',
    claro: ['alerta-100', 'alerta-700'],
    oscuro: ['alerta-900', 'alerta-300'],
  },

  // --- el caso que disparó T-561 ---
  {
    donde: 'botón de borrar etiqueta (configuracion/bloque-etiquetas.tsx)',
    claro: ['blanco', 'alerta-700'],
    oscuro: ['neutral-800', 'alerta-300'],
  },

  // --- marco de trabajo ---
  {
    donde: 'marco de las pantallas privadas',
    claro: ['neutral-50', 'neutral-900'],
    oscuro: ['neutral-950', 'neutral-100'],
  },
  {
    donde: 'tarjeta sobre el marco',
    claro: ['blanco', 'neutral-900'],
    oscuro: ['neutral-900', 'neutral-100'],
  },
  {
    donde: 'texto secundario en tarjeta',
    claro: ['blanco', 'neutral-600'],
    oscuro: ['neutral-900', 'neutral-300'],
  },
  {
    donde: 'texto secundario sobre neutral-800',
    claro: ['neutral-100', 'neutral-700'],
    oscuro: ['neutral-800', 'neutral-300'],
  },
] as const;

describe('contraste de los pares reales de token (WCAG 2.1 AA, 4,5:1)', () => {
  for (const par of PARES) {
    const [fondoClaro, textoClaro] = par.claro;
    const [fondoOscuro, textoOscuro] = par.oscuro;

    it(`${par.donde} — claro: ${fondoClaro} / ${textoClaro}`, () => {
      const hexFondo = colorDeClase(fondoClaro, 'claro');
      const hexTexto = colorDeClase(textoClaro, 'claro');
      expect(hexFondo, `bg-${fondoClaro} no genera ninguna clase`).not.toBeNull();
      expect(hexTexto, `text-${textoClaro} no genera ninguna clase`).not.toBeNull();
      const ratio = contraste(hexFondo as string, hexTexto as string);
      expect(
        Number(ratio.toFixed(2)),
        `${par.donde} en claro: ${fondoClaro} (${hexFondo}) con ${textoClaro} (${hexTexto}) ` +
          `mide ${ratio.toFixed(2)}:1 y AA pide 4,5:1`,
      ).toBeGreaterThanOrEqual(4.5);
    });

    it(`${par.donde} — oscuro: ${fondoOscuro} / ${textoOscuro}`, () => {
      const fondo = colorEfectivoOscuro(fondoOscuro, fondoClaro);
      const texto = colorEfectivoOscuro(textoOscuro, textoClaro);
      const ratio = contraste(fondo.hex, texto.hex);
      const inertes = [
        fondo.inerte ? `dark:bg-${fondoOscuro}` : null,
        texto.inerte ? `dark:text-${textoOscuro}` : null,
      ].filter(Boolean);
      const nota = inertes.length
        ? ` — ${inertes.join(' y ')} ${inertes.length > 1 ? 'no generan' : 'no genera'} CSS, ` +
          `así que en oscuro sigue pintando lo de claro ` +
          `(${fondo.hex} / ${texto.hex})`
        : '';
      expect(
        Number(ratio.toFixed(2)),
        `${par.donde} en oscuro: ${fondoOscuro} (${fondo.hex}) con ${textoOscuro} (${texto.hex}) ` +
          `mide ${ratio.toFixed(2)}:1 y AA pide 4,5:1${nota}`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('contraste de elementos no textuales (3:1)', () => {
  const NO_TEXTO = [
    {
      donde: 'anillo de foco sobre el marco claro',
      fondo: 'neutral-50',
      color: 'acento-600',
      tema: 'claro' as const,
    },
    {
      donde: 'anillo de foco sobre el marco oscuro',
      fondo: 'neutral-950',
      color: 'acento-600',
      tema: 'oscuro' as const,
    },
    {
      donde: 'acción primaria sobre el marco claro',
      fondo: 'neutral-50',
      color: 'acento-700',
      tema: 'claro' as const,
    },
  ];
  for (const n of NO_TEXTO) {
    it(`${n.donde}: ${n.color} sobre ${n.fondo}`, () => {
      const fondo = colorDeClase(n.fondo, n.tema);
      const color = colorDeClase(n.color, n.tema);
      expect(fondo, `${n.fondo} no genera clase`).not.toBeNull();
      expect(color, `${n.color} no genera clase`).not.toBeNull();
      const ratio = contraste(fondo as string, color as string);
      expect(
        Number(ratio.toFixed(2)),
        `mide ${ratio.toFixed(2)}:1 y el mínimo es 3:1`,
      ).toBeGreaterThanOrEqual(3);
    });
  }

  it('el texto blanco de la acción primaria llega a AA sobre acento-700', () => {
    const ratio = contraste(colorDeClase('acento-700', 'claro') as string, '#ffffff');
    expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(4.5);
  });
});

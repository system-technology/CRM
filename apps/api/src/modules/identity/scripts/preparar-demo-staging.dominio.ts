/**
 * Decisiones PURAS de `preparar-demo-staging` (T-600): qué se permite, qué credenciales son
 * válidas y qué se le cuenta al propietario. Sin base de datos ni entorno: se prueba aparte.
 *
 * La intención de las guardias: que esta preparación solo toque una base que contiene la agencia
 * demo y nada más. Una base con alguna agencia ajena a la semilla puede tener datos reales y NO se
 * le pone una contraseña conocida.
 *
 * El correo y la contraseña los elige quien lanza el workflow (inputs): aquí no hay ninguno fijo.
 */

export const SLUG_DE_LA_AGENCIA_DEMO = 'agencia-demo';
/** Clave del rol de la persona dueña, sembrado por `siembra-de-tenant.ts`. */
export const CLAVE_DEL_ROL_DUENO = 'DUENO';
export const NOMBRE_DEL_USUARIO_DE_LA_DEMO = 'Demo ViajaPro';
/** Mismos topes que Better Auth (`minPasswordLength` 12, `maxPasswordLength` 128). No se bajan. */
export const LONGITUD_MINIMA_DE_CLAVE = 12;
export const LONGITUD_MAXIMA_DE_CLAVE = 128;
const ANFITRIONES_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Devuelve el motivo del rechazo o `null`. */
export function motivoDeContrasenaInvalida(clave: string): string | null {
  if (clave.length < LONGITUD_MINIMA_DE_CLAVE) {
    return (
      `La contraseña debe tener al menos ${LONGITUD_MINIMA_DE_CLAVE} caracteres ` +
      '(el mismo mínimo que exige el sistema al crear una).'
    );
  }
  if (clave.length > LONGITUD_MAXIMA_DE_CLAVE) {
    return `La contraseña no puede pasar de ${LONGITUD_MAXIMA_DE_CLAVE} caracteres.`;
  }
  return null;
}

/** Devuelve el motivo del rechazo o `null`. `identidades` rechaza el dominio `.invalid` (CHECK). */
export function motivoDeCorreoInvalido(correo: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || correo.length > 255) {
    return 'El correo no tiene forma de correo (algo@dominio.ext).';
  }
  if (correo.toLowerCase().endsWith('.invalid')) {
    return 'El dominio .invalid está reservado y la base lo rechaza.';
  }
  return null;
}

export interface EntradaDeLaGuardia {
  /** Debe valer `staging`: lo fija el workflow, no quien lo lanza. */
  readonly entorno: string | undefined;
  /** Solo el hostname, nunca la cadena de conexión. */
  readonly anfitrion: string;
  /** Agencias cuyo slug NO es el de la demo. */
  readonly agenciasAjenas: number;
}

export type Decision =
  { readonly permitido: true } | { readonly permitido: false; readonly motivo: string };

export function decidirSiSePuedePrepararLaDemo(entrada: EntradaDeLaGuardia): Decision {
  if (entrada.entorno !== 'staging') {
    return {
      permitido: false,
      motivo: 'Negado: esto solo corre con PREPARAR_DEMO_ENTORNO=staging.',
    };
  }
  if (ANFITRIONES_LOCALES.has(entrada.anfitrion)) {
    return {
      permitido: false,
      motivo: 'Negado: la base es local. Para desarrollo usa `identidad:sembrar-dev`.',
    };
  }
  if (entrada.agenciasAjenas !== 0) {
    return {
      permitido: false,
      motivo:
        `Negado: la base tiene ${entrada.agenciasAjenas} agencia(s) que no son la demo ` +
        `(${SLUG_DE_LA_AGENCIA_DEMO}). No se pone una contraseña conocida donde puede haber datos reales.`,
    };
  }
  return { permitido: true };
}

export interface Conteos {
  readonly agencias: number;
  readonly agenciaDemo: boolean;
  readonly identidades: number;
  readonly usuarios: number;
  readonly credenciales: number;
}

/** Lo que concluye el diagnóstico, en una frase para el propietario. */
export function diagnosticoEnPalabras(c: Conteos): string {
  if (c.agencias === 0) return 'No había ninguna agencia: la semilla nunca corrió en esta base.';
  if (!c.agenciaDemo) return 'Hay agencias pero ninguna es la demo.';
  if (c.usuarios === 0) return 'Existía la agencia demo pero sin ningún usuario.';
  if (c.credenciales === 0) {
    return 'La agencia demo y sus usuarios existían, pero ningún usuario tenía contraseña: nadie podía entrar.';
  }
  return 'La agencia demo existía y había al menos un usuario con contraseña.';
}

export type EstadoDelUsuario = 'creado' | 'contraseña puesta' | 'contraseña reemplazada';

export interface DatosDelResumen {
  readonly antes: Conteos;
  readonly despues: Conteos;
  readonly estado: EstadoDelUsuario;
}

function tabla(c: Conteos): string {
  return [
    '| Dato | Valor |',
    '|---|---|',
    `| Agencias | ${c.agencias} |`,
    `| Agencia demo presente | ${c.agenciaDemo ? 'sí' : 'no'} |`,
    `| Identidades | ${c.identidades} |`,
    `| Usuarios de la agencia demo | ${c.usuarios} |`,
    `| Credenciales (contraseñas) | ${c.credenciales} |`,
  ].join('\n');
}

/**
 * El resumen que lee el propietario. NO lleva ni la contraseña ni el correo: el repositorio es
 * público y quien lanza el workflow ya los conoce (los escribió él). T-646.
 */
export function resumenDeLaPreparacion(d: DatosDelResumen): string {
  return [
    '## Credencial de la demo de staging',
    '',
    `Usuario dueño de la agencia demo: **${d.estado}**. Entra con el correo y la contraseña que ` +
      'escribiste al lanzar el workflow; aquí no se repiten.',
    '',
    `**Diagnóstico de lo que había:** ${diagnosticoEnPalabras(d.antes)}`,
    '',
    '### Antes',
    tabla(d.antes),
    '',
    '### Después',
    tabla(d.despues),
    '',
  ].join('\n');
}

/**
 * Traduce lo que Postgres rechaza al escribir en el libro de cobro a errores de dominio tipados
 * (R6: nunca un `catch` silencioso, nunca un 500 por algo que es culpa de la entrada).
 *
 * **Por qué se descarta el texto.** Un `23514` (CHECK) trae en `message` y `meta` «Failing row
 * contains (…)» con `nota`, `referencia` y `motivo`; un `23505` trae la clave duplicada. Nada de eso
 * sale de aquí: de un error de Postgres solo se lee el SQLSTATE y el NOMBRE de la restricción
 * (que no lleva datos), y el resto se tira. Lo desconocido se vuelve `FalloDeEscrituraDelLibroError`
 * sin `cause`, que arrastraría el original a la traza.
 *
 * Mapa (migración `20261121140000`):
 *   23503 FK    pagador → PagadorNoEncontrado · archivo/moneda → ArchivoNoEncontrado ·
 *               reverso_de_id → MovimientoNoEncontrado · registrado_por → SinUsuarioParaRegistrar
 *   23505 único `pagos_un_reverso_por_movimiento` → MovimientoYaReversado ·
 *               clave de idempotencia → ClaveReutilizada (no debería: el insert es DO NOTHING)
 *   23514 CHECK `pagos_validar_alta` («un reverso no se reversa») → ReversoDeReverso ·
 *               cualquier otro → MovimientoRechazadoPorLaBase
 *   23001 / 42501 (inmutables, privilegios) y lo demás → FalloDeEscrituraDelLibro
 */
import { Prisma } from '@prisma/client';
import { DomainError } from '@viajapro/domain';
import {
  ArchivoDeCobroNoEncontradoError,
  ClaveDeIdempotenciaReutilizadaError,
  CobroOcupadoError,
  FalloDeEscrituraDelLibroError,
  MovimientoDeCobroNoEncontradoError,
  MovimientoRechazadoPorLaBaseError,
  MovimientoYaReversadoError,
  PagadorNoEncontradoError,
  ReversoDeReversoError,
  SinUsuarioParaRegistrarError,
} from '../domain/errors.js';

const propiedad = (o: unknown, nombre: string): unknown =>
  typeof o === 'object' && o !== null ? (o as Record<string, unknown>)[nombre] : undefined;
const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** SQLSTATE sin tocar texto libre: `meta.code` (raw), el `Pxxxx` de Prisma o `code`/`cause.code` de `pg`. */
export function sqlstateDe(error: unknown): string | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return '23505';
    if (error.code === 'P2003') return '23503';
    if (error.code === 'P2004') return '23514';
    return texto(propiedad(error.meta, 'code')) ?? error.code;
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    const m = /\b(23503|23505|23514|23001|42501|55P03)\b/.exec(error.message);
    return m?.[1] ?? null;
  }
  return texto(propiedad(error, 'code')) ?? texto(propiedad(propiedad(error, 'cause'), 'code'));
}

/** Nombre de la restricción violada (no lleva datos). Solo se lee su nombre, el texto se descarta. */
export function restriccionDe(error: unknown): string | null {
  const candidatos = [
    texto(propiedad(error, 'constraint')),
    texto(propiedad(propiedad(error, 'meta'), 'constraint')),
    texto(propiedad(propiedad(error, 'meta'), 'field_name')),
    texto(propiedad(propiedad(error, 'meta'), 'target')),
    texto(propiedad(propiedad(error, 'meta'), 'message')),
    error instanceof Error ? error.message : null,
  ];
  for (const c of candidatos) {
    if (c === null) continue;
    const m = /constraint "?([a-z_0-9]+)"?/i.exec(c) ?? /^(pagos_[a-z_0-9]+)/.exec(c);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** ¿El texto del error es el del disparador `pagos_validar_alta`? Solo se busca la frase. */
function esReversoDeReverso(error: unknown): boolean {
  const mensajes = [
    error instanceof Error ? error.message : '',
    texto(propiedad(propiedad(error, 'meta'), 'message')) ?? '',
  ];
  return mensajes.some((m) => m.includes('un reverso no se reversa'));
}

/** Para el `catch` que rodea a la transacción. Siempre lanza; nunca devuelve el error original. */
export function traducirErrorDelLibro(error: unknown): never {
  // Los nuestros pasan tal cual: no traen datos.
  if (error instanceof DomainError) throw error;

  const codigo = sqlstateDe(error);
  const restriccion = restriccionDe(error);
  // 55P03: `lock_timeout` vencido esperando el candado del archivo. Transitorio: se reintenta.
  if (codigo === '55P03') throw new CobroOcupadoError();
  const en = (fragmento: string): boolean => restriccion?.includes(fragmento) === true;

  if (codigo === '23503') {
    if (en('pagador')) throw new PagadorNoEncontradoError();
    if (en('travel_file')) throw new ArchivoDeCobroNoEncontradoError();
    if (en('reverso_de_id')) throw new MovimientoDeCobroNoEncontradoError();
    if (en('registrado_por')) throw new SinUsuarioParaRegistrarError();
  } else if (codigo === '23505') {
    if (en('un_reverso_por_movimiento')) throw new MovimientoYaReversadoError();
    if (en('clave_idempotencia')) throw new ClaveDeIdempotenciaReutilizadaError();
  } else if (codigo === '23514') {
    if (esReversoDeReverso(error)) throw new ReversoDeReversoError();
    throw new MovimientoRechazadoPorLaBaseError(restriccion);
  }
  throw new FalloDeEscrituraDelLibroError(
    error instanceof Error ? error.constructor.name : typeof error,
    codigo,
  );
}

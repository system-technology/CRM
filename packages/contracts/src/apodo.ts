/**
 * El apodo de ingreso (ADR-0031 §2): normalización, formato y reservados, compartidos por la API
 * y la web. Es la MISMA regla que el `CHECK` de `usuarios.apodo` y de `accesos_identidad.apodo`
 * (`^[a-z][a-z0-9]*([._-][a-z0-9]+)*$`, de 3 a 30), para que lo que pasa aquí no lo rechace la base.
 *
 * El apodo es dato personal (se deriva del nombre de la persona): ningún mensaje de error de este
 * archivo lo repite.
 */
import { z } from 'zod';

export const APODO_LARGO_MINIMO = 3;
export const APODO_LARGO_MAXIMO = 30;

/** Solo minúsculas ASCII: la unicidad sin distinguir caja sale por construcción, sin `citext`. */
export const APODO_PATRON = /^[a-z][a-z0-9]*([._-][a-z0-9]+)*$/;

/** Apodos que nadie puede fijar. La lista no se replica en la base: un reservado colado no abre nada. */
export const APODOS_RESERVADOS = [
  'admin',
  'administrador',
  'root',
  'soporte',
  'ayuda',
  'viajapro',
  'plataforma',
  'sistema',
  'api',
  'www',
  'demo',
  'ingresar',
  'ingreso',
  'registro',
  'null',
  'undefined',
  'dueno',
  'asesor',
  'operaciones',
] as const;

/** Además de los exactos, nada que EMPIECE por estos. */
export const PREFIJOS_DE_APODO_RESERVADOS = ['viajapro', 'soporte'] as const;

/**
 * Recortar, NFKC y minúsculas, en ese orden. NO translitera: tras NFKC, lo que no sea ASCII
 * (`ñ`, tildes, cirílico) sigue siéndolo y `esApodoValido` lo rechaza, así se cierran los homógrafos.
 */
export function normalizarApodo(texto: string): string {
  return texto.trim().normalize('NFKC').toLowerCase();
}

/** Formato del apodo YA normalizado: patrón del `CHECK` y de 3 a 30 caracteres. */
export function esApodoValido(normalizado: string): boolean {
  return (
    normalizado.length >= APODO_LARGO_MINIMO &&
    normalizado.length <= APODO_LARGO_MAXIMO &&
    APODO_PATRON.test(normalizado)
  );
}

/** `true` si el apodo YA normalizado es uno de los reservados o empieza por un prefijo reservado. */
export function esApodoReservado(normalizado: string): boolean {
  return (
    (APODOS_RESERVADOS as readonly string[]).includes(normalizado) ||
    PREFIJOS_DE_APODO_RESERVADOS.some((p) => normalizado.startsWith(p))
  );
}

/**
 * Un apodo que se va a FIJAR: se normaliza y se valida (formato y reservados). Devuelve el valor
 * normalizado. Sin el valor en los mensajes. No se usa al INGRESAR: allí un apodo mal formado se
 * trata como uno inexistente, no como un 400 (ADR-0031 §3).
 */
export const Apodo = z
  .string()
  .max(255)
  .transform(normalizarApodo)
  .superRefine((apodo, ctx) => {
    if (!esApodoValido(apodo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `El apodo lleva de ${APODO_LARGO_MINIMO} a ${APODO_LARGO_MAXIMO} caracteres: letras minúsculas sin tilde ni ñ, números y . _ - entre caracteres.`,
      });
    } else if (esApodoReservado(apodo)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ese apodo está reservado.' });
    }
  });
export type Apodo = z.infer<typeof Apodo>;

/**
 * Cuerpo de `PATCH /api/v1/identidad/miembros/:id/apodo` (permiso `usuarios.administrar`).
 * `apodo: null` lo quita. `.strict()`: ni `tenantId` ni nada más.
 */
export const CambiarApodo = z.object({ apodo: Apodo.nullable() }).strict();
export type CambiarApodo = z.infer<typeof CambiarApodo>;

/** El dominio del correo centinela del ingreso por apodo (ADR-0031 §3). Nunca existe como identidad. */
export const DOMINIO_CENTINELA = 'viajapro.invalid';

/** `true` si el correo es del TLD reservado `.invalid` (RFC 2606) o de un subdominio suyo. */
export function esCorreoDeDominioInvalid(correo: string): boolean {
  const dominio = correo
    .slice(correo.lastIndexOf('@') + 1)
    .trim()
    .toLowerCase();
  return dominio === 'invalid' || dominio.endsWith('.invalid');
}

/**
 * Un correo que PUEDE ser de una identidad: el formato de siempre y fuera del dominio `.invalid`,
 * que es el del correo centinela del ingreso por apodo. Lo usan invitaciones y registro.
 */
export const CorreoDeIdentidad = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(255)
  .refine((c) => !esCorreoDeDominioInvalid(c), { message: 'Ese dominio de correo no es válido.' });
export type CorreoDeIdentidad = z.infer<typeof CorreoDeIdentidad>;

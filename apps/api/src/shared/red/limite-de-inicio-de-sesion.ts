/**
 * Cuántos intentos de inicio de sesión se admiten por minuto y dirección IP (T-612).
 *
 * Antes era una constante fija: no se podía ajustar sin desplegar, y una oficina entera (una sola
 * IP de salida) o la suite de navegador del CI (siete ingresos desde una IP) agotaban el cupo.
 * Ahora se lee de `LIMITE_INICIO_SESION_POR_IP`, con **5 por omisión**: sin la variable, nada cambia.
 *
 * Solo toca el límite **por IP** de Better Auth (en memoria: un reinicio lo pone a cero). El tope
 * por identidad (`TopeDeFallosDeIngreso`, en Postgres) no se lee de aquí y no se afloja.
 *
 * Una variable inválida **nunca deja sin límite**: se usa el de por omisión y se avisa. Avisa, no
 * aborta, como `urls-publicas.ts`. «Local» es `APP_ENV=local`; cualquier otro valor o ninguno se
 * trata como un entorno real.
 */

export const VARIABLE_DE_LIMITE_DE_INICIO = 'LIMITE_INICIO_SESION_POR_IP';
export const INTENTOS_DE_INICIO_POR_OMISION = 5;
/** Por encima de esto se considera un error de dedo, no una necesidad. */
export const INTENTOS_DE_INICIO_MAXIMO = 1000;

type Entorno = Record<string, string | undefined>;

export interface AvisoDeLimiteDeInicio {
  valorEnUso: number;
  mensaje: string;
}

export interface LimiteDeInicio {
  valor: number;
  avisos: AvisoDeLimiteDeInicio[];
}

export function leerLimiteDeInicioDeSesion(entorno: Entorno): LimiteDeInicio {
  const crudo = entorno[VARIABLE_DE_LIMITE_DE_INICIO];
  const enLocal = entorno['APP_ENV'] === 'local';

  if (crudo === undefined || crudo.trim() === '') {
    return { valor: INTENTOS_DE_INICIO_POR_OMISION, avisos: [] };
  }

  const texto = crudo.trim();
  const numero = /^\d+$/.test(texto) ? Number(texto) : Number.NaN;
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > INTENTOS_DE_INICIO_MAXIMO) {
    return {
      valor: INTENTOS_DE_INICIO_POR_OMISION,
      avisos: [
        {
          valorEnUso: INTENTOS_DE_INICIO_POR_OMISION,
          mensaje:
            `${VARIABLE_DE_LIMITE_DE_INICIO} no es un entero entre 1 y ${INTENTOS_DE_INICIO_MAXIMO} ` +
            `(llegó «${texto.slice(0, 40)}»): se usa ${INTENTOS_DE_INICIO_POR_OMISION}. ` +
            'El límite por IP nunca se queda sin aplicar.',
        },
      ],
    };
  }

  const avisos: AvisoDeLimiteDeInicio[] = [];
  if (numero > INTENTOS_DE_INICIO_POR_OMISION && !enLocal) {
    avisos.push({
      valorEnUso: numero,
      mensaje:
        `${VARIABLE_DE_LIMITE_DE_INICIO} es ${numero} (por omisión ${INTENTOS_DE_INICIO_POR_OMISION}) ` +
        `en un entorno que no es local: se admiten ${numero} intentos de inicio de sesión por ` +
        'minuto y por IP. Eso debilita la protección contra fuerza bruta. Déjalo solo si es una ' +
        'decisión consciente y revísalo después.',
    });
  }
  return { valor: numero, avisos };
}

/** Registra un aviso por cada anomalía. Nunca lanza. */
export function avisarDeLimiteDeInicioDeSesion(
  entorno: Entorno,
  log: { warn(mensaje: string): void },
): void {
  for (const aviso of leerLimiteDeInicioDeSesion(entorno).avisos) log.warn(aviso.mensaje);
}

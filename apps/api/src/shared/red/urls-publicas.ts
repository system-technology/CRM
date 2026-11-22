/**
 * Las dos URL públicas de la API (`WEB_PUBLIC_URL`, `API_PUBLIC_URL`) y el aviso de arranque.
 *
 * En `render.yaml` ambas son `sync: false`: su valor solo existe en el panel, y olvidarlas es
 * fácil. Sin la variable, el código cae a `localhost` en silencio (`origenesDeConfianzaDeLaWeb`,
 * `auth.provider.ts`), y el síntoma es que la web se ve pero nadie puede entrar, sin una línea
 * que diga por qué. Este módulo no cambia ese comportamiento: lo hace ruidoso.
 *
 * **Avisa, no aborta**, a propósito. El patrón de abortar de R2 (roles) no aplica aquí: tumbar un
 * servicio que hoy atiende a un cliente lo dejaría peor. Abortar queda como propuesta en la
 * bitácora de T-597.
 *
 * «Desarrollo» es `APP_ENV=local`, el mismo criterio que el atajo de tenant y el correo mailpit.
 * Cualquier otro valor, o ninguno, se trata como un entorno real.
 */

export type VariableDeUrlPublica = 'WEB_PUBLIC_URL' | 'API_PUBLIC_URL';

export interface AvisoDeUrlPublica {
  variable: VariableDeUrlPublica;
  /** El valor con el que arranca el proceso (el de la variable o el de desarrollo). */
  valorEnUso: string;
  mensaje: string;
}

type Entorno = Record<string, string | undefined>;

const WEB_POR_OMISION = 'http://localhost:3000';

/** El valor por omisión de `API_PUBLIC_URL`, el mismo que usaba `auth.provider.ts`. */
export function urlPublicaDeLaApi(entorno: Entorno): string {
  return entorno['API_PUBLIC_URL'] ?? `http://localhost:${entorno['API_PORT'] ?? '3333'}`;
}

function esLoopbackOInvalida(valor: string): boolean {
  let host: string;
  try {
    host = new URL(valor).hostname.toLowerCase();
  } catch {
    return true;
  }
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

function describir(valor: string): string {
  return valor === '' ? '(vacía)' : valor;
}

export function avisosDeUrlsPublicas(entorno: Entorno): AvisoDeUrlPublica[] {
  if (entorno['APP_ENV'] === 'local') return [];

  const avisos: AvisoDeUrlPublica[] = [];

  const web = entorno['WEB_PUBLIC_URL'] ?? WEB_POR_OMISION;
  if (entorno['WEB_PUBLIC_URL'] === undefined || esLoopbackOInvalida(web)) {
    avisos.push({
      variable: 'WEB_PUBLIC_URL',
      valorEnUso: web,
      mensaje:
        `WEB_PUBLIC_URL ${entorno['WEB_PUBLIC_URL'] === undefined ? 'no está definida' : 'no es una URL pública'}: ` +
        `se usa ${describir(web)}. La API solo acepta peticiones con ese Origin, así que ningún ` +
        'navegador podrá iniciar sesión (403 ORIGEN_NO_CONFIABLE), y tampoco funcionarán CORS ni ' +
        'la bandeja en vivo. Pon en el panel la URL pública de la web, con esquema y sin barra final.',
    });
  }

  const api = urlPublicaDeLaApi(entorno);
  if (entorno['API_PUBLIC_URL'] === undefined || esLoopbackOInvalida(api)) {
    avisos.push({
      variable: 'API_PUBLIC_URL',
      valorEnUso: api,
      mensaje:
        `API_PUBLIC_URL ${entorno['API_PUBLIC_URL'] === undefined ? 'no está definida' : 'no es una URL pública'}: ` +
        `se usa ${describir(api)}. Better Auth la toma como URL base y decide con ella el atributo ` +
        'Secure y el prefijo __Secure- de la cookie de sesión: con una URL http la cookie sale ' +
        'sin Secure en un despliegue https. Pon en el panel la URL pública de la API.',
    });
  }

  return avisos;
}

/** Registra un error por cada aviso. Nunca lanza: ver la nota del módulo. */
export function avisarDeUrlsPublicas(
  entorno: Entorno,
  log: { error(mensaje: string): void },
): void {
  for (const aviso of avisosDeUrlsPublicas(entorno)) log.error(aviso.mensaje);
}

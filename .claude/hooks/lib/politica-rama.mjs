/**
 * Política de protección de la rama principal — lógica pura, sin efectos.
 *
 * Vive aparte del hook a propósito: así se puede probar de verdad, sin simular ramas con
 * variables de entorno. Una puerta trasera para hacer verificable al guardián sería peor que
 * el defecto que pretende evitar.
 *
 * HISTORIA DE ESTE ARCHIVO — importa para no repetir el error.
 *
 * Las dos primeras versiones reconocían patrones sobre la cadena completa del comando. Produjo
 * tres falsos positivos en un día, todos de la misma causa: **trataba como argumento lo que era
 * prosa**.
 *
 *   1. `git push origin --delete feat/x` estando en main. No escribe en main; se bloqueaba.
 *   2. `git commit -m "... no se integra a main ..."`. La palabra en el MENSAJE disparaba la guarda.
 *   3. `for p in "git push" "main"; do grep ...`. Los patrones de BÚSQUEDA la disparaban.
 *
 * El tercero obligó a cambiar de enfoque, como estaba comprometido en la bitácora. Ahora el
 * comando se **tokeniza respetando comillas**, se parte por los separadores del shell, y solo se
 * analizan los segmentos cuyo primer token es `git`. Una cadena entre comillas es un argumento,
 * nunca un subcomando: `grep "git push origin main"` deja de parecer un push.
 *
 * Lo que NO cambia: ante la duda, se exige autorización. Perder una detección real es peor que
 * mantener un falso positivo.
 */

export const RAMA_PROTEGIDA = 'main';

/** Separadores de comandos del shell. Dentro de comillas no cuentan. */
const SEPARADORES = new Set(['&&', '||', ';', '|', '&']);

/**
 * Tokeniza una línea de shell respetando comillas simples y dobles, y descarta los cuerpos de
 * heredoc (donde viajan los mensajes de commit largos).
 *
 * No es un intérprete de shell completo y no pretende serlo: basta con distinguir un token que
 * es un comando de uno que es texto entre comillas.
 */
export function tokenizar(linea) {
  // Fuera los heredocs: su contenido es texto, nunca argumentos.
  const sinHeredoc = linea
    .replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?(?:\n|\s)\2\b/g, ' <<TEXTO> ')
    .replace(/<<-?\s*(['"]?)[A-Za-z_][A-Za-z0-9_]*\1[\s\S]*$/, ' <<TEXTO> ');

  const tokens = [];
  let actual = '';
  let entrecomillado = false;
  let comilla = '';

  for (let i = 0; i < sinHeredoc.length; i++) {
    const c = sinHeredoc[i];

    if (comilla) {
      if (c === '\\' && comilla === '"') {
        actual += sinHeredoc[++i] ?? '';
      } else if (c === comilla) {
        comilla = '';
      } else {
        actual += c;
      }
      continue;
    }

    if (c === '"' || c === "'") {
      comilla = c;
      entrecomillado = true;
      continue;
    }

    if (c === '\\') {
      actual += sinHeredoc[++i] ?? '';
      continue;
    }

    if (/\s/.test(c)) {
      if (actual || entrecomillado) tokens.push({ valor: actual, entrecomillado });
      actual = '';
      entrecomillado = false;
      continue;
    }

    actual += c;
  }
  if (actual || entrecomillado) tokens.push({ valor: actual, entrecomillado });

  return tokens;
}

/**
 * Parte la línea en invocaciones de git, devolviendo los argumentos de cada una.
 * Un token entrecomillado nunca puede ser el nombre de un comando.
 */
export function invocacionesGit(linea) {
  const tokens = tokenizar(linea);
  const invocaciones = [];
  let segmento = [];

  const cerrar = () => {
    if (segmento.length === 0) return;
    // Se saltan prefijos como `sudo`, `timeout 30`, `VAR=valor` y `npx`.
    let i = 0;
    while (
      i < segmento.length &&
      !segmento[i].entrecomillado &&
      /^([A-Z_][A-Z0-9_]*=|sudo$|env$|timeout$|\d+$)/.test(segmento[i].valor)
    ) {
      i++;
    }
    const cabeza = segmento[i];
    if (cabeza && !cabeza.entrecomillado && /(^|[\\/])git(\.exe)?$/.test(cabeza.valor)) {
      invocaciones.push(segmento.slice(i + 1));
    }
    segmento = [];
  };

  for (const t of tokens) {
    if (!t.entrecomillado && SEPARADORES.has(t.valor)) {
      cerrar();
      continue;
    }
    segmento.push(t);
  }
  cerrar();

  return invocaciones;
}

/** ¿Alguno de estos argumentos nombra la rama protegida? */
function nombraMain(args) {
  return args.some((a) => {
    const v = a.valor;
    // Formas posibles: main · origin/main · refs/heads/main · :main · main:main · HEAD:main
    return v
      .split(/[:\s]/)
      .some((parte) => parte.replace(/^.*\//, '') === RAMA_PROTEGIDA);
  });
}

function tieneBandera(args, ...banderas) {
  return args.some((a) => banderas.some((b) => a.valor === b || a.valor.startsWith(b + '=')));
}

/**
 * ¿Reescribe el historial de la rama protegida? Se bloquea siempre, haya o no autorización:
 * no existe caso legítimo. Para deshacer algo ya integrado está `git revert`.
 */
export function esDestructivoSobreMain(args, ramaActual) {
  const sub = args.find((a) => !a.valor.startsWith('-'))?.valor;
  const enMain = ramaActual === RAMA_PROTEGIDA;

  if (sub === 'push' && tieneBandera(args, '--force', '--force-with-lease', '-f')) {
    return enMain || nombraMain(args);
  }
  if (sub === 'reset' && tieneBandera(args, '--hard')) return enMain || nombraMain(args);
  if (sub === 'branch' && tieneBandera(args, '-D') && nombraMain(args)) return true;
  if (sub === 'branch' && tieneBandera(args, '--delete', '--force') && nombraMain(args)) return true;

  return false;
}

/**
 * ¿El push toca realmente la rama protegida?
 *
 * Estando en main, `git push origin --delete feat/x` o `git push origin feat/x` no escriben una
 * sola línea en ella. Bloquearlos era un falso positivo, y un guardián que bloquea lo legítimo
 * acaba desactivado.
 */
export function pushTocaMain(args, ramaActual) {
  const sub = args.find((a) => !a.valor.startsWith('-'))?.valor;
  if (sub !== 'push') return false;

  // Borrado de rama: solo importa si el objetivo es main.
  if (tieneBandera(args, '--delete', '-d') || args.some((a) => a.valor.startsWith(':'))) {
    return nombraMain(args);
  }

  if (nombraMain(args)) return true;

  // Sin refspec explícita, git empuja la rama actual.
  const posicionales = args.filter((a) => !a.valor.startsWith('-'));
  const tieneRefspec = posicionales.length >= 3; // push <remoto> <refspec>
  return !tieneRefspec && ramaActual === RAMA_PROTEGIDA;
}

/**
 * Decide qué hacer con un comando.
 * @returns {{accion: 'permitir'|'bloquear-destructivo'|'exigir-autorizacion', esCommit: boolean}}
 */
export function evaluar(linea, ramaActual) {
  const invocaciones = invocacionesGit(linea);
  if (invocaciones.length === 0) return { accion: 'permitir', esCommit: false };

  let exigir = false;
  let esCommit = false;

  for (const args of invocaciones) {
    if (esDestructivoSobreMain(args, ramaActual)) {
      return { accion: 'bloquear-destructivo', esCommit: false };
    }

    const sub = args.find((a) => !a.valor.startsWith('-'))?.valor;
    const enMain = ramaActual === RAMA_PROTEGIDA;

    if (sub === 'commit' && enMain) {
      exigir = true;
      esCommit = true;
    }
    if (sub === 'merge' && enMain) exigir = true;
    if (pushTocaMain(args, ramaActual)) exigir = true;
  }

  return exigir ? { accion: 'exigir-autorizacion', esCommit } : { accion: 'permitir', esCommit: false };
}

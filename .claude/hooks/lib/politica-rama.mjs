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
export function invocacionesGit(linea, crudo = false) {
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
      invocaciones.push(crudo ? segmento.slice(i + 1) : sinOpcionesGlobales(segmento.slice(i + 1)));
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

/**
 * Quita las opciones globales de git que llevan valor (`-C <dir>`, `-c k=v`, `--git-dir=..`)
 * para que el subcomando sea el primer argumento. Sin esto, `git -C ../gate commit` tenia como
 * "subcomando" la ruta y la escritura en main no se reconocia: falso negativo, el grave.
 */
function sinOpcionesGlobales(args) {
  const salida = [];
  let i = 0;
  while (i < args.length && args[i].valor.startsWith('-') && !args[i].entrecomillado) {
    const v = args[i].valor;
    i += v === '-C' || v === '-c' || v === '--git-dir' || v === '--work-tree' ? 2 : 1;
  }
  salida.push(...args.slice(i));
  return salida;
}

/** ¿Alguno de estos argumentos nombra la rama protegida? */
function nombraMain(args) {
  return args.some((a) => {
    const v = a.valor;
    // Formas posibles: main · origin/main · refs/heads/main · :main · main:main · HEAD:main
    return v.split(/[:\s]/).some((parte) => parte.replace(/^.*\//, '') === RAMA_PROTEGIDA);
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
  if (sub === 'branch' && tieneBandera(args, '--delete', '--force') && nombraMain(args))
    return true;

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

  return exigir
    ? { accion: 'exigir-autorizacion', esCommit }
    : { accion: 'permitir', esCommit: false };
}

/**
 * Directorio sobre el que va a actuar el comando, si lo cambia con un `cd` al principio.
 *
 * **Por qué hace falta.** El hook averiguaba la rama ejecutando `git branch --show-current` en
 * su propio directorio, que es el de la sesión. Con un solo árbol de trabajo eso coincidía
 * siempre. Con *worktrees* —varias carpetas del mismo repositorio, cada una en su rama— deja
 * de coincidir, y falla en los dos sentidos:
 *
 *   · **Falso positivo:** trabajar en un worktree sobre una rama de funcionalidad queda
 *     bloqueado porque la carpeta de la sesión está en `main`. Molesto.
 *   · **Falso negativo, que es el grave:** si la sesión está en una rama de trabajo y el
 *     comando entra con `cd` en un worktree que tiene `main`, el guardián mira la rama
 *     equivocada y **deja pasar la escritura en la rama protegida**.
 *
 * Devuelve `null` si el comando no cambia de directorio, y entonces vale el de la sesión.
 *
 * Solo se mira el **primer** segmento: un `cd` posterior a un `&&` ya no decide dónde corre el
 * `git` que viene antes, y encadenar varios `cd` en un mismo comando es raro. Ante la duda se
 * devuelve `null`, que hace al llamador usar el directorio de la sesión — el comportamiento
 * anterior, que es el conservador.
 */
export function directorioDelComando(linea) {
  // `tokenizar` devuelve objetos { valor, entrecomillado }, no cadenas.
  const tokens = tokenizar(linea);
  if (tokens.length < 2) return null;
  if (tokens[0].valor !== 'cd') return dirDeGitC(linea);

  const destino = tokens[1].valor;
  // `cd` a secas, `cd -` o `cd ~`: no se puede resolver aquí sin adivinar. Conservador.
  if (!destino || destino === '-' || destino.startsWith('~')) return null;
  // Si lo que sigue es un separador, el `cd` no tenía argumento.
  if (SEPARADORES.has(destino)) return null;

  return destino;
}

/**
 * Traduce una ruta estilo MSYS/Git Bash a ruta de Windows.
 *
 * En Windows la consola de este proyecto es Git Bash, que habla `/d/Projects/CRM`. Node no
 * entiende esa forma: `execFileSync` con ese `cwd` falla con ENOENT. Y ahí estaba el defecto
 * que importaba — el guardián caía a su respaldo y volvía a mirar la rama de la sesión, que es
 * justo lo que esta corrección venía a evitar. **Un respaldo silencioso delante de una
 * comprobación de seguridad la apaga sin avisar.**
 *
 * Devuelve la ruta sin tocar cuando no aplica, para que el llamador no tenga que distinguir.
 */
export function rutaDeSistema(ruta, esWindows) {
  if (!ruta || !esWindows) return ruta;
  const m = /^\/([A-Za-z])\/(.*)$/.exec(ruta);
  if (!m) return ruta;
  const barra = String.fromCharCode(92);
  return m[1].toUpperCase() + ':' + barra + m[2].split('/').join(barra);
}

/**
 * `git -C <dir> ...`: actua sobre otro worktree sin cambiar de directorio. Sin esto, desde una
 * sesion en una rama de trabajo, `git -C ../gate merge x` se evaluaba contra la rama de la
 * SESION y la escritura en `main` pasaba sin autorizacion (falso negativo).
 * Toma el `-C` de la primera invocacion de git que lo lleve.
 */
function dirDeGitC(linea) {
  for (const args of invocacionesGit(linea, true)) {
    for (let i = 0; i < args.length - 1; i++) {
      if (args[i].valor === '-C' && args[i + 1].valor) return args[i + 1].valor;
      if (!args[i].valor.startsWith('-')) break; // ya es el subcomando: las globales terminaron
    }
  }
  return null;
}

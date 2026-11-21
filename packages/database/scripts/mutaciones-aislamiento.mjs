/**
 * Verificación POR MUTACIÓN de la prueba de aislamiento.
 *
 * Una aserción que nunca se ha visto en rojo no es una protección: es una esperanza.
 * Este script rompe el aislamiento a propósito, una rotura cada vez, y exige que la
 * aserción correspondiente FALLE. Si pasa con el sistema roto, la aserción es decorativa
 * y el hallazgo es bloqueante.
 *
 * EMPIEZA POR UN CONTROL, y sin él el informe no valdría nada: si el arnés no supiera
 * arrancar vitest —falta una variable de entorno, un binario, lo que sea—, todas las
 * mutaciones saldrían «rojas» y el resultado sería un falso positivo perfecto. Antes de
 * romper nada, cada aserción implicada tiene que estar VERDE sobre el sistema sano.
 *
 * Cada mutación se revierte SIEMPRE, también si la prueba revienta: se reaplica
 * `aplicar_aislamiento_tenant`, que es la única forma de volver al estado bueno sin
 * copiar la plantilla de la política en dos sitios.
 *
 * Uso: pnpm --filter @viajapro/database run mutaciones
 */
import { Client } from 'pg';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluarGuarda } from './guarda-base-desechable.mjs';

const URL_ADMIN = process.env.DATABASE_URL;
if (!URL_ADMIN) throw new Error('Falta DATABASE_URL (rol propietario).');
if (!process.env.DATABASE_APP_URL) throw new Error('Falta DATABASE_APP_URL (rol de aplicación).');

// Antes de arrancar NADA (ni el control, que también usa la base): estas mutaciones no corren contra una base compartida.
const guarda = evaluarGuarda({
  desechable: process.env.VIAJAPRO_BASE_DESECHABLE,
  url: URL_ADMIN,
});
if (!guarda.ok) {
  console.error(
    `RECHAZADO: las mutaciones rompen el aislamiento de la base a la que apunten. ${guarda.motivo}.
` +
      'Solo corren contra una base desechable: VIAJAPRO_BASE_DESECHABLE=1 y un host de loopback ' +
      '(o un host propio con base distinta de neondb). No se tocó nada.',
  );
  process.exit(2);
}

const raizPaquete = fileURLToPath(new URL('..', import.meta.url));
// El binario de vitest del propio paquete, invocado con el Node actual.
// NO `npx`: en Windows abre otro intérprete, no hereda bien el entorno y su fallo es
// indistinguible del fallo de la prueba — que es exactamente lo que el CONTROL atrapó.
const VITEST = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

const TABLAS = [
  'conversaciones',
  'mensajes',
  'adjuntos',
  'plantillas_whatsapp',
  'cotizaciones',
  'versiones_cotizacion',
  'usuarios',
  'roles',
];

/**
 * Reescribe `sincronizar_acceso_identidad` con el rol de su dueño. Lo necesitan M17 y su
 * restauración: el rol de migraciones la puede PONERSE (SET) pero no hereda su propiedad, y
 * crear —también reemplazar— en `public` exige CREATE, que se concede y se retira en el acto.
 */
async function reescribirComoAccesos(cliente, definicion) {
  await cliente.query('BEGIN');
  try {
    await cliente.query('GRANT CREATE ON SCHEMA public TO viajapro_accesos');
    await cliente.query('SET LOCAL ROLE viajapro_accesos');
    await cliente.query(definicion);
    await cliente.query('RESET ROLE');
    await cliente.query('REVOKE CREATE ON SCHEMA public FROM viajapro_accesos');
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  }
}

/** El rol dueño de `perfiles_de_agencia`: el que el disparador toma por «la plataforma». */
async function duenoDePerfiles(cliente) {
  const { rows } = await cliente.query(
    "SELECT pg_get_userbyid(relowner) AS dueno FROM pg_class WHERE oid = 'public.perfiles_de_agencia'::regclass",
  );
  return rows[0].dueno;
}

/** La definición sana, leída del catálogo una vez, para poder restaurarla tal cual. */
let definicionSincronizar;
async function definicionSana(cliente) {
  if (!definicionSincronizar) {
    const { rows } = await cliente.query(
      "SELECT pg_get_functiondef('public.sincronizar_acceso_identidad()'::regprocedure) AS def",
    );
    definicionSincronizar = rows[0].def;
    if (!/\[par-old\][\s\S]*\[\/par-old\]/.test(definicionSincronizar)) {
      throw new Error('La función no tiene las marcas [par-old]: M17 no sabría qué quitar.');
    }
    if (!/\[rama-apodo\][\s\S]*\[\/rama-apodo\]/.test(definicionSincronizar)) {
      throw new Error('La función no tiene las marcas [rama-apodo]: M21 no sabría qué quitar.');
    }
  }
  return definicionSincronizar;
}

/** La definición sana de `proteger_verificacion_del_perfil`, leída del catálogo una vez (M24). */
let definicionPerfiles;
async function definicionSanaPerfiles(cliente) {
  if (!definicionPerfiles) {
    const { rows } = await cliente.query(
      "SELECT pg_get_functiondef('public.proteger_verificacion_del_perfil()'::regprocedure) AS def",
    );
    definicionPerfiles = rows[0].def;
  }
  return definicionPerfiles;
}

/**
 * El cuerpo de `proteger_verificacion_del_perfil` tal como lo dejó T-268 (20261120140000): la
 * lógica de verificación íntegra, SIN fijar `creado_en` ni `actualizado_en` (eso lo añadió T-307).
 */
const PERFILES_COMO_EN_T268 = `
CREATE OR REPLACE FUNCTION public.proteger_verificacion_del_perfil()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_plataforma boolean;
  v_dato_cambiado boolean;
BEGIN
  v_plataforma := pg_catalog.pg_has_role(
    current_user,
    (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID),
    'USAGE'
  );
  IF TG_OP = 'INSERT' THEN
    IF NOT v_plataforma THEN
      NEW.verificado_en := NULL;
    END IF;
    RETURN NEW;
  END IF;
  v_dato_cambiado := NEW.rnt IS DISTINCT FROM OLD.rnt
                  OR NEW.nit IS DISTINCT FROM OLD.nit
                  OR NEW.digito_verificacion IS DISTINCT FROM OLD.digito_verificacion;
  IF NOT v_plataforma THEN
    IF v_dato_cambiado THEN
      NEW.verificado_en := NULL;
    ELSE
      NEW.verificado_en := OLD.verificado_en;
    END IF;
  ELSIF v_dato_cambiado
        AND NEW.verificado_en IS NOT DISTINCT FROM OLD.verificado_en THEN
    NEW.verificado_en := NULL;
  END IF;
  RETURN NEW;
END;
$$`;

/**
 * Quita los codigos de color ANSI de la salida de vitest.
 *
 * La expresion se construye desde una cadena en vez de escribirse como literal porque un
 * caracter de control dentro de un literal de expresion regular es invisible al leerlo: no se
 * distingue de un espacio, y la regla `no-control-regex` existe justo para eso. Aqui es
 * deliberado --el ESC de los colores de terminal-- y se nombra.
 */
const ESC = String.fromCharCode(27);
// `[[]` es una clase de caracteres que contiene un corchete: no necesita escaparse, y asi
// la expresion no depende de cuantas capas de comillas la hayan atravesado.
const COLORES_ANSI = new RegExp(ESC + '[[][0-9;]*m', 'g');
const limpio = (t) => t.replace(COLORES_ANSI, '');

/** Corre las aserciones cuyo nombre contiene `nombre`. */
function correr(nombre) {
  const resumen = (texto) =>
    limpio(texto)
      .split('\n')
      .filter((l) => /Tests\s+\d|AssertionError|Error:/.test(l))
      .map((l) => l.trim())
      .join(' | ')
      .slice(0, 200);
  try {
    const salida = execFileSync(
      process.execPath,
      [VITEST, 'run', 'tests/aislamiento.spec.ts', '-t', nombre],
      { cwd: raizPaquete, stdio: 'pipe', env: process.env },
    );
    return { verde: true, salida: resumen(String(salida)) };
  } catch (e) {
    return {
      verde: false,
      salida: resumen(`${e.stdout ?? ''}\n${e.stderr ?? ''}\n${e.message ?? ''}`),
    };
  }
}

const MUTACIONES = [
  {
    nombre: 'M1 — borrar la política tenant_isolation de conversaciones',
    sql: `DROP POLICY tenant_isolation ON conversaciones`,
    prueba: '35',
  },
  {
    nombre: 'M2 — desactivar FORCE ROW LEVEL SECURITY en mensajes',
    sql: `ALTER TABLE mensajes NO FORCE ROW LEVEL SECURITY`,
    prueba: '35',
  },
  {
    nombre: 'M3 — política de plantillas SIN WITH CHECK',
    sql: `DROP POLICY tenant_isolation ON plantillas_whatsapp;
          CREATE POLICY tenant_isolation ON plantillas_whatsapp
            USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)`,
    prueba: '35',
  },
  {
    // LA MUTACIÓN QUE IMPORTA: el punto ciego que quedó señalado en la pasada anterior.
    // polwithcheck no es NULL, la política existe, RLS está forzada: catálogo en verde.
    // Y cualquier agencia puede INSERTAR filas dentro de los datos de otra.
    nombre: 'M4 — WITH CHECK (true): presente pero DIVERGENTE de USING  [el punto ciego]',
    sql: `DROP POLICY tenant_isolation ON mensajes;
          CREATE POLICY tenant_isolation ON mensajes
            USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
            WITH CHECK (true)`,
    prueba: '36',
  },
  {
    nombre: 'M5 — política FOR SELECT en vez de FOR ALL',
    sql: `DROP POLICY tenant_isolation ON adjuntos;
          CREATE POLICY tenant_isolation ON adjuntos FOR SELECT
            USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)`,
    prueba: '36',
  },
  {
    nombre: 'M6 — clave foránea SIMPLE en vez de compuesta con el tenant',
    sql: `ALTER TABLE conversaciones DROP CONSTRAINT conversaciones_contacto_id_tenant_id_fkey;
          ALTER TABLE conversaciones ADD CONSTRAINT conversaciones_contacto_id_tenant_id_fkey
            FOREIGN KEY (contacto_id) REFERENCES contactos (id) ON DELETE CASCADE`,
    prueba: '39',
    restaurar: `ALTER TABLE conversaciones DROP CONSTRAINT conversaciones_contacto_id_tenant_id_fkey;
                ALTER TABLE conversaciones ADD CONSTRAINT conversaciones_contacto_id_tenant_id_fkey
                  FOREIGN KEY (contacto_id, tenant_id) REFERENCES contactos (id, tenant_id)
                  ON DELETE CASCADE ON UPDATE RESTRICT`,
  },
  {
    nombre: 'M7 — quitar la unicidad de (tenant_id, wamid)',
    sql: `DROP INDEX mensajes_tenant_id_wamid_key`,
    prueba: '40',
    restaurar: `CREATE UNIQUE INDEX mensajes_tenant_id_wamid_key
                  ON mensajes (tenant_id, wamid) WHERE wamid IS NOT NULL`,
  },
  // --- Cotizaciones (20261019200000) ---
  {
    nombre: 'M8 — cotizaciones SIN RLS: lectura cruzada',
    sql: `ALTER TABLE cotizaciones DISABLE ROW LEVEL SECURITY`,
    prueba: '48',
  },
  {
    nombre: 'M9 — versiones_cotizacion con WITH CHECK (true): escritura cruzada',
    sql: `DROP POLICY tenant_isolation ON versiones_cotizacion;
          CREATE POLICY tenant_isolation ON versiones_cotizacion
            USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
            WITH CHECK (true)`,
    prueba: '48',
  },
  {
    nombre: 'M10 — versión colgando de la cotización de otra agencia (foránea SIMPLE)',
    sql: `ALTER TABLE versiones_cotizacion DROP CONSTRAINT versiones_cotizacion_cotizacion_id_tenant_id_fkey;
          ALTER TABLE versiones_cotizacion ADD CONSTRAINT versiones_cotizacion_cotizacion_id_tenant_id_fkey
            FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones (id) ON DELETE RESTRICT`,
    prueba: '48',
    restaurar: `ALTER TABLE versiones_cotizacion DROP CONSTRAINT versiones_cotizacion_cotizacion_id_tenant_id_fkey;
                ALTER TABLE versiones_cotizacion ADD CONSTRAINT versiones_cotizacion_cotizacion_id_tenant_id_fkey
                  FOREIGN KEY (cotizacion_id, tenant_id) REFERENCES cotizaciones (id, tenant_id)
                  ON DELETE RESTRICT ON UPDATE RESTRICT`,
  },
  {
    nombre: 'M11 — sin el disparador de inmutabilidad: una versión se edita',
    sql: `ALTER TABLE versiones_cotizacion DISABLE TRIGGER versiones_cotizacion_inmutables`,
    prueba: '49',
    restaurar: `ALTER TABLE versiones_cotizacion ENABLE TRIGGER versiones_cotizacion_inmutables`,
  },
  {
    nombre: 'M12 — sin el disparador de alta: líneas que no suman el total',
    sql: `ALTER TABLE versiones_cotizacion DISABLE TRIGGER versiones_cotizacion_validar_alta`,
    prueba: '50',
    restaurar: `ALTER TABLE versiones_cotizacion ENABLE TRIGGER versiones_cotizacion_validar_alta`,
  },
  {
    nombre: 'M13 — mensajes.cotizacion_id con foránea SIMPLE',
    sql: `ALTER TABLE mensajes DROP CONSTRAINT mensajes_cotizacion_id_tenant_id_fkey;
          ALTER TABLE mensajes ADD CONSTRAINT mensajes_cotizacion_id_tenant_id_fkey
            FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones (id) ON DELETE SET NULL`,
    prueba: '51',
    restaurar: `ALTER TABLE mensajes DROP CONSTRAINT mensajes_cotizacion_id_tenant_id_fkey;
                ALTER TABLE mensajes ADD CONSTRAINT mensajes_cotizacion_id_tenant_id_fkey
                  FOREIGN KEY (cotizacion_id, tenant_id) REFERENCES cotizaciones (id, tenant_id)
                  ON DELETE SET NULL (cotizacion_id) ON UPDATE RESTRICT`,
  },
  // --- Identidad (20261019230000, ADR-0011) ---
  {
    nombre: 'M14 — viajapro_app puede leer sesiones (tabla global de identidad)',
    sql: `GRANT SELECT ON sesiones TO viajapro_app`,
    prueba: '61',
    restaurar: `REVOKE SELECT ON sesiones FROM viajapro_app`,
  },
  {
    // La pieza: que viajapro_identidad esté FUERA de roles_de_aplicacion. Meterlo ahí es
    // exactamente esto, sobre todas las tablas a la vez.
    nombre: 'M15 — viajapro_identidad puede leer contactos (tabla de negocio)',
    sql: `GRANT SELECT ON contactos TO viajapro_identidad`,
    prueba: '62',
    restaurar: `REVOKE SELECT ON contactos FROM viajapro_identidad`,
  },
  {
    nombre: 'M16 — un rol de login es miembro de viajapro_accesos',
    sql: `GRANT viajapro_accesos TO viajapro_app`,
    prueba: '63',
    restaurar: `REVOKE viajapro_accesos FROM viajapro_app`,
  },
  {
    nombre: 'M17 — el disparador NO borra el par OLD al cambiar identidad_id o tenant_id',
    sql: async (cliente) => {
      const sana = await definicionSana(cliente);
      await reescribirComoAccesos(
        cliente,
        sana.replace(/\[par-old\][\s\S]*\[\/par-old\]/, '[sin par-old]'),
      );
    },
    prueba: '64',
    restaurar: async (cliente) => reescribirComoAccesos(cliente, await definicionSana(cliente)),
  },
  {
    nombre: 'M18 — usuarios con WITH CHECK (true): plantar una membresía en otra agencia',
    sql: `DROP POLICY tenant_isolation ON usuarios;
          CREATE POLICY tenant_isolation ON usuarios
            USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
            WITH CHECK (true)`,
    prueba: '65',
  },
  {
    nombre: 'M19 — roles SIN RLS: lectura cruzada del rol de otra agencia',
    sql: `ALTER TABLE roles DISABLE ROW LEVEL SECURITY`,
    prueba: '66',
  },
  {
    nombre: 'M20 — usuarios.rol_id con foránea SIMPLE: un usuario lleva el rol de otra agencia',
    sql: `ALTER TABLE usuarios DROP CONSTRAINT usuarios_rol_id_tenant_id_fkey;
          ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_id_tenant_id_fkey
            FOREIGN KEY (rol_id) REFERENCES roles (id)`,
    prueba: '66',
    restaurar: `ALTER TABLE usuarios DROP CONSTRAINT usuarios_rol_id_tenant_id_fkey;
                ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_id_tenant_id_fkey
                  FOREIGN KEY (rol_id, tenant_id) REFERENCES roles (id, tenant_id)
                  ON DELETE NO ACTION ON UPDATE RESTRICT`,
  },
  // --- Apodo de ingreso (20261120150000, ADR-0031) ---
  {
    // Sin la rama, cambiar el apodo no toca el par (el INSERT choca con él y no hace nada): el
    // índice se queda con el apodo VIEJO, que sigue resolviendo hacia la identidad. Las marcas
    // [rama-apodo] van fuera de [par-old] a propósito: la expresión de M17 es codiciosa.
    nombre: 'M21 — el disparador sin la rama del apodo: un cambio de apodo no llega al índice',
    sql: async (cliente) => {
      const sana = await definicionSana(cliente);
      const mutada = sana.replace(/\[rama-apodo\][\s\S]*\[\/rama-apodo\]/, '[sin rama-apodo]');
      if (!/\[par-old\][\s\S]*\[\/par-old\]/.test(mutada)) {
        throw new Error('M21 se llevó también las marcas [par-old]: las ramas se solapan.');
      }
      await reescribirComoAccesos(cliente, mutada);
    },
    prueba: 'AP7',
    restaurar: async (cliente) => reescribirComoAccesos(cliente, await definicionSana(cliente)),
  },
  // --- perfiles_de_agencia (T-261, T-307): la «plataforma» es el dueño de la tabla ---
  {
    // Si un rol de aplicación fuera miembro del dueño, el disparador lo trataría como la
    // plataforma y `viajapro_app` podría fijar verificado_en.
    nombre:
      'M22 — viajapro_app es miembro del dueño de perfiles_de_agencia (pasaría por «la plataforma»)',
    // NO APLICABLE si el dueño ya es miembro de `viajapro_app`: en el CI el dueño es `viajapro`
    // (POSTGRES_USER del servicio), que PostgreSQL hace miembro de los roles que crea, y entonces
    // `GRANT viajapro TO viajapro_app` cierra un ciclo y se rechaza (0LP01). Un rol intermedio no
    // lo evita (app -> X -> dueño -> app sigue siendo un ciclo). Se declara no aplicable, a la
    // vista en el informe, en vez de fingir que se mutó; en una base con otra topología sí corre.
    noAplicable: async (cliente) => {
      const dueno = await duenoDePerfiles(cliente);
      const { rows } = await cliente.query(
        "SELECT pg_has_role($1, 'viajapro_app', 'MEMBER') AS ciclo",
        [dueno],
      );
      return rows[0].ciclo
        ? `el dueño «${dueno}» ya es miembro de viajapro_app: el GRANT cerraría un ciclo de roles`
        : null;
    },
    sql: async (cliente) => {
      const dueno = await duenoDePerfiles(cliente);
      await cliente.query(`GRANT ${cliente.escapeIdentifier(dueno)} TO viajapro_app`);
    },
    prueba: 'T-261',
    restaurar: async (cliente) => {
      const dueno = await duenoDePerfiles(cliente);
      await cliente.query(`REVOKE ${cliente.escapeIdentifier(dueno)} FROM viajapro_app`);
    },
  },
  {
    nombre:
      'M23 — el disparador de perfiles_de_agencia está deshabilitado: la API fija verificado_en',
    sql: `ALTER TABLE perfiles_de_agencia DISABLE TRIGGER perfiles_de_agencia_proteger_verificacion`,
    prueba: 'T-261',
    restaurar: `ALTER TABLE perfiles_de_agencia ENABLE TRIGGER perfiles_de_agencia_proteger_verificacion`,
  },
  // --- perfiles_de_agencia (T-307): las fechas de auditoría las fija el disparador ---
  {
    // Vuelve a la función de T-268 (verificación intacta, fechas libres). P-7 es la prueba que
    // cubre T-307: si no se pusiera en rojo, la fijación de fechas no tendría quien la vigile.
    nombre:
      'M24 — proteger_verificacion_del_perfil como en T-268: viajapro_app falsea creado_en y actualizado_en',
    sql: async (cliente) => {
      await definicionSanaPerfiles(cliente);
      await cliente.query(PERFILES_COMO_EN_T268);
    },
    prueba: 'P-7',
    restaurar: async (cliente) => cliente.query(await definicionSanaPerfiles(cliente)),
  },
];

/** Una mutación o su restauración: SQL directo, o una función cuando hace falta otro rol. */
const ejecutar = (cliente, paso) =>
  typeof paso === 'function' ? paso(cliente) : cliente.query(paso);

console.log('--- CONTROL: el sistema sano, sin ninguna mutacion ---');
let controlOk = true;
for (const prueba of [...new Set(MUTACIONES.map((m) => m.prueba))]) {
  const r = correr(prueba);
  controlOk &&= r.verde;
  console.log(`${r.verde ? 'VERDE' : 'ROJO '}  control ${prueba}  ->  ${r.salida}`);
}
if (!controlOk) {
  console.error('\nEl control NO esta verde: el arnes o la base estan mal. No se muta nada.');
  process.exit(1);
}

const admin = new Client({ connectionString: URL_ADMIN });
await admin.connect();

console.log('\n--- MUTACIONES ---');
const resultados = [];
for (const m of MUTACIONES) {
  // Tres desenlaces, ninguno silencioso: ROJO (la aserción detectó la rotura), VERDE (no la
  // detectó: hallazgo) y ERROR (la mutación o su restauración reventó: no dice nada de la
  // aserción). Un ERROR no tumba el proceso, para no ocultar a las mutaciones siguientes, pero
  // el proceso sale distinto de cero al final. NUNCA se cuenta como VERDE ni como ROJO.
  const motivoNoAplicable = m.noAplicable ? await m.noAplicable(admin) : null;
  if (motivoNoAplicable) {
    resultados.push({ nombre: m.nombre, estado: 'NO_APLICABLE', salida: motivoNoAplicable });
    console.log(`N/A    ${m.nombre}\n        ->  ${motivoNoAplicable}`);
    continue;
  }
  let r;
  let error;
  try {
    await ejecutar(admin, m.sql);
    r = correr(m.prueba);
  } catch (e) {
    error = e;
  } finally {
    try {
      if (m.restaurar) await ejecutar(admin, m.restaurar);
      for (const t of TABLAS) await admin.query('SELECT aplicar_aislamiento_tenant($1)', [t]);
    } catch (e) {
      error ??= new Error(`la restauración falló: ${e.message}`);
    }
  }
  if (error) {
    resultados.push({ nombre: m.nombre, estado: 'ERROR', salida: String(error.message) });
    console.log(`ERROR  ${m.nombre}\n        ->  ${error.message}`);
    continue;
  }
  resultados.push({ nombre: m.nombre, estado: r.verde ? 'VERDE' : 'ROJO', salida: r.salida });
  console.log(`${r.verde ? 'VERDE' : 'ROJO '}  ${m.nombre}\n        ->  ${r.salida}`);
}

const { rows } = await admin.query(
  'SELECT tabla, problema FROM tablas_sin_aislamiento WHERE problema IS NOT NULL',
);
await admin.end();

console.log('\n================ RESUMEN ================');
const ETIQUETA = {
  ROJO: '[OK]    se puso ROJA  ',
  VERDE: '[FALLO] paso VERDE    ',
  ERROR: '[ERROR] no se pudo ejecutar',
  NO_APLICABLE: '[N/A]   no aplicable  ',
};
for (const r of resultados) console.log(`${ETIQUETA[r.estado]} ${r.nombre}`);
console.log(
  `\nEstado final de tablas_sin_aislamiento: ${rows.length === 0 ? 'vacia (sana)' : JSON.stringify(rows)}`,
);

const cuenta = (e) => resultados.filter((r) => r.estado === e).length;
if (cuenta('VERDE') > 0 || cuenta('ERROR') > 0 || rows.length > 0) {
  console.error(
    `\nHALLAZGO BLOQUEANTE: ${cuenta('VERDE')} aserciones no detectan su rotura, ${cuenta('ERROR')} mutaciones con ERROR.`,
  );
  process.exit(1);
}
console.log(
  `\n${cuenta('ROJO')} mutaciones detectadas, ${cuenta('NO_APLICABLE')} no aplicables en esta topologia de roles. Ninguna asercion es decorativa.`,
);

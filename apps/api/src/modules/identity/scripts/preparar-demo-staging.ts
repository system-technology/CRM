/**
 * Prepara la demo de STAGING para que alguien pueda entrar (T-600). Lo lanza el workflow manual
 * `preparar-demo-staging.yml`, con la conexión del propietario (`DATABASE_URL` = `DIRECT_URL`).
 *
 * Dos fases, con la semilla (`pnpm db:seed`) en medio, que corre como paso aparte del workflow:
 *
 *   diagnosticar  Cuenta agencias, identidades, usuarios y credenciales ANTES de tocar nada y lo
 *                 guarda para el resumen. Aplica las guardias: si se niega, no se siembra nada.
 *   credencial    Crea (o reemplaza) la contraseña del usuario de la demo y lo deja entrar. Escribe
 *                 el resumen del run.
 *
 * La contraseña la escribe quien lanza el workflow (`DEMO_CONTRASENA`); aquí no hay ninguna. Se
 * hashea con `hashPassword` de Better Auth, el mismo scrypt con el que `/sign-in/email` la
 * comprueba, y se verifica de vuelta con `verifyPassword`. El inicio de sesión no se toca: solo se
 * añaden datos.
 *
 * Crea una identidad y un usuario NUEVOS con el correo elegido y el rol dueño de la agencia demo, en
 * vez de renombrar a `dueno@agenciademo.test`: así la semilla, que hace upsert por ese correo, no
 * duplica a nadie al volver a correr. Nunca se imprime la cadena de conexión ni la contraseña por
 * la salida estándar: la contraseña solo va al resumen del run.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import {
  CLAVE_DEL_ROL_DUENO,
  type Conteos,
  decidirSiSePuedePrepararLaDemo,
  type EstadoDelUsuario,
  motivoDeContrasenaInvalida,
  motivoDeCorreoInvalido,
  NOMBRE_DEL_USUARIO_DE_LA_DEMO,
  resumenDeLaPreparacion,
  SLUG_DE_LA_AGENCIA_DEMO,
} from './preparar-demo-staging.dominio.js';

class PrepararDemoError extends Error {
  override readonly name = 'PrepararDemoError';
}

const prisma = new PrismaClient();

function archivoDeAntes(): string {
  return join(process.env['RUNNER_TEMP'] ?? '.', 'demo-antes.json');
}

function anfitrionDeLaBase(): string {
  const cadena = process.env['DATABASE_URL'];
  if (!cadena) throw new PrepararDemoError('Falta DATABASE_URL.');
  return new URL(cadena).hostname;
}

async function contar(): Promise<Conteos> {
  const [agencias, demo, identidades, usuarios, credenciales] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { slug: SLUG_DE_LA_AGENCIA_DEMO } }),
    prisma.identidad.count(),
    prisma.usuario.count(),
    prisma.credencial.count(),
  ]);
  return { agencias, agenciaDemo: demo > 0, identidades, usuarios, credenciales };
}

function leerCredencialesDelEntorno(): { correo: string; contrasena: string } {
  const correo = (process.env['DEMO_CORREO'] ?? '').trim().toLowerCase();
  const contrasena = process.env['DEMO_CONTRASENA'] ?? '';
  const motivo = motivoDeCorreoInvalido(correo) ?? motivoDeContrasenaInvalida(contrasena);
  if (motivo) throw new PrepararDemoError(motivo);
  return { correo, contrasena };
}

function escribirEnElResumen(texto: string): void {
  const destino = process.env['GITHUB_STEP_SUMMARY'];
  if (destino) appendFileSync(destino, `${texto}\n`);
}

async function diagnosticar(): Promise<void> {
  // Fallar pronto, antes de sembrar: un correo o clave inválidos no deben dejar la base a medias.
  leerCredencialesDelEntorno();
  const antes = await contar();
  console.log('Antes de tocar nada:', JSON.stringify(antes));

  const decision = decidirSiSePuedePrepararLaDemo({
    entorno: process.env['PREPARAR_DEMO_ENTORNO'],
    anfitrion: anfitrionDeLaBase(),
    agenciasAjenas: await prisma.tenant.count({
      where: { NOT: { slug: SLUG_DE_LA_AGENCIA_DEMO } },
    }),
  });
  if (!decision.permitido) {
    escribirEnElResumen(`## Demo de staging: NO se preparó\n\n${decision.motivo}\n`);
    throw new PrepararDemoError(decision.motivo);
  }
  writeFileSync(archivoDeAntes(), JSON.stringify(antes));
}

async function ponerCredencial(): Promise<void> {
  const { correo, contrasena } = leerCredencialesDelEntorno();
  const antes = JSON.parse(readFileSync(archivoDeAntes(), 'utf8')) as Conteos;

  const agencia = await prisma.tenant.findUnique({ where: { slug: SLUG_DE_LA_AGENCIA_DEMO } });
  if (!agencia) throw new PrepararDemoError('No hay agencia demo: la semilla no corrió.');
  const rol = await prisma.rol.findFirst({
    where: { tenantId: agencia.id, clave: CLAVE_DEL_ROL_DUENO },
  });
  if (!rol) throw new PrepararDemoError(`La agencia demo no tiene el rol ${CLAVE_DEL_ROL_DUENO}.`);

  const hash = await hashPassword(contrasena);
  let estado: EstadoDelUsuario = 'creado';

  const existente = await prisma.identidad.findUnique({
    where: { correo },
    select: { id: true, credenciales: { select: { id: true } } },
  });
  // Un correo ya usado por una identidad ajena a la agencia demo no se pisa.
  if (existente) {
    const enLaDemo = await prisma.usuario.count({
      where: { tenantId: agencia.id, identidadId: existente.id },
    });
    if (enLaDemo === 0) {
      throw new PrepararDemoError('Ese correo ya existe y no pertenece a la agencia demo.');
    }
    estado = existente.credenciales.length > 0 ? 'contraseña reemplazada' : 'contraseña puesta';
  }

  // `correoVerificado: true`: el código por correo, al iniciar sesión con una identidad sin
  // verificar, le borra la contraseña y las sesiones. Toda identidad de un script nace verificada.
  const identidad = await prisma.identidad.upsert({
    where: { correo },
    update: { correoVerificado: true, eliminadoEn: null },
    create: { correo, nombre: NOMBRE_DEL_USUARIO_DE_LA_DEMO, correoVerificado: true },
  });
  await prisma.usuario.upsert({
    where: { tenantId_correo: { tenantId: agencia.id, correo } },
    update: { activo: true, eliminadoEn: null },
    create: {
      tenantId: agencia.id,
      identidadId: identidad.id,
      rolId: rol.id,
      correo,
      nombre: NOMBRE_DEL_USUARIO_DE_LA_DEMO,
    },
  });
  await prisma.credencial.upsert({
    where: { identidadId_proveedor: { identidadId: identidad.id, proveedor: 'credential' } },
    update: { hashContrasena: hash },
    create: { identidadId: identidad.id, proveedor: 'credential', hashContrasena: hash },
  });
  // Una contraseña nueva cierra las sesiones abiertas con la anterior.
  if (estado === 'contraseña reemplazada') {
    await prisma.sesion.deleteMany({ where: { identidadId: identidad.id } });
  }

  // Comprobaciones de que se puede entrar, sin llamar a la API: la clave guardada verifica, y el
  // disparador dejó el acceso a la agencia (sin él la sesión no tendría agencia activa).
  const guardada = await prisma.credencial.findUnique({
    where: { identidadId_proveedor: { identidadId: identidad.id, proveedor: 'credential' } },
    select: { hashContrasena: true },
  });
  if (
    !guardada?.hashContrasena ||
    !(await verifyPassword({ hash: guardada.hashContrasena, password: contrasena }))
  ) {
    throw new PrepararDemoError('La contraseña guardada no verifica: no se puede dar por lista.');
  }
  const acceso = await prisma.accesoIdentidad.count({
    where: { identidadId: identidad.id, tenantAccesoId: agencia.id },
  });
  if (acceso !== 1) {
    throw new PrepararDemoError('El usuario no quedó con acceso a la agencia demo.');
  }

  const despues = await contar();
  console.log('Después:', JSON.stringify(despues), `| usuario: ${estado}`);
  escribirEnElResumen(resumenDeLaPreparacion({ antes, despues, correo, contrasena, estado }));
}

async function principal(): Promise<void> {
  const fase = process.argv[2];
  if (fase === 'diagnosticar') await diagnosticar();
  else if (fase === 'credencial') await ponerCredencial();
  else throw new PrepararDemoError('Uso: preparar-demo-staging.ts <diagnosticar|credencial>');
}

principal()
  .catch((error: unknown) => {
    // Nunca la contraseña: los errores de arriba solo llevan motivos fijos.
    console.error(error instanceof Error ? error.message : 'Error inesperado.');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

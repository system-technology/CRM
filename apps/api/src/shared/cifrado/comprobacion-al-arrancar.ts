import type { OnModuleInit, Provider, Type } from '@nestjs/common';
import type { PrismaWebhookService } from '../prisma/prisma-webhook.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { clavesDeCamposDesdeEntorno } from './cifrado-de-campos.js';
import {
  comprobarClavesAlArrancar,
  type PuertoVersionesDeClave,
} from './comprobacion-de-claves.js';
import {
  enTenantDeLaApi,
  enTenantDelTrabajador,
  VersionesDeClavePrisma,
} from './versiones-de-clave.prisma.js';

/**
 * T-234: la comprobación de claves (T-226 b) corre DENTRO del arranque de Nest, antes de que nada
 * tome trabajo.
 *
 * El orden lo da Nest 10 y está fijado por `comprobacion-al-arrancar.spec.ts`:
 *   1. `onModuleInit` de todos los módulos, el más profundo primero y la raíz la última. Ahí los
 *      servicios Prisma verifican su rol (R2) y, ya con ellos, corre esta comprobación, porque se
 *      declara en el módulo RAÍZ del contenedor (AppModule, WorkerModule, TrabajadorUnicoModule).
 *   2. `onApplicationBootstrap` de todos los módulos. Ahí arrancan los consumidores de BullMQ y en
 *      proceso y los planificadores. Si la comprobación lanzó, `init()` rechaza y esto no ocurre.
 *
 * Regla para quien añada un consumidor o planificador: conectar en `onApplicationBootstrap`,
 * nunca en `onModuleInit`.
 */
/** `@inyeccion-manual`: lo construye la fábrica de `proveedor` con el servicio Prisma del proceso. */
export class ComprobacionDeClavesAlArrancar implements OnModuleInit {
  constructor(
    private readonly versiones: PuertoVersionesDeClave,
    private readonly claves: () => { version: number; anterior: Buffer | null },
  ) {}

  async onModuleInit(): Promise<void> {
    await comprobarClavesAlArrancar(this.versiones, this.claves());
  }
}

function proveedor<P>(
  servicio: Type<P>,
  versiones: (prisma: P) => PuertoVersionesDeClave,
): Provider {
  return {
    provide: ComprobacionDeClavesAlArrancar,
    inject: [servicio],
    useFactory: (prisma: P) =>
      new ComprobacionDeClavesAlArrancar(versiones(prisma), () =>
        clavesDeCamposDesdeEntorno(process.env),
      ),
  };
}

/** Para `AppModule`: con el `PrismaService` de la API (`viajapro_app`). */
export const comprobacionDeClavesDeLaApi = (servicio: Type<PrismaService>): Provider =>
  proveedor(servicio, (p) => new VersionesDeClavePrisma(p, enTenantDeLaApi(p)));

/** Para `WorkerModule` y `TrabajadorUnicoModule`: con `PrismaWebhookService` (`viajapro_webhook`). */
export const comprobacionDeClavesDelTrabajador = (servicio: Type<PrismaWebhookService>): Provider =>
  proveedor(servicio, (p) => new VersionesDeClavePrisma(p, enTenantDelTrabajador(p)));

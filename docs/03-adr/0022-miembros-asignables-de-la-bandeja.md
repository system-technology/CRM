# ADR-0022 — Miembros asignables: lectura mínima de la agencia para reasignar en la bandeja

- **Estado:** Aceptado (2026-11-15, por delegación expresa del propietario). Implementado en el PR #256 (T-186).
- **Fecha:** 2026-11-15
- **Decide:** propietario, a propuesta de `arquitecto`
- **Consultados:** `arquitecto`. Pendiente: `auditor-seguridad` (toca datos de usuarios del tenant)
- **Tarea:** T-186

---

## Contexto

El modal de reasignar de la bandeja (`apps/web/src/components/bandeja/modal-reasignar.tsx`) lista
asesores de maqueta (`ASESORES` de `mock-inbox`). La escritura ya es real:
`PUT /api/v1/conversaciones/:id/asignacion` exige `bandeja.operar` y comprueba en
`conversaciones.prisma.ts` que el destino sea un usuario activo de la agencia.

Lo que falta es la **lectura**. La única que existe, `GET /api/v1/identidad/miembros` (T-121), exige
`usuarios.administrar` —en la ruta y otra vez en `ListarMiembrosUseCase`— y devuelve correo, rol,
estado, fecha de alta y último acceso. Un Asesor sembrado tiene `bandeja.operar`, `crm.escribir` y
`cotizacion.escribir`, y nada más: **no puede saber a quién reasignar**.

La fuerza es concreta y de hoy: una función que existe en el backend no se puede usar desde la
interfaz sin una maqueta que miente sobre quién trabaja en la agencia.

Un segundo defecto aparece al mirar el código: el destino de una asignación solo se valida como
«activo». El rol sembrado `OPERACIONES` no tiene `bandeja.operar`, así que hoy se le puede asignar
una conversación que **no puede responder**. Queda atascada fuera de la cola común.

## Opciones consideradas

### A — Abrir `GET /identidad/miembros` a `bandeja.operar` y recortar campos según el permiso
- **Gana:** ninguna ruta nueva.
- **Cuesta:** una sola ruta con dos formas de respuesta según quién pregunta. El contrato pasa a
  tener campos opcionales «según permiso», justo el patrón que ya produjo una fuga de margen
  (`TarifaPublica` declarada y sin usar, ver `vigencias.ts`). Un descuido futuro filtra correos.
- **Cierra:** que el listado de administración evolucione (filtros, paginación, invitaciones
  pendientes) sin arrastrar a la bandeja.

### B — Ruta nueva en `inbox`: `GET /api/v1/conversaciones/asignables`
- **Gana:** vive junto a quien la usa.
- **Cuesta:** `inbox` leería `usuarios`, tabla de `identity`. Ya lo hace en dos adaptadores
  (`conversaciones.prisma.ts`, `lectura-de-conversaciones.prisma.ts`), pero esa es una desviación de
  la regla 3 de frontera, no un precedente a ampliar.
- **Cierra:** que `identity` sea el único que decide qué se expone de un usuario.

### C — Ruta nueva de solo lectura en `identity`, con contrato mínimo y permiso de bandeja
`GET /api/v1/identidad/miembros/asignables`, con `bandeja.operar`, que devuelve solo `id` y `nombre`
de los miembros activos cuyo rol tiene `bandeja.operar`.
- **Gana:** `identity` sigue siendo dueño de sus datos; contrato separado y cerrado (`strict`), que
  no puede crecer por accidente; minimización de datos explícita.
- **Cuesta:** una ruta, un caso de uso, un método de puerto y un esquema más.
- **Cierra:** nada relevante.

## Decisión

**C.** Una lectura nueva en `identity`, separada del listado de administración, con el mínimo que
el modal necesita. Y el criterio de «asignable» se aplica igual al **listar** y al **asignar**: lo
que el modal ofrece es exactamente lo que el `PUT` acepta.

### Especificación (implementable sin decidir nada más)

**Ruta.** `GET /api/v1/identidad/miembros/asignables`, en `MiembrosController`
(`apps/api/src/modules/identity/interface/miembros.controller.ts`), método `@Get('asignables')`.
El controlador no tiene `@Get(':id')`, así que no hay colisión de rutas; si algún día se añade, este
método va antes.

**Permiso.** `@RequierePermiso('bandeja.operar')`, y el caso de uso lo comprueba otra vez con
`ContextoTenant.tienePermiso('bandeja.operar')` → `permisoDenegado('bandeja.operar')`, igual que
`ListarMiembrosUseCase`. No se añade permiso nuevo al catálogo: no hace falta migración del `CHECK
roles_permisos_del_catalogo`.

**Contrato** (en `packages/contracts/src/identidad.ts`, R3):

```ts
/**
 * Un miembro al que se puede asignar una conversación (ADR-0022). Solo id y nombre: es lo que
 * el modal de reasignar necesita, y nada más (minimización, Ley 1581). `id` es el de `usuarios`,
 * el mismo que acepta `PUT /api/v1/conversaciones/:id/asignacion`.
 */
export const MiembroAsignable = z
  .object({
    id: z.string().uuid(),
    nombre: z.string(),
  })
  .strict();
export type MiembroAsignable = z.infer<typeof MiembroAsignable>;

/** Respuesta de `GET /api/v1/identidad/miembros/asignables`: ordenada por nombre (`es`). */
export const ListaDeMiembrosAsignables = z.array(MiembroAsignable);
export type ListaDeMiembrosAsignables = z.infer<typeof ListaDeMiembrosAsignables>;
```

**Respuesta.** `200` con `ListaDeMiembrosAsignables`. Ejemplo:

```json
[
  { "id": "0192f3a4-…", "nombre": "Laura Gómez" },
  { "id": "0192f3a5-…", "nombre": "Andrés Ríos" }
]
```

Errores: `401 SIN_SESION` / `SIN_AGENCIA_ACTIVA` (middleware existente), `403 PERMISO_DENEGADO` sin
`bandeja.operar`. Lista vacía es `200 []`, no `404`.

**Quién aparece.** Las filas de `usuarios` del tenant de la sesión con:

- `activo = true` y `eliminado_en IS NULL`;
- `'bandeja.operar' = ANY(rol.permisos)`;
- **incluye a quien pregunta** (tomar es asignarse a uno mismo). La web se reconoce por
  `SesionActual.acceso.usuarioId`; el contrato no lleva un indicador «soy yo».

Orden: `nombre` con `localeCompare(…, 'es')`. Sin paginación: una agencia del segmento tiene de 2 a
30 personas.

**Implementación.**

- `PuertoMiembros` (`domain/puertos-de-miembros.ts`) gana `listarAsignables(): Promise<MiembroAsignable[]>`.
- `MiembrosPrisma.listarAsignables()` con `this.prisma.conTenant(...)` (rol `viajapro_app`, bajo RLS)
  y `tenantId` del `ContextoTenant` **también en el `where`** (defensa en profundidad, como `listar`).
  `select: { id: true, nombre: true }` — el correo **no se lee**, no solo no se devuelve.
- Caso de uso nuevo `ListarMiembrosAsignablesUseCase` en `application/`.

**Cambio acoplado en `inbox` (mismo PR).** En `ConversacionesPrisma.asignar`, la validación del
destino pasa de «activo» a «asignable»: añade `rol: { permisos: { has: 'bandeja.operar' } }` al
`where`. Mismo `UsuarioNoAsignableError` en todos los casos (otra agencia, de baja, inexistente o sin
`bandeja.operar`): no se distingue por qué. Soltar (`usuarioId: null`) no cambia.

**Web.** `modal-reasignar.tsx` deja de importar `ASESORES`; consulta la ruta con TanStack Query al
abrir y muestra el nombre. El subtítulo fijo «Asesor de viajes» se quita: el contrato no lleva rol.

**Pruebas exigidas** (e2e, `identity` o `inbox`):

1. Asesor sembrado → `200`, sin la clave `correo` en ningún elemento (`MiembroAsignable.strict()`).
2. Rol `OPERACIONES` (sin `bandeja.operar`) → `403 PERMISO_DENEGADO`.
3. **Aislamiento:** con dos agencias sembradas, la lista de A no contiene ningún id de B.
4. Un miembro dado de baja y uno con rol sin `bandeja.operar` no aparecen.
5. `PUT …/asignacion` a un miembro de `OPERACIONES` → `UsuarioNoAsignableError`.

## Consecuencias

### Positivas
- El modal deja de mentir y la función de reasignar se puede usar.
- `identity` sigue siendo el único que decide qué se ve de un usuario.
- Se cierra el atasco de conversaciones asignadas a quien no puede responder.

### Negativas
- Dos lecturas de miembros que divergen a propósito; quien añada un campo al listado de
  administración tiene que resistir la tentación de añadirlo aquí.
- Un rol personalizado sin `bandeja.operar` deja de poder recibir conversaciones. Es lo correcto,
  pero una agencia puede sorprenderse si configuró un rol «solo lectura» que antes sí las recibía.
- Cualquier miembro con `bandeja.operar` ve los nombres de todos sus compañeros que atienden la
  bandeja. Es dato personal de empleados (Ley 1581 de 2012) tratado por la agencia, que es la
  responsable, para una finalidad laboral evidente; el nombre del asignado ya se ve hoy en cada
  conversación (`asignadoANombre`). Se minimiza: sin correo, sin rol, sin último acceso.

### Qué habría que cambiar para revertir esto
- Quitar la ruta y el método de puerto; volver la validación de `asignar` a solo «activo». Sin
  migración.

## Cuándo revisar esta decisión

- Si una agencia pide asignar por **equipo** o por **sede**: el filtro deja de ser un permiso.
- Si una agencia pasa de ~200 miembros: paginación o búsqueda.
- Si la bandeja necesita **disponibilidad** (en línea, carga actual): eso es de `inbox`, y entraría
  como proyección propia de `inbox`, no ampliando este contrato.

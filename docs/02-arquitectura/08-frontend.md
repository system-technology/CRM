# Arquitectura del frontend

> **Documento parcial.** La estructura de rutas y la navegación ya están decididas (abajo). Siguen
> pendientes la estrategia de estado, el tiempo real, el rendimiento de la bandeja y el sistema de
> diseño. Responsables: `frontend` y `diseno-ux`.

## 1. Estructura de rutas

Decisión: [ADR-0032](../03-adr/0032-layout-compartido-y-tabla-unica-de-navegacion.md) (Aceptado, 2026-11-20).
Mientras no se implemente N1 de la auditoría de navegación, el árbol sigue plano
(`app/<ruta>/`).

| Dónde | Qué va | Marco |
|---|---|---|
| `app/layout.tsx` | `<html>`, `GuardaSesion`, pie y banner de cookies | — |
| `app/(app)/` | Todas las pantallas privadas: Hoy (`/`), bandeja, pipeline, cotizaciones, cotizador, viajes, seguimientos, contactos, catálogo, reportes, configuración, bienvenida, ensayo | `(app)/layout.tsx` monta una vez la barra lateral, la barra inferior y `<main>` |
| `app/(impresion)/` | Vista imprimible de la cotización | Ninguno. Es privada |
| `app/<ruta>/` | Públicas: ingresar y sus alias, aceptar invitación, legales, 404 | Ninguno |

- **Los grupos no cambian las URL.** Las rutas existentes (`/viajes`, `/bandeja/[id]`,
  `/cotizaciones/[id]`, `/viajes?id=`) no se tocan.
- **La compuerta de sesión sigue en la raíz y deniega por defecto.** Es `GuardaSesion` más
  `lib/rutas-publicas.ts`. El árbol y esa lista deben coincidir: lo comprueba una prueba de
  inventario.
- **Ninguna página importa `BarraModulos`.** Una pantalla privada nueva tiene marco por estar en
  `(app)/`.

## 2. Navegación

**Fuente única:** `lib/navegacion.ts (en apps/web)` (`NAVEGACION`, `ACCIONES`, `moduloActivo`,
`tituloDeDocumento`). Cada entrada tiene: id, etiqueta, ruta, icono, grupo, permiso, prefijos
activos y su lugar en móvil.

Menú objetivo: Hoy · Conversaciones · Oportunidades · Cotizaciones · Archivos de viaje ·
Seguimientos · Contactos · Catálogo · Reportes · Configuración.

De esa tabla leen:
- el menú lateral, que marca el ítem activo con `aria-current="page"`;
- la barra móvil: 3 módulos, «Buscar» y «Más»;
- la paleta Ctrl+K;
- las migas, que solo aparecen en el segundo nivel;
- el H1 de las pantallas de primer nivel;
- `document.title`, con la forma «{pantalla} · ViajaPro».

**Regla:** etiqueta del menú = comando de la paleta = H1 = título. Un nombre se cambia en la tabla,
y nunca en un componente. **Ocultar un ítem por permiso no autoriza nada**: la API decide.

## 3. Pendiente

Estado (TanStack Query), tiempo real (Socket.IO), rendimiento de la bandeja, sistema de diseño.

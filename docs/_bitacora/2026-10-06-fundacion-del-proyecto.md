# 2026-10-06 — Fundación del proyecto

**Participantes:** propietario del producto + Claude Opus 5
**Alcance:** creación del andamiaje completo del proyecto, desde cero. Sin código de aplicación.

---

## Qué se hizo

- Estructura de monorepo (`apps/`, `packages/`, `infra/`, `docs/`) con su configuración base:
  pnpm workspaces, Turborepo, TypeScript estricto, Prettier, commitlint, Docker Compose local.
- `CLAUDE.md` con las diez reglas que no se rompen y el mapa del sistema.
- `ESTADO.md` como hilo vivo del proyecto.
- Documentación de visión, producto, arquitectura, seguridad y roadmap.
- Cuatro ADR aceptados: stack, WhatsApp Cloud API, multi-tenancy, monolito modular.
- Capa de ingeniería asistida por IA: 14 agentes especializados, 5 skills, 6 comandos,
  4 hooks, configuración de MCP, y la documentación del modelo operativo.
- 22 marcadores para los documentos que faltan, con responsable y fase asignados.

## Decisiones tomadas

| Decisión | Razón | Dónde quedó |
|---|---|---|
| WhatsApp Cloud API directo, como Tech Provider | Única vía con margen defendible para un SaaS multi-tenant. Las librerías no oficiales violan los ToS de Meta | ADR-0002 |
| TypeScript end-to-end | Contratos compartidos entre API y web eliminan la mayor fuente de fricción de un equipo pequeño | ADR-0001 |
| Esquema compartido + RLS | Olvidar el filtro produce cero filas, no una fuga. El aislamiento no puede depender de la memoria humana | ADR-0003 |
| Monolito modular | Los microservicios resuelven un problema organizacional que este equipo no tiene, y cuyo costo sí pagaría desde el día uno | ADR-0004 |
| Alcance v1 con los cuatro bloques, secuenciado en fases | El alcance se respeta; el calendario se hace honesto. Primer cobro al mes 4, v1 completa al mes 10 | `docs/08-roadmap/01-roadmap.md` |
| Google Stitch para explorar diseño, no para generar código | El código generado rompe la accesibilidad y la consistencia ya resueltas en `packages/ui` | `docs/01-producto/06-diseno-y-ux.md` |
| **Mercado base: Colombia** | Decisión del propietario. Define moneda, normativa, pasarelas y estacionalidad | `ESTADO.md` |
| El brochure es norte de producto, no compromiso comercial | Nombre, precios y planes siguen abiertos | `docs/00-vision/05-norte-del-producto.md` |

## Qué quedó pendiente

- [ ] **Iniciar la verificación de Meta Business y el acceso a Tech Provider** — camino crítico
- [ ] Conseguir la agencia piloto
- [ ] Definir nombre comercial, verificar marca y registrar dominio
- [ ] Definir modelo de cobro y precios tras medir el costo real por tenant
- [ ] Entrevistar 8-10 agencias colombianas
- [ ] Validar los servidores MCP declarados en `.mcp.json`, incluido Stitch (requiere sesión interactiva)
- [ ] Autorizar los conectores de claude.ai que se vayan a usar: Figma y Mermaid Chart primero
- [ ] Escribir los 22 documentos marcados como pendientes
- [ ] Montar el andamiaje de código: apps y packages vacíos pero compilando

## Hallazgo tardío de la sesión, y la corrección

Al final de la sesión apareció `images/Brochure.jpeg` en el repositorio. **Lo interpreté mal:**
lo tomé como decisiones comerciales cerradas —nombre, precios, planes, mercado— y renombré todo el
andamiaje y alineé la documentación sobre esa base.

El propietario corrigió: **el brochure es material de inspiración, no un compromiso.** Nada
comercial está definido. Se revirtió el tratamiento de precios y planes como decisiones, y se
separó con claridad lo que el brochure aporta (dirección de producto) de lo que no aporta
(compromisos comerciales).

Lo que sí quedó decidido en la misma conversación: **mercado base Colombia**, y que el brochure
vale como norte. De ahí salió `docs/00-vision/05-norte-del-producto.md`, que recoge lo que el
material acierta y empuja la visión más allá: el ciclo que no termina en la reserva, campañas como
reactivación en vez de difusión, el portal del cliente como palanca de productividad, el margen en
tiempo real como diferenciador central, la estacionalidad del calendario colombiano, y la red entre
agencias como horizonte que ya condiciona el modelo de datos.

El nombre en clave `ViajaPro` se mantuvo: aplicado de forma consistente, y cualquier otro sería
igual de provisional. Mientras no haya código, cambiarlo es un comando.

**Lección operativa: preguntar qué material existe antes de inventar, y no confundir un insumo con
una decisión.** Un artefacto encontrado en el repositorio no viene con su estado puesto.

## Qué aprendimos

**El alcance aprobado y el calendario esperado no coincidían, y la diferencia era grande.** Cuatro
bloques funcionales en 3-4 meses son en realidad 8-11 meses con un equipo de 3-4 personas. Se
registró la discrepancia sin recortar el alcance y se construyó un roadmap por fases que pone el
primer cobro en el mes 4. La decisión de dónde cortar queda documentada como decisión del
propietario, no como supuesto del equipo.

**El bloqueo real del proyecto no es técnico, es administrativo.** La verificación de Meta Business
puede tardar semanas y no la controlamos. Toda la Fase 1 depende de ella. Por eso es la tarea
número uno, antes que cualquier línea de código.

**Hay tres cosas que no admiten "lo hacemos después"**, porque agregarlas más tarde significa
migrar datos de producción: el aislamiento entre tenants, el versionado de cotizaciones y los
*time limits*. Están en v1 aunque cuesten.

**El modelo de dominio del turismo tiene trampas que no son visibles desde fuera del sector.** Las
tres que más daño harían si se modelan mal: `Contact` ≠ `Traveler` ≠ `Passenger` (quien paga no
siempre viaja); markup ≠ comisión (uno lo paga el cliente, el otro el proveedor, y se contabilizan
distinto); y el *time limit*, que es el campo que más dinero salva de todo el sistema. Por eso
existe el agente `experto-turismo` como compuerta obligatoria del ciclo de funcionalidad.

**En un proyecto desarrollado con agentes, la documentación no es un subproducto: es la memoria del
sistema.** Ningún modelo recuerda la sesión anterior. De ahí los cuatro artefactos del hilo y los
hooks que los hacen cumplir sin depender de que alguien se acuerde.

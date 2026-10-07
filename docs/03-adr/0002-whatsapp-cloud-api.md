# ADR-0002 — WhatsApp Cloud API directo, como Tech Provider

- **Estado:** Aceptado
- **Fecha:** 2026-10-06
- **Decide:** Propietario del producto
- **Consultados:** `arquitecto`, `whatsapp`, `experto-turismo`

---

## Contexto

WhatsApp no es un canal más de ViajaPro: es el canal donde ocurre la venta. La forma en que nos
conectemos a él determina el margen por cliente, la velocidad de onboarding de cada agencia y si el
producto es siquiera legal de vender.

Las fuerzas en juego:

- **Multi-tenant.** Cada agencia usa **su propio número**, no el nuestro. Necesitamos conectar
  cientos de números de terceros sin tocar configuración manualmente para cada uno.
- **Margen.** El costo por mensaje es nuestro mayor costo variable. Un intermediario que cobre
  sobrecosto se come el margen en el plan de entrada.
- **Riesgo legal y operativo.** El número de WhatsApp es el activo de la agencia. Si se bloquea,
  la agencia deja de vender ese día — y nos culpará a nosotros, con razón.

## Opciones consideradas

### A — Meta Cloud API directo, como Tech Provider (elegida)

Una sola app de Meta. Cada agencia conecta su WABA y su número con **Embedded Signup**, un flujo
incrustado en nuestra interfaz. Nosotros facturamos a Meta el consumo y lo repercutimos.

- **Gana:** costo al precio de lista de Meta (el mejor posible); control total del canal;
  onboarding de minutos sin intervención nuestra; acceso inmediato a toda función nueva de la API;
  relación directa con Meta.
- **Cuesta:** verificación de Meta Business y revisión de la app, que puede tardar semanas;
  somos responsables de la calidad agregada de la plataforma; tenemos que construir el flujo de
  Embedded Signup, la gestión de plantillas y el monitoreo de calidad por número.
- **Cierra:** nada relevante. Siempre se puede agregar un BSP después como canal alternativo.

### B — BSP intermediario (360dialog, Twilio, Infobip)

El proveedor gestiona la relación con Meta; nosotros consumimos su API.

- **Gana:** arranque en días, no semanas; menos burocracia; el proveedor absorbe parte del riesgo
  de cumplimiento.
- **Cuesta:** sobrecosto por mensaje o cuota mensual por número, que en nuestro plan de entrada se
  come buena parte del margen; dependencia de su disponibilidad y de su hoja de ruta; funciones
  nuevas de Meta llegan tarde; una capa más entre nosotros y la causa raíz cuando algo falla.
- **Cierra:** la relación directa con Meta, y con ella el control del costo.

### C — Librería no oficial (Baileys, WPPConnect, venom)

Automatización de WhatsApp Web mediante ingeniería inversa.

- **Gana:** gratis, sin aprobaciones, funciona en un día.
- **Cuesta:** **viola los Términos de Servicio de WhatsApp.** Baneo del número del cliente sin
  aviso ni apelación. Cero garantía de disponibilidad. Imposible de vender a terceros con
  responsabilidad. Un solo cliente baneado destruye la reputación del producto.
- **Cierra:** cualquier posibilidad de construir un negocio serio.

**Descartada sin discusión.** No es una opción barata: es una opción que destruye el producto.

## Decisión

**Opción A: Meta Cloud API directo, como Tech Provider con Embedded Signup.**

Es la única que soporta un SaaS multi-tenant con margen defendible. El costo —semanas de
verificación y más trabajo de integración— se paga una sola vez; el sobrecosto de un BSP se paga
en cada mensaje, para siempre.

El riesgo real no es técnico sino de calendario: la verificación de Meta puede tardar. Por eso es
la **tarea número uno del camino crítico**, y se inicia antes que cualquier línea de código de la
Fase 1. Mientras tanto se desarrolla contra los números de prueba de Meta.

## Consecuencias

### Positivas
- Mejor estructura de costos posible: precio de lista de Meta.
- Onboarding de una agencia en minutos, sin intervención nuestra.
- Control del canal completo: plantillas, calidad, límites, funciones nuevas.
- Relación directa con Meta cuando haya un problema.

### Negativas
- **Somos responsables de la calidad agregada.** Si varios clientes envían spam, Meta puede actuar
  contra nuestra app, no solo contra ellos. El producto debe desincentivar el envío masivo no
  solicitado **por diseño**, no por términos de uso.
- Hay que construir y mantener: Embedded Signup, ciclo de vida de plantillas, monitoreo de calidad
  por número, manejo de todos los códigos de error de Meta.
- Dependemos de la verificación de Meta para arrancar. Es un bloqueo externo sin fecha garantizada.
- Los precios y políticas de Meta cambian varias veces al año y afectan directamente nuestro
  modelo de costos. Mitigación: revisión trimestral obligatoria (loop de investigación).

### Qué habría que cambiar para revertir
La integración está detrás del puerto `MessagingProvider`. Cambiar a un BSP significa escribir un
adaptador nuevo; el dominio no se entera. Ese puerto es deliberado: es nuestra póliza de seguro.

## Cuándo revisar esta decisión

- Si la verificación de Meta se extiende más de 8 semanas y bloquea el lanzamiento → considerar un
  BSP como puente temporal, manteniendo el puerto.
- Si Meta cambia el modelo de precios de forma que el costo directo deje de ser ventajoso.
- Si necesitamos operar en un mercado donde WhatsApp no es el canal dominante.

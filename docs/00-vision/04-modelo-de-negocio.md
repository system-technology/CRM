# Modelo de negocio

> **Lo único decidido aquí es el mercado base: Colombia.** Moneda COP, normativa colombiana,
> pasarelas locales, estacionalidad del calendario festivo colombiano.
>
> ⚠️ **Nada más está decidido.** Ni el nombre comercial, ni el modelo de cobro, ni los precios, ni
> los planes. Lo que sigue son marcos de decisión e hipótesis de trabajo, no acuerdos.
>
> `docs/_assets/brochure-de-inspiracion.jpeg` es **material de inspiración**, no una lista de precios. Lo que aporta como
> dirección de producto está recogido en [el norte del producto](05-norte-del-producto.md).

---

## 1. Cómo se podría cobrar — los modelos y sus consecuencias

La decisión está abierta. Lo útil ahora no es elegir un número, sino entender **qué cambia en el
producto según el modelo**, porque cada uno obliga a medir cosas distintas desde el primer día.

### Opción A — Por asesor (asiento)

Precio fijo mensual por usuario activo.

- **A favor:** factura predecible, fácil de entender, escala con el crecimiento de la agencia.
- **En contra:** la agencia limita cuántos asesores entran al sistema para ahorrar, y acaba con
  gente trabajando por fuera. Eso mata la adopción, que es lo único que importa al principio.
- **Obliga a medir:** usuarios activos reales, no licencias contratadas.

### Opción B — Por conversación

Precio por conversación atendida.

- **A favor:** alinea el precio con el valor y con nuestro costo variable.
- **En contra:** **castiga el comportamiento que queremos fomentar** —que el asesor conteste todo,
  rápido— y hace la factura impredecible. Una agencia pequeña no compra un software cuya factura no
  puede proyectar.
- **Obliga a medir:** conversaciones por tenant con una definición precisa de qué cuenta como una.

### Opción C — Tramos (asesores + conversaciones incluidas)

Planes escalonados con topes de ambos.

- **A favor:** factura predecible, buena segmentación, camino natural de subida de plan.
- **En contra:** **el excedente necesita una política explícita** y las tres salidas posibles son
  decisiones de negocio distintas: cobrar excedente, forzar subida de plan, o bloquear.
  **Bloquear a un asesor a mitad de una venta es inaceptable** y destruye la confianza de golpe.
- **Obliga a medir:** distribución real de uso por tenant, para dimensionar bien los tramos.

### Opción D — Base + consumo de mensajería aparte

Suscripción por la plataforma, y el consumo de WhatsApp facturado a costo más margen.

- **A favor:** nos protege de los cambios de precio de Meta; es transparente y auditable.
- **En contra:** dos conceptos en la factura, más fricción comercial.
- **Obliga a medir:** costo de mensajería por tenant con precisión suficiente para facturarlo.

### Lo que sí es un hecho, independientemente del modelo

**El riesgo de precio de Meta recae en alguien.** Si el consumo va incluido, lo asumimos nosotros;
si va aparte, lo asume la agencia. No hay tercera opción, y hay que decidirlo conscientemente.
De ahí que la revisión trimestral de precios y políticas de Meta sea obligatoria.

**El margen no depende del plan, depende del uso.** Dos agencias en el mismo plan pueden tener
costos muy distintos según cuánto de su volumen sea mensajería de marketing frente a servicio.
Sin medir el costo real por tenant desde el primer cliente, cualquier precio es una apuesta.

### Qué hace falta antes de poner un número

1. **Entrevistar de ocho a diez agencias colombianas** del segmento: qué pagan hoy por software,
   qué les duele más, cuánto vale resolverlo. Es lo más barato y lo que más despeja.
2. **Medir el costo real por tenant** en el piloto durante al menos un mes completo, separando
   infraestructura, mensajería de Meta y tokens de IA.
3. **Elegir el modelo** con esos datos, no antes.
4. **Fijar precio** con margen bruto objetivo del 70% sobre el costo medido, no sobre el estimado.

Nota sobre estacionalidad: en Colombia el volumen de una agencia no es plano. Diciembre y Semana
Santa pueden triplicar el tráfico de un mes bajo. **Cualquier modelo con topes mensuales tiene que
contemplarlo**, o el cliente choca contra el límite justo en su mejor mes del año — el peor momento
posible para tener una fricción de facturación.

---

## 2. La estructura de costos

Lo que de verdad hay que vigilar, por tenant y por mes:

| Costo | Naturaleza | Riesgo |
|---|---|---|
| **Mensajes de WhatsApp** | Variable, el mayor | Meta cambia precios varias veces al año. Revisión trimestral obligatoria |
| **Tokens de IA** | Variable | Puede desbocarse sin tope. **Presupuesto por tenant desde el día uno** |
| Infraestructura | Casi fijo | El esquema compartido con RLS lo mantiene bajo. Ver [ADR-0003](../03-adr/0003-multitenancy.md) |
| Almacenamiento | Variable, crece siempre | La media de WhatsApp se acumula. Política de retención necesaria |
| Soporte | Variable con el número de clientes | El costo oculto que mata márgenes en SaaS de PyME |

**Regla operativa:** `devops` reporta el costo mensual por tenant activo cada vez que cambie algo
relevante. Un SaaS que no conoce su costo marginal por cliente no sabe si su precio sirve.

La disciplina que esto impone en el producto:
- Caché de prompt agresivo en la capa de IA (el prompt de sistema y el catálogo del tenant son estables).
- Elección de modelo por tarea: el rápido para clasificación de alto volumen, el fuerte solo donde
  la diferencia de calidad se mida y se justifique.
- Tope de consumo de IA por tenant, con degradación elegante — no un error, ni una factura sorpresa.

---

## 3. Unit economics — el marco, no los números

Las tres relaciones que deciden si el negocio funciona:

| Relación | Qué significa | Umbral de salud |
|---|---|---|
| **LTV / CAC** | Valor de vida del cliente sobre costo de adquirirlo | ≥ 3 |
| **Meses de recuperación del CAC** | Cuánto tarda un cliente en pagar lo que costó traerlo | ≤ 12 |
| **Margen bruto** | Ingreso menos costo de servir | ≥ 70% |

Para una herramienta de misión crítica —si el CRM se cae, la agencia no vende— la retención debería
ser alta: **abandono mensual por debajo del 3%**. Esa es la hipótesis central del negocio, y es la
primera que hay que validar con el piloto. Si el abandono es mayor, el producto no es tan crítico
como creemos, y eso cambia todo lo demás.

---

## 4. Cómo se entra al mercado

### Fase 1 — Una agencia piloto (meses 1-4)

Una sola agencia, gratis, a cambio de acceso total a su operación y a su opinión sin filtros.
No es una venta: es investigación de producto con un usuario real.

**Sin esto, los primeros nueve meses se construyen a ciegas.** Es la decisión más urgente del
proyecto después de iniciar el trámite con Meta.

### Fase 2 — Primeros clientes pagando (meses 4-8)

De 10 a 20 agencias, conseguidas una por una. Venta directa, acompañamiento de configuración
incluido. El objetivo no es el ingreso: es **llegar a un caso de éxito medible** — una agencia que
pueda decir, con números, cuánto subió su conversión.

### Fase 3 — Crecimiento (meses 8+)

Lo que escala en este mercado:
- **Referidos entre agencias.** El sector se conoce; hablan entre ellos.
- **Gremios y asociaciones** de agencias de viajes.
- **Contenido sobre el oficio**, no sobre el software: cómo cotizar más rápido, cómo no perder un
  *time limit*, cómo hacer que un viajero vuelva.
- **Alianzas con mayoristas y consolidadores**, que tienen la relación con cientos de minoristas.

Lo que **no** funciona aquí: publicidad digital genérica. Una agencia de cinco personas no compra
un CRM por un anuncio.

---

## 5. Qué nos defiende

| Barrera | Fuerza | Cuánto tarda un competidor en salvarla |
|---|---|---|
| **Datos acumulados** | Alta y creciente | Cada cotización y conversación mejora las sugerencias de esa agencia. Migrar significa perder el historial que hace útil al sistema |
| **Costo de cambio operativo** | Alta | Mover toda la operación comercial a otro sistema es doloroso |
| **Dominio del turismo bien modelado** | Media-alta | Un competidor generalista tiene que aprender el negocio. Es lento |
| **Tech Provider de Meta** | Media | Barrera administrativa, semanas de verificación |
| **Integraciones con proveedores** (v2) | Alta, a futuro | Contratos y certificaciones que toman trimestres |

La defensa más fuerte no está en la tabla: es **ser el lugar donde el asesor trabaja todo el día**.
Eso no se replica con funcionalidades, se gana con uso.

---

## 6. Los riesgos del negocio

| Riesgo | Impacto | Qué hacemos |
|---|---|---|
| **Meta cambia precios o políticas** | Alto, directo sobre el margen | Revisión trimestral obligatoria. Precio del plan desacoplado del costo de mensajería |
| **Meta restringe el acceso de Tech Providers** | Existencial | El puerto `MessagingProvider` permite migrar a un BSP sin tocar el dominio |
| **Un competidor grande entra al nicho** | Alto | Ventaja en profundidad de dominio y velocidad. No competir en amplitud |
| **Las agencias no pagan software** | Existencial | **Validar con el piloto antes de construir nueve meses.** Es la hipótesis más peligrosa del plan |
| **Costo de soporte desbordado** | Medio | Onboarding autoservicio; documentación en el producto; plantillas listas |
| **Un cliente quema su número por spam** | Medio, reputacional | El producto desincentiva el envío masivo **por diseño**, no por términos de uso |

El cuarto es el que debería quitar el sueño. Todo lo demás tiene mitigación; ese solo se responde
con un cliente real poniendo dinero sobre la mesa. Por eso el roadmap pone el primer cobro en el
mes 4 y no en el mes 10.

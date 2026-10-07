# Protección de datos personales

> Custodiamos conversaciones privadas, pasaportes, fechas de nacimiento —a veces de menores— y
> datos de pago. No es un anexo legal: es una obligación operativa con consecuencias reales.
>
> **Este documento no es asesoría jurídica.** Antes de salir a producción, debe revisarlo un
> abogado especializado en protección de datos del país de operación. Tarea registrada en `ESTADO.md`.

---

## 1. Qué datos manejamos

| Categoría | Ejemplos | Sensibilidad |
|---|---|---|
| Identificación | Nombre, teléfono, correo | Media |
| **Documentos de viaje** | Pasaporte, cédula, visa, fecha de nacimiento | **Alta** |
| **Datos de menores** | Pasajeros CHD e INF | **Muy alta** |
| Comunicaciones | Contenido completo de conversaciones de WhatsApp | **Alta** |
| Financieros | Pagos, montos, medio de pago | Alta |
| Comportamiento | Historial de viajes, preferencias, destinos | Media |

Hay dos categorías que merecen atención especial y suelen pasarse por alto:

- **Datos de menores.** Un archivo de viaje familiar contiene fecha de nacimiento y documento de
  niños. En la mayoría de las legislaciones esto exige tratamiento reforzado y consentimiento
  del representante legal.
- **Contenido de conversaciones.** Un viajero puede escribir cualquier cosa en un chat: una
  condición médica, una situación familiar. No lo pedimos, pero lo almacenamos.

---

## 2. Nuestro rol

En términos de la normativa de protección de datos:

- **La agencia es el responsable del tratamiento.** Es su relación con el viajero, su finalidad,
  su deber de informar.
- **Nosotros somos el encargado.** Tratamos los datos por cuenta de la agencia, siguiendo sus
  instrucciones.

**Consecuencia práctica:** hace falta un **contrato de encargo de tratamiento** entre nosotros y
cada agencia, firmado antes de que procese un solo dato real. Debe estar en el flujo de alta del
cliente, no como un PDF que alguien recuerda enviar.

---

## 3. Marco legal aplicable

**Colombia (mercado base):** Ley 1581 de 2012 y Decreto 1074 de 2015. Obligaciones concretas:
consentimiento previo, expreso e informado; aviso de privacidad; derechos de conocer, actualizar,
rectificar y suprimir; registro de bases de datos ante la SIC; reporte de incidentes.

**Turismo, Colombia:** Ley 300 de 1996 y Ley 2068 de 2020; RNT vigente obligatorio para operar.
**Leyes 679 y 1336 — prevención de ESCNNA:** la agencia debe adoptar y exhibir un código de
conducta. Esto se refleja en el producto, no es papeleo externo.

**Otros mercados:** México (LFPDPPP), Perú, Chile, Argentina tienen marcos equivalentes.
**Europa:** si una agencia atiende viajeros europeos, aplica el RGPD con obligaciones mayores.
Verificar antes de vender en ese mercado — no asumir que nuestro cumplimiento local basta.

---

## 4. Lo que el producto tiene que hacer

### Consentimiento

Registrado con **fecha, canal, finalidad y versión del aviso de privacidad**. Auditable.

El primer contacto por WhatsApp es el momento del consentimiento: el producto debe facilitar
capturarlo ahí, no exigir un formulario aparte que nadie llenará.

### Derechos del titular

Operables **sin intervención de un desarrollador**:

| Derecho | Qué implementa |
|---|---|
| Conocer | Vista de todos los datos de un titular |
| Actualizar y rectificar | Edición, con registro de quién cambió qué |
| Suprimir | **Borrado real**, no lógico, con sus documentos y su media en S3 |
| Portabilidad | Exportación completa en formato legible |
| Revocar consentimiento | Marca que impide seguir contactando |

El derecho de supresión es el que más código exige: hay que borrar de la base, de S3, de la caché y
de los respaldos según la política de retención. Diseñarlo después de tener datos es mucho más caro.

### Minimización

No pedir lo que no se necesita. El número de pasaporte hace falta para emitir un tiquete, no para
cotizar. El producto solicita el dato **en el momento en que se requiere**, no "por si acaso".

### Retención

| Dato | Retención | Por qué |
|---|---|---|
| Conversaciones | 24 meses desde el último mensaje | Soporte comercial y resolución de disputas |
| Documentos de viaje | 12 meses tras finalizar el viaje | Después no hay finalidad legítima |
| Archivos de viaje | 5 años | Obligaciones fiscales y contables |
| Bitácora de auditoría | 5 años | Trazabilidad |
| Media de WhatsApp | 12 meses | Costo de almacenamiento y ausencia de finalidad posterior |

Un trabajo programado aplica la política. **"Guardar todo para siempre" no es una política de
retención: es una ausencia de política, y aumenta el daño de cualquier incidente.**

---

## 5. Medidas técnicas

| Medida | Implementación |
|---|---|
| Aislamiento entre tenants | RLS en PostgreSQL. Ver [ADR-0003](../03-adr/0003-multitenancy.md) |
| Cifrado en tránsito | TLS 1.3 obligatorio |
| Cifrado en reposo | Disco cifrado + **cifrado a nivel de aplicación (AES-256-GCM) para números de documento y tokens de tenant** |
| Control de acceso | RBAC. Ver [04-rbac.md](04-rbac.md) |
| Auditoría | Todo acceso a datos sensibles registrado: quién, cuándo, a qué |
| Objetos | URLs firmadas de vida corta. Nunca un bucket público |
| Logs | **Jamás contenido de mensajes, documentos ni tokens.** Verificado en auditoría |
| Anonimización | Los datos de staging vienen anonimizados. Nunca datos reales fuera de producción |
| Respaldos | Cifrados, con restauración probada cada trimestre |

---

## 5.1 Transferencia internacional de datos

Desarrollo, `dev` y `staging` corren sobre PostgreSQL gestionado fuera de Colombia
([ADR-0007](../03-adr/0007-postgres-gestionado-neon.md)). Para esos entornos es irrelevante
**porque los datos son sintéticos** — y esa regla pasa de ser buena práctica a ser una obligación
legal: **nunca datos reales de clientes fuera de producción.**

Si producción acabara también fuera del país, la Ley 1581 de 2012 exige resolver la transferencia
internacional por una de estas vías: destino con nivel adecuado de protección declarado por la
SIC, cláusulas contractuales con el encargado, o consentimiento expreso e informado del titular.

**Pendiente para la revisión legal.** No bloquea el desarrollo; bloquea producción.

## 6. Respuesta a incidentes

1. **Contener** — cortar el acceso, rotar credenciales.
2. **Evaluar** — qué datos, de cuántos titulares, de qué tenants.
3. **Notificar** — a las agencias afectadas de inmediato; a la autoridad en el plazo legal; a los
   titulares cuando corresponda.
4. **Documentar** — postmortem en `docs/_incidentes/`.
5. **Corregir** — con la prueba automatizada que lo habría detectado.

**Los plazos de notificación son legales y cortos.** El procedimiento, con los contactos y los
plazos de cada jurisdicción, debe existir **antes** de necesitarlo. No se improvisa un martes a las
once de la noche.

---

## 7. Pendientes antes de producción

- [ ] Revisión por abogado especializado del país de operación
- [ ] Contrato de encargo de tratamiento, en el flujo de alta de cada agencia
- [ ] Aviso de privacidad y política de tratamiento publicados y versionados
- [ ] Registro de bases de datos ante la autoridad competente
- [ ] Flujo de derechos del titular implementado y **probado de punta a punta**
- [ ] Política de retención implementada como trabajo programado
- [ ] Procedimiento de respuesta a incidentes escrito, con contactos y plazos
- [ ] Pipeline de anonimización para staging
- [ ] Resolver la transferencia internacional de datos si producción queda fuera del país

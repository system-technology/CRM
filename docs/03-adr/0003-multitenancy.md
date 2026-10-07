# ADR-0003 — Esquema compartido con `tenant_id` y Row Level Security

- **Estado:** Aceptado
- **Fecha:** 2026-10-06
- **Decide:** Propietario del producto
- **Consultados:** `arquitecto`, `datos`, `auditor-seguridad`

---

## Contexto

ViajaPro es un SaaS donde cada agencia custodia datos de sus clientes: conversaciones privadas,
pasaportes, fechas de nacimiento de menores, montos de venta, márgenes. **Que una agencia vea datos
de otra no es un bug: es el fin del producto.** Ningún cliente se queda después de eso, y en
Colombia es además una infracción a la Ley 1581 de 2012.

Al mismo tiempo, apuntamos a cientos de tenants pequeños operados por un equipo diminuto.
El aislamiento tiene que ser fuerte **y** barato de operar.

## Opciones consideradas

### A — Base de datos por tenant

Cada agencia, su propia base.

- **Gana:** aislamiento físico, el más fuerte posible; restaurar un solo cliente es trivial;
  responde a cualquier exigencia de residencia de datos.
- **Cuesta:** 500 bases son 500 migraciones en cada despliegue; conexiones multiplicadas;
  costo de infraestructura por tenant que hace inviable un plan de entrada barato; cualquier
  consulta agregada entre tenants se vuelve un proyecto.
- **Cierra:** la economía de un SaaS para agencias pequeñas.

### B — Esquema por tenant en una base compartida

- **Gana:** aislamiento razonable; una sola instancia.
- **Cuesta:** sigue siendo N migraciones por despliegue; PostgreSQL se degrada con miles de
  esquemas (el catálogo se vuelve el cuello de botella); el ORM necesita conmutar esquema por
  petición, con el riesgo de olvidarlo en algún camino.
- **Cierra:** poco, pero no resuelve el problema principal mejor que la opción C.

### C — Esquema compartido con `tenant_id` y Row Level Security (elegida)

Todas las tablas en un esquema, con `tenant_id` y políticas RLS que PostgreSQL hace cumplir.

- **Gana:** una migración por despliegue; costo marginal por tenant cercano a cero; métricas
  agregadas triviales; el aislamiento lo garantiza el motor, no el programador.
- **Cuesta:** un error en una política es una brecha; hay que fijar `app.current_tenant` en cada
  transacción sin falta; el "vecino ruidoso" comparte recursos; no responde a exigencias de
  residencia de datos por jurisdicción.
- **Cierra:** vender a un cliente que exija su base aislada, sin un despliegue dedicado.

### D — Esquema compartido con filtrado en la aplicación

Igual que C, pero el `WHERE tenant_id = ?` lo pone el código.

- **Gana:** simple de implementar.
- **Cuesta:** **depende de que ningún programador, ni ningún agente, se olvide nunca.** Un solo
  `findMany` sin filtro es una fuga. Es cuestión de tiempo, no de disciplina.
- **Cierra:** la posibilidad de dormir tranquilo.

**Descartada.** La propiedad más crítica del producto no puede depender de la memoria humana.

## Decisión

**Opción C: esquema compartido, `tenant_id` en toda tabla de negocio, y Row Level Security forzada
en PostgreSQL.**

La diferencia esencial con la opción D: en C, **olvidar el filtro no produce una fuga, produce cero
filas.** El fallo es seguro por defecto.

### Cómo se implementa

**1. Toda tabla de negocio:**
```sql
tenant_id uuid NOT NULL REFERENCES tenants(id)
-- más índice compuesto con tenant_id SIEMPRE en primera posición
```

**2. Política en cada tabla:**
```sql
ALTER TABLE <tabla> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <tabla> FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON <tabla>
  USING       (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK  (tenant_id = current_setting('app.current_tenant', true)::uuid);
```

`FORCE` incluye al dueño de la tabla. `WITH CHECK` **no es opcional**: sin él, un tenant puede
*escribir* filas con el `tenant_id` de otro, aunque no pueda leerlas.

**3. Rol de aplicación sin privilegio de evasión:**
```sql
CREATE ROLE viajapro_app LOGIN NOBYPASSRLS;
```
La aplicación nunca se conecta como `postgres`. Las migraciones sí, y solo ellas.

**4. El tenant se fija por transacción**, en un interceptor, derivado del token de sesión:
```sql
SET LOCAL app.current_tenant = '<uuid>';
```
`SET LOCAL` y no `SET`: el valor muere con la transacción y no contamina la conexión siguiente del
pool. Este detalle es la diferencia entre aislamiento real y una fuga intermitente imposible de
reproducir.

**5. El `tenant_id` jamás viene del cliente.** Ni en el cuerpo, ni en la URL, ni en una cabecera.
Un `tenant_id` que viaja en la petición es un hallazgo crítico de auditoría.

**6. Prueba automatizada obligatoria:** dos tenants, intento de lectura y de escritura cruzada,
debe devolver cero filas y rechazar la escritura. Corre en CI. Una tabla nueva sin esta prueba
no se integra.

## Consecuencias

### Positivas
- Una migración por despliegue, sin importar cuántos clientes haya.
- Costo marginal por tenant cercano a cero: viable un plan de entrada barato.
- El aislamiento lo garantiza PostgreSQL, no la disciplina del equipo.
- Olvidar el filtro devuelve cero filas, no datos ajenos.

### Negativas
- **Una política mal escrita es una brecha.** Mitigación: plantilla obligatoria, revisión del
  `auditor-seguridad` en cada tabla nueva, prueba automatizada en CI.
- Si el interceptor falla en fijar `app.current_tenant`, todas las consultas devuelven vacío.
  Es un fallo ruidoso y por tanto preferible, pero hay que detectarlo rápido: métrica dedicada.
- Vecino ruidoso: un tenant con volumen anormal afecta a los demás. Mitigación: límites por tenant
  y monitoreo de consumo por tenant desde el día uno.
- **No resuelve residencia de datos por jurisdicción.** Si un cliente exige datos en su país, hace
  falta un despliegue regional dedicado. Es un costo conocido, no una sorpresa.
- La caché en Redis y los objetos en S3 **no** están cubiertos por RLS: su aislamiento es
  responsabilidad de la aplicación (prefijo de tenant en claves y rutas). Punto de auditoría recurrente.

### Qué habría que cambiar para revertir
Migrar a base por tenant sería una operación mayor: extracción por tenant, reescritura de la capa
de conexión, cambio del modelo de despliegue. Semanas, no días. Es una decisión difícil de revertir
y por eso se documenta con este detalle.

## Cuándo revisar esta decisión

- Un cliente grande exige residencia de datos en su jurisdicción → despliegue regional, no cambio
  de modelo.
- Un solo tenant supera el 20% del volumen total → evaluar extraerlo a infraestructura dedicada.
- Se detecta una fuga real → revisión completa del modelo, no un parche.

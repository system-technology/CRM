// TEMPORAL, solo para demostrar el rojo de AUD-008. Esta rama no se integra.
// Una tabla nueva de negocio con un GRANT por error a viajapro_identidad.
const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query('CREATE TABLE zz_tabla_nueva_de_negocio (id int)');
  await c.query('GRANT SELECT ON zz_tabla_nueva_de_negocio TO viajapro_identidad');
  await c.end();
})();

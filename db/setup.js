// =============================================================================
// Crea la base "fotograma" completa, desde cero:
//
//   00_crear_db.js       colecciones + validación ($jsonSchema)
//   01_datos_semilla.js  datos del prototipo (interfaces/assets/data.js)
//   02_datos_masivos.js  datos generados (cantidades en config.js)
//   03_ratings.js        media.rating calculado desde reviews
//   04_indices.js        índices
//   05_home.js           colección home: la pantalla de Inicio precalculada
//   06_verificar.js      volumen, validación e integridad de referencias
//
// Uso (desde la carpeta del proyecto):
//   mongosh db/setup.js
//
// ATENCIÓN: borra la base "fotograma" si ya existe.
// =============================================================================

load(__dirname + "/config.js");
load(__dirname + "/lib/utilidades.js");

const total = cronometro();
for (const script of ["00_crear_db.js", "01_datos_semilla.js", "02_datos_masivos.js", "03_ratings.js", "04_indices.js", "05_home.js", "06_verificar.js"]) {
  load(`${__dirname}/${script}`);
}
print(`\nBase "${CONFIG.dbName}" lista en ${total()}.`);

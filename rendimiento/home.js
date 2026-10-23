// =============================================================================
// Inicio: armar la pantalla con varias consultas vs leer la colección home
//
//   SIN home:  las consultas de consultas/1_inicio.js (hero, géneros, top 10,
//              seguir viendo, recién agregadas, recomendadas, series)
//   CON home:  db.home.findOne({ _id: user_id })
//
// Cada variante se ejecuta 20 veces con el mismo usuario y se informa el tiempo
// promedio por pantalla. Se mide el tiempo completo (viajes a la base incluidos),
// que es lo que espera el usuario al abrir el Inicio.
//
// Uso:  mongosh rendimiento/home.js
// =============================================================================

load(__dirname + "/../db/config.js");
db = db.getSiblingDB(CONFIG.dbName);

const YO = ObjectId("665f0c000000000000000001");   // CineFan88
const HACE_7_DIAS = ISODate("2026-09-29T12:00:00Z");
const HACE_30_DIAS = ISODate("2026-09-06T12:00:00Z");
const CARD = { title: 1, type: 1, poster: 1, release_year: 1, "rating.avg": 1 };
const REPETICIONES = 20;

// Las consultas que arman el Inicio sin la colección home
const inicioSinHome = function () {
  const usuario = db.users.findOne({ _id: YO }, { favorite_genre_ids: 1, username: 1, avatar: 1 });
  db.media.findOne({ is_featured: true });
  db.genres.find().sort({ name: 1 }).toArray();
  const ranking = db.views.aggregate([
    { $match: { started_at: { $gte: HACE_7_DIAS } } },
    { $group: { _id: "$media_id", views: { $sum: 1 } } },
    { $sort: { views: -1 } },
    { $limit: 10 },
    { $lookup: { from: "media", localField: "_id", foreignField: "_id", as: "media" } },
  ]).toArray();
  const sesiones = db.views.find({ user_id: YO, started_at: { $gte: HACE_30_DIAS } }).sort({ started_at: -1 }).toArray();
  db.media.find({ _id: { $in: sesiones.map((s) => s.media_id) } }, CARD).toArray();
  db.media.find({}, CARD).sort({ created_at: -1 }).limit(12).toArray();
  db.media.find({ genre_ids: usuario.favorite_genre_ids[0] }, CARD).sort({ "rating.avg": -1 }).limit(12).toArray();
  db.media.find({ type: "series" }, CARD).sort({ "rating.avg": -1 }).limit(12).toArray();
  return ranking.length;
};

// El Inicio con la colección home: una sola lectura
const inicioConHome = function () {
  return db.home.findOne({ _id: YO });
};

const promedio = function (fn) {
  fn();   // una ejecución de calentamiento, no se cuenta
  const t0 = Date.now();
  for (let i = 0; i < REPETICIONES; i++) fn();
  return (Date.now() - t0) / REPETICIONES;
};

const sin = promedio(inicioSinHome);
const con = promedio(inicioConHome);

print("\n=== Pantalla de Inicio (promedio de " + REPETICIONES + " ejecuciones)");
print(`  sin home: ${sin.toFixed(1).padStart(7)} ms   (9 consultas a 4 colecciones)`);
print(`  con home: ${con.toFixed(1).padStart(7)} ms   (1 consulta a 1 colección)`);
print(`  home es ${(sin / con).toFixed(0)} veces más rápida`);

print("\n| Pantalla de Inicio | Consultas | Tiempo promedio |");
print("|---|---|---|");
print(`| Sin home (hero, géneros, top 10, seguir viendo, recientes, recomendadas, series) | 9 | ${sin.toFixed(1)} ms |`);
print(`| Con home (\`db.home.findOne({ _id })\`) | 1 | ${con.toFixed(1)} ms |`);

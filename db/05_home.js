// =============================================================================
// 05 · Colección home (vista precalculada de la pantalla de Inicio)
//
// El Inicio necesitaba 6 consultas (hero, seguir viendo, top 10, recién
// agregadas, recomendadas por género favorito, series, géneros). Con esta
// colección el Inicio se resuelve con UNA sola lectura:
//
//   db.home.findOne({ _id: <user_id> })
//
// Cada documento de home es la pantalla de Inicio ya armada para un usuario.
// Es el patrón "computado" (igual que media.rating) llevado a una pantalla
// entera: se calcula al escribir y se lee muchas veces.
//
// Se ejecuta DESPUÉS de 04_indices.js: las consultas que arman la pantalla
// usan los índices de views y media.
//
// Uso:  mongosh db/05_home.js
// =============================================================================

if (typeof CONFIG === "undefined") load(__dirname + "/config.js");
if (typeof titulo === "undefined") load(__dirname + "/lib/utilidades.js");

// Bloque propio: setup.js carga todos los scripts en el mismo contexto y así
// las constantes de un script no chocan con las de otro.
{

db = db.getSiblingDB(CONFIG.dbName);
titulo("Armando la colección home (una pantalla de Inicio por usuario)");
const t = cronometro();

const DIA = 24 * 3600 * 1000;
const haceDias = (n) => new Date(CONFIG.hoy.getTime() - n * DIA);

// Datos mínimos de un título para dibujar una card (referencia extendida:
// el _id y una copia de lo que se muestra)
const PROYECCION = { title: 1, type: 1, poster: 1, release_year: 1, "rating.avg": 1, seasons: 1 };
const card = (m) => {
  const c = { media_id: m._id, title: m.title, type: m.type, release_year: m.release_year, rating_avg: m.rating.avg };
  if (m.poster) c.poster = m.poster;
  if (m.type === "series") c.seasons_count = m.seasons.length;
  return c;
};

// -----------------------------------------------------------------------------
// Partes iguales para todos los usuarios: se calculan UNA vez
// -----------------------------------------------------------------------------

// Hero: el título destacado
const destacado = db.media.findOne({ is_featured: true });
const hero = {
  media_id: destacado._id, title: destacado.title, type: destacado.type, plot: destacado.plot,
  release_year: destacado.release_year, rating_avg: destacado.rating.avg, genre_ids: destacado.genre_ids,
};
if (destacado.backdrop) hero.backdrop = destacado.backdrop;
if (destacado.poster) hero.poster = destacado.poster;
if (destacado.type === "movie") hero.runtime_min = destacado.runtime_min;
else hero.seasons_count = destacado.seasons.length;

// Géneros (para los chips y "Explorar por género")
const genres = db.genres.find().sort({ name: 1 }).toArray().map((g) => ({ _id: g._id, name: g.name, color: g.color }));
const nombreGenero = {};
for (const g of genres) nombreGenero[g._id] = g.name;

// Top 10 de la semana: $match + $group + $sort + $limit sobre views
const ranking = db.views.aggregate([
  { $match: { started_at: { $gte: haceDias(7) } } },
  { $group: { _id: "$media_id", views: { $sum: 1 } } },
  { $sort: { views: -1 } },
  { $limit: 10 },
]).toArray();
const tituloDe = {};
db.media.find({ _id: { $in: ranking.map((r) => r._id) } }, PROYECCION).forEach((m) => { tituloDe[m._id.toString()] = m; });
const top10 = ranking.map((r) => ({ ...card(tituloDe[r._id.toString()]), views: r.views }));

// Recién agregadas y series mejor valoradas
const recent = db.media.find({}, PROYECCION).sort({ created_at: -1 }).limit(12).toArray().map(card);
const series = db.media.find({ type: "series" }, PROYECCION).sort({ "rating.avg": -1 }).limit(12).toArray().map(card);

// Mejor valoradas de un género: se guarda en un mapa para no repetir la misma
// consulta con cada usuario al que le gusta ese género
const porGenero = {};
const mejoresDe = function (genero) {
  if (!porGenero[genero]) {
    porGenero[genero] = db.media.find({ genre_ids: genero }, PROYECCION).sort({ "rating.avg": -1 }).limit(12).toArray().map(card);
  }
  return porGenero[genero];
};

// -----------------------------------------------------------------------------
// Parte personal de cada usuario: seguir viendo y género favorito
// -----------------------------------------------------------------------------

// Episodio de una serie que se estaba viendo (con su título y duración)
const episodioDe = function (v, m) {
  const temporada = m.seasons.find((s) => s.number === v.episode.season);
  return temporada && temporada.episodes.find((e) => e.number === v.episode.number);
};

// Minutos totales de lo que se estaba viendo (película o episodio)
const duracion = function (v, m) {
  if (!v.episode) return m.runtime_min;
  const episodio = episodioDe(v, m);
  return episodio ? episodio.runtime_min : null;
};

const seguirViendo = function (userId) {
  // Sesiones de los últimos 30 días, de la más nueva a la más vieja (índice views_por_usuario)
  const sesiones = db.views.find({ user_id: userId, started_at: { $gte: haceDias(30) } }).sort({ started_at: -1 }).toArray();

  // La primera sesión de cada título es la última que se vio; si quedó a medias, va a "Seguir viendo"
  const ultima = new Map();
  for (const v of sesiones) {
    const clave = v.media_id.toString();
    if (!ultima.has(clave)) ultima.set(clave, v);
  }
  const pendientes = [...ultima.values()].filter((v) => !v.completed).slice(0, 10);
  if (!pendientes.length) return [];

  const titulos = {};
  db.media.find({ _id: { $in: pendientes.map((v) => v.media_id) } }, { title: 1, type: 1, poster: 1, runtime_min: 1, seasons: 1 })
    .forEach((m) => { titulos[m._id.toString()] = m; });

  return pendientes.map((v) => {
    const m = titulos[v.media_id.toString()];
    const total = duracion(v, m);
    const item = { media_id: m._id, title: m.title, type: m.type, minutes: v.minutes, progress: total ? Math.min(100, Math.round((v.minutes / total) * 100)) : 0 };
    if (m.poster) item.poster = m.poster;
    if (v.episode) {
      const episodio = episodioDe(v, m);
      item.episode = { season: v.episode.season, number: v.episode.number };
      if (episodio) item.episode.title = episodio.title;
    }
    return item;
  });
};

// -----------------------------------------------------------------------------
// Un documento por usuario (insertMany por lotes)
// -----------------------------------------------------------------------------
// La colección se crea con su validación en 00_crear_db.js; acá solo se vacía
// (así el script se puede volver a correr solo para refrescar la pantalla)
db.home.deleteMany({});

const generado = new Date();
let lote = [];
let total = 0;
const guardar = function () {
  if (!lote.length) return;
  db.home.insertMany(lote, { ordered: false });
  total += lote.length;
  lote = [];
  if (total % 5000 === 0) print(`    home: ${total.toLocaleString("es-AR")} documentos`);
};

db.users.find({}, { username: 1, avatar: 1, favorite_genre_ids: 1 }).forEach((u) => {
  const doc = {
    _id: u._id,
    generated_at: generado,
    user: { username: u.username, favorite_genre_ids: u.favorite_genre_ids },
    hero,
    continue_watching: seguirViendo(u._id),
    top10,
    recent,
    series,
    genres,
  };
  if (u.avatar) doc.user.avatar = u.avatar;

  // "Porque te gusta <género>": el primer género favorito del usuario
  const favorito = u.favorite_genre_ids[0];
  if (favorito) doc.because_you_like = { genre_id: favorito, genre_name: nombreGenero[favorito], items: mejoresDe(favorito) };

  lote.push(doc);
  if (lote.length >= 1000) guardar();
});
guardar();

paso(`${total.toLocaleString("es-AR")} documentos en home, armados en ${t()}`);
}

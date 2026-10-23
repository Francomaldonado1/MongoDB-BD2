// =============================================================================
// Pantalla INICIO (interfaces/index.html)
// Uso:  mongosh consultas/1_inicio.js
// =============================================================================

if (typeof mostrar === "undefined") load(__dirname + "/lib.js");

{
seccion("INICIO");

// -----------------------------------------------------------------------------
// 1.0 EL INICIO COMPLETO CON UNA SOLA LECTURA
// La colección home guarda la pantalla ya armada para cada usuario (db/05_home.js):
// hero, seguir viendo, top 10, recién agregadas, recomendadas, series y géneros.
// Es lo que usa la aplicación. Las consultas 1.1 a 1.6 de más abajo son las que
// arman cada parte: se ejecutan cuando se genera home, no cuando entra un usuario.
// -----------------------------------------------------------------------------
mostrar("1.0 Inicio completo: db.home.findOne({ _id: user_id })", () =>
  db.home.findOne({ _id: IDS.cinefan }, { hero: 1, continue_watching: 1, top10: 1, because_you_like: 1 })
, { ancho: 100 });

// -----------------------------------------------------------------------------
// 1.1 Título destacado (hero)
// Un solo documento trae todo lo que muestra el hero.
// -----------------------------------------------------------------------------
mostrar("1.1 Título destacado", () =>
  db.media.findOne(
    { is_featured: true },
    { title: 1, type: 1, plot: 1, release_year: 1, genre_ids: 1, rating: 1 }
  )
);

// -----------------------------------------------------------------------------
// 1.2 Catálogo de géneros
// media.genre_ids guarda slugs; los nombres y colores salen de genres
// (12 documentos que la aplicación carga una vez).
// -----------------------------------------------------------------------------
mostrar("1.2 Catálogo de géneros", () =>
  db.genres.find({}, { name: 1, color: 1 }).sort({ name: 1 })
, { limite: 12, ancho: 100 });

// -----------------------------------------------------------------------------
// 1.3 Top 10 de la semana
// $match: reproducciones de los últimos 7 días
// $group: una fila por título, contando con $sum
// $lookup: trae el título desde media
// -----------------------------------------------------------------------------
mostrar("1.3 Top 10 de la semana", () =>
  db.views.aggregate([
    { $match: { started_at: { $gte: haceDias(7) } } },
    { $group: { _id: "$media_id", reproducciones: { $sum: 1 } } },
    { $sort: { reproducciones: -1 } },
    { $limit: 10 },
    { $lookup: { from: "media", localField: "_id", foreignField: "_id", as: "media" } },
    { $project: { _id: 0, reproducciones: 1, "media.title": 1, "media.type": 1 } },
  ])
, { limite: 10 });

// -----------------------------------------------------------------------------
// 1.4 Recién agregadas (created_at = alta en el catálogo, no fecha de estreno)
// -----------------------------------------------------------------------------
mostrar("1.4 Recién agregadas", () =>
  db.media.find({}, { title: 1, type: 1, release_year: 1, created_at: 1 })
    .sort({ created_at: -1 }).limit(12)
);

// -----------------------------------------------------------------------------
// 1.5 Recomendadas por género favorito
// El género sale del documento del usuario; después se buscan los mejor
// valorados de ese género. genre_ids es un array: { genre_ids: "x" } busca
// dentro del array.
// -----------------------------------------------------------------------------
const usuario = db.users.findOne({ _id: IDS.cinefan }, { favorite_genre_ids: 1 });
const favorito = usuario.favorite_genre_ids[0];
mostrar(`1.5 Porque te gusta "${favorito}"`, () =>
  db.media.find({ genre_ids: favorito }, { title: 1, type: 1, "rating.avg": 1 })
    .sort({ "rating.avg": -1 }).limit(12)
);

// -----------------------------------------------------------------------------
// 1.6 Filtrar media por tipo (patrón polimórfico: películas y series se separan por type)
// -----------------------------------------------------------------------------
mostrar("1.6 Filtrar media por tipo: series mejor valoradas", () =>
  db.media.find({ type: "series" }, { title: 1, release_year: 1, "rating.avg": 1 })
    .sort({ "rating.avg": -1 }).limit(12)
);

}

/* ==========================================================================
   Pantallas del prototipo. Cada sección declara (con ann) la colección y la
   consulta MongoDB que la alimenta.
   ========================================================================== */

const NOW = new Date("2026-10-04T12:00:00Z"); // "hoy" en el prototipo
const oid = (id) => `ObjectId("${id}")`;
const isoDaysAgo = (d) => new Date(NOW - d * 864e5).toISOString().slice(0, 10) + "T00:00:00Z";
const CARD_PROJ = `{ title: 1, type: 1, poster: 1, release_year: 1, "rating.avg": 1 }`;

// Última sesión de cada título del usuario que quedó a medias (lo que calcula el pipeline de "Seguir viendo")
function continueWatching(userId) {
  const last = {};
  DB.views
    .filter((v) => v.user_id === userId)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .forEach((v) => { last[v.media_id] ??= v; });
  return Object.values(last).filter((v) => !v.completed);
}
function episodeOf(m, ep) {
  return m.seasons.find((s) => s.number === ep.season).episodes.find((e) => e.number === ep.number);
}
function viewLabel(v, m) {
  if (!v.episode) return "Película";
  return `T${v.episode.season} · E${v.episode.number} — ${episodeOf(m, v.episode).title}`;
}
function viewProgress(v, m) {
  const total = v.episode ? episodeOf(m, v.episode).runtime_min : m.runtime_min;
  return Math.min(100, Math.round((v.minutes / total) * 100));
}

/* ======================================================================
   INICIO
   El Inicio se resuelve con UNA sola lectura: db.home.findOne({ _id: user_id }).
   La colección home guarda la pantalla ya armada para cada usuario
   (db/05_home.js). Esta función arma ese mismo documento a partir de los datos
   de muestra, y la pantalla se dibuja SOLO con lo que trae ese documento.
   ====================================================================== */
function armarHome(user) {
  const card = (m) => ({
    media_id: m._id, title: m.title, type: m.type, poster: m.poster, release_year: m.release_year, rating_avg: m.rating.avg,
    ...(m.type === "series" ? { seasons_count: m.seasons.length } : {}),
  });
  const f = DB.media.find((m) => m.is_featured);
  const fav = user.favorite_genre_ids[0];
  const byRating = (a, b) => b.rating.avg - a.rating.avg;
  return {
    _id: user._id,
    generated_at: NOW.toISOString().slice(0, 19) + "Z",
    user: { username: user.username, avatar: user.avatar, favorite_genre_ids: user.favorite_genre_ids },
    hero: { ...card(f), plot: f.plot, genre_ids: f.genre_ids, backdrop: f.backdrop, ...(f.type === "movie" ? { runtime_min: f.runtime_min } : {}) },
    continue_watching: continueWatching(user._id).map((v) => {
      const m = MEDIA[v.media_id];
      const { media_id, title, type, poster } = card(m);
      return { media_id, title, type, poster, minutes: v.minutes, progress: viewProgress(v, m),
        ...(v.episode ? { episode: { ...v.episode, title: episodeOf(m, v.episode).title } } : {}) };
    }),
    top10: DB.trending_result.map((t) => ({ ...card(MEDIA[t._id]), views: t.views })),
    recent: [...DB.media].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12).map(card),
    because_you_like: { genre_id: fav, genre_name: GENRES[fav].name,
      items: DB.media.filter((m) => m.genre_ids.includes(fav)).sort(byRating).slice(0, 12).map(card) },
    series: DB.media.filter((m) => m.type === "series").sort(byRating).slice(0, 12).map(card),
    genres: [...DB.genres].sort((a, b) => a.name.localeCompare(b.name)).map((g) => ({ _id: g._id, name: g.name, color: g.color })),
  };
}

function renderHome(app) {
  // La única lectura de la pantalla
  const H = armarHome(ME);

  // Las cards de home guardan media_id y una copia de lo que se muestra; este
  // adaptador les da la forma que esperan los helpers de dibujo (poster, mediaCard…)
  const asMedia = (c) => ({ _id: c.media_id, title: c.title, type: c.type, release_year: c.release_year, rating: { avg: c.rating_avg } });
  const chip = (slug) => {
    const g = H.genres.find((x) => x._id === slug);
    return `<a class="chip" href="genero.html?id=${g._id}" style="--g:${g.color}">${esc(g.name)}</a>`;
  };
  const f = H.hero, fm = asMedia(f);
  const heroMeta = [f.release_year, f.type === "movie" ? fmtRuntime(f.runtime_min) : `${f.seasons_count} ${f.seasons_count === 1 ? "temporada" : "temporadas"}`];
  const episodeLabel = (c) => (c.episode ? `T${c.episode.season} · E${c.episode.number} — ${c.episode.title}` : "Película");

  const FIND = `db.home.findOne({ _id: ${oid(ME._id)} })`;
  const ORIGEN = "Esta sección se armó al generar home (db/05_home.js) con la consulta:";
  const aHero = ann({ col: "home", title: "Título destacado (hero)", short: "home.findOne({ _id: user_id }) → hero",
    q: `${FIND}   // campo hero\n\n// ${ORIGEN}\n//   db.media.findOne({ is_featured: true })`,
    why: "El Inicio completo es UN documento de home. El hero es el campo hero: título, sinopsis, año, rating y los slugs de género, listos para dibujar.",
    docs: () => [{ hero: H.hero }] });
  const aChips = ann({ col: "home", title: "Nombres de los géneros", short: "home.findOne({ _id: user_id }) → genres",
    q: `${FIND}   // campo genres\n\n// ${ORIGEN}\n//   db.genres.find().sort({ name: 1 })`,
    why: "Los nombres y colores de los géneros viajan dentro del mismo documento: no hace falta consultar genres al abrir la pantalla.",
    docs: () => [{ genres: H.genres }], maxDocs: 1 });
  const aList = ann({ col: "users", title: "Agregar a Mi lista", short: "updateOne({ watchlist: { $ne } }, { $push })",
    q: `db.users.updateOne(
  { _id: ${oid(ME._id)}, watchlist: { $ne: ${oid(f.media_id)} } },
  { $push: { watchlist: ${oid(f.media_id)} } }   // $pull para quitarlo
)`,
    why: "Esto es una escritura, no parte de la lectura del Inicio. $push agrega el _id al array de referencias. El filtro { watchlist: { $ne: id } } hace que solo se agregue si todavía no está, así no se duplica.",
    docs: () => [{ _id: ME._id, username: ME.username, watchlist: ME.watchlist }] });
  const aCont = ann({ col: "home", title: "Seguir viendo", short: "home.findOne({ _id: user_id }) → continue_watching",
    q: `${FIND}   // campo continue_watching\n\n// ${ORIGEN}\n// 1) db.views.find({ user_id, started_at: { $gte: hace30dias } }).sort({ started_at: -1 })\n// 2) se queda con la última sesión de cada título; si no está terminada, entra\n// 3) db.media.find({ _id: { $in: [ … ] } })   // título y póster`,
    why: "Es la parte personal de home: cambia con cada usuario. Cada item guarda el título, el póster y el progreso ya calculado, así que no hay que consultar views ni media.",
    docs: () => [{ continue_watching: H.continue_watching }], maxDocs: 1 });
  const aTop = ann({ col: "home", title: "Top 10 de la semana", short: "home.findOne({ _id: user_id }) → top10",
    q: `${FIND}   // campo top10\n\n// ${ORIGEN}\ndb.views.aggregate([\n  { $match: { started_at: { $gte: ISODate("${isoDaysAgo(7)}") } } },\n  { $group: { _id: "$media_id", views: { $sum: 1 } } },\n  { $sort: { views: -1 } },\n  { $limit: 10 }\n])`,
    why: "El ranking es lo más caro de calcular: hay que contar todas las reproducciones de la semana. Con home se calcula una vez, al generar el documento, y no cada vez que alguien abre el Inicio.",
    docs: () => [{ top10: H.top10 }], maxDocs: 1 });
  const aRecent = ann({ col: "home", title: "Recién agregadas", short: "home.findOne({ _id: user_id }) → recent",
    q: `${FIND}   // campo recent\n\n// ${ORIGEN}\n//   db.media.find().sort({ created_at: -1 }).limit(12)`,
    why: "created_at es la fecha en que el título se agregó al catálogo (no la de estreno). Cada card es una referencia extendida: media_id más una copia de lo que se muestra.",
    docs: () => [{ recent: H.recent }], maxDocs: 1 });
  const aFav = ann({ col: "home", title: "Recomendadas por género favorito", short: "home.findOne({ _id: user_id }) → because_you_like",
    q: `${FIND}   // campo because_you_like\n\n// ${ORIGEN}\n//   db.media.find({ genre_ids: "${H.because_you_like.genre_id}" }).sort({ "rating.avg": -1 }).limit(12)`,
    why: "El género sale de users.favorite_genre_ids (el primero). Como es personal, vive en el documento de cada usuario; las mejores de ese género se calculan una vez por género y se copian.",
    docs: () => [{ because_you_like: H.because_you_like }], maxDocs: 1 });
  const aSeries = ann({ col: "home", title: "Series para maratonear", short: "home.findOne({ _id: user_id }) → series",
    q: `${FIND}   // campo series\n\n// ${ORIGEN}\n//   db.media.find({ type: "series" }).sort({ "rating.avg": -1 }).limit(12)`,
    why: "Patrón polimórfico: películas y series conviven en media y se distinguen por type. Acá ya llegan filtradas y con la cantidad de temporadas.",
    docs: () => [{ series: H.series }], maxDocs: 1 });
  const aGenres = ann({ col: "home", title: "Explorar por género", short: "home.findOne({ _id: user_id }) → genres",
    q: `${FIND}   // campo genres\n\n// ${ORIGEN}\n//   db.genres.find().sort({ name: 1 })`,
    why: "La misma lista de géneros alimenta los chips del hero y esta grilla, sin una consulta aparte.",
    docs: () => [{ genres: H.genres }], maxDocs: 1 });

  const inList = ME.watchlist.includes(f.media_id);
  app.innerHTML = `
  <section class="hero" ${aHero.attr}>
    ${backdrop(fm)}
    <div class="hero-content">
      <span class="eyebrow">${typeLabel(fm)} destacada · Nuevo en Fotograma</span>
      <h1 class="hero-title">${esc(f.title)}</h1>
      <div class="meta">${stars(f.rating_avg)}<span class="dot"></span>${heroMeta.join('<span class="dot"></span>')}<span class="badge">${typeLabel(fm)}</span></div>
      <div class="chips" ${aChips.attr}>${f.genre_ids.map(chip).join("")}</div>
      <p class="hero-plot">${esc(f.plot)}</p>
      <div class="actions" ${aList.attr}>
        <a class="btn btn-primary" href="detalle.html?id=${f.media_id}">${ICON.play} Reproducir</a>
        <button class="btn btn-ghost" data-toggle-list>${inList ? ICON.check + " En mi lista" : ICON.plus + " Mi lista"}</button>
        <a class="btn btn-ghost btn-icon" href="detalle.html?id=${f.media_id}" aria-label="Más información">${ICON.info}</a>
      </div>
    </div>
  </section>

  ${H.continue_watching.length ? `
  <section class="section" ${aCont.attr}>
    <div class="section-head"><h2 class="section-title">Seguir viendo</h2><span class="section-sub">Continuá donde lo dejaste</span></div>
    <div class="row wide">
      ${H.continue_watching.map((c) => { const a = artVars(asMedia(c)); return `
        <a class="card continue" href="detalle.html?id=${c.media_id}">
          <div class="thumb art" style="${a.style};--x1:70%;--y1:30%" data-motif="${a.motif}" data-font="${a.font}"><div class="poster-title">${esc(c.title)}</div></div>
          <div class="progress"><span style="width:${c.progress}%"></span></div>
          <div class="card-info"><div class="card-meta"><span>${esc(episodeLabel(c))}</span><span>${c.progress}%</span></div></div>
        </a>`; }).join("")}
    </div>
  </section>` : ""}

  <section class="section" ${aTop.attr}>
    <div class="section-head"><h2 class="section-title">Top 10 de la semana</h2><span class="section-sub">Según reproducciones de los últimos 7 días</span></div>
    <div class="row top">
      ${H.top10.map((t, i) => `
        <a class="card top-card" href="detalle.html?id=${t.media_id}"><span class="top-num">${i + 1}</span>${poster(asMedia(t))}</a>`).join("")}
    </div>
  </section>

  <section class="section" ${aRecent.attr}>
    <div class="section-head"><h2 class="section-title">Recién agregadas</h2><a class="link-more" href="genero.html?sort=recent">Ver todo</a></div>
    <div class="row">${H.recent.map((c) => mediaCard(asMedia(c))).join("")}</div>
  </section>

  <section class="section" ${aFav.attr}>
    <div class="section-head"><h2 class="section-title">Porque te gusta ${esc(H.because_you_like.genre_name)}</h2><a class="link-more" href="genero.html?id=${H.because_you_like.genre_id}">Ver todo</a></div>
    <div class="row">${H.because_you_like.items.map((c) => mediaCard(asMedia(c))).join("")}</div>
  </section>

  <section class="section" ${aSeries.attr}>
    <div class="section-head"><h2 class="section-title">Series para maratonear</h2><a class="link-more" href="genero.html?type=series">Ver todo</a></div>
    <div class="row">${H.series.map((c) => mediaCard(asMedia(c), { sub: `${c.seasons_count} temp. · ${c.release_year}` })).join("")}</div>
  </section>

  <section class="section" ${aGenres.attr}>
    <div class="section-head"><h2 class="section-title">Explorar por género</h2></div>
    <div class="genre-grid">${H.genres.map((g) => `<a class="genre-tile" href="genero.html?id=${g._id}" style="--g:${g.color}">${esc(g.name)}</a>`).join("")}</div>
  </section>`;

  app.querySelector("[data-toggle-list]").onclick = (e) => {
    const b = e.currentTarget, on = !b.dataset.on;
    b.dataset.on = on ? "1" : "";
    b.innerHTML = on ? ICON.check + " En mi lista" : ICON.plus + " Mi lista";
  };
  if (inList) app.querySelector("[data-toggle-list]").dataset.on = "1";
}

/* ======================================================================
   DETALLE (película o serie)
   ====================================================================== */
function renderDetail(app) {
  const m = MEDIA[params.get("id")] ?? DB.media.find((x) => x.is_featured);
  document.title = `${m.title} · Fotograma`;
  const reviews = DB.reviews.filter((r) => r.media_id === m._id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const similar = DB.media
    .filter((x) => x._id !== m._id && x.genre_ids.some((g) => m.genre_ids.includes(g)))
    .sort((a, b) => b.rating.avg - a.rating.avg).slice(0, 10);
  const inList = ME.watchlist.includes(m._id);
  const lastView = DB.views.find((v) => v.user_id === ME._id && v.media_id === m._id);
  const totalEps = m.type === "series" ? m.seasons.reduce((n, s) => n + s.episodes.length, 0) : 0;

  const aDoc = ann({ col: "media", title: "Documento del título", short: `findOne({ _id: ObjectId("…${m._id.slice(-4)}") })`,
    q: `db.media.findOne({ _id: ${oid(m._id)} })`,
    why: "La pantalla de detalle se arma con un único findOne. Director, reparto y (si es serie) temporadas y episodios están embebidos porque siempre se muestran junto con el título.",
    docs: () => [m] });

  app.innerHTML = `
  <section class="hero detail-hero" ${aDoc.attr}>
    ${backdrop(m)}
    <div class="detail-grid">
      ${poster(m, "lg")}
      <div>
        <span class="eyebrow">${typeLabel(m)}</span>
        <h1 class="detail-title">${esc(m.title)}</h1>
        ${m.original_title ? `<div class="original">${esc(m.original_title)}</div>` : ""}
        <div class="meta">${mediaMeta(m).join('<span class="dot"></span>')}${m.type === "series" ? `<span class="dot"></span>${totalEps} episodios` : ""}</div>
        <div class="chips">${m.genre_ids.map(genreChip).join("")}</div>
        <div class="rating-big"><span class="num">★ ${m.rating.avg.toFixed(1)}</span><div><b>de 10</b><small>${nf.format(m.rating.count)} reseñas</small></div></div>
        <p class="hero-plot" style="-webkit-line-clamp:4">${esc(m.plot)}</p>
        <div class="actions" ${ann({ col: "users", title: "Agregar / quitar de Mi lista", short: inList ? "updateOne({ $pull: { watchlist } })" : "updateOne({ $push: { watchlist } })",
          q: `// agregar (solo si todavía no está en la lista)
db.users.updateOne({ _id: ${oid(ME._id)}, watchlist: { $ne: ${oid(m._id)} } },
  { $push: { watchlist: ${oid(m._id)} } })

// quitar
db.users.updateOne({ _id: ${oid(ME._id)} },
  { $pull: { watchlist: ${oid(m._id)} } })`,
          why: "Operadores de arrays vistos en clase: $push agrega el elemento y $pull lo quita. El filtro con $ne evita agregarlo dos veces.",
          docs: () => [{ _id: ME._id, watchlist: ME.watchlist }] }).attr}>
          <button class="btn btn-primary">${ICON.play} ${lastView ? "Continuar" : "Reproducir"}</button>
          <button class="btn btn-ghost" data-toggle-list>${inList ? ICON.check + " En mi lista" : ICON.plus + " Mi lista"}</button>
        </div>
        <dl class="credits">
          <div><dt>${m.type === "movie" ? "Dirección" : "Creación"}</dt><dd>${m.directors.map((d) => `<a href="persona.html?id=${d.person_id}">${esc(d.name)}</a>`).join(", ")}</dd></div>
          <div><dt>Protagonistas</dt><dd>${m.cast.slice(0, 3).map((c) => `<a href="persona.html?id=${c.person_id}">${esc(c.name)}</a>`).join(", ")}</dd></div>
        </dl>
      </div>
    </div>
  </section>

  <div class="section two-col">
    <div class="stack" style="gap:44px">
      ${m.type === "series" ? `
      <div ${ann({ col: "media", title: "Temporadas y episodios", short: "seasons (embebido, solo si type = \"series\")",
        q: `// No hay consulta extra: seasons viene en el mismo findOne del título
db.media.findOne({ _id: ${oid(m._id)} })`,
        why: "Las temporadas y episodios de una serie son pocos y acotados (relación uno a pocos), y nunca se consultan fuera de su serie, por eso se embeben. Es la parte polimórfica del documento.",
        docs: () => [{ _id: m._id, type: m.type, seasons: [m.seasons[0]] }] }).attr}>
        <div class="section-head"><h2 class="section-title">Episodios</h2></div>
        <div class="seasons-tabs">${m.seasons.map((s, i) => `<button class="tab-btn ${i === 0 ? "active" : ""}" data-season="${i}">Temporada ${s.number}</button>`).join("")}</div>
        <div class="episodes" id="episodes"></div>
      </div>` : ""}

      <div ${ann({ col: "media", title: "Reparto", short: "directors + cast (embebidos: person_id + name)",
        q: `// Directores y reparto vienen embebidos en el documento de media
// (patrón de referencia extendida):
//   directors: [ { person_id, name } ]
//   cast:      [ { person_id, name, character } ]
// Al hacer click en una persona:
db.people.findOne({ _id: ${oid(m.cast[0].person_id)} })`,
        why: "Se copia el nombre de la persona dentro de media para no hacer un $lookup a people en cada detalle. El person_id permite navegar a la ficha completa. Es una relación muchos a muchos: una persona trabaja en muchos títulos y un título tiene muchas personas.",
        docs: () => [{ _id: m._id, directors: m.directors, cast: m.cast }] }).attr}>
        <div class="section-head"><h2 class="section-title">Reparto</h2></div>
        <div class="row cast-row">
          ${[...m.directors.map((d) => ({ ...d, character: m.type === "movie" ? "Dirección" : "Creación" })), ...m.cast].map((c) => `
            <a class="person-card" href="persona.html?id=${c.person_id}">${portrait(c.name)}<div class="person-name">${esc(c.name)}</div><div class="person-role">${esc(c.character)}</div></a>`).join("")}
        </div>
      </div>

      <div ${ann({ col: "reviews", title: "Reseñas del título", short: "find({ media_id }).sort({ created_at: -1 }).limit(10)",
        q: `db.reviews.find({ media_id: ${oid(m._id)} })
  .sort({ created_at: -1 })
  .limit(10)

// índice: { media_id: 1, created_at: -1 }`,
        why: "Las reseñas van en su propia colección porque un título popular puede tener miles (relación uno a muchos sin límite). Cada reseña guarda una copia del username y avatar, así no hace falta consultar users para mostrarlas.",
        docs: () => reviews, docsLabel: "Documentos de reviews" }).attr}>
        <div class="section-head">
          <h2 class="section-title">Reseñas <span class="section-sub">· ${nf.format(m.rating.count)}</span></h2>
          <button class="btn btn-ghost btn-sm" ${ann({ col: "reviews", title: "Escribir una reseña", short: "insertOne() + recalcular rating",
            q: `// 1) guardar la reseña (índice único { media_id: 1, user_id: 1 }:
//    un usuario reseña cada título una sola vez)
db.reviews.insertOne({
  media_id: ${oid(m._id)},
  user_id: ${oid(ME._id)},
  user: { username: "${ME.username}", avatar: "${ME.avatar}" },
  rating: 9,
  comment: "…",
  created_at: new Date()
})

// 2) recalcular promedio y cantidad de reseñas del título
db.reviews.aggregate([
  { $match: { media_id: ${oid(m._id)} } },
  { $group: { _id: "$media_id",
              avg: { $avg: "$rating" }, count: { $sum: 1 } } }
])

// 3) guardar el resultado en media (patrón computado)
db.media.updateOne({ _id: ${oid(m._id)} },
  { $set: { "rating.avg": 8.4, "rating.count": 3121 } })`,
            why: "media.rating es un valor precalculado: se lee en cada card del catálogo y solo cambia cuando entra una reseña. Es más barato recalcularlo al escribir que promediar miles de reseñas en cada lectura.",
            docs: () => [{ _id: m._id, rating: m.rating }] }).attr}>${ICON.pen} Escribir reseña</button>
        </div>
        ${reviews.length ? `<div class="reviews">${reviews.map((r) => `
          <article class="review">
            <div class="review-head">${avatar(r.user.username)}<div><div class="who">${esc(r.user.username)}</div><div class="when">${fmtDate(r.created_at)}</div></div>
              <span class="review-score">${r.rating}<small>/10</small></span></div>
            <p>${esc(r.comment)}</p>
          </article>`).join("")}</div>`
        : `<div class="empty">Todavía no hay reseñas de la comunidad para este título.</div>`}
      </div>
    </div>

    <aside class="stack" style="gap:16px">
      <div class="panel">
        <h3>Ficha</h3>
        <div class="facts">
          <div><span>Tipo</span><span>${typeLabel(m)}</span></div>
          <div><span>Estreno</span><span>${m.release_year}</span></div>
          ${m.type === "movie" ? `<div><span>Duración</span><span>${fmtRuntime(m.runtime_min)}</span></div>` : `<div><span>Temporadas</span><span>${m.seasons.length}</span></div><div><span>Episodios</span><span>${totalEps}</span></div>`}
          <div><span>Géneros</span><span>${m.genre_ids.map((g) => GENRES[g].name).join(", ")}</span></div>
          <div><span>En Fotograma desde</span><span>${fmtDate(m.created_at)}</span></div>
        </div>
      </div>
      ${lastView ? `
      <div class="panel" ${ann({ col: "views", title: "Tu última reproducción", short: 'find({ user_id, media_id }).sort({ started_at: -1 })',
        q: `db.views.find({ user_id: ${oid(ME._id)},
                media_id: ${oid(m._id)} })
  .sort({ started_at: -1 })
  .limit(1)`,
        why: "Filtra por usuario y título, y ordena por fecha: usa el índice views_por_usuario { user_id: 1, started_at: -1 }.",
        docs: () => [lastView] }).attr}>
        <h3>Tu actividad</h3>
        <div style="font-weight:600">${esc(viewLabel(lastView, m))}</div>
        <div class="progress"><span style="width:${viewProgress(lastView, m)}%"></span></div>
        <div class="card-meta" style="margin-top:8px">${lastView.completed ? "Terminado" : `Viste ${lastView.minutes} min`} · ${fmtDate(lastView.started_at)}</div>
      </div>` : ""}
    </aside>
  </div>

  <section class="section" ${ann({ col: "media", title: "Títulos similares", short: "find({ genre_ids: { $in: […] }, _id: { $ne } })",
    q: `db.media.find(
  { genre_ids: { $in: ${JSON.stringify(m.genre_ids).replace(/,/g, ", ")} },
    _id: { $ne: ${oid(m._id)} } },
  ${CARD_PROJ}
).sort({ "rating.avg": -1 }).limit(10)`,
    why: "$in sobre un campo array devuelve los títulos que comparten al menos un género; $ne excluye el título actual.",
    docs: () => similar.slice(0, 1) }).attr}>
    <div class="section-head"><h2 class="section-title">Si te gustó ${esc(m.title)}</h2></div>
    <div class="row">${similar.map((x) => mediaCard(x)).join("")}</div>
  </section>`;

  // temporadas
  if (m.type === "series") {
    const box = app.querySelector("#episodes");
    const show = (i) => {
      box.innerHTML = m.seasons[i].episodes.map((e) => `
        <div class="episode"><span class="n">${e.number}</span><div><div class="t">${esc(e.title)}</div><div class="d">Temporada ${m.seasons[i].number} · ${m.seasons[i].year}</div></div><span class="d">${e.runtime_min} min</span></div>`).join("");
      app.querySelectorAll("[data-season]").forEach((b) => b.classList.toggle("active", +b.dataset.season === i));
    };
    app.querySelectorAll("[data-season]").forEach((b) => (b.onclick = () => show(+b.dataset.season)));
    show(0);
  }
  const tl = app.querySelector("[data-toggle-list]");
  tl.dataset.on = inList ? "1" : "";
  tl.onclick = () => {
    const on = !tl.dataset.on;
    tl.dataset.on = on ? "1" : "";
    tl.innerHTML = on ? ICON.check + " En mi lista" : ICON.plus + " Mi lista";
  };
}

/* ======================================================================
   PERSONA (actor / director)
   ====================================================================== */
function renderPerson(app) {
  const p = PEOPLE[params.get("id")] ?? PEOPLE[DB.people[9]._id];
  document.title = `${p.name} · Fotograma`;
  const works = DB.media
    .filter((m) => m.directors.some((d) => d.person_id === p._id) || m.cast.some((c) => c.person_id === p._id))
    .sort((a, b) => b.release_year - a.release_year);
  const asCast = works.filter((m) => m.cast.some((c) => c.person_id === p._id));
  const asDir = works.filter((m) => m.directors.some((d) => d.person_id === p._id));
  const age = Math.floor((NOW - new Date(p.birth_date)) / (365.25 * 864e5));
  const avg = works.length ? works.reduce((s, m) => s + m.rating.avg, 0) / works.length : 0;
  const role = (m) => {
    const c = m.cast.find((x) => x.person_id === p._id);
    return c ? `como ${c.character}` : m.type === "movie" ? "Dirección" : "Creación";
  };

  app.innerHTML = `
  <div class="page-top"></div>
  <section class="person-hero" ${ann({ col: "people", title: "Ficha de la persona", short: `findOne({ _id: ObjectId("…${p._id.slice(-4)}") })`,
    q: `db.people.findOne({ _id: ${oid(p._id)} })`,
    why: "people guarda los datos que solo se muestran en esta ficha (biografía, fecha y país de nacimiento). En media quedan solo person_id y name, que es lo que se muestra en las cards.",
    docs: () => [p] }).attr}>
    ${portrait(p.name)}
    <div>
      <span class="eyebrow">${esc(p.known_for)}</span>
      <h1>${esc(p.name)}</h1>
      <div class="meta"><span>${esc(p.country)}</span><span class="dot"></span><span>Nació el ${fmtDate(p.birth_date)} (${age} años)</span></div>
      <p class="bio">${esc(p.bio)}</p>
      <div class="stats" ${ann({ col: "media", title: "Estadísticas de la filmografía", short: "aggregate: $match → $project $cond → $group",
        q: `db.media.aggregate([
  { $match: { "cast.person_id": ${oid(p._id)} } },
  { $project: {
      rating: "$rating.avg",
      esSerie: { $cond: { if: { $eq: ["$type", "series"] }, then: 1, else: 0 } }
  } },
  { $group: {
      _id: null,
      titulos: { $sum: 1 },
      series:  { $sum: "$esSerie" },
      rating_promedio: { $avg: "$rating" }
  } }
])`,
        why: "$project con $cond marca cada título con 1 si es serie y 0 si no; $group con _id: null reúne todo en un resultado y suma esas marcas.",
        docs: () => [{ _id: null, titulos: works.length, series: works.filter((m) => m.type === "series").length, rating: +avg.toFixed(2) }], docsLabel: "Resultado" }).attr}>
        <div class="stat"><b>${works.length}</b><span>Títulos</span></div>
        ${asCast.length ? `<div class="stat"><b>${asCast.length}</b><span>Actuación</span></div>` : ""}
        ${asDir.length ? `<div class="stat"><b>${asDir.length}</b><span>Dirección</span></div>` : ""}
        <div class="stat"><b>★ ${avg.toFixed(1)}</b><span>Rating promedio</span></div>
      </div>
    </div>
  </section>

  <section class="section" style="margin-top:56px" ${ann({ col: "media", title: "Filmografía", short: `find({ "cast.person_id" }) + find({ "directors.person_id" })`,
    q: `// títulos donde actuó
db.media.find({ "cast.person_id": ${oid(p._id)} },
              { title: 1, poster: 1, release_year: 1, cast: 1 })
  .sort({ release_year: -1 })

// títulos que dirigió
db.media.find({ "directors.person_id": ${oid(p._id)} },
              { title: 1, poster: 1, release_year: 1 })
  .sort({ release_year: -1 })

// índices: { "cast.person_id": 1 }  (multikey)
//          { "directors.person_id": 1 }  (multikey)`,
    why: "Es el otro lado de la relación muchos a muchos: no hace falta guardar en people la lista de títulos, porque un índice multikey sobre cast.person_id encuentra todos los títulos de una persona.",
    docs: () => works.slice(0, 1) }).attr}>
    <div class="section-head"><h2 class="section-title">Filmografía en Fotograma</h2><span class="section-sub">${works.length} títulos</span></div>
    <div class="grid">${works.map((m) => `
      <a class="card" href="detalle.html?id=${m._id}">${poster(m)}
        <div class="card-info"><div class="card-title">${esc(m.title)}</div>
          <div class="card-meta">${stars(m.rating.avg)}<span>${m.release_year} · ${typeLabel(m)}</span></div>
          <span class="role-tag">${esc(role(m))}</span></div></a>`).join("")}</div>
  </section>`;
}

/* ======================================================================
   EXPLORAR / GÉNERO
   ====================================================================== */
function renderGenre(app) {
  const g = GENRES[params.get("id")];
  const state = { type: params.get("type") ?? "all", sort: params.get("sort") ?? "rating" };
  const title = g ? g.name : state.type === "movie" ? "Películas" : state.type === "series" ? "Series" : "Explorar";
  document.title = `${title} · Fotograma`;
  const SORTS = { rating: ['"rating.avg": -1', (a, b) => b.rating.avg - a.rating.avg], recent: ["created_at: -1", (a, b) => b.created_at.localeCompare(a.created_at)], year: ["release_year: -1", (a, b) => b.release_year - a.release_year] };

  const aHead = g ? ann({ col: "genres", title: "Encabezado del género", short: `findOne({ _id: "${g._id}" })`,
    q: `db.genres.findOne({ _id: "${g._id}" })`,
    why: "El _id del género es un slug legible, por eso también se usa en la URL: genero.html?id=" + g._id,
    docs: () => [g] }) : null;

  app.innerHTML = `
  <section class="genre-hero" style="--g:${g ? g.color : "#ff3d6b"}" ${aHead ? aHead.attr : ""}>
    <span class="eyebrow">${g ? "Género" : "Catálogo"}</span>
    <h1>${esc(title)}</h1>
    <p>${esc(g ? g.description : "Todo el catálogo de Fotograma, filtrado y ordenado a tu manera.")}</p>
  </section>
  <div class="toolbar">
    <div class="segmented" data-group="type">
      ${[["all", "Todo"], ["movie", "Películas"], ["series", "Series"]].map(([k, l]) => `<button data-v="${k}">${l}</button>`).join("")}
    </div>
    <div class="segmented" data-group="sort">
      ${[["rating", "Mejor valoradas"], ["recent", "Recién agregadas"], ["year", "Estreno"]].map(([k, l]) => `<button data-v="${k}">${l}</button>`).join("")}
    </div>
  </div>
  <div class="section" style="margin-top:22px">
    <div class="genre-chips" style="margin-bottom:28px">${DB.genres.map((x) => `<a class="chip" href="genero.html?id=${x._id}${state.type !== "all" ? `&type=${state.type}` : ""}" style="--g:${x.color};${g && x._id === g._id ? "background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.35)" : ""}">${esc(x.name)}</a>`).join("")}</div>
    <div id="results"></div>
  </div>`;

  const results = app.querySelector("#results");
  const draw = () => {
    const filter = [];
    if (g) filter.push(`genre_ids: "${g._id}"`);
    if (state.type !== "all") filter.push(`type: "${state.type}"`);
    const items = DB.media.filter((m) => (!g || m.genre_ids.includes(g._id)) && (state.type === "all" || m.type === state.type)).sort(SORTS[state.sort][1]);
    const f = filter.length ? `{ ${filter.join(", ")} }` : "{}";
    results.innerHTML = `<div ${ann({ col: "media", title: "Resultados", short: `find(${f}).sort({ ${SORTS[state.sort][0]} })`,
      q: `db.media.find(${f}, ${CARD_PROJ})
  .sort({ ${SORTS[state.sort][0]} })
  .skip(0).limit(24)   // paginado

// índice compuesto que cubre filtro + orden:
// { genre_ids: 1, type: 1, "rating.avg": -1 }`,
      why: "Los filtros de la barra se traducen directamente al documento de consulta. Esta es una de las consultas que conviene medir con explain(\"executionStats\") con y sin índice.",
      docs: () => items.slice(0, 1) }).attr}>
      <div class="section-head"><span class="section-sub">${items.length} ${items.length === 1 ? "título" : "títulos"}</span></div>
      ${items.length ? `<div class="grid">${items.map((m) => mediaCard(m)).join("")}</div>` : `<div class="empty">No hay títulos con estos filtros.</div>`}
    </div>`;
    app.querySelectorAll(".segmented").forEach((s) => s.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.v === state[s.dataset.group])));
    decorate(results);
  };
  app.querySelectorAll(".segmented button").forEach((b) => (b.onclick = () => { state[b.parentElement.dataset.group] = b.dataset.v; draw(); }));
  draw();
}

/* ======================================================================
   PERFIL
   ====================================================================== */
function renderProfile(app) {
  const list = ME.watchlist.map((id) => MEDIA[id]);
  const myReviews = DB.reviews.filter((r) => r.user_id === ME._id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const myViews = DB.views.filter((v) => v.user_id === ME._id).sort((a, b) => b.started_at.localeCompare(a.started_at));
  const hours = myViews.reduce((s, v) => s + v.minutes, 0) / 60;
  const safeUser = Object.fromEntries(Object.entries(ME).filter(([k]) => k !== "password_hash"));
  const TABS = { lista: "Mi lista", historial: "Historial", resenas: "Mis reseñas", cuenta: "Cuenta" };
  const counts = { lista: list.length, resenas: myReviews.length };

  app.innerHTML = `
  <section class="profile-head" ${ann({ col: "users", title: "Documento del usuario", short: "findOne({ _id }, { password_hash: 0 })",
    q: `db.users.findOne(
  { _id: ${oid(ME._id)} },
  { password_hash: 0 }   // nunca se envía al cliente
)`,
    why: "Un solo documento tiene todo lo que muestran el encabezado y la pestaña Cuenta: los datos personales, la suscripción y los métodos de pago están embebidos porque son pocos y pertenecen solo a este usuario.",
    docs: () => [safeUser] }).attr}>
    <div class="profile-card">
      ${avatar(ME.username)}
      <div>
        <span class="plan">★ ${esc(ME.subscription.plan)}</span>
        <h1 style="margin:8px 0 6px">${esc(ME.username)}</h1>
        <div class="meta"><span>${esc(ME.country)}</span><span class="dot"></span><span>Miembro desde ${fmtDate(ME.created_at)}</span></div>
        <div class="chips" style="margin-top:12px">${ME.favorite_genre_ids.map(genreChip).join("")}</div>
      </div>
      <div class="stats" style="margin:0" ${ann({ col: "views", title: "Horas vistas en el último mes", short: "aggregate: $match → $group $sum minutes",
        q: `db.views.aggregate([
  { $match: { user_id: ${oid(ME._id)},
              started_at: { $gte: ISODate("${isoDaysAgo(30)}") } } },
  { $group: { _id: null,
              minutos: { $sum: "$minutes" },
              sesiones: { $sum: 1 } } },
  { $project: { _id: 0, sesiones: 1,
                horas: { $divide: ["$minutos", 60] } } }
])`,
        why: "$match por usuario y rango de fechas, y $group para sumar los minutos. El resultado se muestra en el encabezado del perfil.",
        docs: () => [{ sesiones: myViews.length, horas: +hours.toFixed(1) }], docsLabel: "Resultado" }).attr}>
        <div class="stat"><b>${hours.toFixed(1)}</b><span>Horas este mes</span></div>
        <div class="stat"><b>${myReviews.length}</b><span>Reseñas</span></div>
        <div class="stat"><b>${list.length}</b><span>En mi lista</span></div>
      </div>
    </div>
    <div class="tabs" role="tablist">${Object.entries(TABS).map(([k, l]) => `<button data-tab="${k}" role="tab">${l}${counts[k] != null ? `<span class="count">${counts[k]}</span>` : ""}</button>`).join("")}</div>
  </section>
  <div class="tab-panel" id="panel"></div>`;

  const panel = app.querySelector("#panel");
  const PANELS = {
    lista: () => `<div ${ann({ col: ["users", "media"], title: "Mi lista", short: "aggregate: $match → $lookup (watchlist → media)",
      q: `db.users.aggregate([
  { $match: { _id: ${oid(ME._id)} } },
  { $lookup: {
      from: "media",
      localField: "watchlist",      // array de ObjectId
      foreignField: "_id",
      as: "items"
  } },
  { $project: { _id: 0, "items.title": 1, "items.poster": 1,
                "items.release_year": 1, "items.rating.avg": 1 } }
])`,
      why: "watchlist guarda solo referencias porque la lista crece con el uso. $lookup busca en media cada _id del array y devuelve los títulos en items.",
      docs: () => [{ _id: ME._id, watchlist: ME.watchlist }] }).attr}>
      <div class="grid">${list.map((m) => mediaCard(m)).join("")}</div></div>`,

    historial: () => {
      const days = {};
      myViews.forEach((v) => (days[v.started_at.slice(0, 10)] ??= []).push(v));
      return `<div ${ann({ col: ["views", "media"], title: "Historial de reproducción", short: "aggregate: $match started_at → $sort → $lookup",
        q: `db.views.aggregate([
  { $match: { user_id: ${oid(ME._id)},
              started_at: { $gte: ISODate("${isoDaysAgo(30)}") } } },
  { $sort: { started_at: -1 } },
  { $lookup: { from: "media", localField: "media_id",
               foreignField: "_id", as: "media" } },
  { $project: { started_at: 1, episode: 1, minutes: 1, completed: 1,
                "media.title": 1, "media.poster": 1 } }
])`,
        why: "Lo \"visto\" no se guarda como una lista en users (crecería sin límite): se obtiene de views. Así el historial tiene fecha, duración y episodio de cada sesión.",
        docs: () => myViews, docsLabel: "Documentos de views" }).attr}>
        <div class="history">${Object.entries(days).map(([d, vs]) => `
          <div class="history-day"><h4>${fmtDate(d + "T12:00:00Z")}</h4>
            ${vs.map((v) => { const m = MEDIA[v.media_id]; return `
              <a class="history-item" href="detalle.html?id=${m._id}">${poster(m, "sm")}
                <div><div class="t">${esc(m.title)}</div><div class="s">${esc(viewLabel(v, m))}</div></div>
                <div class="time">${v.started_at.slice(11, 16)} · ${v.minutes} min<br><span class="pill ${v.completed ? "ok" : "mid"}">${v.completed ? "Terminado" : `${viewProgress(v, m)}%`}</span></div>
              </a>`; }).join("")}
          </div>`).join("")}</div></div>`;
    },

    resenas: () => `<div ${ann({ col: ["reviews", "media"], title: "Mis reseñas", short: "aggregate: $match user_id → $lookup media",
      q: `db.reviews.aggregate([
  { $match: { user_id: ${oid(ME._id)} } },
  { $sort: { created_at: -1 } },
  { $lookup: { from: "media", localField: "media_id",
               foreignField: "_id", as: "media" } },
  { $project: { rating: 1, comment: 1, created_at: 1,
                "media.title": 1, "media.poster": 1 } }
])

// índice: { user_id: 1, created_at: -1 }`,
      why: "La misma colección reviews se consulta desde dos lados: por media_id en el detalle y por user_id en el perfil. Por eso tiene dos índices compuestos.",
      docs: () => myReviews, docsLabel: "Documentos de reviews" }).attr}>
      <div class="reviews" style="max-width:820px">${myReviews.map((r) => { const m = MEDIA[r.media_id]; return `
        <article class="review">
          <a class="on" href="detalle.html?id=${m._id}">${poster(m, "sm")}<div><div class="who">${esc(m.title)}</div><div class="when">${fmtDate(r.created_at)}</div></div><span class="review-score">${r.rating}<small>/10</small></span></a>
          <p>${esc(r.comment)}</p>
        </article>`; }).join("")}</div></div>`,

    cuenta: () => `<div class="account" ${ann({ col: "users", title: "Cuenta y pagos", short: "subdocumentos embebidos en users",
      q: `// Se leen del mismo documento (findOne del encabezado).
// Ejemplo de modificación: cambiar de plan.
// La notación con punto modifica campos del subdocumento.
db.users.updateOne(
  { _id: ${oid(ME._id)} },
  { $set: { "subscription.plan": "Estándar",
            "subscription.billing": "mensual" } }
)`,
      why: "subscription es un subdocumento (uno a uno) y payment_methods es un array chico (uno a pocos). Los dos se embeben porque pertenecen solo a este usuario y se muestran en su perfil.",
      docs: () => [{ _id: ME._id, subscription: ME.subscription, payment_methods: ME.payment_methods }] }).attr}>
      <div class="panel"><h3>Suscripción</h3><div class="facts">
        <div><span>Plan</span><span>${esc(ME.subscription.plan)}</span></div>
        <div><span>Facturación</span><span style="text-transform:capitalize">${esc(ME.subscription.billing)}</span></div>
        <div><span>Próxima renovación</span><span>${fmtDate(ME.subscription.renewal_date)}</span></div></div></div>
      <div class="panel"><h3>Métodos de pago</h3>${ME.payment_methods.map((p) => `
        <div class="pay"><span class="pay-logo" style="background:${p.type === "card" ? "#1a1f71" : "#00b1ea"};color:#fff">${p.type === "card" ? p.brand.toUpperCase() : "MP"}</span>
          <div style="flex:1"><div style="font-weight:600">${p.type === "card" ? `${p.brand} •••• ${p.last4}` : "Mercado Pago"}</div><div class="card-meta">${p.type === "card" ? `Vence ${p.expiry}` : esc(p.email)}</div></div>
          ${p.is_default ? '<span class="pill ok">Principal</span>' : ""}</div>`).join("")}</div>
      <div class="panel"><h3>Datos personales</h3><div class="facts">
        <div><span>Email</span><span>${esc(ME.email)}</span></div>
        <div><span>País</span><span>${esc(ME.country)}</span></div>
        <div><span>Nacimiento</span><span>${fmtDate(ME.birth_date)}</span></div></div></div>
    </div>`,
  };

  const show = (k) => {
    panel.innerHTML = PANELS[k]();
    app.querySelectorAll("[data-tab]").forEach((b) => { b.classList.toggle("active", b.dataset.tab === k); b.setAttribute("aria-selected", b.dataset.tab === k); });
    decorate(panel);
    history.replaceState(null, "", "#" + k);
  };
  app.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => show(b.dataset.tab)));
  show(TABS[location.hash.slice(1)] ? location.hash.slice(1) : "lista");
}

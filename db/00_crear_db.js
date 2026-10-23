// =============================================================================
// 00 · Creación de la base de datos y las colecciones
//
// Borra la base "fotograma" (si existe) y crea las 7 colecciones de forma
// explícita. Crearlas explícitamente (en vez de dejar que se creen al primer
// insert) permite:
//   - definir reglas de validación ($jsonSchema) para cada colección
//
// Uso:  mongosh db/00_crear_db.js
// =============================================================================

if (typeof CONFIG === "undefined") load(__dirname + "/config.js");
if (typeof titulo === "undefined") load(__dirname + "/lib/utilidades.js");

// Bloque propio: setup.js carga todos los scripts en el mismo contexto y así
// las constantes de un script no chocan con las de otro.
{

db = db.getSiblingDB(CONFIG.dbName);
titulo(`Creando la base "${CONFIG.dbName}"`);

db.dropDatabase();
paso("base anterior eliminada");

// Esquema de un número entre min y max (int, long o double)
const numero = (min, max) => ({ bsonType: "number", minimum: min, maximum: max });
const texto = (extra = {}) => ({ bsonType: "string", minLength: 1, ...extra });

// Opciones comunes: los documentos que no cumplen el esquema se rechazan
const validacion = (schema) => ({
  validator: { $jsonSchema: schema },
  validationLevel: "strict",
  validationAction: "error",
});

// -----------------------------------------------------------------------------
// genres — catálogo chico; _id es un slug legible ("ciencia-ficcion")
// -----------------------------------------------------------------------------
db.createCollection("genres", validacion({
  bsonType: "object",
  required: ["_id", "name", "color"],
  properties: {
    _id: texto({ pattern: "^[a-z0-9]+(-[a-z0-9]+)*$", description: "slug: minúsculas y guiones" }),
    name: texto(),
    color: texto({ pattern: "^#[0-9a-fA-F]{6}$" }),
    description: { bsonType: "string" },
  },
}));
paso("genres");

// -----------------------------------------------------------------------------
// people — actores y directores
// -----------------------------------------------------------------------------
db.createCollection("people", validacion({
  bsonType: "object",
  required: ["name", "known_for"],
  properties: {
    name: texto(),
    known_for: { enum: ["Actuación", "Dirección"] },
    birth_date: { bsonType: "date" },
    country: { bsonType: "string" },
    bio: { bsonType: "string" },
    photo: { bsonType: "string" },
  },
}));
paso("people");

// -----------------------------------------------------------------------------
// media — películas y series (patrón polimórfico)
// El "oneOf" final obliga a que una película tenga runtime_min y una serie
// tenga seasons: la validación también refleja el polimorfismo.
// -----------------------------------------------------------------------------
const personaRef = (extraRequeridos = [], extraProps = {}) => ({
  bsonType: "object",
  required: ["person_id", "name", ...extraRequeridos],
  properties: { person_id: { bsonType: "objectId" }, name: texto(), ...extraProps },
});

db.createCollection("media", validacion({
  bsonType: "object",
  required: ["title", "type", "release_year", "plot", "genre_ids", "rating", "directors", "cast", "is_featured", "created_at"],
  properties: {
    title: texto(),
    original_title: texto(),
    type: { enum: ["movie", "series"] },
    release_year: numero(1888, 2100),
    plot: texto(),
    poster: { bsonType: "string" },
    backdrop: { bsonType: "string" },
    genre_ids: { bsonType: "array", minItems: 1, uniqueItems: true, items: { bsonType: "string" } },
    rating: {
      bsonType: "object",
      required: ["avg", "count"],
      properties: { avg: numero(0, 10), count: { bsonType: "number", minimum: 0 } },
    },
    is_featured: { bsonType: "bool" },
    created_at: { bsonType: "date" },
    directors: { bsonType: "array", minItems: 1, items: personaRef() },
    cast: { bsonType: "array", items: personaRef(["character"], { character: { bsonType: "string" } }) },
    runtime_min: numero(1, 1000),
    seasons: {
      bsonType: "array",
      minItems: 1,
      items: {
        bsonType: "object",
        required: ["number", "episodes"],
        properties: {
          number: numero(1, 100),
          year: numero(1888, 2100),
          episodes: {
            bsonType: "array",
            minItems: 1,
            items: {
              bsonType: "object",
              required: ["number", "title", "runtime_min"],
              properties: { number: numero(1, 1000), title: texto(), runtime_min: numero(1, 600) },
            },
          },
        },
      },
    },
  },
  oneOf: [
    { properties: { type: { enum: ["movie"] } }, required: ["runtime_min"], not: { required: ["seasons"] } },
    { properties: { type: { enum: ["series"] } }, required: ["seasons"], not: { required: ["runtime_min"] } },
  ],
}));
paso("media");

// -----------------------------------------------------------------------------
// users
// -----------------------------------------------------------------------------
db.createCollection("users", validacion({
  bsonType: "object",
  required: ["username", "email", "password_hash", "created_at", "subscription", "payment_methods", "favorite_genre_ids", "watchlist"],
  properties: {
    username: texto({ pattern: "^[A-Za-z0-9._]{3,30}$" }),
    email: texto({ pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" }),
    password_hash: texto(),
    avatar: { bsonType: "string" },
    birth_date: { bsonType: "date" },
    country: { bsonType: "string" },
    created_at: { bsonType: "date" },
    favorite_genre_ids: { bsonType: "array", items: { bsonType: "string" } },
    subscription: {
      bsonType: "object",
      required: ["plan", "billing", "renewal_date"],
      properties: {
        plan: { enum: ["Básico", "Estándar", "Premium"] },
        billing: { enum: ["mensual", "anual"] },
        renewal_date: { bsonType: "date" },
      },
    },
    payment_methods: {
      bsonType: "array",
      items: {
        bsonType: "object",
        required: ["type", "is_default"],
        properties: {
          type: { enum: ["card", "mercadopago", "paypal"] },
          brand: { bsonType: "string" },
          last4: { bsonType: "string", pattern: "^[0-9]{4}$" },   // nunca el número completo
          expiry: { bsonType: "string", pattern: "^(0[1-9]|1[0-2])/[0-9]{2}$" },
          email: { bsonType: "string" },
          is_default: { bsonType: "bool" },
        },
      },
    },
    watchlist: { bsonType: "array", uniqueItems: true, items: { bsonType: "objectId" } },
  },
}));
paso("users");

// -----------------------------------------------------------------------------
// reviews
// -----------------------------------------------------------------------------
db.createCollection("reviews", validacion({
  bsonType: "object",
  required: ["media_id", "user_id", "user", "rating", "created_at"],
  properties: {
    media_id: { bsonType: "objectId" },
    user_id: { bsonType: "objectId" },
    user: {
      bsonType: "object",
      required: ["username"],
      properties: { username: texto(), avatar: { bsonType: "string" } },
    },
    rating: { bsonType: "int", minimum: 1, maximum: 10 },
    comment: { bsonType: "string", maxLength: 2000 },
    created_at: { bsonType: "date" },
  },
}));
paso("reviews");

// -----------------------------------------------------------------------------
// views — reproducciones: cada documento es una sesión (quién, qué, cuándo,
// cuántos minutos). Es la colección más grande: crece con cada reproducción.
// -----------------------------------------------------------------------------
db.createCollection("views", validacion({
  bsonType: "object",
  required: ["user_id", "media_id", "started_at", "minutes", "completed"],
  properties: {
    user_id: { bsonType: "objectId" },
    media_id: { bsonType: "objectId" },
    started_at: { bsonType: "date" },
    episode: {                                   // solo si es una serie
      bsonType: "object",
      required: ["season", "number"],
      properties: { season: numero(1, 100), number: numero(1, 1000) },
    },
    minutes: numero(0, 1000),
    completed: { bsonType: "bool" },
  },
}));
paso("views");

// -----------------------------------------------------------------------------
// home — pantalla de Inicio precalculada: un documento por usuario (_id = user_id)
// con todo lo que muestra el Inicio. Se arma en 05_home.js.
// -----------------------------------------------------------------------------
const tarjeta = (extraRequeridos = [], extraProps = {}) => ({
  bsonType: "object",
  required: ["media_id", "title", "type", ...extraRequeridos],
  properties: {
    media_id: { bsonType: "objectId" },
    title: texto(),
    type: { enum: ["movie", "series"] },
    poster: { bsonType: "string" },
    release_year: numero(1888, 2100),
    rating_avg: numero(0, 10),
    seasons_count: numero(1, 100),
    ...extraProps,
  },
});
const lista = (items) => ({ bsonType: "array", items });

db.createCollection("home", validacion({
  bsonType: "object",
  required: ["generated_at", "user", "hero", "continue_watching", "top10", "recent", "series", "genres"],
  properties: {
    generated_at: { bsonType: "date" },
    user: {
      bsonType: "object",
      required: ["username", "favorite_genre_ids"],
      properties: { username: texto(), avatar: { bsonType: "string" }, favorite_genre_ids: { bsonType: "array", items: { bsonType: "string" } } },
    },
    hero: tarjeta(["plot", "genre_ids"], { plot: texto(), genre_ids: { bsonType: "array", items: { bsonType: "string" } }, backdrop: { bsonType: "string" }, runtime_min: numero(1, 1000) }),
    continue_watching: lista(tarjeta(["minutes", "progress"], {
      minutes: numero(0, 1000),
      progress: numero(0, 100),
      episode: { bsonType: "object", required: ["season", "number"], properties: { season: numero(1, 100), number: numero(1, 1000), title: texto() } },
    })),
    top10: lista(tarjeta(["views"], { views: { bsonType: "number", minimum: 1 } })),
    recent: lista(tarjeta()),
    series: lista(tarjeta()),
    because_you_like: {
      bsonType: "object",
      required: ["genre_id", "genre_name", "items"],
      properties: { genre_id: texto(), genre_name: texto(), items: lista(tarjeta()) },
    },
    genres: lista({ bsonType: "object", required: ["_id", "name", "color"], properties: { _id: texto(), name: texto(), color: texto() } }),
  },
}));
paso("home");

print(`\n  Colecciones creadas: ${db.getCollectionNames().filter((c) => !c.startsWith("system.")).sort().join(", ")}`);
}

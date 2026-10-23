# Rendimiento — Fotograma

## 1. Comandos

```js
// Crear un índice (con nombre)
db.coleccion.createIndex({ campo: 1 }, { name: "nombre_del_indice" })

// Listar los índices de una colección
db.coleccion.getIndexes()

// Eliminar un índice por su nombre
db.coleccion.dropIndex("nombre_del_indice")

// Ejecutar una consulta y ver cómo la resolvió MongoDB
// (el tiempo, en milisegundos, está en executionStats.executionTimeMillis)
db.coleccion.find().explain("executionStats")
```

---

## 2. Crear los índices

```js
// ---------------------------------------------------------------- media
db.media.createIndex({ genre_ids: 1, type: 1, "rating.avg": -1 }, { name: "media_genero_tipo_rating" })   // 1.5, 4.2
db.media.createIndex({ type: 1, "rating.avg": -1 }, { name: "media_tipo_rating" })                       // 1.6
db.media.createIndex({ created_at: -1 }, { name: "media_recientes" })                                     // 1.4
db.media.createIndex({ "cast.person_id": 1 }, { name: "media_reparto" })                                  // 3.2
db.media.createIndex({ "directors.person_id": 1 }, { name: "media_directores" })                          // 3.2
db.media.createIndex({ is_featured: 1 }, { name: "media_destacado" })                                     // 1.1

// ---------------------------------------------------------------- users
db.users.createIndex({ email: 1 }, { name: "users_email_unico", unique: true })
db.users.createIndex({ username: 1 }, { name: "users_username_unico", unique: true })

// -------------------------------------------------------------- reviews
db.reviews.createIndex({ media_id: 1, created_at: -1 }, { name: "reviews_por_titulo" })                  // 2.2
db.reviews.createIndex({ user_id: 1, created_at: -1 }, { name: "reviews_por_usuario" })                  // 5.4
db.reviews.createIndex({ media_id: 1, user_id: 1 }, { name: "reviews_titulo_usuario_unico", unique: true })

// ---------------------------------------------------------------- views
db.views.createIndex({ user_id: 1, started_at: -1 }, { name: "views_por_usuario" })                      // 2.3, 5.3
db.views.createIndex({ started_at: -1 }, { name: "views_por_fecha" })                                    // 1.3
```

El comentario de cada línea indica la consulta de `consultas.md` que usa ese índice. Los índices con `unique: true` además impiden valores repetidos: no puede haber dos usuarios con el mismo email o username, ni dos reseñas del mismo usuario para el mismo título.

---

## 3. Listar los índices

```js
db.media.getIndexes()
db.users.getIndexes()
db.reviews.getIndexes()
db.views.getIndexes()
```

Por ejemplo, `db.reviews.getIndexes()` devuelve:

```js
[
  { v: 2, key: { _id: 1 }, name: '_id_' },
  { v: 2, key: { media_id: 1, created_at: -1 }, name: 'reviews_por_titulo' },
  { v: 2, key: { user_id: 1, created_at: -1 }, name: 'reviews_por_usuario' },
  { v: 2, key: { media_id: 1, user_id: 1 }, name: 'reviews_titulo_usuario_unico', unique: true }
]
```

Índices de cada colección:

| Colección | Índices |
|---|---|
| `media` | `_id_`, `media_genero_tipo_rating`, `media_tipo_rating`, `media_recientes`, `media_reparto`, `media_directores`, `media_destacado` |
| `users` | `_id_`, `users_email_unico`, `users_username_unico` |
| `reviews` | `_id_`, `reviews_por_titulo`, `reviews_por_usuario`, `reviews_titulo_usuario_unico` |
| `views` | `_id_`, `views_por_usuario`, `views_por_fecha` |
| `genres`, `people` | solo `_id_` |

---

## 4. Eliminar los índices

```js
// ---------------------------------------------------------------- media
db.media.dropIndex("media_genero_tipo_rating")
db.media.dropIndex("media_tipo_rating")
db.media.dropIndex("media_recientes")
db.media.dropIndex("media_reparto")
db.media.dropIndex("media_directores")
db.media.dropIndex("media_destacado")

// ---------------------------------------------------------------- users
db.users.dropIndex("users_email_unico")
db.users.dropIndex("users_username_unico")

// -------------------------------------------------------------- reviews
db.reviews.dropIndex("reviews_por_titulo")
db.reviews.dropIndex("reviews_por_usuario")
db.reviews.dropIndex("reviews_titulo_usuario_unico")

// ---------------------------------------------------------------- views
db.views.dropIndex("views_por_usuario")
db.views.dropIndex("views_por_fecha")
```

El índice `_id_` no se puede eliminar.

---

## 5. Medición con `executionTimeMillis`

### `media` (3.016 documentos)

```js
db.media.find().explain("executionStats")                                                         // sin filtro

db.media.find({ is_featured: true })
  .explain("executionStats")                                                                      // 1.1

db.media.find({}).sort({ created_at: -1 })
  .explain("executionStats")                                                                      // 1.4

db.media.find({ genre_ids: "ciencia-ficcion" }).sort({ "rating.avg": -1 })
  .explain("executionStats")                                                                      // 1.5

db.media.find({ type: "series" }).sort({ "rating.avg": -1 })
  .explain("executionStats")                                                                      // 1.6

db.media.find({ "cast.person_id": ObjectId("665f0b000000000000000010") }).sort({ release_year: -1 })
  .explain("executionStats")                                                                      // 3.2

db.media.find({ "directors.person_id": ObjectId("665f0b000000000000000001") }).sort({ release_year: -1 })
  .explain("executionStats")                                                                      // 3.2

db.media.find({ genre_ids: "ciencia-ficcion", type: "movie" }).sort({ "rating.avg": -1 })
  .explain("executionStats")                                                                      // 4.2
```

### `reviews` (150.012 documentos)

```js
db.reviews.find().explain("executionStats")                                                       // sin filtro

db.reviews.find({ media_id: ObjectId("665f0a000000000000000010") }).sort({ created_at: -1 })
  .explain("executionStats")                                                                      // 2.2

db.reviews.find({ user_id: ObjectId("665f0c000000000000000001") }).sort({ created_at: -1 })
  .explain("executionStats")                                                                      // 5.4
```

### `views` (1.000.010 documentos)

```js
db.views.find().explain("executionStats")                                                         // sin filtro

db.views.find({ started_at: { $gte: ISODate("2026-09-29T12:00:00Z") } })
  .explain("executionStats")                                                                      // 1.3

db.views.find({ user_id: ObjectId("665f0c000000000000000001"), media_id: ObjectId("665f0a000000000000000010") })
  .sort({ started_at: -1 })
  .explain("executionStats")                                                                      // 2.3

db.views.find({ user_id: ObjectId("665f0c000000000000000001"), started_at: { $gte: ISODate("2026-09-06T12:00:00Z") } })
  .sort({ started_at: -1 })
  .explain("executionStats")                                                                      // 5.3
```

---

## 6. La pantalla de Inicio: varias consultas vs la colección `home`

Los índices aceleran **una** consulta. Pero el Inicio arma la pantalla con **9 consultas** a 4 colecciones (usuario, hero, géneros, top 10, seguir viendo, sus títulos, recién agregadas, recomendadas y series), y el tiempo de la pantalla es la suma de todas. La colección `home` ([`colecciones.md`](colecciones.md#7-home)) guarda la pantalla ya armada para cada usuario y se lee con una sola consulta:

```js
db.home.findOne({ _id: ObjectId("665f0c000000000000000001") })     // el Inicio completo de CineFan88
```

Se mide el tiempo total de la pantalla (promedio de 20 ejecuciones, con el mismo usuario), con `mongosh rendimiento/home.js`:

| Pantalla de Inicio | Consultas | Tiempo promedio |
|---|---|---|
| Sin `home` (hero, géneros, top 10, seguir viendo, recientes, recomendadas, series) | 9 | 514,5 ms |
| Con `home` (`db.home.findOne({ _id })`) | 1 | 3,7 ms |

- **Con los índices ya creados**, armar el Inicio sigue costando ≈ 0,5 s. La parte más pesada es el Top 10: el `$group` tiene que contar todas las reproducciones de la semana en `views`.
- `home` es unas 140 veces más rápida, porque ese trabajo se hizo **antes**, al armar el documento (`db/05_home.js`), y no cada vez que un usuario abre la aplicación.
- **Costo:** `home` ocupa ≈ 97 MB (≈ 10 KB por usuario) y tarda ≈ 78 s en armarse para los 10.006 usuarios. Es una copia: queda atrasada hasta que se regenera.

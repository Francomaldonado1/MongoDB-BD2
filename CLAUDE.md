# CLAUDE.md

## Contexto

Proyecto **individual** de *Diseño de Bases de Datos II* (Universidad de Mendoza, 2026). La aprobación es obligatoria para regularizar la materia, y se evalúa **oralmente**.

El PDF de requisitos pide:
- Requisitos y solución propuesta.
- Modelado de datos.
- Implementación en MongoDB.
- Carga de datos.
- Consultas avanzadas.
- Medición de desempeño con índices.
- Política de backups.

La teoría vista (clases en `../Teoria_mongo/*.ppsx`) cubre:
- Modelado, con la idea "primero la aplicación, después el modelo".
- CRUD y operadores de arrays.
- `aggregate`: `$match`, `$group`, `$project`, `$cond`, `$lookup`.
- Relaciones 1:1, 1:N y N:M.
- Colecciones de series temporales.
- Índices y `explain("executionStats")`.
- `mongodump`/`mongorestore` y `mongoexport`/`mongoimport`.
- MongoDB Atlas.

**Tema:** *Fotograma*, un catálogo/streaming de películas y series.

## Cómo trabajar en este repo

- **Idioma:** todo en español (código, comentarios, documentación, commits).
- **Simplicidad:** todo tiene que poder **explicarse en un oral**. Preferir soluciones simples y justificadas antes que patrones avanzados. Consultar antes de agregar colecciones o funcionalidades.
- **Orden de trabajo:** diseño y modelo primero, después la implementación.
- **Solo lo visto en clase:** las consultas usan únicamente los operadores de la teoría. Nada de `$facet`, `$unwind`, `$text`, `$merge`, `$elemMatch`, `$addToSet`, operadores posicionales, `arrayFilters`, operadores de fecha ni `$lookup` con `pipeline`. Si hace falta algo más, se resuelve con un `for` en la shell o en la aplicación, o se consulta antes.
- **Git:** commitear directo en `main`, sin ramas, y solo cuando se pida. Lo mismo para el push.
- **Coherencia:** cuando cambia el modelo, actualizar juntos `colecciones.md`, el prototipo (`interfaces/assets/data.js` y `pages.js`) y los scripts de `db/`.

## Estructura

| Ruta | Contenido |
|---|---|
| `colecciones.md` | Modelo de datos: colecciones, decisiones de embeber o referenciar, relaciones, patrones, índices y preguntas para defender el modelo |
| `interfaces/` | Prototipo navegable: Inicio, Detalle, Persona, Género y Perfil. HTML, CSS y JS sin dependencias. El botón "Ver modelo de datos" muestra la colección y la consulta de cada sección |
| `interfaces/assets/data.js` | Documentos de muestra con la forma exacta del modelo. También son la semilla de la base |
| `db/` | Scripts de mongosh que crean y cargan la base (ver `README.md`) |
| `consultas.md` | Todas las consultas (por pantalla, escrituras y analítica) con explicación y resultados reales. Es el documento de referencia |
| `consultas/` | Las mismas consultas como scripts de mongosh (`mongosh consultas/todas.js`). `6_escritura.js` deshace sus cambios al final |
| `rendimiento.md`, `rendimiento/medir.js` | Comandos `createIndex` / `getIndexes` / `dropIndex` y `explain("executionStats").executionStats.executionTimeMillis` de cada consulta sin y con índice. Formato simple, como en la clase |
| `backup.md` | `mongodump` / `mongorestore` / `mongoexport` / `mongoimport` probados, ejecutados desde la raíz del proyecto con salida en `./backup` (en `.gitignore`), y la política de backup (diario, 7 días, prueba semanal) |

## Modelo (resumen)

Base **`fotograma`**, con 7 colecciones (6 de datos y `home`):

- **`media`:** películas y series en una misma colección (patrón polimórfico, campo `type`).
  - Las películas tienen `runtime_min`; las series tienen `seasons` embebido.
  - `genre_ids` guarda slugs de `genres`.
  - `directors` y `cast` son arrays con referencia extendida (`person_id` + `name`).
  - `rating { avg, count }` se calcula desde `reviews` (patrón computado).
- **`genres`:** `_id` es un slug (`"ciencia-ficcion"`). Se filtra sin `$lookup` y renombrar un género es modificar un solo documento.
- **`people`:** actores y directores. Relación N:M con `media` mediante índices multikey.
- **`users`:** `subscription` y `payment_methods` embebidos; `watchlist` con referencias a `media`. Lo "visto" se obtiene de `views`.
- **`reviews`:** colección propia (1:N sin límite) con una copia de `username` y `avatar`. Hay un índice único en `{ media_id, user_id }`.
- **`home`:** pantalla de Inicio precalculada (patrón computado llevado a una pantalla entera). Un documento por usuario (`_id` = `user_id`) con `hero`, `continue_watching`, `top10`, `recent`, `because_you_like`, `series` y `genres`; el Inicio se resuelve con `db.home.findOne({ _id: user_id })`. Se arma con `db/05_home.js` (después de los índices) y las consultas que lo arman están en `consultas/1_inicio.js`. Es una copia: puede quedar atrasada hasta la próxima corrida. `rendimiento/home.js` compara el Inicio con y sin `home`.
- **`views`:** colección común (no serie temporal; se simplificó por tiempo): `{ user_id, media_id, started_at, episode?, minutes, completed }`. Índices `views_por_usuario { user_id: 1, started_at: -1 }` y `views_por_fecha { started_at: -1 }`.

## Base de datos local

- **Entorno:** MongoDB 8.0 corre en Docker (`docker-compose.yml`, contenedor `fotograma-mongo`) en `localhost:27017`, sin autenticación. La imagen trae mongosh y las database tools. El repo está montado en `/proyecto` (directorio de trabajo del contenedor).
- **Armado:** `docker compose exec mongo mongosh db/setup.js` recrea la base desde cero (menos de un minuto en la PC Linux; algo más en la Mac Intel con Docker).
- **Comandos de mongosh/mongodump:** en la Mac correrlos con `docker compose exec mongo ...`, porque ahí no están instalados.
- **PC Linux (andromeda):** también usa el contenedor de Docker (el servicio `mongod` nativo está deshabilitado). mongosh y las database tools sí están instalados en el host, así que se puede correr `mongosh` directo contra `localhost:27017`. En algunas redes el puerto 22 está bloqueado y `git pull/push` se cuelga: usar SSH por el puerto 443 (`ssh.github.com`).
- **Volúmenes:** se definen en `db/config.js`. Valores actuales: 4.000 personas, 3.000 títulos, 10.000 usuarios, 150.000 reseñas y 1.000.000 de reproducciones.
- **Reproducibilidad:** el generador usa una semilla fija (`CONFIG.semilla`) y una fecha "hoy" fija (`CONFIG.hoy` = 2026-10-06).
- **Índices:** `db/04_indices.js` los crea con un `createIndex(claves, { name })` explícito por índice, como en la clase. `rendimiento/medir.js` los elimina con `dropIndex`, mide, y los vuelve a crear con los mismos `createIndex`.

### Particularidades de mongosh

- **Funciones en bloques:** `setup.js` carga todos los scripts con `load()` en el mismo contexto, así que cada script envuelve su código en un bloque `{ ... }`. Dentro de esos bloques **no usar declaraciones `function f()`**, porque mongosh las saca del bloque y pierden el acceso a las constantes. Usar `const f = function () {}`.
- **Números:** los números enteros de JS se guardan como `int` (`8.0` también). En los validadores usar `bsonType: "number"`.

## Próximos pasos

1. Documento de requisitos (funcionales y no funcionales).

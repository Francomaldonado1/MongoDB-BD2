# Fotograma — Catálogo de películas y series sobre MongoDB

Proyecto de **Diseño de Bases de Datos II** (Universidad de Mendoza, 2026): implementación práctica de una solución basada en el motor documental MongoDB.

> **Origen:** este repositorio parte del proyecto original [AugustoGiuffrida/Proyecto_DB2](https://github.com/AugustoGiuffrida/Proyecto_DB2). Esta versión agrega la colección **`home`** (la pantalla de Inicio precalculada, que se lee con una sola consulta). Ver [Cambios sobre el proyecto original](#cambios-sobre-el-proyecto-original).

## Tema

Una plataforma de streaming / catálogo (estilo IMDb o Netflix) donde los usuarios exploran películas y series, las agregan a su lista, las reproducen y escriben reseñas.

El tema tiene:
- **Varias entidades:** títulos, géneros, personas, usuarios, reseñas, reproducciones y la pantalla de Inicio (`home`).
- **Todas las cardinalidades:** uno a uno, uno a pocos, uno a muchos y muchos a muchos.
- **Consultas variadas:** búsqueda por título, filtros y ordenamientos, rankings por período, `$lookup` entre colecciones y agregaciones con `$group`.
- **Volumen real para medir índices:** las reseñas y, sobre todo, las reproducciones crecen rápido.

## Proceso de diseño

Como vimos en la clase de modelado, en MongoDB **primero se diseña la aplicación y después el modelo de datos**:

1. **Interfaces** → [`interfaces/`](interfaces/): prototipo navegable de las 5 pantallas.
2. **Modelo** → [`colecciones.md`](colecciones.md): 7 colecciones (6 de datos y `home`, la pantalla de Inicio precalculada), decisiones de embeber o referenciar, relaciones, patrones e índices previstos.
3. **Consultas** → [`consultas.md`](consultas.md): todas las consultas de la aplicación por pantalla, más escrituras y reportes analíticos, con resultados reales. Los scripts ejecutables están en [`consultas/`](consultas/) (`mongosh consultas/todas.js`).
4. **Rendimiento** → [`rendimiento.md`](rendimiento.md): comandos para crear, listar y eliminar los índices (`createIndex`, `getIndexes`, `dropIndex`) y `executionTimeMillis` de cada consulta sin índice y con índice (`mongosh rendimiento/medir.js`).
5. **Backup** → [`backup.md`](backup.md): `mongodump`, `mongorestore`, `mongoexport` y `mongoimport` (ejecutados desde la raíz del proyecto, con salida en `./backup`) y la política de backup.

## Pantallas

| Pantalla | Archivo | Qué ve el usuario | Colecciones |
|---|---|---|---|
| Inicio | `index.html` | Título destacado, Seguir viendo, Top 10 de la semana, Recién agregadas, recomendadas por género favorito, series, géneros | `home` (una sola lectura; se arma desde `media` `views` `genres` `users`) |
| Detalle | `detalle.html` | Ficha completa del título, temporadas y episodios (series), reparto, reseñas, títulos similares | `media` `reviews` `views` `users` |
| Persona | `persona.html` | Biografía y filmografía de un actor o director | `people` `media` |
| Género / Explorar | `genero.html` | Catálogo filtrado por género y tipo, con orden configurable | `genres` `media` |
| Perfil | `perfil.html` | Mi lista, historial de reproducción, mis reseñas, cuenta y pagos | `users` `media` `reviews` `views` |

### Cómo ver el prototipo

Abrí `interfaces/index.html` en el navegador (doble click alcanza; no requiere servidor). Las tipografías se cargan desde Google Fonts, así que sin internet se ven con la fuente del sistema.

El botón **"Ver modelo de datos"** (abajo a la derecha) marca cada sección con la colección que la alimenta. Al hacer click en una etiqueta se abre la consulta MongoDB completa y un documento de ejemplo.

Los datos del prototipo ([`interfaces/assets/data.js`](interfaces/assets/data.js)) tienen exactamente la forma de los documentos del modelo. Los pósters son arte generado por CSS; en la base, `poster` y `backdrop` guardan la ruta de la imagen.

## Base de datos

### Con Docker (recomendado)

Requisito: Docker. El contenedor ya trae MongoDB 8, `mongosh` y las database tools (`mongodump`, `mongorestore`…).

```bash
docker compose up -d                            # levanta MongoDB en localhost:27017
docker compose exec mongo mongosh db/setup.js   # crea y carga la base
docker compose exec mongo mongosh fotograma     # abre la shell
```

- **Compass:** conectarse a `mongodb://localhost:27017`.
- **Datos:** quedan en el volumen `mongo-data`. `docker compose down` apaga sin perderlos; `docker compose down -v` los borra.
- El repo se monta en `/proyecto` dentro del contenedor, así que las rutas son las mismas que acá.

### Sin Docker

Requisitos: MongoDB 8 corriendo en `localhost:27017` y `mongosh`.

```bash
mongosh db/setup.js
```

### Qué hace `setup.js`

Crea la base **`fotograma`** desde cero (borra la anterior si existe). En una PC común tarda menos de un minuto; con Docker en una Mac Intel puede tardar unos minutos más.

| Script | Qué hace |
|---|---|
| [`db/00_crear_db.js`](db/00_crear_db.js) | Crea las 7 colecciones, todas con validación `$jsonSchema` |
| [`db/01_datos_semilla.js`](db/01_datos_semilla.js) | Carga los documentos del prototipo (16 títulos reales, sus personas, CineFan88…) |
| [`db/02_datos_masivos.js`](db/02_datos_masivos.js) | Genera datos coherentes: 4.000 personas, 3.000 títulos, 10.000 usuarios, 150.000 reseñas y 1.000.000 de reproducciones |
| [`db/03_ratings.js`](db/03_ratings.js) | Calcula `media.rating` desde las reseñas (`$group` + `updateOne`) |
| [`db/04_indices.js`](db/04_indices.js) | Crea los índices, después de la carga |
| [`db/05_home.js`](db/05_home.js) | Arma la colección `home`: un documento por usuario con la pantalla de Inicio completa (hero, seguir viendo, top 10, recientes, recomendadas, series, géneros), para leerla con un solo `findOne` |
| [`db/06_verificar.js`](db/06_verificar.js) | Muestra el volumen por colección, prueba que la validación rechace documentos inválidos, controla la integridad de las referencias y que `home` coincida con las colecciones de origen |

- **Volúmenes:** se configuran en [`db/config.js`](db/config.js).
- **Reproducibilidad:** el generador usa una semilla fija, así que cada corrida produce los mismos datos y las mediciones de rendimiento se pueden repetir.
- **Por separado:** cada script también se puede correr solo, por ejemplo `mongosh db/06_verificar.js`. `mongosh db/05_home.js` refresca la colección `home` sin recrear la base.

## La colección `home`: el Inicio con una sola lectura

El Inicio es la pantalla más visitada y tiene que ser la más rápida. Armarla con las colecciones de datos exigía **9 consultas a 4 colecciones** en cada visita (usuario, título destacado, géneros, top 10, seguir viendo, recién agregadas, recomendadas y series).

En un modelo documental el documento se diseña con la forma de lo que la aplicación lee. Por eso `home` guarda **la pantalla ya armada**, un documento por usuario (`_id` = `user_id`):

```js
db.home.findOne({ _id: userId })   // el Inicio completo
```

| Pantalla de Inicio | Consultas | Tiempo promedio |
|---|---|---|
| Sin `home` | 9 | 514,5 ms |
| Con `home` | 1 | 3,7 ms |

- **Patrón:** computado (el mismo de `media.rating`), llevado a toda una pantalla. Se calcula al escribir y se lee muchas veces.
- **Costo asumido:** es una copia y puede quedar atrasada hasta regenerarla (`mongosh db/05_home.js`). Ocupa ≈ 10 KB por usuario.
- **Dónde está:** modelo en [`colecciones.md`](colecciones.md#7-home), armado en [`db/05_home.js`](db/05_home.js), lectura en [`consultas/1_inicio.js`](consultas/1_inicio.js) (consulta 1.0), medición en [`rendimiento.md`](rendimiento.md#6-la-pantalla-de-inicio-varias-consultas-vs-la-colección-home) (`mongosh rendimiento/home.js`) y prototipo en `interfaces/index.html`.

## Cambios sobre el proyecto original

- Nueva colección **`home`** (7 colecciones en total) con validación `$jsonSchema`.
- Nuevo `db/05_home.js`; la verificación pasó de `05_verificar.js` a `06_verificar.js` y ahora controla `home`.
- Nueva consulta 1.0 en `consultas/1_inicio.js` y nuevo `rendimiento/home.js`.
- El Inicio del prototipo (`interfaces/`) se dibuja desde un único documento `home`.
- Documentación actualizada: `colecciones.md`, `rendimiento.md`, `CLAUDE.md` y este README.

## Estado

- [x] Tema y pantallas
- [x] Modelo de datos (7 colecciones, con `home` para el Inicio)
- [x] Creación de la base, validación de esquemas y carga masiva de datos
- [x] Índices
- [x] Consultas avanzadas ([`consultas.md`](consultas.md))
- [x] Medición de rendimiento ([`rendimiento.md`](rendimiento.md))
- [x] Política de backup y restauración ([`backup.md`](backup.md))
- [x] Colección `home`: Inicio precalculado, con una sola lectura


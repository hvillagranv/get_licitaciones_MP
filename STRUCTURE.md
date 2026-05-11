# STRUCTURE.md

Vista actual de la estructura y responsabilidades del proyecto.

## Modelo de acceso

| Página / Funcionalidad          | Anónimo | Autenticado | Admin |
|---------------------------------|:-------:|:-----------:|:-----:|
| index.html (listado general)    | ✓       | ✓           | ✓     |
| index.html filtro instituciones |         | ✓           | ✓     |
| organismos.html                 | ✓       | ✓           | ✓     |
| proveedores.html                | ✓       | ✓           | ✓     |
| palabras_clave.html             |         | ✓           | ✓     |
| guardadas.html                  |         | ✓           | ✓     |
| sugerencias.html                |         | ✓ (con proveedor) | ✓ |
| admin_usuarios.html             |         |             | ✓     |
| admin_catalogos.html            |         |             | ✓     |

## Catálogos (palabras clave e instituciones)

- Almacenados en BD: tablas `palabras_clave` e `instituciones` (migración 006).
- Lectura pública de instituciones: `api/catalogosPub.php?catalogo=instituciones`
- Lectura de palabras clave (auth): `api/catalogosPub.php?catalogo=palabras_clave`
- CRUD admin + import/export CSV: `api/catalogosAdmin.php?catalogo=...`
- Interfaz de gestión: `admin_catalogos.html` / `frontend/admin_catalogos.js`
- Los CSV en `data/csv/` siguen funcionando como fallback si la tabla no existe.



get_licitaciones_MP/
- README.md
- STRUCTURE.md
- package.json
- package-lock.json
- .env (local, no versionar)
- .env.example
- .gitignore

Páginas HTML (raíz)
- index.html
- palabras_clave.html
- organismos.html
- proveedores.html
- sugerencias.html
- guardadas.html
- ingresar.html
- admin_usuarios.html
- admin_catalogos.html      ← gestión de catálogos (admin)

api/
- auth.php
- licitacionesPub.php
- organismosPub.php
- proveedoresPub.php
- sugerenciasPub.php
- guardadas.php
- adminUsuarios.php
- catalogosPub.php          ← GET instituciones (público) / GET palabras_clave (auth)
- catalogosAdmin.php        ← CRUD + import/export CSV (admin)

frontend/
- styles.css
- auth.js                   ← actualizado: muestra navCatalogosItem para admins
- visualization.js
- palabras_clave.js         ← actualizado: requiere auth; datos desde API
- organismos.js
- proveedores.js
- sugerencias.js
- guardadas.js
- ingresar.js
- admin_usuarios.js
- admin_catalogos.js        ← CRUD + import/export CSV
- security.js

backend/
- server.js
- connectDB.js
- licitacionesBD.js
- licitacionesBD_optimizado.js
- licitacionesTodas.js
- guardarBD.js
- verificarEstados.js
- generarProveedoresCSV.js
- revisarcodigos.js
- utils/
  - logs.js
- sql/
  - 001_usuarios_y_guardadas.sql
  - 002_auth_rate_limits.sql
  - 003_roles_admin.sql
  - 004_admin_auditoria.sql
  - 005_usuarios_proveedores.sql
  - 006_palabras_clave_instituciones.sql  ← nuevas tablas
  - hansenri_licitacionesMP.sql

data/
- csv/
  - instituciones.csv       ← fallback si tabla BD no existe
  - organismos.csv
  - palabras_clave.csv      ← referencia; import vía admin_catalogos.html
  - proveedores.csv

logs/
- log_YYYY-MM-DD_hh-mm-ss.txt

docs/
- DEPLOYMENT_GUIDE.md

scripts/
- parallel_lics.py

MVP1/
- Código histórico y archivos de apoyo (legacy)

## Responsabilidades por capa

### Frontend (HTML + JS)

- index.html + visualization.js
  - Listado general, filtros, chips de instituciones, actualización manual sin recarga de página.
- palabras_clave.html + palabras_clave.js
  - Búsqueda por palabras clave con variantes CSV y chips de selección.
- organismos.html + organismos.js
  - KPIs, tablas y gráficos (últimos 12 meses + todos los años).
- proveedores.html + proveedores.js
  - KPIs, tablas y gráficos (últimos 12 meses + todos los años).
- sugerencias.html + sugerencias.js
  - Afinidad por proveedor, enfoque listado/sugeridas, guardado desde tarjeta.
- guardadas.html + guardadas.js
  - Lista de guardadas con estado, cierre, adjudicación y fecha guardada.
- ingresar.html + ingresar.js
  - Registro/login y asociación de proveedor.
- admin_usuarios.html + admin_usuarios.js
  - Administración de usuarios por rol.

### API PHP

- auth.php
  - Login/logout/session, CSRF, rate limiting, asociación usuario-proveedor.
- licitacionesPub.php / organismosPub.php / proveedoresPub.php
  - Exposición de datos de licitaciones y agregados para vistas.
- sugerenciasPub.php
  - Cálculo de afinidad, enfoque por listado CSV o sugeridas por historial.
- guardadas.php
  - List/add/remove de guardadas por usuario autenticado.
- adminUsuarios.php
  - Operaciones de administración de cuentas.

### Backend Node

- server.js
  - Servidor Express, headers de seguridad con Helmet, CORS restringido y rutas.
- scripts de backend/
  - Ingesta, verificación, actualización y persistencia de datos de licitaciones.

## Seguridad vigente

### Control de sesión y cookies

- Sesiones PHP activas con cookies HttpOnly, SameSite=Lax y secure cuando aplica HTTPS.

### Protección CSRF

- Token CSRF emitido por sesión y validado en operaciones sensibles (POST).

### CORS y headers

- Orígenes permitidos explícitos en API PHP y backend Express.
- Headers de endurecimiento: HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection.

### Endurecimiento de backend

- Helmet habilitado en Express.
- Límite de tamaño en payload JSON/urlencoded.
- Manejo de errores con respuestas controladas.

### Protección de autenticación

- Rate limiting para login y acciones críticas en auth.php.

### Base de datos

- Uso de sentencias preparadas en endpoints PHP.
- Variables sensibles obtenidas desde .env.

### Operación segura

- No versionar .env ni secretos.
- Revisar logs antes de compartirlos externamente.
- Validar CORS_ORIGIN y dominios permitidos en cada despliegue.

## Cambios funcionales relevantes recientes

- Sugerencias:
  - enfoque predeterminado listado.
  - orden principal por afinidad y desempates por señales.
- Inicio y palabras clave:
  - botón de actualización manual del listado.
  - filtros en formato chips verticales.
- Organismos y proveedores:
  - gráficos separados para últimos 12 meses y todos los años.
- Guardadas:
  - muestra estado, fecha de cierre y fecha de adjudicación.

## Convenciones

- HTML en raíz para navegación directa.
- JS/CSS en frontend/.
- Endpoints en api/.
- Lógica de ingesta/procesamiento en backend/.
- Documentación de despliegue en docs/.

# Portal de Licitaciones MP

Sistema para ingesta, consulta y analisis de licitaciones de Mercado Publico, con vistas de exploracion, filtros avanzados, sugerencias por proveedor y gestion de licitaciones guardadas.

## Estado actual

- Frontend en paginas HTML en la raiz y scripts/estilos en frontend/.
- APIs PHP en api/ para autenticacion, datos publicos, sugerencias y guardadas.
- Backend Node.js en backend/ para servicio Express, ingesta y tareas de actualizacion.
- Seguridad activa en sesion, CSRF, CORS y headers de proteccion.

## Funcionalidades vigentes

### Navegacion y acceso

- Menu superior comun en paginas principales.
- Control de sesion en frontend/auth.js.
- Visibilidad condicional de menus para sugerencias, guardadas y administracion.

### Inicio (index.html)

- Listado de licitaciones publicadas con paginacion.
- Filtro por texto, instituciones frecuentes y exclusion de bajo valor (L1, E2).
- Filtro de instituciones en formato seleccion por chips verticales (uno por linea, sin scroll interno).
- Boton Actualizar listado con recarga parcial (sin refrescar toda la pagina).
- Descarga de CSV del resultado filtrado.
- Guardar/quitar licitacion segun sesion.

### Palabras clave (palabras_clave.html)

- Filtro por palabras clave con variantes desde data/csv/palabras_clave.csv.
- Seleccion por chips verticales (uno por linea, sin scroll interno).
- Resumen de palabras seleccionadas y variaciones.
- Boton Actualizar listado con recarga parcial.
- Descarga de CSV filtrado.

### Organismos (organismos.html)

- Busqueda de organismo con sugerencias.
- KPIs por estado y monto adjudicado.
- Graficos de cantidad y monto para:
  - ultimos 12 meses
  - todos los anos
- Tabla top de proveedores adjudicados y grafico de categorias.

### Proveedores (proveedores.html)

- Busqueda de proveedor con sugerencias.
- KPIs por estado y monto adjudicado.
- Graficos de cantidad y monto para:
  - ultimos 12 meses
  - todos los anos
- Tabla top de organismos compradores y grafico de categorias.

### Sugerencias (sugerencias.html)

- Recomendaciones para proveedor asociado al usuario.
- Enfoque predeterminado: listado (palabras clave definidas en CSV).
- Enfoque alternativo: sugeridas (terminos del historial adjudicado).
- Indice de afinidad normalizado 0-100.
- Orden principal por afinidad; desempates por palabras clave, institucion, categoria y fecha.
- Boton Guardar licitacion por tarjeta.

### Guardadas (guardadas.html)

- Listado de licitaciones guardadas del usuario.
- Muestra estado, fecha de cierre, fecha de adjudicacion y fecha de guardado.
- Quitar licitacion guardada.

### Administracion de usuarios

- Gestion en admin_usuarios.html con endpoint dedicado.

## Seguridad implementada

### Backend Node (backend/server.js)

- Helmet habilitado para headers de seguridad.
- CORS restringido por CORS_ORIGIN.
- Limite de payload en JSON/urlencoded.
- Manejadores de error y rutas no encontradas.

### APIs PHP (api/*.php)

- Sesiones con cookies seguras: HttpOnly, SameSite=Lax, secure en HTTPS.
- Token CSRF por sesion y validacion en operaciones POST sensibles.
- Headers de seguridad: X-Content-Type-Options, X-Frame-Options, HSTS, X-XSS-Protection.
- CORS con lista explicita de origenes permitidos.
- Queries con sentencias preparadas.

### Autenticacion (api/auth.php)

- Rate limiting por alcance para login y acciones sensibles.
- Gestion de proveedor asociado al usuario con normalizacion de nombre/RUT.
- Validaciones de entrada y respuesta de error controlada.

### Datos sensibles

- Variables criticas en .env (no versionado).
- No subir credenciales ni tickets al repositorio.
- Logs con enfoque de seguridad (utilidades en backend/utils/logs.js).

## Estructura principal

Ver detalle completo en STRUCTURE.md.

## Ejecucion local

1. Instalar dependencias

npm install

2. Configurar variables de entorno

- Copiar .env.example a .env
- Definir DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, CORS_ORIGIN y variables requeridas

3. Iniciar backend

node backend/server.js

4. Abrir aplicacion

- http://localhost:5500/

## Endpoints principales

- api/auth.php
- api/licitacionesPub.php
- api/organismosPub.php
- api/proveedoresPub.php
- api/sugerenciasPub.php
- api/guardadas.php
- api/adminUsuarios.php

## Notas operativas

- Los botones de actualizacion de listados recargan solo datos y mantienen la pagina actual.
- Si hay cache del navegador, se recomienda recarga forzada para ver cambios de frontend.
- Para produccion, mantener CORS y origenes PHP estrictamente alineados con el dominio real.

## Repositorio

- Owner: hvillagranv
- Repo: get_licitaciones_MP

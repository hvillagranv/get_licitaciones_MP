# 📋 Portal de Licitaciones Públicas Chile

Sistema integrado para consultar, analizar y visualizar licitaciones del portal Mercado Público de Chile.

---

## 📁 Estructura del Proyecto

```
proyecto/
├── README.md                    # Este archivo
├── STRUCTURE.md                 # Estructura detallada del proyecto
├── package.json                 # Dependencias Node.js
├── .env                         # Variables de entorno (Git ignored)
├── .env.example                 # Plantilla de .env
├── .gitignore                   # Configuración de Git
│
├── 📄 HTML (Raíz del proyecto)
│   ├── index.html               # Página principal
│   ├── palabras_clave.html      # Búsqueda por palabras clave
│   ├── organismos.html          # Análisis por organismo
│   └── proveedores.html         # Análisis de proveedores
│
├── 🔧 backend/                  # Aplicación Node.js y scripts
│   ├── connectDB.js             # Conexión segura a BD con .env
│   ├── server.js                # Servidor Express con Helmet + CORS
│   ├── licitacionesBD.js        # Recolectar licitaciones desde API
│   ├── licitacionesBD_optimizado.js
│   ├── licitacionesTodas.js     # Procesar todos los estados
│   ├── verificarEstados.js      # Verificar estados actuales
│   ├── guardarBD.js             # Guardar datos en BD
│   └── utils/
│       └── logs.js              # Sistema de logs con sanitización
│
├── 🌐 frontend/                 # Assets web (CSS/JS)
│   ├── styles.css               # Estilos Bootstrap 5
│   ├── visualization.js         # Visualizaciones generales
│   ├── palabras_clave.js        # Lógica palabras clave
│   ├── organismos.js            # Lógica organismos
│   ├── proveedores.js           # Lógica proveedores
│   └── security.js              # Utilidades de seguridad frontend
│
├── 🔌 api/                      # Endpoints PHP
│   ├── licitacionesPub.php      # GET /api/licitaciones (público)
│   ├── organismosPub.php        # GET /api/organismos
│   └── proveedoresPub.php       # GET /api/proveedores
│
├── 📊 data/                     # Datos y logs
│   ├── csv/                     # Archivos CSV exportados
│   │   ├── instituciones.csv
│   │   ├── organismos.csv
│   │   └── palabras_clave.csv
│   └── logs/                    # Logs de aplicación
│       └── log_*.txt
│
├── 📚 docs/                     # Documentación
│   └── DEPLOYMENT_GUIDE.md      # Guía de despliegue
│
├── 🐍 scripts/                  # Scripts utilitarios
│   └── parallel_lics.py         # Script Python para procesamiento
│
├── 🔄 MVP1/                     # Código legacy MVP1
│   ├── processJSON.js
│   ├── get_estado.js
│   ├── eliminar_duplicados.js
│   ├── visualization.js
│   ├── csv/                     # Datos MVP1
│   └── logs/                    # Logs MVP1
│
└── 📦 node_modules/            # Dependencias (npm)
```

---

## 🚀 Inicio Rápido

### 1. Configuración Inicial
```bash
# Copiar plantilla de ambiente
cp .env.example .env

# Editar .env con credenciales reales
# DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, TICKET, etc.

# Instalar dependencias
npm install

# Instalar Helmet para headers de seguridad
npm install helmet
```

### 2. Ejecutar Aplicación
```bash
# Iniciar servidor Express
node backend/server.js

# O ejecutar script de recolección de licitaciones
node backend/licitacionesBD.js

# O ejecutar con nodemon para desarrollo
npx nodemon backend/server.js
```

### 3. Acceder a la Aplicación
- Frontend: `http://localhost:5500/` (HTML en raíz, assets en frontend/)
- API Express: `http://localhost:5500/api/licitaciones`
- Endpoints PHP: `http://hvillagranv.com/api/licitacionesPub.php`

---

## 🔐 Seguridad

### ✅ Implementaciones Actuales

| Aspecto | Estado | Detalles |
|--------|--------|----------|
| **Credenciales BD** | ✅ | Variables de entorno en `.env` (Git ignored) |
| **Tickets API** | ✅ | Variables `TICKET` y `TICKET_MVP1` en `.env` |
| **CORS** | ✅ | Restringido a dominios en `CORS_ORIGIN` (.env) |
| **Headers Seguridad** | ✅ | Helmet middleware en `backend/server.js` |
| **Sanitización Logs** | ✅ | Passwords, tokens, emails enmascarados automáticamente |
| **CSRF Protection** | ✅ | Tokens CSRF en endpoints PHP |
| **Error Handling** | ✅ | Mensajes genéricos, logs privados |

### ⚠️ Acción Pendiente
- **Cambiar contraseña de `hansenri_admin`** en BD (la anterior puede estar comprometida en historial de git)

---

## 📋 Tecnologías

### Backend
- **Node.js** - Runtime JavaScript
- **Express** - Framework web
- **MySQL2/Promise** - Conexión a BD
- **mysql2** - Driver MySQL
- **dotenv** - Variables de entorno
- **helmet** - Headers de seguridad
- **cors** - Control de CORS

### Frontend
- **Bootstrap 5** - Framework CSS responsivo
- **PapaParse** - Parseo de CSV en navegador
- **Fetch API** - Solicitudes HTTP

### PHP API
- **mysqli** - Conexión segura a MySQL
- **Sessions** - Control de estado CSRF

### Datos
- **MySQL/MariaDB** - Base de datos
- **CSV** - Exportación de datos

---

## 🔄 Flujo de Datos

```
┌─────────────────────────────────────────────┐
│  API Mercado Público Chile                  │
│  (api.mercadopublico.cl)                    │
└────────────────┬────────────────────────────┘
                 │ TICKET=886F450C...
                 ↓
         ┌───────────────────┐
         │ backend/          │
         │ licitacionesBD.js │
         └─────────┬─────────┘
                   │
                   ↓
         ┌───────────────────┐
         │  MySQL Database   │
         │  (BD segura)      │
         └─────────┬─────────┘
                   │
        ┌──────────┴──────────┐
        ↓                     ↓
  ┌──────────────┐     ┌──────────────┐
  │ *.html       │     │ api/         │
  │ (Raíz)       │     │ *.php        │
  │ Visualizar   │←────┤ (JSON)       │
  └──────────────┘     └──────────────┘
        ↓
  frontend/*.js
  frontend/*.css
```


## 🧪 Testing

### Verificar Construcción
```bash
# Instalar y verificar
npm install
npm audit

# Validar conexión a BD
node backend/connectDB.js

# Iniciar servidor
node backend/server.js
```

### Pruebas de Seguridad
```bash
# Verificar que .env está en .gitignore
grep -i ".env" .gitignore

# Verificar headers de seguridad
curl -i http://localhost:5500/api/licitaciones | grep -E "X-"

# Verificar CSRF token
curl -i http://localhost:5500/api/licitacionesPub.php | grep "X-CSRF"
```

---

## 📞 Soporte & Contacto

- **Repositorio:** [https://github.com/hvillagranv/get_licitaciones_MP](https://github.com/hvillagranv/get_licitaciones_MP)
- **Owner:** @hvillagranv
- **Email:** hvillagranvidal@gmail.com

---

## 📝 Changelog

### Versión Actual (11/02/2026)
- ✅ Estructura organizada: HTML en raíz, assets en frontend/
- ✅ Credenciales externalizadas a .env
- ✅ Headers de seguridad con Helmet
- ✅ Sanitización de logs
- ✅ CSRF Protection en PHP
- ✅ Error handling seguro
- ✅ Rutas actualizadas (api/, data/csv/)

---

**Última actualización:** 11 de Febrero 2026  
**Estado:** 🟢 En producción

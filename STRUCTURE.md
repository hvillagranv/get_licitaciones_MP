# 📐 ESTRUCTURA DEL PROYECTO - VISTA ÁRBOL

## Referencia Visual Completa

```
📦 get_licitaciones_MP/
│
├── 🔧 CONFIGURACIÓN
│   ├── README.md                      # ← Documentación principal
│   ├── STRUCTURE.md                   # ← Este archivo
│   ├── .env                           # ← Credenciales (Git ignored)
│   ├── .env.example                   # ← Plantilla
│   ├── .gitignore                     # ← Configuración git
│   ├── package.json                   # ← Dependencias Node.js
│   ├── package-lock.json              # ← Lock file
│   │
│
├── 📄 HTML (Raíz del Proyecto)        # Páginas HTML accesibles directamente
│   ├── index.html                     # Página principal
│   ├── palabras_clave.html            # Búsqueda por palabras
│   ├── organismos.html                # Análisis por organismo
│   └── proveedores.html               # Análisis de proveedores
│   │
│
├── 🌐 frontend/                       # Assets web (CSS/JS)
│   ├── 🎨 Estilos
│   │   └── styles.css                 # Bootstrap 5 + custom
│   │
│   ├── ⚙️ Scripts JavaScript
│   │   ├── visualization.js           # Visualizaciones comunes
│   │   ├── palabras_clave.js          # Lógica búsqueda palabras
│   │   ├── organismos.js              # Lógica organismos
│   │   ├── proveedores.js             # Lógica proveedores
│   │   └── security.js                # Utilidades front-end security
│   │       ├── escaparHTML()
│   │       ├── validarInput()
│   │       ├── getCsrfToken()
│   │       └── sanitizarDatos()
│   │
│
├── 🔌 api/                            # Endpoints PHP públicos
│   ├── licitacionesPub.php            # GET /api/licitaciones
│   │   ├── CORS: www.hvillagranv.com
│   │   ├── Sanitización: sanitizar_input()
│   │   ├── CSRF: Token validation
│   │   └── Headers: Seguridad + CSRF
│   │
│   ├── organismosPub.php              # GET /api/organismos
│   │   └── (Misma estructura que licitacionesPub.php)
│   │
│   └── proveedoresPub.php             # GET /api/proveedores
│       └── (Misma estructura que licitacionesPub.php)
│   │
│
├── 🔧 backend/                        # Node.js / Express
│   ├── 🔌 Conexión BD
│   │   └── connectDB.js
│   │       ├── .env validation
│   │       ├── Pool configuration
│   │       ├── Connection test
│   │       └── Process.exit(1) si fail
│   │
│   ├── 🚀 Servidor web
│   │   └── server.js
│   │       ├── Helmet() - Headers seguridad
│   │       ├── CORS restrictivo - desde .env
│   │       ├── JSON limit - 10kb
│   │       ├── Error handler global
│   │       ├── 404 handler
│   │       └── Process signals (SIGTERM/SIGINT)
│   │
│   ├── 📡 Recolección de datos
│   │   ├── licitacionesBD.js          # Desde API
│   │   ├── licitacionesBD_optimizado.js
│   │   ├── licitacionesTodas.js       # Todos los estados
│   │   ├── verificarEstados.js        # Verificar estados
│   │   ├── guardarBD.js               # Insert/Update en BD
│   │   └── revisarcodigos.js          # Revisar códigos fallidos
│   │       └── Headers: .env validation
│   │           TICKET: process.env.TICKET con exit(1)
│   │
│   ├── 📝 Utilidades
│   │   └── utils/
│   │       └── logs.js
│   │           ├── logMensaje() - Sanitizado
│   │           ├── sanitizarDatos() - Maskea:
│   │           │   ├── Passwords → ***REDACTED***
│   │           │   ├── Tokens → ***JWT_REDACTED***
│   │           │   ├── API Keys → ***REDACTED***
│   │           │   ├── Emails → ***@domain.com
│   │           │   ├── Tarjetas → ****-****-****-****
│   │           │   └── Teléfonos → ***-****
│   │           ├── iniciarMonitorInactividad()
│   │           └── detenerMonitorInactividad()
│   │
│
├── 🐍 scripts/                        # Utilidades Python/CLI
│   └── parallel_lics.py               # Procesamiento paralelo
│
│
├── 📊 data/                           # Datos y logs
│   ├── csv/                           # Exportaciones
│   │   ├── instituciones.csv
│   │   ├── organismos.csv
│   │   ├── palabras_clave.csv
│   │   └── ...
│   │
│   └── logs/                          # Logs de aplicación
│       ├── log_2026-02-11_09-30-19.txt
│       ├── log_2026-02-11_09-46-02.txt
│       └── ... (Logs sanitizados)
│   │
│
├── 📚 docs/                           # Documentación
│   └── DEPLOYMENT_GUIDE.md            # Guía de despliegue
│   │
│
├── 🔄 MVP1/                           # Código legacy (v1 piloto)
│   ├── processJSON.js
│   ├── get_estado.js
│   ├── eliminar_duplicados.js
│   ├── visualization.js
│   ├── csv/                           # Datos MVP1
│   └── logs/                          # Logs MVP1
│
│
└── 🔌 .git/                           # Control de versiones
    └── (Histórico de commits)

```

---

## 🎯 Categorización de Archivos

### Configuración (Raíz)
```
.env                  ← Variables de entorno
.env.example          ← Plantilla
.gitignore            ← Ignorar .env en git
package.json          ← Dependencias
README.md             ← Documentación principal
STRUCTURE.md          ← Este documento
```

### HTML (Raíz)
```
*.html                 ← Páginas web accesibles directamente
├── index.html         ← Página principal
├── palabras_clave.html
├── organismos.html
└── proveedores.html
```

### Frontend (Assets Web)
```
frontend/
├── *.js               ← Lógica frontend
├── *.css              ← Estilos
└── security.js        ← Seguridad frontend
```

### Backend (Servidor + Lógica)
```
backend/
├── server.js          ← Express + Helmet
├── connectDB.js       ← Conexión segura
├── licitaciones*.js   ← Recolección
├── guardarBD.js       ← Persistencia
└── utils/logs.js      ← Logging seguro
```

### API (Endpoints PHP Públicos)
```
api/
├── licitacionesPub.php
├── organismosPub.php
└── proveedoresPub.php
```

### Datos
```
data/
├── csv/               ← Exportaciones
└── logs/              ← Aplicación
```

### Documentación
```
docs/
└── DEPLOYMENT_GUIDE.md    ← Guía de despliegue
```

---

## ✅ Checklist de Organización

| Aspecto | Estado | Detalle |
|--------|--------|---------|
| Carpetas lógicas | ✅ | frontend/, api/, backend/, data/, docs/, scripts/ |
| HTML en raíz | ✅ | Archivos HTML directamente accesibles desde raíz |
| Assets organizados | ✅ | CSS/JS en frontend/, separados de HTML |
| Configuración centralizada | ✅ | .env en raíz (Git ignored) |
| Documentación agrupada | ✅ | docs/ contiene documentación útil |
| Datos separados | ✅ | data/csv y data/logs |
| Backend modular | ✅ | scripts separados por función + utils/ |
| README principal | ✅ | README.md y STRUCTURE.md en raíz |
| Estructura clara | ✅ | Carpetas nombradas descriptivamente |

---

**Estructura finalizada:** 11 de Febrero 2026

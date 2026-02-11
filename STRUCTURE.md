# 📐 ESTRUCTURA DEL PROYECTO - VISTA ÁRBOL

## Referencia Visual Completa

```
📦 get_licitaciones_MP/
│
├── 🔧 CONFIGURACIÓN
│   ├── README.md                      # ← Documentación principal
│   ├── .env                           # ← Credenciales (Git ignored)
│   ├── .env.example                   # ← Plantilla
│   ├── .gitignore                     # ← Configuración git
│   ├── package.json                   # ← Dependencias Node.js
│   ├── package-lock.json              # ← Lock file
│   │
│
├── 🌐 frontend/                       # Aplicación web interactiva
│   ├── 📄 HTML (Páginas)
│   │   ├── index.html                 # Página principal
│   │   ├── palabras_clave.html        # Búsqueda por palabras
│   │   ├── organismos.html            # Análisis por organismo
│   │   └── proveedores.html           # Análisis de proveedores
│   │
│   ├── 🎨 Estilos
│   │   └── styles.css                 # Bootstrap 5 + custom
│   │
│   ├── ⚙️ Scripts JavaScript
│   │   ├── visualization.js           # Visualizaciones comunes
│   │   ├── palabras_clave.js          # Lógica búsqueda palabras
│   │   ├── organismos.js              # Lógica organismos
│   │   ├── proveedores.js             # Lógica proveedores
│   │   └── security.js                # Utilidades fron-end security
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
├── 📚 docs/                           # Documentación seguridad
│   ├── SECURITY_AUDIT.md              # Análisis de vulnerabilidades
│   │   ├── Credenciales hardcodeadas
│   │   ├── CORS sin restricción
│   │   ├── Exposición de errores
│   │   ├── XSS en frontend
│   │   └── Validación de entrada
│   │
│   ├── SECURITY_CHECKLIST.md          # Checklist de remedios
│   │   ├── Fase 1: CRÍTICO (1-2 horas)
│   │   ├── Fase 2: ALTO (2 semanas)
│   │   └── Fase 3: MEDIO (próximo mes)
│   │
│   ├── SECURITY_EXECUTIVE_SUMMARY.md  # Para stakeholders
│   │   ├── Hallazgos críticos
│   │   ├── Costo de remediar
│   │   ├── Plan de acción
│   │   └── KPIs de seguridad
│   │
│   ├── SECURITY_README.md             # Guía para desarrolladores
│   │   ├── Cómo usar .env
│   │   ├── Mejores prácticas
│   │   ├── Headers de seguridad
│   │   └── Validación de entrada
│   │
│   ├── VULNERABILITIES_STATUS_REPORT.md # Estado actual
│   │   ├── CRÍTICAS: 3/3 ✅ 100%
│   │   ├── ALTAS: 1/5 ✅ 20%
│   │   ├── MEDIAS: 3/3 ✅ 100%
│   │   └── TOTAL: 7/11 ✅ 64%
│   │
│   ├── MEDIUM_VULNERABILITIES_FIXED.md # Detalles de medias
│   │   ├── Headers de seguridad (Helmet)
│   │   ├── Logs sanitizados
│   │   └── CSRF Protection
│   │
│   ├── DB_CREDENTIALS_FIX.md          # Cambio de credenciales
│   │   ├── Pasos para cambiar password
│   │   └── Cómo actualizar .env
│   │
│   ├── QUICK_FIX_GUIDE.md             # Guía rápida
│   │   ├── Acción inmediata (2 horas)
│   │   └── Verificaciones adicionales
│   │
│   └── RISK_MATRIX.md                 # Matriz de riesgos
│       ├── Severidad vs Impacto
│       └── Priorización
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
README.md             ← Este documento
```

### Frontend (Estático + Interactivo)
```
frontend/
├── *.html             ← Contenido
├── *.js               ← Lógica
├── *.css              ← Estilos
└── security.js        ← Seguridad
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
├── SECURITY_*         ← Análisis seguridad
├── VULNERABILITIES_*  ← Estado de fixes
├── DB_CREDENTIALS_*   ← Credenciales
├── QUICK_FIX_*        ← Guías rápidas
└── RISK_MATRIX.md     ← Matriz riesgos
```

---

## ✅ Checklist de Organización

| Aspecto | Estado | Detalle |
|--------|--------|---------|
| Carpetas lógicas | ✅ | frontend/, api/, backend/, data/, docs/, scripts/ |
| Configuración centralizada | ✅ | .env en raíz (Git ignored) |
| Documentación agrupada | ✅ | docs/ contiene todos los .md |
| Datos separados | ✅ | data/csv y data/logs |
| Backend modular | ✅ | scripts separados por función + utils/ |
| Frontend organizado | ✅ | HTML, JS, CSS, security.js |
| README principal | ✅ | README.md en raíz |
| Estructura clara | ✅ | Carpetas nombradas descriptivamente |

---

**Estructura finalizada:** 11 de Febrero 2026

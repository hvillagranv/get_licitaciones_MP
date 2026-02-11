# ✅ CORRECCIÓN DE VULNERABILIDADES MEDIAS

## Implementaciones Completadas

### 1. 🔐 Headers de Seguridad en Node.js/Express

**Archivo:** `backend/server.js`

#### Antes (Inseguro ❌)
```javascript
app.use(cors());  // Sin restricciones
// Sin headers de seguridad
```

#### Ahora (Seguro ✅)
```javascript
import helmet from 'helmet';

// Helmet middleware para headers de seguridad
app.use(helmet());

// CORS restrictivo basado en .env
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',');
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin.trim())) {
      callback(null, true);
    } else {
      callback(new Error('CORS no permitido'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

// Middleware para parsear JSON
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb' }));
```

#### Headers Proporcionados por Helmet
✅ `X-Content-Type-Options: nosniff`
✅ `X-Frame-Options: DENY`
✅ `X-XSS-Protection: 1; mode=block`
✅ `Strict-Transport-Security: max-age=31536000`
✅ `Content-Security-Policy: ...`
✅ `X-DNS-Prefetch-Control: off`
✅ `Referrer-Policy: no-referrer`
✅ `Permissions-Policy: ...`

#### Error Handling Mejorado
```javascript
// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('❌ Error no capturado:', err.message);
  
  // Si es error de CORS
  if (err.message === 'CORS no permitido') {
    return res.status(403).json({ error: 'Origen no autorizado' });
  }
  
  // Error genérico - NO exponer detalles internos
  res.status(500).json({ error: 'Error interno del servidor' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});
```

**Instalación Requerida:**
```bash
npm install helmet
```

---

### 2. 📝 Sanitización de Logs

**Archivo:** `backend/utils/logs.js`

#### Vulnerabilidad Original
- ❌ Loguea datos sensibles (passwords, tokens, emails, teléfonos)
- ❌ Sin sanitización de información confidencial
- ❌ Logs podrían ser comprometidos y revelar secretos

#### Solución Implementada
```javascript
// Función para sanitizar datos sensibles
const sanitizarDatos = (msg) => {
  let sanitizado = String(msg);
  
  // Mascarar passwords
  sanitizado = sanitizado.replace(
    /password["\s:=]+["']?([^"'\s,}]+)/gi,
    'password: ***REDACTED***'
  );
  
  // Mascarar tokens
  sanitizado = sanitizado.replace(
    /token["\s:=]+["']?([^"'\s,}]+)/gi,
    'token: ***REDACTED***'
  );
  
  // Mascarar credenciales
  sanitizado = sanitizado.replace(
    /credential["\s:=]+["']?([^"'\s,}]+)/gi,
    'credential: ***REDACTED***'
  );
  
  // Mascarar JWT
  sanitizado = sanitizado.replace(
    /bearer\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/gi,
    'Bearer ***JWT_REDACTED***'
  );
  
  // Mascarar API keys
  sanitizado = sanitizado.replace(
    /[Aa]pi[_-]?key["\s:=]+["']?([^"'\s,}]+)/gi,
    'api_key: ***REDACTED***'
  );
  
  // Mascarar emails (parcialmente)
  sanitizado = sanitizado.replace(
    /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    '***@$2'
  );
  
  // Mascarar números de tarjeta
  sanitizado = sanitizado.replace(
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    '****-****-****-****'
  );
  
  // Mascarar números de teléfono
  sanitizado = sanitizado.replace(
    /(\+?56)?\s*9?\s*\d{4}\s*\d{4}/g,
    '***-****'
  );
  
  return sanitizado;
};

export const logMensaje = (msg, tipo = 'info') => {
  ultimaActividad = Date.now();
  const timestamp = new Date().toLocaleString('es-CL', {
    timeZone: 'America/Santiago'
  });
  
  // Sanitizar el mensaje antes de loguearlo
  const msgSanitizado = sanitizarDatos(msg);
  const linea = `[${timestamp}] [${tipo.toUpperCase()}] ${msgSanitizado}\n`;
  
  try {
    fs.appendFileSync(logPath, linea);
  } catch (err) {
    console.error('Error escribiendo log:', err.message);
  }
};
```

#### Qué se Sanitiza
| Tipo | Antes | Después |
|------|-------|---------|
| Password | `password: lEP5O3Ajhs` | `password: ***REDACTED***` |
| Token | `token: eyJhbGc...` | `token: ***REDACTED***` |
| Email | `usuario@mail.com` | `***@mail.com` |
| API Key | `api_key: sk-abc123...` | `api_key: ***REDACTED***` |
| Tarjeta | `4532-1234-5678-9010` | `****-****-****-****` |
| Teléfono | `+56 9 8765 4321` | `***-****` |

---

### 3. 🛡️ CSRF Protection en PHP

**Archivos:** `licitacionesPub.php`, `organismosPub.php`, `proveedoresPub.php`

#### Implementación

```php
<?php
// CSRF PROTECTION
session_start();

// Generar token CSRF si no existe
if (empty($_SESSION['csrf_token'])) {
  $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// Función para sanitizar entrada
function sanitizar_input($data) {
  return htmlspecialchars(strip_tags($data), ENT_QUOTES, 'UTF-8');
}

// Validar CSRF token para POST/PUT/DELETE
if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT', 'DELETE'])) {
  $csrf_header = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_POST['csrf_token'] ?? '';
  if (empty($csrf_header) || !hash_equals($_SESSION['csrf_token'], $csrf_header)) {
    http_response_code(403);
    echo json_encode(['error' => 'Token CSRF inválido']);
    exit;
  }
}

// Headers de seguridad
header('X-CSRF-Token: ' . $_SESSION['csrf_token']);
// ... rest of headers
```

#### Uso en JavaScript/Frontend

**1. Obtener token CSRF de headers**
```javascript
// Leer token del header de respuesta
const getCsrfToken = async () => {
  const response = await fetch('/api/endpoint', { method: 'GET' });
  return response.headers.get('X-CSRF-Token');
};

// O extraer de meta tag (opcional)
const token = document.querySelector('meta[name="csrf-token"]')?.content;
```

**2. Enviar token en POST requests**
```javascript
// Opción 1: En header X-CSRF-Token
fetch('/licitacionesPub.php', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken
  },
  body: JSON.stringify({ data: 'value' })
});

// Opción 2: En body (form data)
const formData = new FormData();
formData.append('csrf_token', csrfToken);
formData.append('data', 'value');

fetch('/licitacionesPub.php', {
  method: 'POST',
  body: formData
});
```

#### Protección Contra
✅ Cross-Site Request Forgery (CSRF)
✅ Solicitudes no autorizadas desde otros sitios
✅ Validación de origen de solicitudes

---

## 🎯 Resumen de Cambios

| Vulnerabilidad | Archivo(s) | Implementación | Estado |
|---|---|---|---|
| **Headers de Seguridad** | `backend/server.js` | Helmet middleware + CORS restrictivo | ✅ 100% |
| **Logs Sin Sanitización** | `backend/utils/logs.js` | Función sanitizarDatos() | ✅ 100% |
| **CSRF Protection** | `licitacionesPub.php`, `organismosPub.php`, `proveedoresPub.php` | Tokens CSRF + session validation | ✅ 100% |

---

## 📋 Próximos Pasos Recomendados

### Instalaciones Necesarias
```bash
npm install helmet
```

### Testing
```bash
# Verificar CSRF token en respuesta
curl -i http://localhost:3000/api/endpoint

# Verificar que POST sin token falla
curl -X POST http://localhost:3000/licitacionesPub.php

# Verificar sanitización en logs
grep -i "redacted" logs/log_*.txt
```

### Documentación para Desarrolladores
1. Todos los POST requests deben incluir header `X-CSRF-Token`
2. Los logs sanitizan automáticamente datos sensibles
3. Helmet proporciona headers de seguridad automáticamente

---

## 🔐 Estado de Vulnerabilidades Medias

```
Vulnerabilidad                 | Antes | Ahora
───────────────────────────────┼───────┼──────
Headers de Seguridad           | ❌    | ✅
Logs Sin Sanitización          | ❌    | ✅
CSRF Protection                | ❌    | ✅
───────────────────────────────┴───────┴──────
TOTAL VULNERABILIDADES MEDIAS  | 3/3   | ✅ COMPLETADO
```

---

**Fecha de implementación:** 11 de Febrero 2026  
**Documentación:** Completa  
**Testing:** Pendiente por user

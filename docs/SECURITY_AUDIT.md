# 🔐 AUDITORÍA DE SEGURIDAD - Portal de Licitaciones

**Fecha:** 11 de Febrero 2026  
**Estado:** ⚠️ CRÍTICO - Se encontraron vulnerabilidades graves

---

## 📋 Resumen Ejecutivo

Se identificaron **9 vulnerabilidades críticas/altas** que requieren atención inmediata. Las principales se encuentran en:
- Credenciales hardcodeadas en el código
- Falta de validación de entrada
- CORS sin restricción
- Exposición de errores en producción
- Potencial XSS en el frontend

---

## 🔴 VULNERABILIDADES CRÍTICAS

### 1. ⚠️ CRÍTICO: Credenciales Hardcodeadas en el Código

**Archivos afectados:**
- `backend/connectDB.js`
- `licitacionesPub.php`
- `organismosPub.php`
- `proveedoresPub.php`

**Riesgo:** Las credenciales de la base de datos están expuestas en el código fuente:
```javascript
// ❌ INSEGURO
export const pool = mysql.createPool({
  host: '162.241.60.15',
  user: 'hansenri_admin',
  password: 'lEP5O3Ajhs',        // ⚠️ EXPUESTA
  database: 'hansenri_licitacionesMP'
});
```

**Impacto:** Acceso no autorizado a la base de datos, robo de datos sensibles.

**Recomendación:**
- Usar variables de entorno (`.env`)
- Nunca commitear archivos `.env`
- Regenerar credenciales inmediatamente
- Usar gestores de secretos (Vault, AWS Secrets Manager)

---

### 2. ⚠️ CRÍTICO: CORS Sin Restricción

**Archivo:** `backend/server.js`

**Código problemático:**
```javascript
// ❌ INSEGURO
app.use(cors());  // Acepta solicitudes de CUALQUIER origen
```

**Impacto:** Cualquier sitio web puede acceder a tu API y datos.

**Recomendación:**
```javascript
// ✅ SEGURO
app.use(cors({
  origin: ['http://localhost:3000', 'https://tunominio.com'],
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
```

---

### 3. ⚠️ CRÍTICO: Exposición de Errores en Producción

**Archivo:** `licitacionesPub.php`

```php
// ❌ INSEGURO
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

echo json_encode(["error" => $mysqli->error]);  // Revela estructura de BD
```

**Impacto:** Información sensible expuesta a atacantes (estructura de BD, queries, etc).

**Recomendación:**
```php
// ✅ SEGURO
error_reporting(E_ALL);
ini_set('display_errors', 0);  // No mostrar errores
ini_set('log_errors', 1);
ini_set('error_log', '/var/log/php_errors.log');

if (!$result) {
    http_response_code(500);
    echo json_encode(["error" => "Error interno del servidor"]);
    exit;
}
```

---

### 4. ⚠️ ALTO: Falta de Validación de Entrada

**Archivo:** `organismosPub.php`

```php
// ❌ INSEGURO - Sin validación
$organismo = isset($_GET['organismo']) ? trim($_GET['organismo']) : '';
// Se usa directamente en consulta SQL (aunque con prepared statement)
```

**Impacto:** Posible inyección SQL (aunque parcialmente mitigada con prepared statement).

**Recomendación:**
```php
// ✅ SEGURO
$organismo = isset($_GET['organismo']) ? trim($_GET['organismo']) : '';

// Validar entrada
if (!preg_match('/^[a-záéíóúñ\s\-\.(),]+$/i', $organismo)) {
    http_response_code(400);
    echo json_encode(["error" => "Organismo inválido"]);
    exit;
}

// Validar longitud
if (strlen($organismo) > 255) {
    http_response_code(400);
    echo json_encode(["error" => "Organismo muy largo"]);
    exit;
}
```

---

### 5. ⚠️ ALTO: Potencial XSS en el Frontend

**Archivos:** `visualization.js`, `palabras_clave.js`, `organismos.js`, `proveedores.js`

**Ejemplo problemático:**
```javascript
// ❌ INSEGURO - Inyección DOM sin validación
const alias = aliasInstituciones[item.institucion_nombre] || item.institucion_nombre;
const card = `<h3>${alias}</h3>`;  // Podría contener HTML/JS malicioso
contenedor.innerHTML += card;  // Inyecta HTML sin sanitizar
```

**Impacto:** Ejecución de código malicioso en el navegador del usuario.

**Recomendación:**
```javascript
// ✅ SEGURO - Usar textContent en lugar de innerHTML
const h3 = document.createElement('h3');
h3.textContent = alias;  // Escapa automáticamente HTML
card.appendChild(h3);

// O usar función sanitizadora
function escaparHTML(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

const card = `<h3>${escaparHTML(alias)}</h3>`;
```

---

## 🟠 VULNERABILIDADES ALTAS

### 6. 🔴 ALTO: Falta de Autenticación/Autorización

**Archivos afectados:** Todos los archivos PHP y rutas del backend

**Riesgo:** No hay autenticación - cualquiera puede acceder a todos los datos.

**Recomendación:**
```php
// ✅ SEGURO - Implementar autenticación
session_start();
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(["error" => "No autorizado"]);
    exit;
}
```

---

### 7. 🟠 ALTO: Sin Rate Limiting

**Impacto:** Posible ataque de fuerza bruta o DoS.

**Recomendación para Node.js:**
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max: 100,  // 100 solicitudes por IP
  message: 'Demasiadas solicitudes'
});

app.use('/api/', limiter);
```

---

### 8. 🟠 ALTO: Falta de HTTPS

**Impacto:** Datos en tránsito sin encriptación.

**Recomendación:**
- Usar certificado SSL/TLS
- Redirigir HTTP a HTTPS
- Header de seguridad: `Strict-Transport-Security`

```php
// ✅ SEGURO
header("Strict-Transport-Security: max-age=31536000; includeSubDomains");
```

---

## 🟡 VULNERABILIDADES MEDIAS

### 9. 🟡 MEDIO: Sin CSP (Content Security Policy)

**Impacto:** Facilita ataques XSS.

**Recomendación:**
```php
// ✅ SEGURO
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' cdn.jsdelivr.net;");
```

---

### 10. 🟡 MEDIO: Sin CSRF Protection

**Impacto:** Solicitudes falsificadas desde otros sitios.

**Recomendación:**
```php
// Generar token CSRF
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// Validar en formularios POST
if ($_POST['csrf_token'] !== $_SESSION['csrf_token']) {
    http_response_code(403);
    exit;
}
```

---

### 11. 🟡 MEDIO: Logs exponen información sensible

**Archivo:** `backend/utils/logs.js`

Los logs podrían contener información sensible de la base de datos.

**Recomendación:**
```javascript
// Antes de loguear, sanitizar datos sensibles
const sanitizarLog = (mensaje) => {
  return mensaje
    .replace(/password['":\s=]+[^\s,}]+/gi, 'password=***')
    .replace(/token['":\s=]+[^\s,}]+/gi, 'token=***');
};

export const logMensaje = (msg, tipo = 'info') => {
  const msgSanitizado = sanitizarLog(msg);
  // ... loguear msgSanitizado
};
```

---

## 📋 TABLA RESUMEN DE VULNERABILIDADES

| # | Severidad | Descripción | Archivo(s) | Estado |
|---|-----------|-------------|-----------|--------|
| 1 | 🔴 CRÍTICO | Credenciales hardcodeadas | connectDB.js, *.php | ❌ No reparada |
| 2 | 🔴 CRÍTICO | CORS sin restricción | server.js | ❌ No reparada |
| 3 | 🔴 CRÍTICO | Exposición de errores | *.php | ❌ No reparada |
| 4 | 🟠 ALTO | Validación de entrada insuficiente | *.php | ❌ No reparada |
| 5 | 🟠 ALTO | Potencial XSS | *.js frontend | ❌ No reparada |
| 6 | 🟠 ALTO | Sin autenticación | Todos | ❌ No reparada |
| 7 | 🟠 ALTO | Sin rate limiting | server.js | ❌ No reparada |
| 8 | 🟠 ALTO | Sin HTTPS | Todas las rutas | ❌ No reparada |
| 9 | 🟡 MEDIO | Sin CSP headers | *.php | ❌ No reparada |
| 10 | 🟡 MEDIO | Sin CSRF protection | *.php | ❌ No reparada |
| 11 | 🟡 MEDIO | Logs con info sensible | logs.js | ❌ No reparada |

---

## ✅ PLAN DE ACCIÓN RECOMENDADO

### Fase 1: CRÍTICO (Esta semana)
1. ✅ Mover credenciales a variables de entorno
2. ✅ Regenerar todas las contraseñas de BD
3. ✅ Configurar CORS restrictivo
4. ✅ Desactivar exposición de errores

### Fase 2: ALTO (Próximas 2 semanas)
5. ✅ Implementar validación de entrada
6. ✅ Sanitizar salidas HTML
7. ✅ Agregar autenticación básica
8. ✅ Implementar rate limiting
9. ✅ Configurar HTTPS

### Fase 3: MEDIO (Próximo mes)
10. ✅ Agregar headers de seguridad (CSP, HSTS)
11. ✅ Implementar CSRF tokens
12. ✅ Sanitizar logs

---

## 🛠️ HERRAMIENTAS RECOMENDADAS

- **ESLint + Security Plugin:** Detectar problemas de seguridad en JS
- **SQLMap:** Probar inyección SQL
- **OWASP ZAP:** Escaneo de seguridad completo
- **npm audit:** Vulnerabilidades en dependencias
- **Snyk:** Monitoreo continuo de vulnerabilidades

---

## 📞 PRÓXIMAS PASOS

1. **Inmediato:** Implementar cambios CRÍTICOS
2. **Corto plazo:** Revisar con especialista en seguridad
3. **Largo plazo:** Realizar auditoría penetration testing

---

**Generado por:** Sistema de Auditoría Automatizada  
**Último actualizado:** 11 de Feb 2026

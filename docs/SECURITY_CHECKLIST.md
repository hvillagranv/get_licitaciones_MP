# ✅ CHECKLIST DE CORRECCIONES DE SEGURIDAD

## Fase 1: CRÍTICO (Hacer AHORA - 1-2 horas)

### 1. Variables de Entorno
- [ ] Copiar `.env.example` a `.env`
- [ ] Rellenar credenciales reales en `.env`
- [ ] Agregar `.env` a `.gitignore`
- [ ] Instalar `dotenv`: `npm install dotenv`
- [ ] Reemplazar `backend/connectDB.js` con versión segura

### 2. Regenerar Credenciales
- [ ] Cambiar contraseña de usuario `hansenri_admin` en BD
- [ ] Cambiar credenciales en todas partes
- [ ] Verificar que no hay copias antiguas en commits

### 3. CORS
- [ ] Instalar `cors`: `npm install cors` (ya existe)
- [ ] Actualizar `backend/server.js` con CORS restrictivo
- [ ] Configurar `CORS_ORIGIN` en `.env`

### 4. Errores en Producción (PHP)
- [ ] Desactivar `display_errors` en todos los `.php`
- [ ] Activar logging a archivo con `ini_set('error_log')`
- [ ] Remover líneas que expongan errors en respuesta JSON

---

## Fase 2: ALTO (Próximas 2 semanas)

### 5. Dependendencias de Seguridad
```bash
npm install express-rate-limit helmet dotenv
```
- [ ] Instalar `helmet` para headers de seguridad
- [ ] Instalar `express-rate-limit` para rate limiting
- [ ] Actualizar `backend/server.js` con estas dependencias

### 6. Validación de Entrada (PHP)
- [ ] Agregar función `validar_input()` en cada `.php`
- [ ] Validar longitud de strings
- [ ] Validar formato esperado (caracteres permitidos)
- [ ] Rechazar inputs inválidos con error 400

### 7. XSS en Frontend
- [ ] Reemplazar `innerHTML` con `textContent` donde sea posible
- [ ] Crear función `escaparHTML()` reutilizable
- [ ] Revisar todos los archivos: `visualization.js`, `palabras_clave.js`, `organismos.js`, `proveedores.js`

**Buscar patrones peligrosos:**
```javascript
// ❌ MALO
contenedor.innerHTML += card;

// ✅ BUENO
contenedor.textContent = card;
// O usar esta plantilla
function crearCard(datos) {
  const div = document.createElement('div');
  div.className = 'card';
  const titulo = document.createElement('h3');
  titulo.textContent = datos.nombre;  // Seguro
  div.appendChild(titulo);
  return div;
}
```

### 8. Autenticación Básica
- [ ] Implementar session/JWT en PHP
- [ ] Requerir login en rutas protegidas
- [ ] Usar `session_start()` y validar `$_SESSION['user_id']`

---

## Fase 3: MEDIO (Próximo mes)

### 9. Headers de Seguridad (PHP)
```php
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');
header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
header('Content-Security-Policy: default-src \'self\'; script-src \'self\' \'unsafe-inline\' cdn.jsdelivr.net;');
```

### 10. CSRF Protection
- [ ] Generar tokens CSRF en formularios
- [ ] Validar tokens en requests POST
- [ ] Ejemplo:
```php
$_SESSION['csrf_token'] = bin2hex(random_bytes(32));
// En formularios
<input type="hidden" name="csrf_token" value="<?= $_SESSION['csrf_token'] ?>">
// Validar
if ($_POST['csrf_token'] !== $_SESSION['csrf_token']) {
  http_response_code(403);
  exit;
}
```

### 11. Logs Seguros
- [ ] Sanitizar datos sensibles antes de loguear
- [ ] No loguear contraseñas, tokens, email addresses
- [ ] Rotar logs regularmente
- [ ] Actualizar `backend/utils/logs.js`

---

## Verificaciones Adicionales

### npm audit
```bash
npm audit
npm audit fix
```
- [ ] Ejecutar `npm audit` para detectar vulnerabilidades
- [ ] Instalar actualizaciones: `npm update` o `npm audit fix`

### Verificación de Git
```bash
# Asegurar que las credenciales no están en el historio
git log -p --all -S "lEP5O3Ajhs"
```
- [ ] Verificar que credenciales no están en git
- [ ] Si las hay, usar `git-filter-branch` o `BFG Repo-Cleaner`

### HTTPS
- [ ] Obtener certificado SSL (Let's Encrypt es gratis)
- [ ] Redirigir HTTP a HTTPS
- [ ] Configurar HSTS header

---

## Requisitos para cada archivo

### .env (NUEVO - No versionarse)
```
DB_HOST=...
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
CORS_ORIGIN=...
```

### .gitignore (ACTUALIZAR)
```
.env
.env.local
node_modules/
logs/
```

### package.json (AGREGAR)
```json
{
  "dependencies": {
    "express-rate-limit": "^6.0.0",
    "helmet": "^7.0.0",
    "dotenv": "^16.0.0"
  }
}
```

### backend/connectDB.js (REEMPLAZAR)
Usar `SECURE_connectDB.js`

### backend/server.js (ACTUALIZAR PARCIALMENTE)
Usar configuración de `SECURE_server.js`

### *.php (ACTUALIZAR TODOS)
- Usar plantilla `SECURE_licitacionesPub.php`
- Desactivar display_errors
- Agregar headers de seguridad
- Validar inputs

---

## Testing de Seguridad

### Pruebas Manual
- [ ] Intentar acceder sin autenticación (debe fallar)
- [ ] Probar CORS desde otro dominio (debe fallar)
- [ ] Intentar inyección SQL: `' OR '1'='1`
- [ ] Buscar XSS: `<script>alert(1)</script>`

### Herramientas
```bash
# ESLint con plugin de seguridad
npm install --save-dev eslint eslint-plugin-security
npx eslint . --ext .js

# Prueba de dependencias
npm audit

# OWASP ZAP Scan (descargar app)
# SQLMap para probar SQL injection
```

---

## Registro de Cambios

| Fecha | Cambio | Estado |
|-------|--------|--------|
| 11/02/2026 | Auditoría inicial | ✅ Completada |
| TBD | Implementar Fase 1 | ⏳ Pendiente |
| TBD | Implementar Fase 2 | ⏳ Pendiente |
| TBD | Implementar Fase 3 | ⏳ Pendiente |

---

## Personas Asignadas

- **Lead de Seguridad:** _________
- **Backend:** _________
- **Frontend:** _________
- **DevOps/Deployment:** _________

---

## Contacto de Emergencia

Si encontras vulnerabilidades nuevas:
1. NO las commits
2. NO las reportes públicamente
3. Contacta al Lead de Seguridad

---

**Última actualización:** 11 de Febrero 2026

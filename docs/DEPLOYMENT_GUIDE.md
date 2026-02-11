# 🚀 GUÍA DE DESPLIEGUE - Portal de Licitaciones

## Estructura Actual

```
Raíz del proyecto:
├── *.html          ← Páginas web (index, organismos, palabras_clave, proveedores)
├── frontend/       ← Assets (CSS, JS)
├── api/            ← Endpoints PHP
├── backend/        ← Servidor Express + scripts Node.js
└── data/           ← CSV y logs
```

---

## ✅ Solución Implementada

### Servidor Node.js (Express)

El archivo `backend/server.js` está configurado para:
- ✅ Servir HTML desde la raíz del proyecto
- ✅ Servir assets (CSS/JS) desde `frontend/`
- ✅ Proporcionar API endpoints en `/api/licitaciones`

### Cómo funciona

```javascript
// Servir assets estáticos desde frontend/
app.use(express.static(path.join(__dirname, '../frontend')));

// Ruta raíz - HTML desde raíz del proyecto
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// API endpoints
app.get('/api/licitaciones', async (req, res) => { ... });
```

### Estructura de solicitudes

```
Solicitud                   Respuesta
─────────────────          ───────────────────────
GET /                    → index.html (raíz)
GET /frontend/styles.css → frontend/styles.css
GET /frontend/*.js       → frontend/*.js
GET /api/licitaciones    → JSON desde BD
```

---

## 🔧 Despliegue en Producción

### Opción 1: Servidor Node.js con PM2 (RECOMENDADO)

**Ventajas:**
- ✅ Versiones recientes de Node.js
- ✅ Control total de la aplicación
- ✅ Mejor rendimiento
- ✅ SSL/HTTPS fácil con Let's Encrypt

**Requisitos:**
- Node.js 16+ instalado
- PM2 para mantener proceso activo
- Nginx/Apache como reverse proxy
- Puerto 5500 abierto internamente

**Instalación:**

```bash
# 1. SSH en servidor
ssh usuario@www.hvillagranv.com

# 2. Instalar dependencias
cd /home/usuario/public_html/usoMP
npm install

# 3. Instalar PM2 globalmente
npm install -g pm2

# 4. Iniciar aplicación con PM2
pm2 start backend/server.js --name "licitaciones"

# 5. Guardar configuración PM2
pm2 save

# 6. Configurar PM2 para reiniciar en boot
pm2 startup
```

**Configuración Nginx como Reverse Proxy:**

```nginx
# /etc/nginx/sites-available/hvillagranv.com
server {
    listen 80;
    server_name www.hvillagranv.com hvillagranv.com;

    # Redirigir HTTP a HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name www.hvillagranv.com hvillagranv.com;

    # Certificados SSL (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/hvillagranv.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hvillagranv.com/privkey.pem;

    # Seguridad SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Proxy a Node.js
    location / {
        proxy_pass http://localhost:5500;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Archivos estáticos con caché
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        proxy_pass http://localhost:5500;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # API endpoints
    location /api/ {
        proxy_pass http://localhost:5500;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**Iniciar servidor:**
```bash
cd /home/usuario/public_html/usoMP
npm install
npm install helmet
node backend/server.js

# O con PM2
pm2 start backend/server.js --name "licitaciones"
```

---

### Opción 2: Hosting Compartido con PHP (cPanel)

**Si tu servidor actual corre PHP, puedes:**

**A) Usando .htaccess (Apache)**

Crear `.htaccess` en raíz:

```apache
# Redirigir requests a index.html para SPA routing
<IfModule mod_rewrite.c>
    RewriteEngine On
    
    # No reescribir archivos existentes o directorios
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    
    # Redirigir todo a index.html
    RewriteRule ^ frontend/index.html [QSA,L]
</IfModule>

# Comprimir respuestas
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/plain
    AddOutputFilterByType DEFLATE text/html
    AddOutputFilterByType DEFLATE text/xml
    AddOutputFilterByType DEFLATE text/css
    AddOutputFilterByType DEFLATE application/xml
    AddOutputFilterByType DEFLATE application/xhtml+xml
    AddOutputFilterByType DEFLATE application/rss+xml
    AddOutputFilterByType DEFLATE application/javascript
    AddOutputFilterByType DEFLATE application/x-javascript
</IfModule>

# Cache headers
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType text/css "access plus 30 days"
    ExpiresByType application/javascript "access plus 30 days"
    ExpiresByType image/jpeg "access plus 30 days"
    ExpiresByType image/png "access plus 30 days"
</IfModule>
```

**Mover archivos:**
```bash
# En cPanel File Manager o SSH
mkdir -p public_html/frontend
mv public_html/*.html public_html/frontend/
mv public_html/*.js public_html/frontend/
mv public_html/styles.css public_html/frontend/
mv public_html/*.php public_html/api/  # Los endpoints PHP
```

**B) Usando nginx en cPanel**

```nginx
location / {
    try_files $uri $uri/ /frontend/index.html?$query_string;
}

location ~* \.(js|css|png|jpg|jpeg|gif|ico)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}

location /api/ {
    # APIs PHP siguen funcionando
}
```

---

### Opción 3: Servidor Dedicado / VPS

**Con Docker (Recomendado):**

Crear `Dockerfile`:
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5500

CMD ["node", "backend/server.js"]
```

Crear `docker-compose.yml`:
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "5500:5500"
    environment:
      - NODE_ENV=production
      - PORT=5500
      - CORS_ORIGIN=https://www.hvillagranv.com
    volumes:
      - .env:/app/.env
    restart: always
```

**Ejecutar:**
```bash
docker-compose up -d
```

---

## 📋 Checklist de Despliegue

### Pre-Despliegue
- [ ] Actualizar `.env` con dominio real
- [ ] Instalar `npm install helmet`
- [ ] Confirmar que `frontend/index.html` existe
- [ ] Verificar que `backend/server.js` está actualizado

### Despliegue
- [ ] Hacer backup de configuración actual
- [ ] Actualizar código desde git (`git pull`)
- [ ] Ejecutar `npm install`
- [ ] Iniciar servidor: `node backend/server.js` o `pm2 start ...`
- [ ] Verificar que puerto 5500 está abierto (si es necesario)

### Post-Despliegue
- [ ] Probar: `curl http://localhost:5500/`
- [ ] Probar CSS/JS se cargan: `curl http://localhost:5500/styles.css`
- [ ] Probar API: `curl http://localhost:5500/api/licitaciones`
- [ ] Probar desde navegador: `https://www.hvillagranv.com`
- [ ] Verificar que CORS funciona
- [ ] Revisar logs: `pm2 logs licitaciones`

---

## 🔍 Troubleshooting

### "Cannot GET /"
**Causa:** El servidor no está respondiendo
```bash
# Verificar que server.js está ejecutándose
pm2 list

# Ver logs
pm2 logs licitaciones
```

### Archivos no se cargan (404)
**Causa:** La ruta a frontend/ está incorrecta
```bash
# Verificar estructura
ls -la frontend/
ls -la backend/

# El servidor debería estar en: backend/server.js
# Y frontend en: frontend/index.html (desde raíz del proyecto)
```

### CORS error
**Solución:** Actualizar `.env`:
```env
CORS_ORIGIN=https://www.hvillagranv.com,https://hvillagranv.com
```

### Puerto 5500 ya está en uso
```bash
# Cambiar puerto en .env
PORT=5501

# O matar proceso
lsof -i :5500
kill -9 <PID>
```

---

## 📊 Comparativa de Opciones

| Opción | Costo | Complejidad | Rendimiento | Recomendado |
|--------|-------|-------------|-------------|-------------|
| **Node.js Dedicado** | Medio | Media | Excelente | ✅ Sí |
| **Hosting Compartido** | Bajo | Baja | Bueno | Si hosting lo soporta |
| **Docker/VPS** | Alto | Alta | Excelente | Para escala |
| **Serverless (AWS)** | Variable | Alta | Muy bueno | Para carga variable |

---

## 🚀 Próximos Pasos

1. **Elegir opción de despliegue** según tu hosting actual
2. **Configurar archivo `.env`** con credenciales de producción
3. **Ejecutar servidor** con Node.js o en hosting compartido
4. **Verificar funcionamiento** desde navegador
5. **Monitorear logs** y performance
6. **Configurar backup** automático

---

**Última actualización:** 11 de Febrero 2026  
**Estado:** Listo para desplegar

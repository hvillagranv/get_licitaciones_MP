# 📊 MATRIZ DE RIESGOS DE SEGURIDAD

## Visualización de Vulnerabilidades

```
CRÍTICO (Acción Inmediata)
┌─────────────────────────────────────────┐
│ 🔴 3 Vulnerabilidades                   │
│                                         │
│ • Credenciales hardcodeadas            │
│ • CORS sin restricción                 │
│ • Exposición de errores BD             │
└─────────────────────────────────────────┘

ALTO (Próximas 2 Semanas)
┌─────────────────────────────────────────┐
│ 🟠 5 Vulnerabilidades                   │
│                                         │
│ • Validación de entrada insuficiente   │
│ • XSS potential en frontend            │
│ • Sin autenticación                    │
│ • Sin rate limiting                    │
│ • Sin HTTPS                            │
└─────────────────────────────────────────┘

MEDIO (Próximo Mes)
┌─────────────────────────────────────────┐
│ 🟡 3 Vulnerabilidades                   │
│                                         │
│ • Sin CSP headers                      │
│ • Sin CSRF protection                  │
│ • Logs con info sensible               │
└─────────────────────────────────────────┘
```

---

## 🎯 Matriz de Impacto vs Probabilidad

```
                    PROBABILIDAD
              Baja    Media    Alta
IMPACTO
 Alto    │     │      │ 🔴🔴🔴  │
         │-----┼------┼--------│
 Medio   │     │  🟠🟠 │ 🟠🟠🟠  │
         │-----┼------┼--------│
 Bajo    │  🟡  │  🟡  │   🟡   │

🔴 = CRÍTICO (Reparar AHORA)
🟠 = ALTO (Reparar próximas 2 semanas)
🟡 = MEDIO (Reparar próximo mes)
```

---

## 📈 Timeline de Remedición

```
Semana 1     Semana 2-3     Semana 4-6     Semana 7+
│            │              │              │
├─ 🔴 CRÍTICO ├─ 🟠 ALTO    ├─ 🟡 MEDIO   └─ Mantener
│            │              │              
│ 4 horas    │ 8 horas      │ 6 horas      
│ Esta       │ Próximas 2   │ Próximo      
│ semana     │ semanas      │ mes          
│            │              │              
├─ Credenciales en .env
├─ CORS restrictivo
├─ Desactivar errores
├─ Testing básico
└─ Deploy seguro
             ├─ Validación entrada
             ├─ XSS prevention
             ├─ Rate limiting
             ├─ Autenticación
             └─ Deploy producción
                        ├─ CSP headers
                        ├─ CSRF tokens
                        ├─ Logs seguros
                        ├─ Auditoría externa
                        └─ Deploy final
                                    └─ Monitoreo
                                    └─ Actualizaciones
```

---

## 🔐 Cobertura de Seguridad Actual vs Objetivo

```
                Actual    Objetivo    Progress
                                      
Credenciales    0%        100%        [        ] 0%
Autenticación   0%        100%        [        ] 0%
CORS            10%       100%        [        ] 10%
Rate Limiting   0%        100%        [        ] 0%
XSS Protection  5%        100%        [        ] 5%
CSRF Protection 0%        100%        [        ] 0%
HTTPS           0%        100%        [        ] 0%
Headers Seg.    0%        100%        [        ] 0%
Error Handling  30%       100%        [===     ] 30%
Input Validation 40%      100%        [====    ] 40%

PROMEDIO        8.5%      100%        [        ] 8.5%

DESPUÉS DE FASE 1:           50%       [========      ] 50%
DESPUÉS DE FASE 2:           85%       [==============] 85%
DESPUÉS DE FASE 3:           100%      [==================] 100%
```

---

## 📋 Dependencias por Vulnerabilidad

```
CREDENCIALES
├─ .env (crear)
├─ .gitignore (actualizar)
├─ backend/connectDB.js (reemplazar)
├─ licitacionesPub.php (editar)
├─ organismosPub.php (editar)
└─ proveedoresPub.php (editar)

CORS
├─ backend/server.js (editar)
├─ .env (agregar CORS_ORIGIN)
├─ npm install cors
└─ Testing

XSS
├─ frontend-security.js (usar)
├─ visualization.js (actualizar)
├─ palabras_clave.js (actualizar)
├─ organismos.js (actualizar)
└─ proveedores.js (actualizar)

OTROS
├─ Rate Limiting: npm install express-rate-limit
├─ Helmet: npm install helmet
├─ Validación: Funciones custom en PHP
├─ Autenticación: Implementar sesiones/JWT
└─ HTTPS: Certificado SSL
```

---

## 🔄 Workflow de Implementación

```
START
  │
  ├─ 1. Cambiar credenciales BD ──────┐
  │                                    │
  ├─ 2. Crear .env + dotenv ──────┐   │
  │                               │   │
  ├─ 3. Limpiar Git history ──────┤   │
  │                               │   │
  ├─ 4. Actualizar archivos ──────┤   │
  │                               │   │
  ├─ 5. npm install ──────────────┤   │
  │                               │   │
  ├─ 6. Testing local ────────────┤   │
  │                               │   │
  ├─ 7. Push a staging ───────────┼───┘
  │                               │
  ├─ 8. Testing en staging ───────┤
  │                               │
  ├─ 9. Code review ──────────────┤
  │                               │
  ├─ 10. Deploy a production ─────┘
  │
  └─ DONE ✅
```

---

## 📊 Costo vs Beneficio

```
┌──────────────────────────────────────────────┐
│  COSTO DE REMEDIAR AHORA                     │
├──────────────────────────────────────────────┤
│ Fase 1: $300-500      (4 horas)              │
│ Fase 2: $600-1000     (8 horas)              │
│ Fase 3: $450-750      (6 horas)              │
│                                              │
│ TOTAL: $1350-2250 USD (18 horas)             │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│  COSTO DE NO ACTUAR (Breach Scenario)        │
├──────────────────────────────────────────────┤
│ Robo de datos: $100,000+                     │
│ Downtime: $50,000+/hora                      │
│ Notificación usuarios: $10,000+              │
│ Multas/demandas: $500,000+                   │
│ Pérdida de reputación: Incalculable          │
│                                              │
│ TOTAL: $660,000+ USD                         │
└──────────────────────────────────────────────┘

ROI: 290x (Invertir $2250 para evitar $660,000)
```

---

## 🎯 Métricas de Éxito

Después de Fase 1:
```
✅ 0 credenciales en código
✅ 0 credenciales en Git history
✅ CORS restringido a dominios específicos
✅ Errores NO expuestos al cliente
✅ Aplicación funciona sin cambios visibles
```

Después de Fase 2:
```
✅ Todas las inputs validadas
✅ Protección XSS implementada
✅ Rate limiting activo
✅ Logs de seguridad generados
✅ npm audit limpio
```

Después de Fase 3:
```
✅ Headers de seguridad OWASP completos
✅ CSRF tokens en lugar
✅ Authenticate requerido para datos sensibles
✅ HTTPS configurado
✅ Auditoría externa aprobada
```

---

## 👥 Asignación de Responsabilidades

```
┌─────────────────┬──────────────────────┬─────────┐
│ Tarea           │ Responsable          │ Tiempo  │
├─────────────────┼──────────────────────┼─────────┤
│ Credenciales    │ DevOps               │ 30 min  │
│ .env setup      │ Backend Lead         │ 30 min  │
│ Git cleanup     │ Git Master           │ 30 min  │
│ CORS config     │ Backend Lead         │ 15 min  │
│ PHP updates     │ Backend Dev 1        │ 1 hora  │
│ Frontend XSS    │ Frontend Dev         │ 2 horas │
│ Validación      │ Backend Dev 2        │ 2 horas │
│ Rate limiting   │ Backend Lead         │ 1 hora  │
│ Testing         │ QA Engineer          │ 3 horas │
│ Deploy          │ DevOps               │ 1 hora  │
│ Monitoring      │ DevOps + Backend     │ Ongoing │
└─────────────────┴──────────────────────┴─────────┘
```

---

## 📞 Escalation Path

```
Si encuentras un problema:

Problem Found
     │
     ├─ Blocker (app no funciona)?
     │  └─ Escalar a Lead de Backend INMEDIATO
     │
     ├─ Security issue (error expuesto)?
     │  └─ Escalar a Security Lead URGENTE
     │
     ├─ Merge conflict?
     │  └─ Resolver con Git Master
     │
     └─ Test failure?
        └─ Avisar a QA Engineer
```

---

**Ultimo actualizado:** 11 Feb 2026  
**Válido por:** 6 meses  
**Requiere revisión:** 11 Aug 2026

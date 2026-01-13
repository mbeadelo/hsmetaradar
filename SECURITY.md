# 🔒 Medidas de Seguridad

Este documento describe las medidas de seguridad implementadas en HS Meta Radar.

## 🛡️ Protecciones Implementadas

### 1. Headers de Seguridad HTTP (Helmet.js)

- **Content Security Policy (CSP)**: Previene ataques XSS controlando qué recursos pueden cargarse
- **X-Frame-Options**: Previene clickjacking (DENY)
- **X-Content-Type-Options**: Previene MIME sniffing (nosniff)
- **X-XSS-Protection**: Protección adicional contra XSS
- **Cross-Origin Policies**: Configuradas para permitir Google Ads mientras mantienen seguridad

### 2. Rate Limiting

**Rate Limiter General:**
- 100 peticiones por IP cada 15 minutos
- Protege contra spam y ataques de denegación de servicio (DoS)

**Rate Limiter para /api/refresh:**
- 5 peticiones por IP cada 30 minutos
- Previene abuso del endpoint de scraping

### 3. Validación y Sanitización

- **JSON Payload Limit**: Máximo 10KB para evitar payloads maliciosos grandes
- **Archivos Estáticos**: Solo se sirven extensiones permitidas (.html, .json, .js, .css, .png, .jpg, etc.)
- **Archivos Ocultos**: Bloqueados (dotfiles: 'deny')
- **Códigos HTTP apropiados**: 403, 500, etc. según el tipo de error

### 4. Logging de Seguridad

- Log de IPs en peticiones al endpoint /api/refresh
- Log de errores con timestamps e IPs
- Log de peticiones 404 para detectar escaneos maliciosos
- Stack traces solo en desarrollo (ocultos en producción)

### 5. Endpoint /api/refresh Protegido

- Deshabilitado en producción (solo funciona en desarrollo local)
- Rate limiting agresivo (5 peticiones/30 min)
- Logging de todas las peticiones con IP
- Timeout de 2 minutos para evitar bloqueos

## 🔍 Monitoreo Recomendado

Para producción, considera configurar:

1. **Alertas de Rate Limiting**: Monitorear IPs que alcancen límites frecuentemente
2. **Logs Centralizados**: Usar servicios como Loggly, Papertrail, o CloudWatch
3. **Monitoreo de Errores**: Sentry o similar para tracking de errores
4. **Firewall**: Cloudflare o similar para DDoS protection adicional

## 🚨 Reportar Vulnerabilidades

Si encuentras una vulnerabilidad de seguridad, por favor NO la publiques públicamente. 
Contacta directamente al mantenedor del proyecto.

## 📋 Checklist de Seguridad para Deploy

- [x] Helmet configurado con CSP apropiada
- [x] Rate limiting activado
- [x] Validación de archivos estáticos
- [x] Logging de seguridad implementado
- [x] Error handling con información apropiada según entorno
- [x] Endpoint sensible (/api/refresh) protegido
- [ ] HTTPS configurado en producción (manejado por Render)
- [ ] Variables de entorno seguras (NODE_ENV=production)

## 🔄 Mantenimiento

- Revisar logs regularmente para patrones sospechosos
- Mantener dependencias actualizadas (`npm audit` y `npm update`)
- Revisar alertas de GitHub Dependabot
- Actualizar políticas de seguridad según nuevas amenazas

---

**Última actualización:** 2026-01-13

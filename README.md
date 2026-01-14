# HS Meta Radar

Este proyecto rastrea y publica el meta de Hearthstone Top Legend usando scraping automatizado y datos públicos. 

## Seguridad y privacidad
- No se almacenan ni exponen credenciales sensibles en el repositorio.
- El endpoint `/api/refresh` requiere un token secreto configurado por variable de entorno (`REFRESH_TOKEN`).
- No hay claves privadas, contraseñas ni secretos en el código fuente ni archivos versionados.

## ¿Cómo hacerlo público de forma segura?
1. **Verifica que no haya secretos en el código ni archivos.**
2. **Las variables sensibles deben ir en el entorno (ejemplo: Render, Vercel, Heroku, GitHub Secrets).**
3. **El workflow de GitHub Actions está restaurado y listo para funcionar.**
4. **No se expone información privada de usuarios, solo BattleTags públicos.**

## Uso
- Instala dependencias: `npm install`
- Ejecuta el servidor: `npm start`
- Ejecuta el scraper manualmente: `npm run scrape`

## Endpoints
- `/` Página principal
- `/api/health` Health check
- `/api/refresh` Refresca datos (requiere token)

## Licencia
Este proyecto es open source bajo licencia ISC.

---
**Checklist para hacerlo público:**
- [x] Sin secretos ni contraseñas en el repo
- [x] Token de refresco solo por variable de entorno
- [x] Documentación de seguridad incluida
- [x] Workflow de GitHub Actions restaurado
- [x] Datos sensibles fuera del repo

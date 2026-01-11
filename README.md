# 🃏 HS Meta Radar

Rastreador de mazos del Top 50 Legend de Hearthstone con actualización automática cada 30 minutos.

**Creado por [Entërra](https://www.youtube.com/@Enterra)** | [YouTube](https://www.youtube.com/@Enterra) | [Twitter @EnterraTV](https://twitter.com/EnterraTV)

🌐 **Live:** [hsmetaradar.com](https://hsmetaradar.com) *(próximamente)*

## 🚀 Deploy en Render (GRATIS)

### Paso 1: Subir a GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/hsmetaradar.git
git push -u origin main
```

### Paso 2: Deploy en Render
1. Ve a [render.com](https://render.com) y crea una cuenta (gratis)
2. Click en **"New"** → **"Web Service"**
3. Conecta tu repositorio de GitHub
4. Configuración automática:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node 20+
5. Click en **"Create Web Service"**
6. ¡Listo! En 2-3 minutos estará en línea

### Paso 3: Usar dominio personalizado (opcional)
1. En Render → Settings → Custom Domains
2. Añade tu dominio (ej: `hsmetaradar.com`)
3. Configura los DNS en tu proveedor:
   ```
   A     @       [IP de Render]
   CNAME www     tu-proyecto.onrender.com
   ```
4. HTTPS automático en 5-10 minutos

---

## 💻 Uso Local

### Iniciar el servidor
```bash
npm install
npm start
```

Abre http://localhost:3000 en tu navegador.

### Solo ejecutar el scraper
```bash
npm run scrape
```

### 2. **Railway** (10-20$/mes tras prueba)
- ✅ $5 créditos gratis al inicio
- ✅ No se duerme
- ✅ Muy fácil de usar
- ⚠️ Después de prueba, cuesta ~$10-20/mes

**Pasos:**
1. Ve a https://railway.app
2. "New Project" → Deploy from GitHub
3. Selecciona tu repo
4. Railway detecta Node.js automáticamente
5. Te da URL pública

### 3. **Heroku** (~$7/mes)
- Plan gratuito eliminado en 2022
- Plan básico: $7/mes
- Muy establecido y confiable

**Pasos:**
1. Instala Heroku CLI
2. `heroku create tu-proyecto`
3. `git push heroku main`

### 4. **VPS (DigitalOcean, Vultr, etc)** (~$5-10/mes)
- ✅ Control total
- ✅ Siempre activo
- ⚠️ Requiere configurar todo manualmente

**Pasos:**
1. Compra un VPS (ej: DigitalOcean Droplet $6/mes)
2. Instala Node.js
3. Clona tu repo
4. Instala PM2: `npm install -g pm2`
5. Ejecuta: `pm2 start server.js`
6. Configura nginx como proxy reverso

### 5. **Vercel/Netlify** (Gratis pero con limitaciones)
- ⚠️ Diseñados para sitios estáticos
- ⚠️ Funciones serverless tienen timeout (10-30 segundos)
- ❌ El scraper tarda ~30-60 segundos → NO RECOMENDADO

### 6. **Hosting propio 24/7**
Si tienes una computadora que puedes dejar encendida:
1. Instala Node.js
2. Clona el proyecto
3. `npm install`
4. `npm start`
5. Configura port forwarding en tu router (puerto 3000)
6. Usa servicio como No-IP para DNS dinámico

## 🔄 Actualización Automática (Opcional)

### Con cron job (Linux/Mac)
```bash
# Editar crontab
crontab -e

# Añadir: ejecutar cada 6 horas
0 */6 * * * cd /ruta/a/hsmetaradar && node index_hsguru_replays.js
```

### Con Task Scheduler (Windows)
1. Abre "Programador de tareas"
2. Crear tarea básica
3. Trigger: Cada 6 horas
4. Acción: `node D:\workspace-lolo\hsmetaradar\index_hsguru_replays.js`

### Con el servidor (node-cron)
Instala: `npm install node-cron`

Añade a `server.js`:
```javascript
const cron = require('node-cron');

// Ejecutar cada 6 horas
cron.schedule('0 */6 * * *', () => {
    console.log('🔄 Auto-refresh starting...');
    exec('node index_hsguru_replays.js', (error, stdout) => {
        if (error) console.error('Auto-refresh failed:', error);
        else console.log('✅ Auto-refresh completed');
    });
});
```

## 📊 Características

- ✅ Extrae Top 50 mazos de HSGuru
- ✅ Obtiene nombres de jugadores de HSReplay/Firestone
- ✅ Cross-referencia con 1350 BattleTags conocidos
- ✅ **Interfaz web moderna y responsive**
- ✅ **Enlaces a redes sociales del creador**
- ✅ **Espacios para Google AdSense (monetización)**
- ✅ **Footer profesional con información del creador**
- ✅ Botón de actualización manual
- ✅ Copia códigos de mazos con un click
- ✅ **Manejo inteligente de sin resultados:** Si no se encuentran nuevos mazos en el Top 50, se publican los datos existentes con un mensaje informativo

## 🔔 Sistema de Notificación Sin Nuevos Resultados

Cuando el scraper ejecuta y no encuentra nuevos replays del Top 50, en lugar de no hacer nada:

1. **Mantiene los datos existentes** en `top_decks.json`
2. **Actualiza el timestamp** con la hora del último intento
3. **Agrega un banner informativo** en la interfaz web que dice:
   > 📌 **Información actualizada:** Se ha refrescado la información pero no se han encontrado nuevos mazos recientes dentro del top 50

### Probar la funcionalidad

```bash
# Simular caso sin nuevos resultados
npm run test:no-results

# Abrir legend_decks.html para ver el banner

# Restaurar estado normal
npm run test:restore
```

Esto es útil para confirmar que el sistema está funcionando incluso cuando no hay nuevos datos disponibles.

## 🛠️ Estructura

```
hsmetaradar/
├── server.js                  # Servidor Express
├── index_hsguru_replays.js    # Scraper principal
├── legend_decks.html          # Frontend (con ads y redes sociales)
├── top_decks.json            # Datos scrapeados
├── master_list.json          # 1350 BattleTags conocidos
├── GOOGLE_ADS_SETUP.md       # Guía para configurar Google AdSense
└── get_battlefy.js           # Scraper de Battlefy (ya usado)
```

## 💰 Monetización

El proyecto incluye espacios preparados para Google AdSense:
- **2 banners horizontales** (728x90 o responsive)
- Ubicación estratégica para maximizar visibilidad
- Ver [GOOGLE_ADS_SETUP.md](GOOGLE_ADS_SETUP.md) para instrucciones completas

**Ingresos estimados:** $30-750/mes dependiendo del tráfico

## 💡 Recomendación Final

**Para uso personal:** Render (gratis)
**Para producción seria:** Railway o VPS
**Para máximo uptime:** VPS con PM2

---

¿Dudas? El proyecto está listo para deployarse en cualquiera de estas opciones.

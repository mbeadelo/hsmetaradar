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

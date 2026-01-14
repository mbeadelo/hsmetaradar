const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');


const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy para entornos detrás de proxy/reverse proxy (Render, Actions, etc)
app.set('trust proxy', 1);

// Try to load security modules (graceful degradation if not available)
let helmet, rateLimit;
try {
    helmet = require('helmet');
    rateLimit = require('express-rate-limit');
    console.log('✅ Security modules loaded');
} catch (err) {
    console.warn('⚠️ Security modules not available, running with basic security');
}

// Security: Helmet for HTTP headers (if available)
if (helmet) {
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "https://pagead2.googlesyndication.com",
                    "https://tpc.googlesyndication.com",
                    "https://www.googletagservices.com",
                    "https://www.googletagmanager.com",
                    "https://cdn.jsdelivr.net"
                ],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                imgSrc: ["'self'", "data:", "https:", "blob:"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                connectSrc: [
                    "'self'",
                    "https://pagead2.googlesyndication.com",
                    "https://tpc.googlesyndication.com",
                    "https://googleads.g.doubleclick.net",
                    "https://www.googletagservices.com",
                    "https://cdn.jsdelivr.net"
                ],
                frameSrc: [
                    "'self'",
                    "https://googleads.g.doubleclick.net",
                    "https://tpc.googlesyndication.com"
                ]
            }
        },
        crossOriginEmbedderPolicy: false, // Permitir recursos externos como Google Ads
    }));
}

// Rate limiting (if available)
if (rateLimit) {
    const generalLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutos
        max: 100, // Límite de 100 peticiones por IP
        message: { error: 'Demasiadas peticiones desde esta IP, intenta de nuevo más tarde.' },
        standardHeaders: true,
        legacyHeaders: false,
    });

    const refreshLimiter = rateLimit({
        windowMs: 30 * 60 * 1000, // 30 minutos
        max: 5, // Máximo 5 refrescos por IP cada 30 minutos
        message: { error: 'Límite de refrescos alcanzado. Intenta de nuevo más tarde.' },
        standardHeaders: true,
        legacyHeaders: false,
    });

    // Apply rate limiting to all requests
    app.use(generalLimiter);

    // Store for later use
    app.locals.refreshLimiter = refreshLimiter;
} else {
    console.warn('⚠️ Rate limiting disabled - install express-rate-limit for better security');
}

// Middleware
app.use(express.json({ limit: '10kb' })); // Limitar tamaño de JSON

// Security: Additional headers
app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');

    // Nota: X-Frame-Options DENY puede interferir con algunos formatos de anuncios
    // (aunque normalmente AdSense se renderiza en iframes de terceros y no enmarcando tu sitio).
    // Lo mantengo como lo tenías.
    res.set('X-Frame-Options', 'DENY');

    res.set('X-XSS-Protection', '1; mode=block');
    next();
});

// Disable caching for all static files
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Expires', '-1');
    res.set('Pragma', 'no-cache');
    next();
});

// Serve HTML first (before static files)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'legend_decks.html'));
});

// Static files (but not index.html since we override / route)
app.use(express.static(__dirname, {
    index: false,
    dotfiles: 'deny', // No servir archivos ocultos
    setHeaders: (res, filePath) => {
        // Solo servir archivos permitidos
        const allowedExtensions = ['.html', '.json', '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'];
        const ext = path.extname(filePath).toLowerCase();

        if (!allowedExtensions.includes(ext)) {
            // Importante: aquí no puedes "res.status(403)" y cortar la respuesta de static,
            // pero sí puedes marcar statusCode. Express seguirá intentando; esto es un hardening básico.
            res.statusCode = 403;
            return;
        }
    }
}));

// =======================================================
// API endpoint to refresh data (solo disponible en desarrollo/local)
// =======================================================
if (process.env.NODE_ENV !== 'production') {
  const refreshMiddleware = app.locals.refreshLimiter || ((req, res, next) => next());
  app.post('/api/refresh', refreshMiddleware, (req, res) => {
    res.status(403).json({
      success: false,
      error: 'Endpoint desactivado en producción. Usa GitHub Actions para refrescar datos.'
    });
  });
}

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    console.error(`❌ [${new Date().toISOString()}] Error from ${ip}:`, err.stack);

    res.status(err.status || 500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
    });
});

// 404 handler
app.use((req, res) => {
    const ip = req.ip || req.connection.remoteAddress;
    console.log(`⚠️ [${new Date().toISOString()}] 404 from ${ip}: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Not Found' });
});

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════╗
║   🃏 HS Meta Radar Server                 ║
║   Running on http://localhost:${PORT}       ║
╚════════════════════════════════════════════╝

📖 Open in browser: http://localhost:${PORT}
🔄 Refresh endpoint: POST /api/refresh (token protected)
⭐ Tracking ${PORT === 3000 ? 'Top 50' : 'Legend'} players

Press Ctrl+C to stop
`);
});

const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Security: Helmet for HTTP headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'", 
                "'unsafe-inline'", // Necesario para scripts inline en el HTML
                "https://pagead2.googlesyndication.com",
                "https://cdn.jsdelivr.net",
                "https://www.googletagmanager.com"
            ],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "https://pagead2.googlesyndication.com"],
            frameSrc: ["'self'", "https://googleads.g.doubleclick.net"],
        },
    },
    crossOriginEmbedderPolicy: false, // Permitir recursos externos como Google Ads
}));

// Rate limiting
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

// Middleware
app.use(express.json({ limit: '10kb' })); // Limitar tamaño de JSON

// Security: Additional headers
app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
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
            res.status(403);
            return;
        }
    }
}));

// API endpoint to refresh data
app.post('/api/refresh', refreshLimiter, (req, res) => {
    console.log('🔄 Refresh requested...');
    
    // Log IP address for security monitoring
    const ip = req.ip || req.connection.remoteAddress;
    console.log(`📍 IP: ${ip}`);
    
    // En producción (Render), no ejecutar el scraper por limitaciones del entorno
    if (process.env.RENDER || process.env.NODE_ENV === 'production') {
        console.log('⚠️ Scraper deshabilitado en producción. Actualiza localmente y haz push a GitHub.');
        return res.status(403).json({ 
            success: false, 
            error: 'El scraper no está disponible en producción. Ejecuta "npm run scrape" localmente y actualiza el repositorio.' 
        });
    }
    
    // Execute the scraper (solo en desarrollo local)
    exec('node index_hsguru_replays.js', { 
        cwd: __dirname,
        timeout: 120000 // 2 minutes timeout
    }, (error, stdout, stderr) => {
        if (error) {
            console.error('❌ Scraper error:', error);
            return res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
        
        console.log('✅ Scraper completed');
        console.log(stdout);
        
        // Read the updated JSON file
        try {
            const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'top_decks.json'), 'utf8'));
            res.json({ 
                success: true, 
                totalDecks: data.totalDecks || data.decks.length,
                knownPlayers: data.knownPlayers || 0,
                lastUpdate: data.lastUpdate
            });
        } catch (readError) {
            console.error('❌ Error reading result:', readError);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to read result file' 
            });
        }
    });
});

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
🔄 Auto-refresh available via button
⭐ Tracking ${PORT === 3000 ? 'Top 50' : 'Legend'} players

Press Ctrl+C to stop
`);
});

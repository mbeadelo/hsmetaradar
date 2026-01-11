const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

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
app.use(express.static(__dirname, { index: false }));

// API endpoint to refresh data
app.post('/api/refresh', (req, res) => {
    console.log('🔄 Refresh requested...');
    
    // Execute the scraper
    exec('node index_hsguru_replays.js', { 
        cwd: __dirname,
        timeout: 120000 // 2 minutes timeout
    }, (error, stdout, stderr) => {
        if (error) {
            console.error('❌ Scraper error:', error);
            return res.json({ 
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
            res.json({ 
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

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

// Lista de torneos ESA conocidos (agregar más según necesites)
const KNOWN_TOURNAMENTS = [
    'https://battlefy.com/esportsadmin-esa-events/hearthstone-masters-tour-open-qualifier-march-europe/67d0ce1c10bdf100181d89d5'
];

async function scrapeTournamentParticipants(page, tournamentUrl) {
    try {
        // Construir URL de participantes
        const participantsUrl = tournamentUrl.includes('/participants') 
            ? tournamentUrl 
            : `${tournamentUrl}/participants`;
            
        await page.goto(participantsUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 5000));

        // Hacer clic en "Load More" repetidamente
        let previousCount = 0;
        
        for (let i = 0; i < 15; i++) {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise(r => setTimeout(r, 1500));
            
            const currentCount = await page.evaluate(() => {
                const battleTags = document.body.innerText.match(/[A-Za-z0-9_]{3,20}#\d{4,5}/g);
                return battleTags ? new Set(battleTags).size : 0;
            });
            
            if (currentCount === previousCount && i > 2) {
                break;
            }
            
            previousCount = currentCount;
            
            const clicked = await page.evaluate(() => {
                const allElements = Array.from(document.querySelectorAll('*'));
                const loadMoreBtn = allElements.find(el => {
                    const text = (el.innerText || el.textContent || '').toLowerCase().trim();
                    return (text === 'load more' || text === 'show more' || text.includes('load')) &&
                           el.offsetParent !== null &&
                           (el.tagName === 'BUTTON' || el.tagName === 'A' || el.role === 'button');
                });
                
                if (loadMoreBtn) {
                    loadMoreBtn.click();
                    return true;
                }
                return false;
            });
            
            if (!clicked && i > 2) break;
            
            await new Promise(r => setTimeout(r, 2000));
        }

        // Extraer todos los BattleTags
        const players = await page.evaluate(() => {
            const battleTags = document.body.innerText.match(/[A-Za-z0-9_]{3,20}#\d{4,5}/g);
            return battleTags ? [...new Set(battleTags)] : [];
        });

        return players;
        
    } catch (err) {
        console.log(`      ✗ Error: ${err.message}`);
        return [];
    }
}

async function run() {
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 1400 });

        // Cargar la lista existente si existe
        let masterSet = new Set();
        if (fs.existsSync('master_list.json')) {
            const existing = JSON.parse(fs.readFileSync('master_list.json', 'utf8'));
            existing.forEach(p => masterSet.add(p));
            console.log(`📂 Cargados ${masterSet.size} jugadores existentes\n`);
        }

        console.log(`📡 Procesando ${KNOWN_TOURNAMENTS.length} torneos...\n`);

        let processedCount = 0;
        let newPlayersCount = 0;

        for (const tournamentUrl of KNOWN_TOURNAMENTS) {
            const name = tournamentUrl.split('/').slice(-2, -1)[0] || 'Torneo';
            console.log(`📋 [${++processedCount}/${KNOWN_TOURNAMENTS.length}] ${name}`);
            
            const players = await scrapeTournamentParticipants(page, tournamentUrl);
            
            const newPlayers = players.filter(p => !masterSet.has(p));
            newPlayers.forEach(p => masterSet.add(p));
            
            console.log(`   ✓ ${players.length} participantes | ${newPlayers.length} nuevos | Total: ${masterSet.size}\n`);
            
            newPlayersCount += newPlayers.length;
            
            // Pausa entre torneos
            await new Promise(r => setTimeout(r, 3000));
        }

        // Guardar la lista actualizada
        const finalList = Array.from(masterSet).sort();
        fs.writeFileSync('master_list.json', JSON.stringify(finalList, null, 2));
        
        console.log(`\n🔥 PROCESO COMPLETADO 🔥`);
        console.log(`   Total de jugadores: ${masterSet.size}`);
        console.log(`   Nuevos agregados: ${newPlayersCount}`);
        console.log(`   Archivo guardado: master_list.json`);
        
    } catch (e) {
        console.error("❌ Error:", e.message);
    } finally {
        await browser.close();
    }
}

run();
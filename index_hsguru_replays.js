const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function scrapeHSGuruReplays() {
    console.log('🚀 Iniciando scraping de HSGuru Top Legend Replays...\n');
    
    // Cargar lista de BattleTags conocidos
    let knownPlayers = [];
    if (fs.existsSync('master_list.json')) {
        knownPlayers = JSON.parse(fs.readFileSync('master_list.json', 'utf-8'));
        console.log(`📂 Cargados ${knownPlayers.length} jugadores conocidos\n`);
    }
    
    // Configuración para Render y otros entornos cloud
    const launchOptions = {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions'
        ]
    };
    
    // En producción (Render), usar el Chrome instalado por Puppeteer
    if (process.env.RENDER) {
        console.log('🔧 Entorno Render detectado, usando configuración especial...');
    }
    
    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        const url = 'https://www.hsguru.com/replays?rank=top_legend';
        console.log(`📖 Cargando ${url}...`);
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 5000));

        console.log('🔍 Extrayendo datos de replays...\n');

        const replays = await page.evaluate(() => {
            const results = [];
            const rows = document.querySelectorAll('table tbody tr');
            
            rows.forEach((row, index) => {
                try {
                    const rowText = row.innerText || row.textContent;
                    
                    // Buscar código de deck
                    const codeMatch = rowText.match(/AAE[A-Za-z0-9+/=]{50,}/);
                    if (!codeMatch) return;
                    const deckCode = codeMatch[0];
                    
                    // Buscar rank
                    const rankMatch = rowText.match(/#(\d+)\s+Legend/i);
                    if (!rankMatch) return;
                    const rank = parseInt(rankMatch[1]);
                    
                    // Extraer nombre del arquetipo
                    let deckName = 'Unknown Deck';
                    const match = rowText.match(/###\s+([^\n]+)/);
                    if (match) {
                        deckName = match[1].trim().split('AAE')[0].trim();
                    }
                    
                    // Timestamp
                    const timeMatch = rowText.match(/(\d+)\s+(minute|hour|second)s?\s+ago/i);
                    const timeAgo = timeMatch ? timeMatch[0] : 'Unknown';
                    
                    // Buscar enlace directo a HSReplay o Firestone
                    const links = row.querySelectorAll('a');
                    let replayUrl = null;
                    const allLinks = [];
                    for (const link of links) {
                        allLinks.push(link.href);
                        // Priorizar HSReplay, luego Firestone
                        if (link.href && link.href.includes('hsreplay.net')) {
                            replayUrl = link.href;
                            break;
                        }
                        if (link.href && link.href.includes('firestone')) {
                            replayUrl = link.href;
                        }
                    }
                    
                    // Guardar índice para poder hacer click después
                    results.push({
                        rank,
                        deckName,
                        deckCode,
                        timeAgo,
                        rowIndex: index,
                        replayUrl,
                        allLinks
                    });
                } catch (e) {
                    // Ignorar
                }
            });
            
            return results;
        });

        console.log(`✅ Encontrados ${replays.length} replays con deck codes\n`);

        if (replays.length === 0) {
            console.log('⚠️ No se encontraron replays.');
            await browser.close();
            return;
        }

        // Filtrar: Solo Top 50
        const top50Replays = replays.filter(r => r.rank <= 50);
        console.log(`🎯 Filtrados ${top50Replays.length}/${replays.length} replays del Top 50\n`);

        if (top50Replays.length === 0) {
            console.log('⚠️ No hay replays del Top 50.');
            await browser.close();
            return;
        }

        // Hacer click en cada replay para extraer nombre del jugador
        console.log('🖱️  Visitando enlaces de replays para extraer nombres...\n');
        
        for (const replay of top50Replays) {
            try {
                process.stdout.write(`   #${replay.rank} ${replay.deckName}... `);
                
                let newPage = null;
                
                // Si ya tenemos la URL del replay, navegar directamente
                if (replay.replayUrl) {
                    newPage = await browser.newPage();
                    
                    // Configurar headers para evitar detección
                    await newPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                    await newPage.setExtraHTTPHeaders({
                        'Accept-Language': 'en-US,en;q=0.9',
                    });
                    
                    await newPage.goto(replay.replayUrl, {waitUntil: 'networkidle2', timeout: 15000}).catch(() => {});
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    // Intentar hacer click si no tenemos URL
                    const newPagePromise = new Promise(resolve => {
                        browser.once('targetcreated', async target => {
                            const np = await target.page();
                            resolve(np);
                        });
                    });
                    
                    const clicked = await page.evaluate((rowIndex) => {
                        const rows = document.querySelectorAll('table tbody tr');
                        const row = rows[rowIndex];
                        if (!row) return false;
                        
                        const links = row.querySelectorAll('a');
                        for (const link of links) {
                            const text = link.innerText || link.textContent;
                            if (text.includes('View Replay') || text.includes('View') || link.href.includes('hsreplay')) {
                                link.click();
                                return true;
                            }
                        }
                        return false;
                    }, replay.rowIndex);
                    
                    if (!clicked) {
                        console.log('❌ No se encontró botón');
                        continue;
                    }
                    
                    newPage = await Promise.race([
                        newPagePromise,
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
                    ]).catch(() => null);
                }
                
                if (!newPage) {
                    console.log('❌ No se abrió nueva ventana');
                    continue;
                }
                
                // Esperar a que cargue la página de HSReplay
                await newPage.waitForSelector('body', {timeout: 5000}).catch(() => {});
                await new Promise(r => setTimeout(r, 2000));
                
                // Debug: URL y título
                const url = newPage.url();
                const title = await newPage.title();
                
                // Extraer nombre del jugador
                const playerData = await newPage.evaluate(() => {
                    // Método 1: HSReplay - buscar .deck-name span
                    const deckNameSpan = document.querySelector('.deck-name span');
                    if (deckNameSpan) {
                        const fullText = deckNameSpan.innerText.trim();
                        const nameMatch = fullText.match(/^(.+?)'s?\s+Deck/i);
                        if (nameMatch) {
                            return { name: nameMatch[1].trim(), source: 'HSReplay' };
                        }
                    }
                    
                    // Método 2: Buscar en cualquier span que contenga "'s Deck"
                    const allSpans = document.querySelectorAll('span');
                    for (const span of allSpans) {
                        const text = span.innerText || span.textContent || '';
                        if (text.includes("'s Deck") || text.includes("' Deck")) {
                            const nameMatch = text.match(/^(.+?)'s?\s+Deck/i);
                            if (nameMatch) {
                                return { name: nameMatch[1].trim(), source: 'Span Search' };
                            }
                        }
                    }
                    
                    // Método 3: Firestone - buscar en diferentes selectores comunes
                    const selectors = [
                        '.player-name',
                        '[class*="player"]',
                        '.username',
                        '[data-player-name]',
                        'h1', 'h2', 'h3'  // Títulos comunes
                    ];
                    
                    for (const sel of selectors) {
                        const elements = document.querySelectorAll(sel);
                        for (const elem of elements) {
                            const text = elem.innerText || elem.textContent || '';
                            // Evitar textos muy largos o muy cortos
                            if (text.length > 2 && text.length < 50 && 
                                !text.includes('http') && !text.includes('www')) {
                                // Verificar si parece un nombre de jugador
                                if (/^[A-Za-z0-9_\u4e00-\u9fa5가-힣]+$/u.test(text.trim())) {
                                    return { name: text.trim(), source: `Firestone (${sel})` };
                                }
                            }
                        }
                    }
                    
                    return { name: null, source: 'Not found' };
                }).catch(() => ({ name: null, source: 'Error' }));
                
                replay.playerName = playerData.name;
                
                if (playerData.name) {
                    console.log(`✅ ${playerData.name}`);
                } else {
                    console.log(`❌ (${title.substring(0, 30)})`);
                }
                
                // Cerrar la nueva pestaña
                await newPage.close().catch(() => {});
                
                await new Promise(r => setTimeout(r, 500));
                
            } catch (error) {
                console.log(`❌ Error: ${error.message.substring(0, 40)}`);
            }
        }
        
        console.log('');

        // Agrupar por rank
        const uniqueByRank = {};
        top50Replays.forEach(replay => {
            if (!uniqueByRank[replay.rank]) {
                uniqueByRank[replay.rank] = replay;
            }
        });

        // Convertir y ordenar
        const finalDecks = Object.values(uniqueByRank)
            .sort((a, b) => a.rank - b.rank)
            .map(replay => {
                // Buscar en master list
                const playerInList = replay.playerName 
                    ? knownPlayers.find(bt => 
                        bt.split('#')[0].toLowerCase() === replay.playerName.toLowerCase()
                    )
                    : null;
                
                return {
                    rank: replay.rank,
                    name: replay.playerName || `Legend #${replay.rank}`,
                    inMasterList: !!playerInList,
                    battleTag: playerInList || null,
                    deck: {
                        name: replay.deckName,
                        code: replay.deckCode
                    },
                    lastSeen: replay.timeAgo
                };
            });

        // Preview
        console.log('\n📊 Resultado final del Top 50:\n');
        const inList = finalDecks.filter(d => d.inMasterList).length;
        console.log(`   ⭐ ${inList} jugadores de tu master_list.json`);
        console.log(`   📋 ${finalDecks.length - inList} jugadores adicionales\n`);
        
        finalDecks.forEach(deck => {
            const badge = deck.inMasterList ? '⭐' : '  ';
            const battleTag = deck.battleTag ? ` [${deck.battleTag}]` : '';
            console.log(`  ${badge} #${deck.rank} ${deck.name}${battleTag} - ${deck.deck.name}`);
        });

        await browser.close();

        // Guardar
        const output = {
            lastUpdate: new Date().toISOString(),
            source: "HSGuru Top 50 + HSReplay player names",
            totalDecks: finalDecks.length,
            knownPlayers: inList,
            decks: finalDecks
        };

        fs.writeFileSync('top_decks.json', JSON.stringify(output, null, 2));
        
        console.log(`\n✨ ¡Completado! ${finalDecks.length} mazos del Top 50 guardados`);
        console.log(`⭐ Jugadores en tu lista: ${inList}/${finalDecks.length}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        await browser.close();
    }
}

scrapeHSGuruReplays();

const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeHSGuruReplays() {
    console.log('🚀 Iniciando scraping de HSGuru Top Legend Replays...\n');
    
    // Cargar lista de BattleTags conocidos
    let knownPlayers = [];
    if (fs.existsSync('master_list.json')) {
        knownPlayers = JSON.parse(fs.readFileSync('master_list.json', 'utf-8'));
        console.log(`📂 Cargados ${knownPlayers.length} jugadores conocidos\n`);
    }
    
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });

    try {
        const url = 'https://www.hsguru.com/replays?rank=top_legend';
        console.log(`📖 Cargando ${url}...`);
        
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(5000);

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
                    for (const link of links) {
                        if (link.href && link.href.includes('hsreplay.net')) {
                            replayUrl = link.href;
                            break;
                        }
                        if (link.href && link.href.includes('firestone')) {
                            replayUrl = link.href;
                        }
                    }
                    
                    results.push({
                        rank,
                        deckName,
                        deckCode,
                        timeAgo,
                        replayUrl
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

        // Visitar replays para extraer nombres
        console.log('🖱️  Visitando enlaces de replays para extraer nombres...\n');
        
        for (const replay of top50Replays) {
            try {
                process.stdout.write(`   #${replay.rank} ${replay.deckName}... `);
                
                if (!replay.replayUrl) {
                    console.log('❌ Sin URL');
                    continue;
                }
                
                const replayPage = await browser.newPage();
                await replayPage.goto(replay.replayUrl, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
                await replayPage.waitForTimeout(2000);
                
                // Extraer nombre del jugador
                const playerData = await replayPage.evaluate(() => {
                    // HSReplay
                    const deckNameSpan = document.querySelector('.deck-name span');
                    if (deckNameSpan) {
                        const fullText = deckNameSpan.innerText.trim();
                        const nameMatch = fullText.match(/^(.+?)'s?\s+Deck/i);
                        if (nameMatch) {
                            return { name: nameMatch[1].trim() };
                        }
                    }
                    
                    // Buscar "'s Deck" en cualquier span
                    const allSpans = document.querySelectorAll('span');
                    for (const span of allSpans) {
                        const text = span.innerText || span.textContent || '';
                        if (text.includes("'s Deck")) {
                            const nameMatch = text.match(/^(.+?)'s?\s+Deck/i);
                            if (nameMatch) {
                                return { name: nameMatch[1].trim() };
                            }
                        }
                    }
                    
                    return { name: null };
                }).catch(() => ({ name: null }));
                
                replay.playerName = playerData.name;
                
                if (playerData.name) {
                    console.log(`✅ ${playerData.name}`);
                } else {
                    console.log(`❌ Sin nombre`);
                }
                
                await replayPage.close();
                await page.waitForTimeout(500);
                
            } catch (error) {
                console.log(`❌ Error`);
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
        
        finalDecks.slice(0, 10).forEach(deck => {
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

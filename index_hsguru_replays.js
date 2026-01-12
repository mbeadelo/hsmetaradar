const { chromium } = require('playwright');
const fs = require('fs');

// Función para normalizar nombres para comparación
function normalizeName(name) {
    if (!name) return null;
    // Convertir a lowercase y remover espacios extra
    return name.trim().toLowerCase();
}

// Función para extraer BattleTag si existe
function extractBattleTag(text) {
    if (!text) return null;
    const match = text.match(/([a-zA-Z0-9]+)#(\d{4,5})/);
    return match ? match[0] : null;
}

// Función para cargar y limpiar datos históricos (últimos 30 días)
function loadHistoricalData() {
    if (!fs.existsSync('historical_data.json')) {
        return { entries: [] };
    }
    
    const data = JSON.parse(fs.readFileSync('historical_data.json', 'utf-8'));
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    
    // Filtrar solo entradas de los últimos 30 días
    data.entries = data.entries.filter(entry => {
        const entryTime = new Date(entry.timestamp).getTime();
        return entryTime > thirtyDaysAgo;
    });
    
    return data;
}

// Función para añadir nueva entrada a datos históricos
function addToHistoricalData(decks) {
    const historical = loadHistoricalData();
    
    // Añadir nueva entrada con timestamp
    historical.entries.push({
        timestamp: new Date().toISOString(),
        decks: decks
    });
    
    // Guardar
    fs.writeFileSync('historical_data.json', JSON.stringify(historical, null, 2));
    
    return historical;
}

async function scrapeHSGuruReplays() {
    console.log('🚀 Iniciando scraping de HSGuru Top Legend Replays...\n');
    
    // Cargar lista de BattleTags conocidos
    let knownPlayers = [];
    if (fs.existsSync('master_list.json')) {
        knownPlayers = JSON.parse(fs.readFileSync('master_list.json', 'utf-8'));
        console.log(`📂 Cargados ${knownPlayers.length} jugadores conocidos\n`);
    }
    
    // Cargar datos existentes
    let existingData = null;
    if (fs.existsSync('top_decks.json')) {
        existingData = JSON.parse(fs.readFileSync('top_decks.json', 'utf-8'));
        console.log(`📂 Cargados ${existingData.totalDecks} mazos existentes\n`);
    }
    
    // Cargar datos históricos (hasta 30 días)
    const historicalData = loadHistoricalData();
    console.log(`📊 Datos históricos: ${historicalData.entries.length} entradas (hasta 30 días)\n`);
    
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled'
        ]
    });
    
    const page = await browser.newPage({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Ocultar que somos un bot
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    try {
        const url = 'https://www.hsguru.com/replays?rank=top_legend';
        console.log(`📖 Cargando ${url}...`);
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        
        // Esperar a que la tabla esté presente
        console.log('⏳ Esperando tabla de replays...');
        await page.waitForSelector('table tbody tr', { timeout: 60000 });
        await page.waitForTimeout(5000);

        console.log('🔍 Extrayendo datos de replays...\n');

        const replays = await page.evaluate(() => {
            const results = [];
            const rows = document.querySelectorAll('table tbody tr');
            
            rows.forEach((row, index) => {
                try {
                    const rowText = row.innerText || row.textContent;
                    
                    // Buscar TODOS los códigos de deck en la fila (debería haber 2)
                    const allCodes = rowText.match(/AAE[A-Za-z0-9+/=]{50,}/g);
                    if (!allCodes || allCodes.length === 0) return;
                    
                    // Buscar rank - prueba varios patrones
                    let rank = null;
                    let rankMatch = rowText.match(/#(\d+)\s+Legend/i);
                    if (!rankMatch) rankMatch = rowText.match(/Legend\s+#?(\d+)/i);
                    if (!rankMatch) rankMatch = rowText.match(/\b(\d+)\s+Legend/i);
                    if (!rankMatch) rankMatch = rowText.match(/Rank\s*:?\s*(\d+)/i);
                    
                    if (!rankMatch) return;
                    rank = parseInt(rankMatch[1]);
                    
                    // Extraer nombre del jugador desde la tabla de HSGuru (priorizar BattleTag)
                    let playerName = null;
                    let hasBattleTag = false;
                    
                    // Buscar en las celdas de la fila
                    const cells = row.querySelectorAll('td');
                    for (const cell of cells) {
                        const cellText = cell.innerText || cell.textContent || '';
                        // Buscar BattleTag pattern (Name#12345)
                        const battleTagMatch = cellText.match(/([a-zA-Z0-9]+)#(\d{4,5})/);
                        if (battleTagMatch) {
                            playerName = battleTagMatch[0];
                            hasBattleTag = true;
                            break;
                        }
                    }
                    
                    // Si no encontramos BattleTag, buscar nombres comunes antes del rank
                    if (!playerName) {
                        const nameMatch = rowText.match(/^([a-zA-Z0-9_]+)\s+#?\d+\s+Legend/);
                        if (nameMatch) {
                            playerName = nameMatch[1];
                            hasBattleTag = false;
                        }
                    }
                    
                    // Extraer nombre del arquetipo (puede haber 2 arquetipos separados por "###")
                    const deckNamesMatches = rowText.match(/###\s+([^\n]+)/g);
                    const deckNames = deckNamesMatches ? deckNamesMatches.map(m => m.replace(/###\s+/, '').trim().split('AAE')[0].trim()) : [];
                    
                    // Extraer TODOS los arquetipos visibles de TODAS las celdas (para meta snapshot)
                    const allArchetypes = [];
                    const cellsList = Array.from(row.querySelectorAll('td'));
                    cellsList.forEach(cell => {
                        const cellText = cell.innerText || cell.textContent;
                        
                        // Método 1: Buscar patrón "### Archetype Name" 
                        const matches1 = cellText.match(/###\s+([^\n#]+)/g);
                        if (matches1) {
                            matches1.forEach(m => {
                                const archName = m.replace(/###\s+/, '').trim().split('AAE')[0].trim();
                                if (archName && archName.length > 3 && !allArchetypes.includes(archName)) {
                                    allArchetypes.push(archName);
                                }
                            });
                        }
                        
                        // Método 2: Buscar botones con clase o data-deck-name
                        const buttons = cell.querySelectorAll('button, [class*="deck"], [data-deck]');
                        buttons.forEach(btn => {
                            const btnText = (btn.innerText || btn.textContent || '').trim();
                            // Si el texto tiene formato "Class Archetype" o "Archetype Class"
                            if (btnText && btnText.length > 3 && !btnText.includes('AAE') && !allArchetypes.includes(btnText)) {
                                // Verificar si tiene formato válido de arquetipo
                                const words = btnText.split(' ');
                                if (words.length >= 2 && !btnText.includes('#') && !btnText.includes('Legend')) {
                                    allArchetypes.push(btnText);
                                }
                            }
                        });
                    });
                    
                    console.log(`   [DEBUG] Rank ${rank}: Found ${allArchetypes.length} archetypes: ${allArchetypes.join(' | ')}`);
                    
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
                    
                    // Crear entrada por cada deck code encontrado
                    allCodes.forEach((deckCode, deckIndex) => {
                        results.push({
                            rank,
                            playerName, // Nombre extraído directamente de HSGuru
                            hasBattleTag, // Flag para saber si tenemos BattleTag completo
                            deckName: deckNames[deckIndex] || 'Unknown Deck',
                            deckCode,
                            timeAgo,
                            replayUrl,
                            deckIndex, // 0 = jugador 1, 1 = jugador 2
                            allArchetypes // Para meta snapshot adicional
                        });
                    });
                } catch (e) {
                    // Ignorar
                }
            });
            
            return results;
        });

        console.log(`✅ Encontrados ${replays.length} replays con deck codes\n`);
        
        // Debug: mostrar cuántos deck codes por replay
        console.log(`📝 Total de deck entries: ${replays.length}`);
        const replayUrls = new Set(replays.map(r => r.replayUrl).filter(Boolean));
        console.log(`📝 URLs únicas de replays: ${replayUrls.size}\n`);

        if (replays.length === 0) {
            console.log('⚠️ No se encontraron replays.');
            await browser.close();
            
            if (existingData) {
                console.log('📌 Publicando datos existentes con mensaje de actualización...');
                existingData.lastUpdate = new Date().toISOString();
                existingData.noNewResults = true;
                existingData.noNewResultsMessage = 'Se ha refrescado la información pero no se han encontrado nuevos mazos recientes dentro del top 100';
                fs.writeFileSync('top_decks.json', JSON.stringify(existingData, null, 2));
                console.log('✨ Datos actualizados con mensaje de sin resultados nuevos');
            }
            return;
        }

        // Filtrar: Solo Top 100
        const top100Replays = replays.filter(r => r.rank <= 100);
        console.log(`🎯 Filtrados ${top100Replays.length}/${replays.length} replays del Top 100\n`);

        if (top100Replays.length === 0) {
            console.log('⚠️ No hay replays del Top 100.');
            await browser.close();
            
            if (existingData) {
                console.log('📌 Publicando datos existentes con mensaje de actualización...');
                existingData.lastUpdate = new Date().toISOString();
                existingData.noNewResults = true;
                existingData.noNewResultsMessage = 'Se ha refrescado la información pero no se han encontrado nuevos mazos recientes dentro del top 100';
                fs.writeFileSync('top_decks.json', JSON.stringify(existingData, null, 2));
                console.log('✨ Datos actualizados con mensaje de sin resultados nuevos');
            }
            return;
        }

        // Visitar replays para extraer nombres (solo URLs únicas)
        console.log('🖱️  Visitando replays para extraer nombres...\n');
        
        // Agrupar replays por URL para visitarlos una sola vez
        const replaysByUrl = {};
        top100Replays.forEach(replay => {
            if (replay.replayUrl) {
                if (!replaysByUrl[replay.replayUrl]) {
                    replaysByUrl[replay.replayUrl] = [];
                }
                replaysByUrl[replay.replayUrl].push(replay);
            }
        });
        
        for (const [url, replays] of Object.entries(replaysByUrl)) {
            try {
                const firstReplay = replays[0];
                process.stdout.write(`   #${firstReplay.rank} ${firstReplay.deckName}`);                
                // Mostrar URL para debugging
                console.log(`\n      URL: ${url}`);
                process.stdout.write(`      Extrayendo... `);
                                if (replays.length > 1) {
                    process.stdout.write(` + ${replays.length - 1} más... `);
                } else {
                    process.stdout.write(`... `);
                }
                
                // Si todos los replays ya tienen nombre de HSGuru, skip
                const allHaveNames = replays.every(r => r.playerName);
                if (allHaveNames) {
                    console.log(`✅ Ya tiene nombres (HSGuru)`);
                    continue;
                }
                
                const replayPage = await browser.newPage({
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                });
                
                // Ocultar que somos un bot
                await replayPage.addInitScript(() => {
                    Object.defineProperty(navigator, 'webdriver', { get: () => false });
                });
                
                try {
                    await replayPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    
                    // Esperar más tiempo si es HSReplay (por Cloudflare)
                    if (url.includes('hsreplay.net')) {
                        await replayPage.waitForTimeout(5000); // 5 segundos para Cloudflare
                    } else {
                        await replayPage.waitForTimeout(3000);
                    }
                    
                    let playerNames = [];
                    let deckCodes = [];
                    
                    // Debug: capturar URL y tipo
                    const pageType = url.includes('hsreplay.net') ? 'HSReplay' : url.includes('firestone') ? 'Firestone' : 'Unknown';
                    
                    // Detectar plataforma y usar método apropiado
                    if (url.includes('hsreplay.net')) {
                        // HSReplay (HDT) - Extraer AMBOS nombres y deck codes
                        const hsreplayData = await replayPage.evaluate(() => {
                            const names = [];
                            const codes = [];
                            
                            // Debug info
                            const debugInfo = {
                                title: document.title,
                                hasDeckNameSpans: document.querySelectorAll('.deck-name span').length,
                                hasDataPlayerName: document.querySelectorAll('[data-player-name]').length,
                                hasPlayerClass: document.querySelectorAll('.player-name, .player').length,
                                bodyLength: document.body.innerText.length
                            };
                            
                            // Método 1: .deck-name span con patrón "Name's Deck" (buscar todos y deduplicar)
                            const deckNameSpans = document.querySelectorAll('.deck-name span');
                            const uniqueNames = new Set();
                            deckNameSpans.forEach(span => {
                                const deckNameText = span.textContent || span.innerText;
                                const match = deckNameText.match(/^(.+?)'s\s+Deck/i);
                                if (match && match[1]) uniqueNames.add(match[1].trim());
                            });
                            names.push(...Array.from(uniqueNames));
                            
                            if (names.length === 0) {
                                // Método 2: Buscar atributos data-player-name (deduplicar)
                                const playerEls = document.querySelectorAll('[data-player-name]');
                                const uniquePlayerNames = new Set();
                                playerEls.forEach(el => {
                                    const name = el.getAttribute('data-player-name');
                                    if (name) uniquePlayerNames.add(name);
                                });
                                names.push(...Array.from(uniquePlayerNames));
                            }
                            
                            if (names.length === 0) {
                                // Método 3: Fallback - buscar en clases o texto (deduplicar)
                                const playerNameEls = document.querySelectorAll('.player-name, .player');
                                const uniquePlayerNames = new Set();
                                playerNameEls.forEach(el => {
                                    const name = el.innerText || el.textContent;
                                    if (name && name.trim()) uniquePlayerNames.add(name.trim());
                                });
                                names.push(...Array.from(uniquePlayerNames));
                            }
                            
                            // Si solo tenemos 1 nombre único, buscar BattleTags en el texto
                            if (names.length < 2) {
                                const bodyText = document.body.innerText;
                                const battleTagMatches = bodyText.match(/([a-zA-Z0-9]+)#(\d{4,5})/g);
                                if (battleTagMatches && battleTagMatches.length >= 1) {
                                    // Extraer nombres únicos de los BattleTags
                                    const battleTagNames = new Set();
                                    battleTagMatches.forEach(tag => {
                                        const name = tag.split('#')[0];
                                        battleTagNames.add(name);
                                    });
                                    
                                    // Si encontramos 2 o más nombres únicos de BattleTags, usarlos
                                    if (battleTagNames.size >= 2) {
                                        names.length = 0; // Limpiar
                                        names.push(...Array.from(battleTagNames).slice(0, 2));
                                    } else if (names.length === 0 && battleTagNames.size === 1) {
                                        // Si no teníamos ningún nombre, usar el BattleTag encontrado
                                        names.push(...Array.from(battleTagNames));
                                    } else if (names.length === 1 && battleTagNames.size >= 1) {
                                        // Si tenemos 1 nombre y hay BattleTags, añadir el que no esté ya
                                        const currentName = names[0].toLowerCase();
                                        for (const btName of battleTagNames) {
                                            if (btName.toLowerCase() !== currentName) {
                                                names.push(btName);
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                            
                            // Extraer deck codes de la página (en botones de copy o export)
                            const bodyText = document.body.innerText || document.body.textContent;
                            const codeMatches = bodyText.match(/AAE[A-Za-z0-9+/=]{50,}/g);
                            if (codeMatches) {
                                codes.push(...new Set(codeMatches)); // Deduplicar
                            }
                            
                            return { 
                                names: names.slice(0, 2), 
                                codes: codes.slice(0, 2),
                                debug: debugInfo
                            };
                        });
                        
                        playerNames = hsreplayData.names;
                        deckCodes = hsreplayData.codes;
                        
                        // Si no encontró nombres, mostrar debug
                        if (playerNames.length === 0) {
                            console.log(`\n      [HSReplay Debug] Title: ${hsreplayData.debug.title}`);
                            console.log(`      [HSReplay Debug] .deck-name spans: ${hsreplayData.debug.hasDeckNameSpans}`);
                            console.log(`      [HSReplay Debug] [data-player-name]: ${hsreplayData.debug.hasDataPlayerName}`);
                            console.log(`      [HSReplay Debug] .player-name: ${hsreplayData.debug.hasPlayerClass}`);
                            console.log(`      [HSReplay Debug] Body length: ${hsreplayData.debug.bodyLength} chars`);
                        }
                    } else if (url.includes('firestone')) {
                        // Firestone - Primero Events para nombres, luego Decks para códigos
                        try {
                            // PASO 1: Ir a Events y extraer nombres de jugadores
                            const eventsTab = await replayPage.$('button:has-text("Events"), a:has-text("Events"), [role="tab"]:has-text("Events")').catch(() => null);
                            if (eventsTab) {
                                await eventsTab.click();
                                await replayPage.waitForTimeout(1500);
                            }
                            
                            playerNames = await replayPage.evaluate(() => {
                                const names = [];
                                const bodyText = document.body.innerText;
                                
                                // Buscar texto después de "mulligan" para encontrar Turn 1
                                const mulliganIndex = bodyText.toLowerCase().indexOf('mulligan');
                                const relevantText = mulliganIndex >= 0 ? bodyText.substring(mulliganIndex) : bodyText;
                                
                                // Buscar patrón "Turn 1 - [Nombre]" o "Turn 1 [Nombre]" en el texto relevante
                                const turn1Matches = relevantText.match(/Turn\s+1[:\s-]+([a-zA-Z0-9#_]+)/gi);
                                if (turn1Matches && turn1Matches.length >= 2) {
                                    const uniqueNames = new Set();
                                    turn1Matches.forEach(match => {
                                        const nameMatch = match.match(/Turn\s+1[:\s-]+([a-zA-Z0-9#_]+)/i);
                                        if (nameMatch) uniqueNames.add(nameMatch[1].trim());
                                    });
                                    names.push(...Array.from(uniqueNames).slice(0, 2));
                                }
                                
                                if (names.length === 0) {
                                    // Fallback: buscar cualquier BattleTag
                                    const battleTagMatches = bodyText.match(/([a-zA-Z0-9]+)#(\d{4,5})/g);
                                    if (battleTagMatches) {
                                        const uniqueTags = new Set(battleTagMatches);
                                        names.push(...Array.from(uniqueTags).slice(0, 2));
                                    }
                                }
                                
                                return names.slice(0, 2);
                            });
                            
                            // Si no encontramos nombres (replay muy corto/surrender), marcar como inválido
                            if (playerNames.length === 0) {
                                console.log('❌ Replay sin información (posible surrender temprano)');
                                await replayPage.close();
                                continue; // Saltar este replay
                            }
                            
                            // PASO 2: Ir a Decks y buscar deck codes
                            const decksTab = await replayPage.$('button:has-text("Decks"), a:has-text("Decks"), [role="tab"]:has-text("Decks")').catch(() => null);
                            if (decksTab) {
                                await decksTab.click();
                                await replayPage.waitForTimeout(2000);
                                
                                // Intentar encontrar botones de deck y hacer clic
                                const deckButtons = await replayPage.$$('button').catch(() => []);
                                
                                // Extraer deck codes del contenido visible
                                deckCodes = await replayPage.evaluate(() => {
                                    const codes = [];
                                    const bodyText = document.body.innerText || document.body.textContent;
                                    
                                    // Buscar todos los códigos AAE en la página
                                    const codeMatches = bodyText.match(/AAE[A-Za-z0-9+/=]{50,}/g);
                                    if (codeMatches) {
                                        codes.push(...new Set(codeMatches));
                                    }
                                    
                                    return codes.slice(0, 2);
                                });
                                
                                // Si solo tenemos 1 código, intentar hacer clic en botones para revelar más
                                if (deckCodes.length < 2 && deckButtons.length >= 2) {
                                    for (let i = 0; i < Math.min(deckButtons.length, 4); i++) {
                                        try {
                                            await deckButtons[i].click();
                                            await replayPage.waitForTimeout(500);
                                            
                                            const newCodes = await replayPage.evaluate(() => {
                                                const codes = [];
                                                const bodyText = document.body.innerText;
                                                const codeMatches = bodyText.match(/AAE[A-Za-z0-9+/=]{50,}/g);
                                                if (codeMatches) {
                                                    codes.push(...new Set(codeMatches));
                                                }
                                                return codes;
                                            });
                                            
                                            if (newCodes.length > deckCodes.length) {
                                                deckCodes = newCodes.slice(0, 2);
                                                if (deckCodes.length >= 2) break;
                                            }
                                        } catch (e) {
                                            // Botón no clickeable, continuar
                                        }
                                    }
                                }
                            }
                            
                            // Si no hay códigos en Decks, buscar en toda la página
                            if (deckCodes.length === 0) {
                                deckCodes = await replayPage.evaluate(() => {
                                    const codes = [];
                                    const bodyText = document.body.innerText;
                                    const codeMatches = bodyText.match(/AAE[A-Za-z0-9+/=]{50,}/g);
                                    if (codeMatches) codes.push(...new Set(codeMatches));
                                    return codes.slice(0, 2);
                                });
                            }
                        } catch (err) {
                            // Si falla el click, intentar extraer directamente
                            const firestoneData = await replayPage.evaluate(() => {
                                const names = [];
                                const codes = [];
                                const bodyText = document.body.innerText;
                                
                                const battleTagMatches = bodyText.match(/([a-zA-Z0-9]+)#(\d{4,5})/g);
                                if (battleTagMatches) names.push(...new Set(battleTagMatches).slice(0, 2));
                                
                                const codeMatches = bodyText.match(/AAE[A-Za-z0-9+/=]{50,}/g);
                                if (codeMatches) codes.push(...new Set(codeMatches));
                                
                                return { 
                                    names: names.slice(0, 2), 
                                    codes: codes.slice(0, 2) 
                                };
                            });
                            
                            playerNames = firestoneData.names;
                            deckCodes = firestoneData.codes;
                        }
                    }
                    
                    // Si encontramos deck codes adicionales, crear nuevos replays
                    if (deckCodes.length > 1 && deckCodes.length > replays.length) {
                        // Hay más deck codes que los que teníamos, añadir el segundo jugador
                        const firstReplay = replays[0];
                        for (let i = replays.length; i < deckCodes.length; i++) {
                            const newReplay = {
                                rank: firstReplay.rank,
                                playerName: playerNames[i] || null,
                                deckName: 'Unknown Deck', // No sabemos el arquetipo del oponente
                                deckCode: deckCodes[i],
                                timeAgo: firstReplay.timeAgo,
                                replayUrl: url,
                                deckIndex: i
                            };
                            replays.push(newReplay);
                            top100Replays.push(newReplay);
                        }
                    }
                    
                    // Asignar nombres a los replays correspondientes según deckIndex
                    replays.forEach((replay, idx) => {
                        const nameIndex = replay.deckIndex || idx;
                        if (!replay.playerName && playerNames[nameIndex]) {
                            replay.playerName = playerNames[nameIndex];
                            // Verificar si el nombre extraído tiene BattleTag
                            replay.hasBattleTag = playerNames[nameIndex].includes('#');
                        }
                        // Actualizar deck code si lo encontramos
                        if (deckCodes[nameIndex]) {
                            replay.deckCode = deckCodes[nameIndex];
                        }
                    });
                    
                    // Mostrar resultados
                    if (playerNames.length > 0) {
                        console.log(`✅ ${playerNames.join(' vs ')} (${deckCodes.length} decks)`);
                    } else {
                        console.log('❌ Sin nombres');
                    }
                } catch (error) {
                    console.log('❌ Error cargando');
                }
                
                await replayPage.close();
                await page.waitForTimeout(500);
                
            } catch (error) {
                console.log('❌ Error');
            }
        }
        
        console.log('');

        // NO agrupar por rank - mantener TODOS los decks (ambos jugadores)
        // Solo deduplicar si son exactamente el mismo deck code + mismo jugador (normalizado)
        const uniqueDecks = [];
        const seen = new Set();
        
        top100Replays.forEach(replay => {
            const normalizedName = normalizeName(replay.playerName) || 'unknown';
            const key = `${replay.rank}-${replay.deckCode}-${normalizedName}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueDecks.push(replay);
            }
        });

        // Convertir y ordenar
        const finalDecks = uniqueDecks
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
        console.log('\n📊 Resultado final del Top 100:\n');
        const inList = finalDecks.filter(d => d.inMasterList).length;
        console.log(`   ⭐ ${inList} jugadores de tu master_list.json`);
        console.log(`   📋 ${finalDecks.length - inList} jugadores adicionales\n`);
        
        finalDecks.slice(0, 10).forEach(deck => {
            const badge = deck.inMasterList ? '⭐' : '  ';
            const battleTag = deck.battleTag ? ` [${deck.battleTag}]` : '';
            console.log(`  ${badge} #${deck.rank} ${deck.name}${battleTag} - ${deck.deck.name}`);
        });

        await browser.close();

        // Recopilar nombres nuevos para añadir a master_list
        const newPlayers = [];
        finalDecks.forEach(deck => {
            if (deck.name && !deck.inMasterList && deck.name !== `Legend #${deck.rank}`) {
                // Si tiene BattleTag completo, añadirlo
                if (deck.name.includes('#')) {
                    if (!newPlayers.includes(deck.name)) {
                        newPlayers.push(deck.name);
                    }
                }
            }
        });
        
        // Añadir nuevos jugadores a master_list.json
        if (newPlayers.length > 0) {
            console.log(`\n🆕 Añadiendo ${newPlayers.length} nuevos jugadores a master_list.json:`);
            newPlayers.forEach(player => console.log(`   + ${player}`));
            
            const updatedMasterList = [...knownPlayers, ...newPlayers].sort();
            fs.writeFileSync('master_list.json', JSON.stringify(updatedMasterList, null, 2));
            console.log('✨ master_list.json actualizado');
        }

        // ========================================
        // AÑADIR DATOS ACTUALES AL HISTÓRICO
        // ========================================
        const historical = addToHistoricalData(finalDecks);
        console.log(`\n📊 Datos históricos actualizados: ${historical.entries.length} entradas`);

        // ========================================
        // CALCULAR META SNAPSHOT + META SCORE CON DIFERENTES PERÍODOS
        // ========================================
        console.log('\n🔄 Calculando estadísticas para múltiples períodos de tiempo...\n');
        
        // Función auxiliar para filtrar decks por período
        function getDecksForPeriod(entries, hours) {
            const now = Date.now();
            const cutoff = now - (hours * 60 * 60 * 1000);
            const filteredEntries = entries.filter(entry => {
                const entryTime = new Date(entry.timestamp).getTime();
                return entryTime > cutoff;
            });
            const decks = [];
            filteredEntries.forEach(entry => decks.push(...entry.decks));
            return decks;
        }
        
        // Obtener decks para cada período
        const allDecks24h = getDecksForPeriod(historical.entries, 24);
        const allDecks7d = getDecksForPeriod(historical.entries, 24 * 7);
        const allDecks30d = getDecksForPeriod(historical.entries, 24 * 30);
        
        console.log(`📈 Mazos por período:`);
        console.log(`   - 24h: ${allDecks24h.length} mazos`);
        console.log(`   - 7 días: ${allDecks7d.length} mazos`);
        console.log(`   - 30 días: ${allDecks30d.length} mazos`);
        console.log();
        
        // Función para calcular estadísticas de un período
        function calculateMetaStats(decks, periodName) {
            console.log(`\n🔍 Calculando estadísticas para ${periodName}...`);
            
            const classDistribution = {};
            const archetypeData = {};
            
            decks.forEach(deck => {
                // Extraer clase del nombre del mazo
                const deckName = deck.deck.name;
                const words = deckName.split(' ');
                const className = words[words.length - 1];
                
                classDistribution[className] = (classDistribution[className] || 0) + 1;
                
                // Recopilar datos del arquetipo
                if (!archetypeData[deckName]) {
                    archetypeData[deckName] = {
                        count: 0,
                        ranks: [],
                        uniquePlayers: new Set(),
                        hasDeckCode: true
                    };
                }
                archetypeData[deckName].count++;
                archetypeData[deckName].ranks.push(deck.rank);
                
                if (deck.name !== `Legend #${deck.rank}`) {
                    const normalized = normalizeName(deck.name);
                    if (normalized) {
                        archetypeData[deckName].uniquePlayers.add(normalized);
                    }
                }
            });
            
            // Calcular Meta Score para cada arquetipo
            const archetypeScores = Object.entries(archetypeData).map(([name, data]) => {
                const frequencyScore = (data.count / decks.length) * 100 * 0.4;
                const uniquePlayersScore = (data.uniquePlayers.size / data.count) * 100 * 0.3;
                const avgRank = data.ranks.reduce((a, b) => a + b, 0) / data.ranks.length;
                const rankScore = ((100 - avgRank) / 100) * 100 * 0.3;
                const totalScore = frequencyScore + uniquePlayersScore + rankScore;
                
                let tier = 'C';
                if (totalScore >= 75) tier = 'S';
                else if (totalScore >= 60) tier = 'A';
                else if (totalScore >= 45) tier = 'B';
                
                return {
                    name,
                    count: data.count,
                    percentage: ((data.count / decks.length) * 100).toFixed(1),
                    uniquePlayers: data.uniquePlayers.size,
                    avgRank: Math.round(avgRank),
                    metaScore: Math.round(totalScore),
                    tier
                };
            });
            
            archetypeScores.sort((a, b) => b.metaScore - a.metaScore);
            
            // Snapshot (top 5 por frecuencia)
            const topArchetypes = [...archetypeScores]
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);
            
            // Porcentajes de clases
            const classPercentages = {};
            Object.keys(classDistribution).forEach(cls => {
                classPercentages[cls] = ((classDistribution[cls] / decks.length) * 100).toFixed(1);
            });
            
            console.log(`   ✅ ${Object.keys(archetypeData).length} arquetipos únicos`);
            
            return {
                snapshot: {
                    classDistribution,
                    classPercentages,
                    topArchetypes: topArchetypes.map(arch => ({
                        name: arch.name,
                        count: arch.count,
                        percentage: arch.percentage
                    })),
                    mostPlayedClass: Object.keys(classDistribution).sort((a, b) => 
                        classDistribution[b] - classDistribution[a])[0],
                    totalDecksAnalyzed: decks.length,
                    period: periodName
                },
                metaScore: {
                    archetypes: archetypeScores,
                    totalDecksAnalyzed: decks.length,
                    period: periodName,
                    lastCalculated: new Date().toISOString(),
                    methodology: {
                        frequency: "40% - Apariciones en el período",
                        diversity: "30% - Jugadores únicos que lo usan",
                        ranking: "30% - Ranking promedio de los jugadores"
                    }
                }
            };
        }
        
        // Calcular para cada período
        const stats24h = calculateMetaStats(allDecks24h, 'Last 24 hours');
        const stats7d = calculateMetaStats(allDecks7d, 'Last 7 days');
        const stats30d = calculateMetaStats(allDecks30d, 'Last 30 days');

        // Guardar datos actuales (última iteración) + estadísticas multi-período
        const output = {
            lastUpdate: new Date().toISOString(),
            source: "HSGuru Top 100 + HSReplay player names",
            totalDecks: finalDecks.length,
            knownPlayers: inList,
            decks: finalDecks,
            noNewResults: false,
            metaSnapshot: {
                '24h': stats24h.snapshot,
                '7d': stats7d.snapshot,
                '30d': stats30d.snapshot
            },
            metaScore: {
                '24h': stats24h.metaScore,
                '7d': stats7d.metaScore,
                '30d': stats30d.metaScore
            }
        };

        fs.writeFileSync('top_decks.json', JSON.stringify(output, null, 2));
        
        console.log(`\n✨ ¡Completado! ${finalDecks.length} mazos del Top 100 guardados`);
        console.log(`⭐ Jugadores en tu lista: ${inList}/${finalDecks.length}`);
        
        // Mostrar Top 3 Meta Score (24h)
        console.log('\n🏆 Top 3 Meta Score (24h):');
        if (stats24h && stats24h.metaScore && stats24h.metaScore.archetypes) {
            stats24h.metaScore.archetypes.slice(0, 3).forEach((arch, i) => {
                console.log(`   ${i + 1}. [${arch.tier}] ${arch.name} - Score: ${arch.metaScore} (${arch.count} decks, ${arch.uniquePlayers} jugadores)`);
            });
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        await browser.close();
    }
}

scrapeHSGuruReplays();

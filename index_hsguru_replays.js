// --- VERIFICACIÓN DE VERSIÓN PARA GITHUB ACTIONS ---
try {
  const { execSync } = require('child_process');
  const commit = execSync('git rev-parse --short HEAD').toString().trim();
  console.log(`🟢 index_hsguru_replays.js versión commit: ${commit} - Fecha: ${new Date().toISOString()}`);
} catch (e) {
  console.log(`🟢 index_hsguru_replays.js versión local (sin git): ${new Date().toISOString()}`);
}
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ================================
// Render/cron hardening helpers
// ================================
const DATA_DIR = process.env.DATA_DIR || process.cwd();
const LOCK_FILE = path.join(DATA_DIR, '.scrape.lock');
const ARCHETYPE_LATEST_FILE = path.join(DATA_DIR, 'archetype_latest.json');

function loadArchetypeLatest() {
  if (!fs.existsSync(ARCHETYPE_LATEST_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(ARCHETYPE_LATEST_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveArchetypeLatest(obj) {
  writeJsonAtomic(ARCHETYPE_LATEST_FILE, obj);
}

// Limitar memoria de stats (evita OOM cuando el histórico crece)
const MAX_DECKS_PER_PERIOD = parseInt(process.env.MAX_DECKS_PER_PERIOD || '1200', 10);

function p(file) {
  return path.join(DATA_DIR, file);
}

function writeJsonAtomic(filePath, obj) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, filePath);
}

function acquireLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const ageMs = Date.now() - fs.statSync(LOCK_FILE).mtimeMs;
      // Consider lock stale after 2 hours
      if (ageMs < 2 * 60 * 60 * 1000) return false;
    }
    fs.writeFileSync(LOCK_FILE, String(Date.now()));
    return true;
  } catch {
    // If lock handling fails, fail open but log
    return true;
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch {}
}

async function configurePage(page) {
  // Reduce bandwidth/CPU: block images/fonts/media
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (type === 'image' || type === 'font' || type === 'media') return route.abort();
    return route.continue();
  });

  page.setDefaultNavigationTimeout(60000);
  page.setDefaultTimeout(60000);
}

async function gotoWithRetries(page, url, options, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      await page.goto(url, options);
      return;
    } catch (e) {
      lastErr = e;
      const wait = 1000 * Math.pow(2, i);
      console.log(`   ⚠️ goto falló (${i + 1}/${retries}). Reintento en ${wait}ms: ${e.message}`);
      try { await page.waitForTimeout(wait); } catch {}
    }
  }
  throw lastErr;
}

// Función para normalizar nombres para comparación
function normalizeName(name) {
  if (!name) return null;
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
  if (!fs.existsSync(p('historical_data.json'))) {
    return { entries: [] };
  }

  const data = JSON.parse(fs.readFileSync(p('historical_data.json'), 'utf-8'));
  const now = Date.now();
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

  // Filtrar solo entradas de los últimos 30 días
  data.entries = (data.entries || []).filter(entry => {
    const entryTime = new Date(entry.timestamp).getTime();
    return entryTime > thirtyDaysAgo;
  });

  return data;
}

// Función para añadir nueva entrada a datos históricos
function addToHistoricalData(decks) {
  const historical = loadHistoricalData();

  historical.entries.push({
    timestamp: new Date().toISOString(),
    decks: decks
  });

  writeJsonAtomic(p('historical_data.json'), historical);
  return historical;
}

async function scrapeHSGuruReplays() {
  if (!acquireLock()) {
    console.log('⛔ Scrape ya en ejecución. Salgo para evitar solapamiento.');
    return;
  }

  console.log('🚀 Iniciando scraping de HSGuru Top Legend Replays...\n');

  let browser; // declarado fuera para finally

  // Cargar lista de BattleTags conocidos
  let knownPlayers = [];
  if (fs.existsSync(p('master_list.json'))) {
    knownPlayers = JSON.parse(fs.readFileSync(p('master_list.json'), 'utf-8'));
    console.log(`📂 Cargados ${knownPlayers.length} jugadores conocidos\n`);
  }

  // Cargar datos existentes
  let existingData = null;
  if (fs.existsSync(p('top_decks.json'))) {
    existingData = JSON.parse(fs.readFileSync(p('top_decks.json'), 'utf-8'));
    console.log(`📂 Cargados ${existingData.totalDecks} mazos existentes\n`);
  }

  // Cargar datos históricos (hasta 30 días)
  const historicalData = loadHistoricalData();
  console.log(`📊 Datos históricos: ${historicalData.entries.length} entradas (hasta 30 días)\n`);

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote'
        // '--single-process' // Si sigues con OOM, prueba a habilitarlo (a veces ayuda, a veces empeora)
      ]
    });

    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const page = await browser.newPage({ userAgent });
    await configurePage(page);
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Ocultar que somos un bot
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Reutilizar UNA sola página para replays (reduce muchísimo RAM)
    const replayPage = await browser.newPage({ userAgent });
    await configurePage(replayPage); // <-- CRÍTICO: antes NO lo hacías
    await replayPage.setViewportSize({ width: 1920, height: 1080 });
    await replayPage.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    const url = 'https://www.hsguru.com/replays?rank=top_legend';
    console.log(`📖 Cargando ${url}...`);

    await gotoWithRetries(page, url, { waitUntil: 'domcontentloaded', timeout: 90000 }, 3);

    console.log('⏳ Esperando tabla de replays...');
    await page.waitForSelector('table tbody tr', { timeout: 60000 });
    await page.waitForTimeout(5000);

    console.log('🔍 Extrayendo datos de replays...\n');

    const replays = await page.evaluate(() => {
      const results = [];
      const rows = document.querySelectorAll('table tbody tr');

      rows.forEach((row) => {
        try {
          const rowText = row.innerText || row.textContent;

          // Buscar TODOS los códigos de deck en la fila (debería haber 2)
          const allCodes = rowText.match(/AAE[A-Za-z0-9+/=]{50,}/g);
          if (!allCodes || allCodes.length === 0) return;

          // Buscar rank - prueba varios patrones
          let rankMatch = rowText.match(/#(\d+)\s+Legend/i);
          if (!rankMatch) rankMatch = rowText.match(/Legend\s+#?(\d+)/i);
          if (!rankMatch) rankMatch = rowText.match(/\b(\d+)\s+Legend/i);
          if (!rankMatch) rankMatch = rowText.match(/Rank\s*:?\s*(\d+)/i);
          if (!rankMatch) return;

          const rank = parseInt(rankMatch[1], 10);

          // Extraer nombre del jugador desde la tabla de HSGuru (priorizar BattleTag)
          let playerName = null;
          let hasBattleTag = false;

          const cells = row.querySelectorAll('td');
          for (const cell of cells) {
            const cellText = cell.innerText || cell.textContent || '';
            const battleTagMatch = cellText.match(/([a-zA-Z0-9]+)#(\d{4,5})/);
            if (battleTagMatch) {
              playerName = battleTagMatch[0];
              hasBattleTag = true;
              break;
            }
          }

          if (!playerName) {
            const nameMatch = rowText.match(/^([a-zA-Z0-9_]+)\s+#?\d+\s+Legend/);
            if (nameMatch) {
              playerName = nameMatch[1];
              hasBattleTag = false;
            }
          }

          // Extraer nombre del arquetipo
          const deckNamesMatches = rowText.match(/###\s+([^\n]+)/g);
          const deckNames = deckNamesMatches ? deckNamesMatches.map(m => m.replace(/###\s+/, '').trim().split('AAE')[0].trim()) : [];

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
              playerName,
              hasBattleTag,
              deckName: deckNames[deckIndex] || 'Unknown Deck',
              deckCode,
              timeAgo,
              replayUrl,
              deckIndex
            });
          });
        } catch (e) {
          // Ignorar
        }
      });

      return results;
    });

    console.log(`✅ Encontrados ${replays.length} replays con deck codes\n`);
    console.log(`📝 Total de deck entries: ${replays.length}`);
    const replayUrlsSet = new Set(replays.map(r => r.replayUrl).filter(Boolean));
    console.log(`📝 URLs únicas de replays: ${replayUrlsSet.size}\n`);

    if (replays.length === 0) {
      console.log('⚠️ No se encontraron replays.');

      if (existingData) {
        console.log('📌 Publicando datos existentes con mensaje de actualización...');
        existingData.lastUpdate = new Date().toISOString();
        existingData.noNewResults = true;
        existingData.noNewResultsMessage = 'Se ha refrescado la información pero no se han encontrado nuevos mazos recientes dentro del top 100';
        writeJsonAtomic(p('top_decks.json'), existingData);
        console.log('✨ Datos actualizados con mensaje de sin resultados nuevos');
      }
      return;
    }

    // Filtrar: Solo Top 100
    const top100Replays = replays.filter(r => r.rank <= 100);
    console.log(`🎯 Filtrados ${top100Replays.length}/${replays.length} replays del Top 100\n`);

    if (top100Replays.length === 0) {
      console.log('⚠️ No hay replays del Top 100.');

      if (existingData) {
        console.log('📌 Publicando datos existentes con mensaje de actualización...');
        existingData.lastUpdate = new Date().toISOString();
        existingData.noNewResults = true;
        existingData.noNewResultsMessage = 'Se ha refrescado la información pero no se han encontrado nuevos mazos recientes dentro del top 100';
        writeJsonAtomic(p('top_decks.json'), existingData);
        console.log('✨ Datos actualizados con mensaje de sin resultados nuevos');
      }
      return;
    }

    // Visitar replays para extraer nombres (solo URLs únicas)
    console.log('🖱️  Visitando replays para extraer nombres...\n');

    // Agrupar replays por URL
    const replaysByUrl = {};
    top100Replays.forEach(replay => {
      if (replay.replayUrl) {
        if (!replaysByUrl[replay.replayUrl]) replaysByUrl[replay.replayUrl] = [];
        replaysByUrl[replay.replayUrl].push(replay);
      }
    });

    // Iterar URLs sin crear páginas nuevas (replayPage reutilizada)
    for (const [replayUrl, group] of Object.entries(replaysByUrl)) {
      try {
        const firstReplay = group[0];

        process.stdout.write(`   #${firstReplay.rank} ${firstReplay.deckName}`);
        console.log(`\n      URL: ${replayUrl}`);
        process.stdout.write(`      Extrayendo... `);

        if (group.length > 1) process.stdout.write(` + ${group.length - 1} más... `);
        else process.stdout.write(`... `);

        // Si todos los replays ya tienen nombre de HSGuru, skip
        const allHaveNames = group.every(r => r.playerName);
        if (allHaveNames) {
          console.log(`✅ Ya tiene nombres (HSGuru)`);
          continue;
        }


        // Crear una nueva página para cada replay
        const replayPage = await browser.newPage({ userAgent });
        await configurePage(replayPage);
        await replayPage.setViewportSize({ width: 1920, height: 1080 });
        await replayPage.addInitScript(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        // Navegar con reintentos (Cloudflare / latencia)
        await gotoWithRetries(replayPage, replayUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }, 3);

        // Esperas ligeras (menos RAM que cargas completas)
        if (replayUrl.includes('hsreplay.net')) await replayPage.waitForTimeout(4500);
        else await replayPage.waitForTimeout(2500);

        let playerNames = [];
        let deckCodes = [];

        if (replayUrl.includes('hsreplay.net')) {
          const hsreplayData = await replayPage.evaluate(() => {
            const names = [];
            const codes = [];

            // Método 1: .deck-name span
            const deckNameSpans = document.querySelectorAll('.deck-name span');
            const uniqueNames = new Set();
            deckNameSpans.forEach(span => {
              const deckNameText = span.textContent || span.innerText;
              const match = deckNameText.match(/^(.+?)'s\s+Deck/i);
              if (match && match[1]) uniqueNames.add(match[1].trim());
            });
            names.push(...Array.from(uniqueNames));

            if (names.length === 0) {
              const playerEls = document.querySelectorAll('[data-player-name]');
              const uniquePlayerNames = new Set();
              playerEls.forEach(el => {
                const name = el.getAttribute('data-player-name');
                if (name) uniquePlayerNames.add(name);
              });
              names.push(...Array.from(uniquePlayerNames));
            }

            if (names.length === 0) {
              const playerNameEls = document.querySelectorAll('.player-name, .player');
              const uniquePlayerNames2 = new Set();
              playerNameEls.forEach(el => {
                const name = el.innerText || el.textContent;
                if (name && name.trim()) uniquePlayerNames2.add(name.trim());
              });
              names.push(...Array.from(uniquePlayerNames2));
            }

            if (names.length < 2) {
              const bodyText = document.body.innerText;
              const battleTagMatches = bodyText.match(/([a-zA-Z0-9]+)#(\d{4,5})/g);
              if (battleTagMatches && battleTagMatches.length >= 1) {
                const battleTagNames = new Set();
                battleTagMatches.forEach(tag => battleTagNames.add(tag.split('#')[0]));
                if (battleTagNames.size >= 2) {
                  names.length = 0;
                  names.push(...Array.from(battleTagNames).slice(0, 2));
                } else if (names.length === 0 && battleTagNames.size === 1) {
                  names.push(...Array.from(battleTagNames));
                } else if (names.length === 1 && battleTagNames.size >= 1) {
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

            const bodyText2 = document.body.innerText || document.body.textContent;
            const codeMatches = bodyText2.match(/AAE[A-Za-z0-9+/=]{50,}/g);
            if (codeMatches) codes.push(...new Set(codeMatches));

            return { names: names.slice(0, 2), codes: codes.slice(0, 2) };
          });

          playerNames = hsreplayData.names;
          deckCodes = hsreplayData.codes;

        } else if (replayUrl.includes('firestone')) {
          try {
            const eventsTab = await replayPage.$('button:has-text("Events"), a:has-text("Events"), [role="tab"]:has-text("Events")').catch(() => null);
            if (eventsTab) {
              await eventsTab.click();
              await replayPage.waitForTimeout(1200);
            }

            playerNames = await replayPage.evaluate(() => {
              const names = [];
              const bodyText = document.body.innerText;

              const mulliganIndex = bodyText.toLowerCase().indexOf('mulligan');
              const relevantText = mulliganIndex >= 0 ? bodyText.substring(mulliganIndex) : bodyText;

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
                const battleTagMatches = bodyText.match(/([a-zA-Z0-9]+)#(\d{4,5})/g);
                if (battleTagMatches) names.push(...Array.from(new Set(battleTagMatches)).slice(0, 2));
              }

              return names.slice(0, 2);
            });

            if (playerNames.length === 0) {
              console.log('❌ Replay sin información (posible surrender temprano)');
              await replayPage.close();
              continue;
            }

            const decksTab = await replayPage.$('button:has-text("Decks"), a:has-text("Decks"), [role="tab"]:has-text("Decks")').catch(() => null);
            if (decksTab) {
              await decksTab.click();
              await replayPage.waitForTimeout(1600);

              deckCodes = await replayPage.evaluate(() => {
                const codes = [];
                const bodyText = document.body.innerText || document.body.textContent;
                const codeMatches = bodyText.match(/AAE[A-Za-z0-9+/=]{50,}/g);
                if (codeMatches) codes.push(...new Set(codeMatches));
                return codes.slice(0, 2);
              });
            }

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
            const firestoneData = await replayPage.evaluate(() => {
              const names = [];
              const codes = [];
              const bodyText = document.body.innerText;

              const battleTagMatches = bodyText.match(/([a-zA-Z0-9]+)#(\d{4,5})/g);
              if (battleTagMatches) names.push(...Array.from(new Set(battleTagMatches)).slice(0, 2));

              const codeMatches = bodyText.match(/AAE[A-Za-z0-9+/=]{50,}/g);
              if (codeMatches) codes.push(...new Set(codeMatches));

              return { names: names.slice(0, 2), codes: codes.slice(0, 2) };
            });

            playerNames = firestoneData.names;
            deckCodes = firestoneData.codes;
          }
        }

        if (playerNames.length > 0) {
          console.log(`✅ ${playerNames.join(' vs ')} (${deckCodes.length || group.length} decks)`);
        } else {
          console.log('❌ Sin nombres');
        }

        // Pequeña pausa para no “calentar” el proceso
        await replayPage.waitForTimeout(250);
        await replayPage.close();

        // Asignar nombres / códigos al grupo según deckIndex
        group.forEach((replay, idx) => {
          const nameIndex = replay.deckIndex ?? idx;
          if (!replay.playerName && playerNames[nameIndex]) {
            replay.playerName = playerNames[nameIndex];
            replay.hasBattleTag = replay.playerName.includes('#');
          }
          if (deckCodes[nameIndex]) replay.deckCode = deckCodes[nameIndex];
        });

        if (playerNames.length > 0) {
          console.log(`✅ ${playerNames.join(' vs ')} (${deckCodes.length || group.length} decks)`);
        } else {
          console.log('❌ Sin nombres');
        }

        // Pequeña pausa para no “calentar” el proceso
        await page.waitForTimeout(250);

      } catch (error) {
        console.log('❌ Error');
      }
    }

    console.log('');

    // Deduplicar
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

    // Recopilar nuevos jugadores
    const newPlayers = [];
    finalDecks.forEach(deck => {
      if (deck.name && !deck.inMasterList && deck.name !== `Legend #${deck.rank}`) {
        if (deck.name.includes('#') && !newPlayers.includes(deck.name)) newPlayers.push(deck.name);
      }
    });

    if (newPlayers.length > 0) {
      console.log(`\n🆕 Añadiendo ${newPlayers.length} nuevos jugadores a master_list.json:`);
      newPlayers.forEach(player => console.log(`   + ${player}`));

      const updatedMasterList = [...knownPlayers, ...newPlayers].sort();
      writeJsonAtomic(p('master_list.json'), updatedMasterList);
      console.log('✨ master_list.json actualizado');
    }


    // ========================================
    // STATS: evitar arrays gigantes (cap por periodo)
    // ========================================
    console.log('\n🔄 Calculando estadísticas para múltiples períodos de tiempo...\n');


    function getDecksForPeriod(entries, hours, cap = MAX_DECKS_PER_PERIOD) {
      const now = Date.now();
      const cutoff = now - (hours * 60 * 60 * 1000);

      // Filtrar entradas recientes
      const filteredEntries = entries.filter(entry => {
        const entryTime = new Date(entry.timestamp).getTime();
        return entryTime > cutoff;
      });

      // En lugar de concatenar TODO, agregamos hasta "cap"
      const decks = [];
      for (const entry of filteredEntries) {
        if (!entry || !Array.isArray(entry.decks)) continue;
        for (const d of entry.decks) {
          decks.push(d);
          if (decks.length >= cap) return decks;
        }
      }
      return decks;
    }

    // Declarar e inicializar los arrays de decks por periodo
    const allDecks24h = getDecksForPeriod(historical.entries, 24);
    const allDecks7d = getDecksForPeriod(historical.entries, 24 * 7);
    const allDecks30d = getDecksForPeriod(historical.entries, 24 * 30);

    console.log(`📈 Mazos por período (cap ${MAX_DECKS_PER_PERIOD}):`);
    console.log(`   - 24h: ${allDecks24h.length} mazos`);
    console.log(`   - 7 días: ${allDecks7d.length} mazos`);
    console.log(`   - 30 días: ${allDecks30d.length} mazos`);
    console.log();

    function calculateMetaStats(decks, periodName, archetypeLatestCache) {
      // ...existing code...
    }

    // Inicialización segura de finalDecks (solo asignar si está indefinida)
    if (typeof finalDecks === 'undefined' || !Array.isArray(finalDecks)) global.finalDecks = [];

    // ...existing code...

    try {
      stats24h = calculateMetaStats(allDecks24h, 'Last 24 hours', archetypeLatest) || stats24h;
    } catch (e) { console.warn('No se pudo calcular stats24h:', e); }
    try {
      stats7d = calculateMetaStats(allDecks7d, 'Last 7 days', archetypeLatest) || stats7d;
    } catch (e) { console.warn('No se pudo calcular stats7d:', e); }
    try {
      stats30d = calculateMetaStats(allDecks30d, 'Last 30 days', archetypeLatest) || stats30d;
    } catch (e) { console.warn('No se pudo calcular stats30d:', e); }

    // ========================================
    // ACTUALIZAR archetype_latest.json
    // ========================================
    let archetypeLatest = loadArchetypeLatest();
    let updated = false;
    // 1. Nutrir con los decks reales
    finalDecks.forEach(deck => {
      const name = deck.deck?.name;
      const code = deck.deck?.code;
      if (!name || !code) return;
      const prev = archetypeLatest[name];
      if (!prev || new Date(deck.lastSeen).getTime() > new Date(prev.updatedAt).getTime()) {
        archetypeLatest[name] = {
          code,
          updatedAt: new Date().toISOString(),
          rank: deck.rank
        };
        updated = true;
      }
    });
    // 2. Nutrir con los sampleDeckCode de Meta Score (24h, 7d, 30d)
    [stats24h, stats7d, stats30d].forEach(stats => {
      if (!stats?.metaScore?.archetypes) return;
      stats.metaScore.archetypes.forEach(arch => {
        if (!arch.name || !arch.sampleDeckCode) return;
        const prev = archetypeLatest[arch.name];
        // Solo actualiza si no existe o el código es diferente
        if (!prev || prev.code !== arch.sampleDeckCode) {
          archetypeLatest[arch.name] = {
            code: arch.sampleDeckCode,
            updatedAt: new Date().toISOString(),
            rank: null
          };
          updated = true;
        }
      });
    });
    if (updated) saveArchetypeLatest(archetypeLatest);

    // ========================================
    // HISTÓRICO (se mantiene igual)
    // ========================================
    const historical = addToHistoricalData(finalDecks);
    console.log(`\n📊 Datos históricos actualizados: ${historical.entries.length} entradas`);

    // ========================================
    // STATS: evitar arrays gigantes (cap por periodo)
    // ========================================
    console.log('\n🔄 Calculando estadísticas para múltiples períodos de tiempo...\n');

    function getDecksForPeriod(entries, hours, cap = MAX_DECKS_PER_PERIOD) {
      const now = Date.now();
      const cutoff = now - (hours * 60 * 60 * 1000);

      // Filtrar entradas recientes
      const filteredEntries = entries.filter(entry => {
        const entryTime = new Date(entry.timestamp).getTime();
        return entryTime > cutoff;
      });

      // En lugar de concatenar TODO, agregamos hasta "cap"
      const decks = [];
      for (const entry of filteredEntries) {
        if (!entry || !Array.isArray(entry.decks)) continue;
        for (const d of entry.decks) {
          decks.push(d);
          if (decks.length >= cap) return decks;
        }
      }
      return decks;
    }

    // ...existing code...

    console.log(`📈 Mazos por período (cap ${MAX_DECKS_PER_PERIOD}):`);
    console.log(`   - 24h: ${allDecks24h.length} mazos`);
    console.log(`   - 7 días: ${allDecks7d.length} mazos`);
    console.log(`   - 30 días: ${allDecks30d.length} mazos`);
    console.log();

    function calculateMetaStats(decks, periodName, archetypeLatestCache) {
      console.log(`\n🔍 Calculando estadísticas para ${periodName}...`);

      const classDistribution = {};
      const archetypeData = {};

      decks.forEach(deck => {
        const deckName = deck?.deck?.name || 'Unknown Deck';
        const words = deckName.split(' ');
        const className = words[words.length - 1] || 'Unknown';

        classDistribution[className] = (classDistribution[className] || 0) + 1;

        if (!archetypeData[deckName]) {
          archetypeData[deckName] = {
            count: 0,
            ranks: [],
            uniquePlayers: new Set()
          };
        }

        archetypeData[deckName].count++;
        if (typeof deck.rank === 'number') archetypeData[deckName].ranks.push(deck.rank);

        if (deck.name !== `Legend #${deck.rank}`) {
          const normalized = normalizeName(deck.name);
          if (normalized) archetypeData[deckName].uniquePlayers.add(normalized);
        }
      });

      const decksLen = Math.max(decks.length, 1);

      const archetypeScores = Object.entries(archetypeData).map(([name, data]) => {
        const frequencyScore = (data.count / decksLen) * 100 * 0.4;
        const uniquePlayersScore = (data.uniquePlayers.size / Math.max(data.count, 1)) * 100 * 0.3;

        const ranksLen = Math.max(data.ranks.length, 1);
        const avgRank = data.ranks.reduce((a, b) => a + b, 0) / ranksLen;
        const rankScore = ((100 - avgRank) / 100) * 100 * 0.3;

        const totalScore = frequencyScore + uniquePlayersScore + rankScore;

        let tier = 'C';
        if (totalScore >= 75) tier = 'S';
        else if (totalScore >= 60) tier = 'A';
        else if (totalScore >= 45) tier = 'B';

        // sampleDeckCode: busca en archetypeLatestCache, si no, null
        let sampleDeckCode = null;
        if (archetypeLatestCache && archetypeLatestCache[name] && archetypeLatestCache[name].code) {
          sampleDeckCode = archetypeLatestCache[name].code;
        }

        return {
          name,
          count: data.count,
          percentage: ((data.count / decksLen) * 100).toFixed(1),
          uniquePlayers: data.uniquePlayers.size,
          avgRank: Number.isFinite(avgRank) ? Math.round(avgRank) : 100,
          metaScore: Math.round(totalScore),
          tier,
          sampleDeckCode
        };
      });

      archetypeScores.sort((a, b) => b.metaScore - a.metaScore);

      const topArchetypes = [...archetypeScores]
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const classPercentages = {};
      Object.keys(classDistribution).forEach(cls => {
        classPercentages[cls] = ((classDistribution[cls] / decksLen) * 100).toFixed(1);
      });

      console.log(`   ✅ ${Object.keys(archetypeData).length} arquetipos únicos`);

      const mostPlayedClass = Object.keys(classDistribution).sort((a, b) =>
        classDistribution[b] - classDistribution[a]
      )[0];

      return {
        snapshot: {
          classDistribution,
          classPercentages,
          topArchetypes: topArchetypes.map(arch => ({
            name: arch.name,
            count: arch.count,
            percentage: arch.percentage
          })),
          mostPlayedClass: mostPlayedClass || 'Unknown',
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


    // Inicialización segura de arrays y stats (solo asignar si están indefinidas)
    // (No redeclarar si ya existen)
    if (typeof allDecks24h === 'undefined' || !Array.isArray(allDecks24h)) global.allDecks24h = [];
    if (typeof allDecks7d === 'undefined' || !Array.isArray(allDecks7d)) global.allDecks7d = [];
    if (typeof allDecks30d === 'undefined' || !Array.isArray(allDecks30d)) global.allDecks30d = [];
    if (typeof finalDecks === 'undefined' || !Array.isArray(finalDecks)) global.finalDecks = [];

    // ...existing code...

    try {
      stats24h = calculateMetaStats(allDecks24h, 'Last 24 hours', archetypeLatest) || stats24h;
    } catch (e) { console.warn('No se pudo calcular stats24h:', e); }
    try {
      stats7d = calculateMetaStats(allDecks7d, 'Last 7 days', archetypeLatest) || stats7d;
    } catch (e) { console.warn('No se pudo calcular stats7d:', e); }
    try {
      stats30d = calculateMetaStats(allDecks30d, 'Last 30 days', archetypeLatest) || stats30d;
    } catch (e) { console.warn('No se pudo calcular stats30d:', e); }

    const output = {
      lastUpdate: new Date().toISOString(),
      source: "HSGuru Top 100 + HSReplay player names",
      totalDecks: finalDecks.length,
      knownPlayers: inList || 0,
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

    writeJsonAtomic(p('top_decks.json'), output);

    console.log(`\n✨ ¡Completado! ${finalDecks.length} mazos del Top 100 guardados`);
    console.log(`⭐ Jugadores en tu lista: ${inList}/${finalDecks.length}`);

    console.log('\n🏆 Top 3 Meta Score (24h):');
    if (stats24h?.metaScore?.archetypes) {
      stats24h.metaScore.archetypes.slice(0, 3).forEach((arch, i) => {
        console.log(`   ${i + 1}. [${arch.tier}] ${arch.name} - Score: ${arch.metaScore} (${arch.count} decks, ${arch.uniquePlayers} jugadores)`);
      });
    }

    // Cerrar páginas para liberar RAM
    try { await replayPage.close(); } catch {}
    try { await page.close(); } catch {}

  } catch (error) {
    console.error('❌ Error:', error && error.message ? error.message : error);
  } finally {
    try { if (browser) await browser.close(); } catch {}
    releaseLock();
  }
}

scrapeHSGuruReplays();

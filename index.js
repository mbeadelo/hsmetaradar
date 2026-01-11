const axios = require('axios');
const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const REGIONS = ['EU', 'US', 'AP'];

/**
 * Obtiene el mazo más reciente de un jugador desde HSReplay
 */
async function getDeckFromHSReplay(page, battleTag) {
    // HSReplay usa el formato completo con #
    const encodedTag = encodeURIComponent(battleTag);
    const possibleUrls = [
        `https://hsreplay.net/decks/mine/?hearthstone_account=${encodedTag}`,
        `https://hsreplay.net/games/mine/?hearthstone_account=${encodedTag}`,
        `https://hsreplay.net/account/${encodedTag}/`,
    ];

    for (const url of possibleUrls) {
        try {
            console.log(`\n      [Probando] ${url}`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
            await new Promise(r => setTimeout(r, 2500));

            const pageData = await page.evaluate(() => {
                const title = document.title;
                const bodyText = document.body.innerText.substring(0, 400);
                
                // Buscar si requiere login
                const needsLogin = bodyText.includes('Sign in') || 
                                  bodyText.includes('Log in') || 
                                  bodyText.includes('Premium');
                
                // Buscar deck en la página
                const deckLinks = Array.from(document.querySelectorAll('a[href*="/decks/"]'));
                const hasDeckData = deckLinks.length > 0;
                
                // Buscar código de deck visible
                const deckCodeEl = document.querySelector('[data-deckstring], [data-deck-code], .deck-code');
                const deckCode = deckCodeEl?.innerText || deckCodeEl?.getAttribute('data-deckstring');
                
                return {
                    title,
                    needsLogin,
                    hasDeckData,
                    deckCode,
                    bodyPreview: bodyText.substring(0, 200)
                };
            });

            console.log(`      [DEBUG] Título: "${pageData.title}"`);
            console.log(`      [DEBUG] Login requerido: ${pageData.needsLogin}`);
            console.log(`      [DEBUG] Tiene deck data: ${pageData.hasDeckData}`);
            console.log(`      [BODY] ${pageData.bodyPreview}`);
            
            if (pageData.deckCode) {
                return { name: "Deck Reciente HSReplay", code: pageData.deckCode };
            }
            
            if (!pageData.needsLogin && pageData.hasDeckData) {
                // Hay datos pero necesitamos extraerlos mejor
                console.log(`      ✓ Página encontrada con datos, pero sin código directo`);
                return { name: "Perfil encontrado (sin código público)", code: null };
            }
            
        } catch (error) {
            console.log(`      [ERROR] ${error.message.substring(0, 80)}`);
            continue;
        }
    }

    return { name: "No disponible en HSReplay", code: null };
}

/**
 * Consulta el ranking oficial de Blizzard para ver quién está activo
 */
async function getLiveLeaderboard(region) {
    try {
        const url = `https://hearthstone.blizzard.com/es-es/api/community/leaderboardsData?region=${region}&leaderboardId=standard`;
        const res = await axios.get(url);
        
        // La estructura real es res.data.leaderboard.rows
        if (res.data && res.data.leaderboard && res.data.leaderboard.rows) {
            return res.data.leaderboard.rows;
        }
        
        return [];
    } catch (e) {
        console.error(`❌ Error consultando ranking Blizzard ${region}:`, e.message);
        return [];
    }
}

async function main() {
    // 1. Cargamos tu lista de Battlefy / Amigos
    if (!fs.existsSync('master_list.json')) {
        console.log("❌ No se encuentra master_list.json. Crea el archivo con ['Nombre#1234'] primero.");
        return;
    }
    const masterList = JSON.parse(fs.readFileSync('master_list.json', 'utf-8'));
    
    const finalData = {};

    // Iniciar browser
    console.log('🚀 Iniciando navegador...\n');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        for (const reg of REGIONS) {
            console.log(`\n--- 🔍 PROCESANDO REGIÓN: ${reg} ---`);
            
            // 2. Obtenemos el ranking en vivo de Blizzard
            const livePlayers = await getLiveLeaderboard(reg);
            
            // 3. Cruzamos datos: ¿Quién de mi lista está hoy en el ranking?
            // Comparamos el nombre (sin el #) para mayor flexibilidad
            const activeTargets = livePlayers.filter(lp => 
                masterList.some(ml => lp.accountid.toLowerCase() === ml.split('#')[0].toLowerCase())
            );

            console.log(`🎯 ${activeTargets.length} jugadores de tu lista detectados en el Top.`);

            finalData[reg] = [];

            // 4. Extraemos mazos solo de los activos
            for (const target of activeTargets) {
                // Encontrar el BattleTag completo de la master list
                const fullBattleTag = masterList.find(ml => 
                    ml.split('#')[0].toLowerCase() === target.accountid.toLowerCase()
                );
                
                if (!fullBattleTag) continue;
                
                process.stdout.write(`🛰️  Obteniendo mazo de ${fullBattleTag} (Rank ${target.rank})... `);
                
                const deckInfo = await getDeckFromHSReplay(page, fullBattleTag);
                
                if (deckInfo && deckInfo.code) {
                    finalData[reg].push({
                        rank: target.rank,
                        name: fullBattleTag,
                        deck: deckInfo
                    });
                    console.log(`✅ [${deckInfo.name}]`);
                } else {
                    console.log(`⏭️  [${deckInfo.name}]`);
                }

                // Un pequeño retraso para ser amigables con la API
                await new Promise(r => setTimeout(r, 800));
            }
        }
    } finally {
        await browser.close();
    }

    // 5. Guardamos el resultado final
    fs.writeFileSync('top_decks.json', JSON.stringify(finalData, null, 2));
    console.log("\n🚀 ¡TODO LISTO! Datos actualizados en top_decks.json");
}

main();
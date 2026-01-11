const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

/**
 * Scrapea los mazos featured de HearthstoneTopDecks.com
 * Estos son mazos de jugadores top legend con códigos públicos
 */
async function scrapeTopDecks() {
    console.log('🚀 Iniciando scraping de HearthstoneTopDecks...\n');
    
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        const url = 'https://www.hearthstonetopdecks.com/';
        console.log(`📖 Cargando ${url}...`);
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await new Promise(r => setTimeout(r, 3000));

        const decks = await page.evaluate(() => {
            const results = [];
            
            // Buscar decks en la sección "FEATURED DECKS"
            const featuredSection = document.querySelector('.featured-decks, [class*="featured"]');
            const deckLinks = document.querySelectorAll('a[href*="/decks/"]');
            
            deckLinks.forEach((link, idx) => {
                if (idx >= 15) return; // Limitar a 15 decks
                
                const href = link.href;
                const text = link.innerText || link.textContent;
                
                // Buscar patrón: "Nombre Deck – #X Legend (PlayerName)"
                const legendMatch = text.match(/#(\d+)\s+Legend\s+\(([^)]+)\)/i);
                
                if (legendMatch) {
                    const rank = parseInt(legendMatch[1]);
                    const playerName = legendMatch[2];
                    
                    // Extraer nombre del deck (antes del "–")
                    const deckNameMatch = text.match(/^([^–]+)/);
                    const deckName = deckNameMatch ? deckNameMatch[1].trim() : 'Unknown Deck';
                    
                    results.push({
                        deckName,
                        playerName,
                        rank,
                        url: href
                    });
                }
            });
            
            return results;
        });

        console.log(`✅ Encontrados ${decks.length} mazos legendarios\n`);

        // Visitar cada página de deck para obtener el código
        const finalDecks = [];
        
        for (const deck of decks) {
            process.stdout.write(`🔍 ${deck.playerName} (Rank #${deck.rank}) - ${deck.deckName}... `);
            
            try {
                await page.goto(deck.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
                await new Promise(r => setTimeout(r, 2000));

                const deckCode = await page.evaluate(() => {
                    // Buscar el código del deck en la página
                    const codeInput = document.querySelector('input[readonly].deckstring, input[value^="AAE"], textarea[readonly]');
                    if (codeInput) return codeInput.value;
                    
                    // Buscar en botones de copiar
                    const copyBtn = document.querySelector('[data-clipboard-text^="AAE"]');
                    if (copyBtn) return copyBtn.getAttribute('data-clipboard-text');
                    
                    // Buscar en texto visible
                    const codeText = document.body.innerText.match(/AAE[A-Za-z0-9+/=]{50,}/);
                    if (codeText) return codeText[0];
                    
                    return null;
                });

                if (deckCode) {
                    finalDecks.push({
                        rank: deck.rank,
                        name: deck.playerName,
                        deck: {
                            name: deck.deckName,
                            code: deckCode
                        }
                    });
                    console.log(`✅`);
                } else {
                    console.log(`⚠️ Sin código`);
                }

                await new Promise(r => setTimeout(r, 800));
                
            } catch (error) {
                console.log(`❌ Error: ${error.message.substring(0, 50)}`);
            }
        }

        await browser.close();

        // Organizar por rank
        finalDecks.sort((a, b) => a.rank - b.rank);

        // Guardar resultado
        const output = {
            lastUpdate: new Date().toISOString(),
            source: "HearthstoneTopDecks.com",
            decks: finalDecks
        };

        fs.writeFileSync('top_decks.json', JSON.stringify(output, null, 2));
        
        console.log(`\n✨ ¡Completado! ${finalDecks.length} mazos guardados en top_decks.json`);
        console.log(`📊 Ranks encontrados: #${Math.min(...finalDecks.map(d => d.rank))} - #${Math.max(...finalDecks.map(d => d.rank))}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        await browser.close();
    }
}

scrapeTopDecks();

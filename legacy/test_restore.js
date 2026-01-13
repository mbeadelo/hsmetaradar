// Script para restaurar el estado normal (quitar flag noNewResults)
const fs = require('fs');

console.log('🔄 Restaurando estado normal...\n');

// Leer datos existentes
if (!fs.existsSync('top_decks.json')) {
    console.error('❌ Error: No existe top_decks.json');
    process.exit(1);
}

const existingData = JSON.parse(fs.readFileSync('top_decks.json', 'utf-8'));

// Quitar flags de sin nuevos resultados
existingData.noNewResults = false;
delete existingData.noNewResultsMessage;

// Guardar
fs.writeFileSync('top_decks.json', JSON.stringify(existingData, null, 2));

console.log('✅ Restaurado top_decks.json a estado normal');
console.log('📌 El banner de información ya no aparecerá');

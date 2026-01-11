// Script de prueba para simular el caso de "sin nuevos resultados"
const fs = require('fs');

console.log('🧪 Test: Simulando caso sin nuevos resultados...\n');

// Leer datos existentes
if (!fs.existsSync('top_decks.json')) {
    console.error('❌ Error: No existe top_decks.json');
    process.exit(1);
}

const existingData = JSON.parse(fs.readFileSync('top_decks.json', 'utf-8'));
console.log(`📂 Datos existentes: ${existingData.totalDecks} mazos`);

// Actualizar con flag de sin nuevos resultados
existingData.lastUpdate = new Date().toISOString();
existingData.noNewResults = true;
existingData.noNewResultsMessage = 'Se ha refrescado la información pero no se han encontrado nuevos mazos recientes dentro del top 50';

// Guardar
fs.writeFileSync('top_decks.json', JSON.stringify(existingData, null, 2));

console.log('✅ Actualizado top_decks.json con flag noNewResults');
console.log('\n📌 Ahora puedes abrir legend_decks.html para ver el banner de información');

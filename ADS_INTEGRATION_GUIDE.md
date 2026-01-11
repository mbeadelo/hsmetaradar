# 📢 Guía Visual - Integración de Google Ads

## 🎯 Ubicaciones de los Anuncios

### Vista Completa Desktop

```
╔════════════════════════════════════════════════════════════╗
║                       HEADER                               ║
║  🃏 HS Meta Radar by Entërra                               ║
║  [🎥 YouTube]  [🐦 @EnterraTV]                            ║
╚════════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════════╗
║              📡 SOBRE EL PROYECTO                          ║
║  Tracker automático del Top 50 Legend                      ║
║  Creado y mantenido por Entërra                           ║
╚════════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════════╗
║            📢 GOOGLE ADS - BANNER #1                       ║
║         (Tu código de AdSense va aquí)                     ║
║              728x90 Leaderboard                            ║
╚════════════════════════════════════════════════════════════╝
         ▲▲▲ ZONA DE ALTO TRÁFICO ▲▲▲

┌────────────────────────────────────────────────────────────┐
│  💎 #5 TrueBench - Hagatha Shaman                         │
│  💎 #6 SAVOR - Hagatha Shaman                             │
│  ⭐ #10 Jiuqianyu - Elise Rogue                           │
│  ⭐ #11 TrueBench - Elise Rogue                           │
│  ... más mazos ...                                         │
└────────────────────────────────────────────────────────────┘

╔════════════════════════════════════════════════════════════╗
║            📢 GOOGLE ADS - BANNER #2                       ║
║         (Tu código de AdSense va aquí)                     ║
║              728x90 Leaderboard                            ║
╚════════════════════════════════════════════════════════════╝
         ▲▲▲ DESPUÉS DEL CONTENIDO ▲▲▲

╔════════════════════════════════════════════════════════════╗
║                      FOOTER                                ║
║  Creado por Entërra • © 2026                              ║
║  [🎥 YouTube]  [🐦 Twitter]                               ║
╚════════════════════════════════════════════════════════════╝
```

---

## 📱 Vista Mobile

```
┌──────────────────────┐
│     HEADER           │
│  🃏 HS Meta Radar    │
│  by Entërra          │
│  [🎥 YouTube]        │
│  [🐦 Twitter]        │
└──────────────────────┘

┌──────────────────────┐
│  📡 SOBRE            │
│  EL PROYECTO         │
└──────────────────────┘

┌──────────────────────┐
│   📢 GOOGLE ADS      │
│      Banner #1       │
│     320x50 o         │
│     Responsive       │
└──────────────────────┘

┌──────────────────────┐
│  Lista de Mazos      │
│  (scrollable)        │
│                      │
│  💎 #5 TrueBench     │
│  💎 #6 SAVOR         │
│  ⭐ #10 Jiuqianyu    │
│  ...                 │
└──────────────────────┘

┌──────────────────────┐
│   📢 GOOGLE ADS      │
│      Banner #2       │
│     320x50 o         │
│     Responsive       │
└──────────────────────┘

┌──────────────────────┐
│      FOOTER          │
│  Entërra © 2026      │
└──────────────────────┘
```

---

## 🔧 Cómo Agregar el Código de AdSense

### Paso 1: Obtén tu código de AdSense

Después de crear una unidad de anuncio en AdSense, obtendrás algo así:

```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456"
     crossorigin="anonymous"></script>
<!-- Top Banner -->
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="ca-pub-1234567890123456"
     data-ad-slot="9876543210"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
<script>
     (adsbygoogle = window.adsbygoogle || []).push({});
</script>
```

### Paso 2: Ubicar los placeholders en legend_decks.html

**Banner #1 (Top):**
Busca esto (línea ~285):
```html
<!-- Google Ad Space #1 (Top Banner) -->
<div class="ad-container ad-banner">
    <div class="ad-placeholder">
        <!-- PEGA AQUÍ TU CÓDIGO DE GOOGLE ADS -->
        📢 Espacio publicitario #1
    </div>
</div>
```

**Banner #2 (Bottom):**
Busca esto (línea ~305):
```html
<!-- Google Ad Space #2 (Bottom Banner) -->
<div class="ad-container ad-banner" id="bottom-ad" style="display: none;">
    <div class="ad-placeholder">
        <!-- PEGA AQUÍ TU CÓDIGO DE GOOGLE ADS -->
        📢 Espacio publicitario #2
    </div>
</div>
```

### Paso 3: Reemplazar

**ANTES:**
```html
<div class="ad-container ad-banner">
    <div class="ad-placeholder">
        <!-- PEGA AQUÍ TU CÓDIGO DE GOOGLE ADS -->
        📢 Espacio publicitario #1
    </div>
</div>
```

**DESPUÉS:**
```html
<div class="ad-container ad-banner">
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-TU-ID-AQUI"
         crossorigin="anonymous"></script>
    <!-- Top Banner -->
    <ins class="adsbygoogle"
         style="display:block"
         data-ad-client="ca-pub-TU-ID-AQUI"
         data-ad-slot="TU-SLOT-AQUI"
         data-ad-format="auto"
         data-full-width-responsive="true"></ins>
    <script>
         (adsbygoogle = window.adsbygoogle || []).push({});
    </script>
</div>
```

---

## 💡 Tips para Maximizar CPM

### 1. Ubicación ✅
- **Top Banner:** Alta visibilidad, usuarios aún explorando
- **Bottom Banner:** Usuarios ya comprometidos con el contenido

### 2. Tamaño
- **Desktop:** 728x90 (Leaderboard) - El más común y mejor pagado
- **Tablet:** 468x60 (Banner)
- **Mobile:** 320x50 (Mobile Banner) o 300x250 (Medium Rectangle)
- **Responsive:** Se adapta automáticamente (recomendado)

### 3. Colores
Los anuncios se adaptan automáticamente al tema de tu sitio.
Tu fondo oscuro (#0a0a0f) es moderno y profesional.

### 4. No Hacer
❌ NO pongas más de 3 anuncios por página
❌ NO hagas click en tus propios anuncios (baneo permanente)
❌ NO digas "haz click en los anuncios"
❌ NO ocultes contenido detrás de anuncios

### 5. Hacer ✅
✅ Usa anuncios responsive
✅ Coloca anuncios donde la gente ya está mirando
✅ Mantén buena velocidad de carga
✅ Genera tráfico de calidad
✅ Crea contenido único y valioso

---

## 📊 Qué Esperar

### Primeros Días
- **Impresiones:** Bajas mientras Google aprende tu sitio
- **CPM:** Variable ($0.50-$2)
- **Ingresos:** $0.10-1.00/día

### Primera Semana
- **Impresiones:** Aumentan gradualmente
- **CPM:** Se estabiliza ($1-3)
- **Ingresos:** $1-5/día

### Primer Mes
- **Impresiones:** Consistentes si promueves bien
- **CPM:** Optimizado ($2-5)
- **Ingresos:** $30-150/mes (con 500-2000 visitas/día)

### Crecimiento (3-6 meses)
- **Tráfico:** 5,000-10,000 visitas/día
- **CPM:** Maduro ($3-7)
- **Ingresos:** $300-1,500/mes

---

## 🎯 Ejemplo Real de Cálculo

### Escenario Conservador
```
📊 Tráfico: 1,000 visitas/día
👁️ Impresiones: 2,000/día (2 ads × 1,000 visitas)
💰 CPM: $2 (conservador para nicho gaming)
📈 CTR: 0.5% (10 clicks/día)

Cálculo:
2,000 impresiones × $2 CPM / 1,000 = $4/día
$4/día × 30 días = $120/mes
```

### Escenario Optimista
```
📊 Tráfico: 5,000 visitas/día
👁️ Impresiones: 10,000/día
💰 CPM: $4 (buen nicho gaming + audiencia premium)
📈 CTR: 1% (100 clicks/día)

Cálculo:
10,000 impresiones × $4 CPM / 1,000 = $40/día
$40/día × 30 días = $1,200/mes
```

---

## 🚀 Siguiente Paso

1. **Crea tu cuenta de AdSense** (si aún no la tienes)
2. **Espera aprobación** (puede tardar días o semanas)
3. **Crea las 2 unidades de anuncios**
4. **Pega los códigos** en los placeholders
5. **Deploy a producción**
6. **Espera 24-48 horas** para que aparezcan los anuncios
7. **¡Empieza a generar ingresos!** 💰

---

**¡Estás a punto de monetizar tu proyecto!** 🎉

_Última actualización: 11 de Enero, 2026_

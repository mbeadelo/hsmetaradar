# 📢 Configuración de Google Ads

## Paso 1: Crear cuenta de Google AdSense

1. Ve a [https://www.google.com/adsense](https://www.google.com/adsense)
2. Inicia sesión con tu cuenta de Google
3. Completa el registro con:
   - URL del sitio web
   - Información de pago
   - Verificación de identidad

## Paso 2: Crear unidades de anuncios

Una vez aprobada tu cuenta, crea estas unidades:

### Anuncio #1: Banner Superior (Top Banner)
- **Tipo:** Display ads
- **Tamaño:** 728x90 (Leaderboard) o Responsive
- **Ubicación:** Después de la sección "Sobre el proyecto"

### Anuncio #2: Banner Inferior (Bottom Banner)
- **Tipo:** Display ads
- **Tamaño:** 728x90 (Leaderboard) o Responsive
- **Ubicación:** Después de la lista de mazos

### Anuncio #3 (Opcional): Banner Lateral
- **Tipo:** Display ads
- **Tamaño:** 300x250 (Medium Rectangle) o 300x600 (Half Page)
- **Ubicación:** Lateral derecho en desktop

## Paso 3: Obtener el código

1. En AdSense, ve a **"Anuncios" → "Por unidad de anuncio"**
2. Selecciona la unidad que creaste
3. Copia el código que se ve así:

```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX"
     crossorigin="anonymous"></script>
<!-- Nombre de tu anuncio -->
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
     data-ad-slot="XXXXXXXXXX"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
<script>
     (adsbygoogle = window.adsbygoogle || []).push({});
</script>
```

## Paso 4: Agregar el código a legend_decks.html

Busca estos comentarios en `legend_decks.html` y reemplázalos:

### Espacio #1 (Top Banner)
```html
<!-- Google Ad Space #1 (Top Banner) -->
<div class="ad-container ad-banner">
    <div class="ad-placeholder">
        <!-- PEGA AQUÍ TU CÓDIGO DE GOOGLE ADS -->
    </div>
</div>
```

### Espacio #2 (Bottom Banner)
```html
<!-- Google Ad Space #2 (Bottom Banner) -->
<div class="ad-container ad-banner" id="bottom-ad" style="display: none;">
    <div class="ad-placeholder">
        <!-- PEGA AQUÍ TU CÓDIGO DE GOOGLE ADS -->
    </div>
</div>
```

## Paso 5: Ajustar estilos (si es necesario)

Si quieres que los anuncios se vean mejor integrados:

1. Elimina la clase `ad-placeholder` cuando pegues el código real
2. Ajusta el `min-height` de `.ad-container` según el tamaño del anuncio
3. Para anuncios responsive, usa:
   ```css
   .ad-container {
       min-height: auto;
   }
   ```

## 📊 Mejores Prácticas

✅ **Ubicación óptima:**
- Banner superior: Después del contenido informativo, antes de los mazos
- Banner inferior: Al final del contenido, antes del footer

✅ **Tamaños recomendados:**
- Desktop: 728x90, 970x90, 300x250
- Mobile: 320x50, 300x250, Responsive

✅ **Para maximizar ingresos:**
- Usa anuncios responsive

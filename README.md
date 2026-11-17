# CHAPAS LOCAS – fútbol arcade 1 vs 1 online (versión 0.1 jugable)
## Ejecutar en local
    npm install && npm start      # http://localhost:3000
Abre dos pestañas/ordenadores: uno pulsa CREAR SALA, el otro escribe el código y UNIRSE. Ambos pulsan ¡LISTO!, el anfitrión (👑) pulsa EMPEZAR.
## Desplegar en Internet (Render, plan gratuito disponible)
1. Sube esta carpeta a un repositorio de GitHub.
2. Render → New → Web Service → conecta el repo. Build: `npm install`. Start: `npm start`. Render da HTTPS y WSS automáticamente.
3. Variables opcionales: `PORT` (lo pone Render), `CLIENT_ORIGIN` (solo si alojas el frontend en otro dominio; entonces define `window.GAME_SERVER` en index.html).
4. Comparte la URL; el plan gratuito "duerme" tras inactividad (el primer acceso tarda ~1 min).
Las fotos se comprimen en el navegador (160px JPEG) y solo viven en la memoria de la sala; se borran al cerrarse.

## Novedades v0.2
Power-ups (🚀 turbo, 💥 superchut, 🧲 imán, 🦘 salto, 🛡 escudo, 🌀 teletransporte con S/↓), modo Caos (modificadores cada pocos segundos), 5 estadios, música y efectos con botones de silencio, controles táctiles y estadísticas/historial guardados en el navegador.

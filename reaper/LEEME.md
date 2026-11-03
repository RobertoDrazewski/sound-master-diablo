# Reaper -> Diablo Master

Script que renderiza el proyecto abierto y lo sube a la banda elegida, con tu usuario.

## Instalación (una sola vez)

1. En la web: **Cuenta → Token para Reaper → Generar** y copiá el token (empieza con `pck_`). Se muestra una sola vez.
2. En Reaper: **Actions → Show action list → New action → Load ReaScript...** y elegí `DiabloMaster_subir.lua`.
3. Opcional: asignale un atajo de teclado desde la misma lista de acciones.
4. Hacé un render manual una vez (**File → Render**) con formato **WAV 24 bit**. El script usa el último formato que hayas dejado.

## Uso

1. Ejecutá la acción. La primera vez pide la dirección de la web (`http://localhost:8010` para probar, tu dominio después) y el token, y te deja elegir la banda.
2. Poné el nombre del tema y elegí qué subir:
   - `cancion`: mezcla completa del proyecto (si hay selección de tiempo, solo esa parte).
   - `pistas`: una pista por archivo (bajo, batería, guitarras...).
3. Al terminar aparece el aviso. El tema ya está en la web para escuchar, bajar y masterizar.

Para cambiar de banda, de dirección o de token, escribí `si` en "Cambiar conexión".

## Importante

- Para subir la canción **sin master**, sacá los efectos de limitador/maximizador del track Master antes de ejecutar.
- Las pistas se renderizan todas; si hay pistas que no querés, silencialas o sacalas del proyecto.
- El script no cambia tus ajustes de render: los restaura al terminar.
- Funciona en Mac y Windows. Usa `curl`, que ya viene en ambos.

# Reaper -> Diablo Master

Script que exporta el proyecto abierto de Reaper (la mezcla o las pistas sueltas) y lo sube a tu banda, con tu usuario.

La guía paso a paso también está dentro de la web: menú **Conectar Reaper**. Desde ahí se descarga el script y se genera el token.

## Instalación (una sola vez)

1. En la web, entrá a **Conectar Reaper** y descargá `DiabloMaster_subir.lua`. Guardalo en una carpeta fija (Documentos, por ejemplo).
2. Generá tu token (empieza con `pck_`). Se muestra una sola vez.
3. En Reaper: **Actions > Show action list... > New action... > Load ReaScript...** y elegí el archivo.
4. Hacé un render manual una vez (**File > Render**) con formato **WAV 24 bit** o FLAC. El script usa el último formato que hayas dejado.
5. Opcional: asignale un atajo de teclado con **Add...** en *Shortcuts for selected action*.

## Uso

1. Guardá el proyecto (Cmd+S / Ctrl+S). Reaper no exporta un proyecto sin nombre.
2. Ejecutá la acción. La primera vez pide la dirección de la web (`https://diablomastermix.com.ar`) y el token, y te deja elegir la banda.
3. Completá:
   - Nombre del tema o ensayo.
   - Qué subir: `cancion` (mezcla completa; si hay selección de tiempo, solo esa parte) o `pistas` (una pista por archivo).
   - Dónde: `ensayo`, `produccion` o `master`.
4. Al terminar aparece el aviso. El tema ya está en la web para escuchar, bajar y masterizar.

Para cambiar de banda, de dirección o de token, escribí `si` en "Cambiar conexión".

## Importante

- Para subir la canción **sin master**, sacá los limitadores del track Master antes de ejecutar.
- Las pistas se renderizan todas; silenciá o sacá las que no quieras subir.
- Los archivos de más de 90 MB se mandan automáticamente por partes de 50 MB (Cloudflare corta los envíos de más de 100 MB).
- El script no cambia tus ajustes de render: los restaura al terminar.
- Funciona en Mac y Windows. Usa `curl`, que ya viene en ambos.
- La copia que descarga la web está en `app/static/reaper/DiabloMaster_subir.lua`. Si se edita este archivo, hay que copiar los cambios a la otra.

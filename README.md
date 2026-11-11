# Diablo Master

Masterizador de ensayos para bandas.

Backend (FastAPI) para subir, escuchar, descargar y masterizar los temas de las bandas.

## Probar en local con Docker

```bash
cp .env.example .env        # completar SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD
docker compose up --build
```

La app queda en http://localhost:8010 (la documentación técnica de la API está en `/docs`). Los datos se guardan en `./data`, que no se sube al repo.

## Instalación en la VPS

```bash
sudo apt install -y ffmpeg python3-venv
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

## Configuración (variables de entorno)

| Variable | Default | Para qué |
|---|---|---|
| `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` | - | Crea el super admin la primera vez (solo si no hay usuarios) |
| `DATA_DIR` | `./data` | Base de datos SQLite, audios y caché |
| `BAND_QUOTA_GB` | `15` | Tope de disco por banda |
| `RAW_RETENTION_DAYS` | `30` | Días que se conserva el ensayo crudo completo |
| `MAX_UPLOAD_MB` | `3000` | Tamaño máximo por archivo |
| `REFERENCE_SECONDS` | `90` | Fragmento que se guarda de cada referencia |
| `CORS_ORIGINS` | vacío | Dominios del front, separados por coma |
| `SECRET_KEY` | autogenerada | Si no se define, se crea en `DATA_DIR/secret.key` |

## Ejecutar

```bash
export SUPERADMIN_EMAIL="vos@tudominio.com"
export SUPERADMIN_PASSWORD="una-clave-larga"
uvicorn app.main:app --host 127.0.0.1 --port 8010
```

Para probar en tu compu entrá a http://localhost:8010 (el puerto se puede cambiar con `--port`).

Dejar **un solo proceso** (sin `--workers`): la cola de masterizado corre en un hilo dentro del proceso y procesa de a un trabajo.

## Nginx (importante para subidas grandes)

```nginx
client_max_body_size 3000m;
proxy_request_buffering off;
proxy_read_timeout 600s;
```

Servir siempre por HTTPS (Let's Encrypt): hay contraseñas y tokens en tránsito.

## Flujo

1. El super admin crea bandas (`POST /admin/bands`) e invita por mail (`POST /admin/invites`); la persona abre el link y define su contraseña (`POST /auth/accept-invite`).
2. Cada integrante sube temas (`POST /bands/{id}/tracks`, `mode` = `mix` | `stems` | `raw`).
3. Reproducción y descarga: `GET /versions/{id}/link?fmt=preview|flac|wav|mp3` devuelve una URL firmada de 1 hora.
4. Masterizar: `POST /tracks/{id}/master` con `reference_id` (imitar una referencia) o `genre_id` (preset del género); seguimiento en `GET /jobs/{id}`.
5. Para Reaper: `POST /me/api-tokens` genera un token personal (`pck_...`) que se usa como `Authorization: Bearer`.

## Reaper

El script para subir desde Reaper está en `reaper/` (ver `reaper/LEEME.md`). La web trae una guía paso a paso en el menú **Conectar Reaper**, y el script se descarga desde ahí (copia en `app/static/reaper/`).

## Almacenamiento

Los temas se guardan en FLAC (más un preview AAC liviano para el celular). El WAV y el MP3 se generan al pedirlos y quedan en caché. Los ensayos crudos (`raw`) se borran solos a los 30 días.

Las referencias son fragmentos de música de terceros: solo se usan para procesar y no hay ningún endpoint para escucharlas ni bajarlas.

## Herramientas de la banda

- **Ensayos**: grabá desde el celular (hace falta https) o subí un audio; se guarda con nombre y toda la banda lo escucha y lo descarga. Masterizar con un clic.
- **Producción**: grabá tomas o subí mezclas y pistas, probá el Asistente y pasá el tema a Master cuando esté listo. Cada tema se puede mover entre Ensayos, Producción y Master.
- **Master**: subís la mezcla, elegís estilo o referencia y bajás la versión masterizada (WAV, MP3, FLAC).
- **Álbumes**: orden de temas, tapa e historial por álbum.
- **Tapas**: en cada álbum, "Crear tapa" arma la portada desde tu foto con estilos propios (gratis) y el título encima. Con `OPENAI_API_KEY` suma generación con IA a partir de un prompt (tiene costo; `COVER_AI_DAILY_LIMIT` por banda y por día, `COVER_AI_QUALITY` = low/medium/high). Modelo por defecto `gpt-image-2.5-sunburst` (`COVER_AI_MODEL`); si la cuenta no lo tiene, prueba `gpt-image-2.5-flare` y después los anteriores (`gpt-image-1`, `dall-e-3`). Algunos modelos de imagen piden verificar la organización en OpenAI. Casilla opcional de aviso de contenido explícito, siempre abajo a la derecha. Se puede elegir la tipografía del título (Clásica, Metal, Gótica, Rocker; archivos en `app/static/fonts`, licencia OFL) y subir el logo de la banda, que se pega tal cual (con su transparencia) arriba o en el centro, sin pasar por la IA.
- **Calendario y avisos**: eventos de la banda y notificaciones para los integrantes.
- **Asistente**: analiza el audio (volumen, picos, saturación, balance de graves/agudos, estéreo) y sugiere mejoras en lenguaje simple. Funciona sin costo y sin internet.

### Consejo con OpenAI (opcional, apagado por defecto)

Si definís `OPENAI_API_KEY` el asistente suma un resumen redactado a partir de las métricas (nunca se envía el audio). Tiene costo por uso; `ASSISTANT_DAILY_LIMIT` limita las consultas por banda y por día. Sin la clave, el botón no aparece.

### Dependencias nuevas

Se agregó `pillow` (fotos de perfil, banda y álbum): `pip install pillow`.

### Integrantes
Solo el super admin crea bandas y nombra a su admin. Dentro de la banda, solo el admin de la banda (y el super admin) puede sumar integrantes con invitaciones; los demás integrantes pueden editar el lugar de cada uno y sacar integrantes. Solo el admin de la banda o el super admin pueden sumar managers, y solo el super admin puede sacar a un admin. Cada integrante figura como músico (con instrumento y si canta) o como manager.

### Lanzamiento
Cuando los temas de un álbum tienen master y el álbum tiene tapa, en Lanzamiento se arma un paquete (ZIP) con los WAV 24 bits, los MP3 320, la tapa en 3000 px, la lista de temas y una guía para publicar en plataformas, en Bandcamp o para prensar un vinilo o un CD. El paquete se genera en segundo plano, se guarda en `DATA_DIR/cache/release` y se borra solo a las 24 horas.

### Administración

El super admin ve todo en Admin: bandas (renombrar, borrar con confirmación, roles), personas (generar contraseña nueva, activar o desactivar), invitaciones, estilos y estado del servidor. Cada persona cambia su contraseña desde Tu cuenta.

### Instalar como app

En Android (Chrome) y iPhone (Safari: Compartir > Agregar a inicio) se instala con ícono propio. En celular hay menú inferior con las herramientas.

## Master v2, suscripciones, contacto y chat

- **Master**: motor propio en `app/engine.py` (EQ de fase lineal, compresión multibanda, saturación, ancho estéreo, equilibrio batería/bajo/voces y limitador de true peak, medido en LUFS BS.1770). Más de 70 estilos en `app/genres.py` o master por referencia. Cada master guarda un informe (`/versions/{id}/master-report`).
- **Planes**: 3 planes por banda (Garage, Estudio, Pro), editables desde Administración > Planes. Cobro mensual con Mercado Pago (`app/billing.py`, webhook en `/billing/webhook`). Las bandas existentes quedan "sin cargo"; el super admin decide al crear una banda si paga o no. Sin pago, la banda queda en solo lectura (puede escuchar y bajar), nunca se borra su material.
- **Super admin**: solo ve herramientas de administración (resumen, bandas, cobros, planes, personas, referencias globales, estilos, mensajes).
- **Contacto**: `/contact` con Cloudflare Turnstile, honeypot y límite por IP. Los mensajes quedan siempre en Administración > Mensajes y salen por mail si hay SMTP o Resend.
- **Chat**: `/chat`, ingeniero de audio con defensas contra inyección de prompts (`app/chat.py`) y topes de uso.
- Variables nuevas: ver `.env.example`.

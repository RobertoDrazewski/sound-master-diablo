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

El script para subir desde Reaper está en `reaper/` (ver `reaper/LEEME.md`).

## Almacenamiento

Los temas se guardan en FLAC (más un preview AAC liviano para el celular). El WAV y el MP3 se generan al pedirlos y quedan en caché. Los ensayos crudos (`raw`) se borran solos a los 30 días.

Las referencias son fragmentos de música de terceros: solo se usan para procesar y no hay ningún endpoint para escucharlas ni bajarlas.

## Herramientas de la banda

- **Ensayos**: grabá desde el celular (hace falta https) o subí un audio; se guarda con nombre y toda la banda lo escucha y lo descarga. Masterizar con un clic.
- **Producción**: grabá tomas o subí mezclas y pistas, probá el Asistente y pasá el tema a Master cuando esté listo. Cada tema se puede mover entre Ensayos, Producción y Master.
- **Master**: subís la mezcla, elegís estilo o referencia y bajás la versión masterizada (WAV, MP3, FLAC).
- **Álbumes**: orden de temas, tapa e historial por álbum.
- **Tapas**: en cada álbum, "Crear tapa" arma la portada desde tu foto con estilos propios (gratis) y el título encima. Con `OPENAI_API_KEY` suma generación con IA a partir de un prompt (tiene costo; `COVER_AI_DAILY_LIMIT` por banda y por día).
- **Calendario y avisos**: eventos de la banda y notificaciones para los integrantes.
- **Asistente**: analiza el audio (volumen, picos, saturación, balance de graves/agudos, estéreo) y sugiere mejoras en lenguaje simple. Funciona sin costo y sin internet.

### Consejo con OpenAI (opcional, apagado por defecto)

Si definís `OPENAI_API_KEY` el asistente suma un resumen redactado a partir de las métricas (nunca se envía el audio). Tiene costo por uso; `ASSISTANT_DAILY_LIMIT` limita las consultas por banda y por día. Sin la clave, el botón no aparece.

### Dependencias nuevas

Se agregó `pillow` (fotos de perfil, banda y álbum): `pip install pillow`.

### Integrantes

El super admin crea las bandas y nombra a su admin. El admin de la banda suma a sus compañeros desde Integrantes con un link de invitación (email, si es músico o manager, instrumento y si canta), cancela invitaciones pendientes y saca integrantes. Cada persona edita su propio lugar en la banda.

### Administración

El super admin ve todo en Admin: bandas (renombrar, borrar con confirmación, roles), personas (generar contraseña nueva, activar o desactivar), invitaciones, estilos y estado del servidor. Cada persona cambia su contraseña desde Tu cuenta.

### Instalar como app

En Android (Chrome) y iPhone (Safari: Compartir > Agregar a inicio) se instala con ícono propio. En celular hay menú inferior con las herramientas.

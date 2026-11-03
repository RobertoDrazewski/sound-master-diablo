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

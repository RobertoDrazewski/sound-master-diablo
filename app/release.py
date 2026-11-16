"""Paquete de lanzamiento: masters en WAV y MP3, tapa grande y una guia para publicar o prensar."""
import threading
import time
import uuid
import zipfile
from pathlib import Path

from . import audio, tags

_lock = threading.Lock()
_state: dict[int, dict] = {}
KEEP_HOURS = 24


def zip_path(data_dir: Path, album_id: int) -> Path:
    return data_dir / "cache" / "release" / f"{album_id}.zip"


def state(album_id: int) -> dict:
    with _lock:
        st = dict(_state.get(album_id) or {"status": "none"})
    if st["status"] == "none":
        # si el servidor se reinicio pero el paquete sigue en disco
        from .config import DATA_DIR
        p = zip_path(DATA_DIR, album_id)
        if p.exists():
            st = {"status": "ready", "size_mb": round(p.stat().st_size / 1e6, 1), "built_at": int(p.stat().st_mtime)}
    return st


def _set(album_id: int, **kw):
    with _lock:
        _state.setdefault(album_id, {"status": "none"}).update(kw)


def _fmt_time(sec: float) -> str:
    sec = int(round(sec))
    return f"{sec // 60}:{sec % 60:02d}"


FOLDERS = {
    "es": {"root": "lanzamiento", "cover": "tapa", "lyrics": "letras", "csv": "orden,titulo,duracion"},
    "en": {"root": "release", "cover": "cover", "lyrics": "lyrics", "csv": "order,title,length"},
    "pt": {"root": "lancamento", "cover": "capa", "lyrics": "letras", "csv": "ordem,titulo,duracao"},
}


def _guide(meta: dict, cover_px: int) -> str:
    lang = meta.get("lang") if meta.get("lang") in FOLDERS else "es"
    f = FOLDERS[lang]
    tl = "\n".join(f"  {i:02d}. {t['title']}  ({_fmt_time(t['duration'])})" for i, t in enumerate(meta["tracks"], 1))
    total = _fmt_time(sum(t["duration"] for t in meta["tracks"]))
    year = f" ({meta['year']})" if meta.get("year") else ""
    head = f"{meta['album']}{year} - {meta['band']}\n{'=' * 60}\n\n"
    if lang == "en":
        cover_note = ("This album has no cover yet: add one in Albums before uploading it to a platform." if cover_px == 0 else
                      f"The original cover is {cover_px} px; we enlarged it to 3000 px. If your distributor or pressing plant needs "
                      "higher quality, upload your own image of 3000 x 3000 px or more." if cover_px < 3000 else "The cover is 3000 x 3000 px.")
        return head + f"""SONGS
{tl}

Total length: {total}

WHAT'S IN THIS FOLDER
  wav-24bit/   The masters as 24-bit WAV. This is the file to upload to platforms and to press.
  mp3-320/     The same songs as 320 kbps MP3, to share, listen on your phone or post on social media.
  {f['cover']}/       The square cover as JPG. {cover_note}
  {f['lyrics']}/      The lyrics of each song (if you added them): .txt to read and .lrc synced line by line.
  tracklist.csv  Song order and length.

  Every master carries inside it the title, the band, the album and the lyrics, plus the credit
  "Mastered with Diablo Master Mix". The songs and their rights belong 100% to the band.

HOW TO RELEASE ON SPOTIFY, APPLE MUSIC, YOUTUBE MUSIC AND OTHERS
  These platforms don't take music straight from bands: it goes through a distributor
  (for example DistroKid, CD Baby or TuneCore). Steps:
  1. Create an account with the distributor you choose and compare prices: some charge per year, others per release.
  2. Upload the cover and the WAVs from wav-24bit/ in the order of tracklist.csv.
  3. Fill in the band name, title, year, genre and the songwriters of each song.
     In the mastering credits, enter: Diablo Master Mix.
  4. The distributor usually assigns the ISRC codes (one per song) and the UPC (one per album).
  5. Pick the release date. Leave at least two weeks so you can pitch the song in Spotify for Artists.
  Check the distributor's current requirements, because they change.

LYRICS ON SPOTIFY AND APPLE MUSIC
  The platforms show the lyrics they get from Musixmatch. Claim the band's profile on Musixmatch for Artists
  (it's free) and upload the lyrics of each song. The .lrc files in {f['lyrics']}/ already carry the timing of
  each line, so they show up synced while the song plays.

HOW TO RELEASE ON BANDCAMP
  Bandcamp does take music straight from the band. Create the account, choose "Add album" and upload the WAVs
  from wav-24bit/. The cover goes on the same screen. Set the price, or "name your price".

HOW TO PRESS A RECORD (LP) OR A CD
  1. Ask one or two pressing plants for a quote. Ask what audio format and cover they need.
  2. For vinyl, each side should last 18 to 22 minutes at most to sound good. If the album lasts {total},
     you'll need to decide which songs go on side A and which on side B.
  3. Plants usually ask for the WAVs from wav-24bit/ split by side, plus a test pressing before the run.
  4. For the CD, besides the audio they ask for barcodes (UPC) and the cover template.

BEFORE RELEASING
  - Listen to the whole album once, start to finish, on headphones.
  - Check there are no samples or covers without permission.
  - If the album includes someone else's song, you need their authorization.
"""
    if lang == "pt":
        cover_note = ("Este álbum ainda não tem capa: adicione em Álbuns antes de enviá-lo a uma plataforma." if cover_px == 0 else
                      f"A capa original tem {cover_px} px; ampliamos para 3000 px. Se a sua distribuidora ou a fábrica pedir mais "
                      "qualidade, envie uma imagem própria de 3000 x 3000 px ou mais." if cover_px < 3000 else "A capa está em 3000 x 3000 px.")
        return head + f"""MÚSICAS
{tl}

Duração total: {total}

O QUE HÁ NESTA PASTA
  wav-24bit/   Os masters em WAV 24 bits. É o arquivo para enviar às plataformas e para prensar.
  mp3-320/     As mesmas músicas em MP3 320 kbps, para compartilhar, ouvir no celular ou postar nas redes.
  {f['cover']}/        A capa quadrada em JPG. {cover_note}
  {f['lyrics']}/      A letra de cada música (se vocês cadastraram): .txt para ler e .lrc sincronizado linha por linha.
  tracklist.csv  Ordem e duração das músicas.

  Cada master leva dentro o título, a banda, o álbum e a letra, além do crédito
  "Mastered with Diablo Master Mix". As músicas e seus direitos são 100% da banda.

COMO PUBLICAR NO SPOTIFY, APPLE MUSIC, YOUTUBE MUSIC E OUTRAS
  Essas plataformas não recebem música direto das bandas: ela vai por meio de uma distribuidora
  (por exemplo DistroKid, CD Baby ou TuneCore). Passos:
  1. Crie uma conta na distribuidora que escolher e compare preços: algumas cobram por ano e outras por lançamento.
  2. Envie a capa e os WAV de wav-24bit/ na ordem de tracklist.csv.
  3. Preencha o nome da banda, o título, o ano, o gênero e os compositores de cada música.
     Nos créditos de masterização, coloque: Diablo Master Mix.
  4. A distribuidora costuma atribuir os códigos ISRC (um por música) e UPC (um por álbum).
  5. Escolha a data de lançamento. Deixe pelo menos duas semanas para poder apresentar a música no Spotify for Artists.
  Confira os requisitos atuais da distribuidora, porque mudam.

A LETRA NO SPOTIFY E NA APPLE MUSIC
  As plataformas mostram as letras que recebem do Musixmatch. Reivindique o perfil da banda no Musixmatch for Artists
  (é grátis) e envie a letra de cada música. Os .lrc de {f['lyrics']}/ já trazem o tempo de cada linha, assim
  aparecem sincronizadas enquanto a música toca.

COMO PUBLICAR NO BANDCAMP
  O Bandcamp recebe música direto da banda. Crie a conta, escolha "Add album" e envie os WAV de wav-24bit/.
  A capa vai na mesma tela. Defina o preço, ou "name your price".

COMO PRENSAR UM DISCO (LP) OU UM CD
  1. Peça orçamento a uma ou duas fábricas. Pergunte que formato de áudio e de capa elas precisam.
  2. No vinil, cada lado deve durar entre 18 e 22 minutos no máximo para soar bem. Se o álbum dura {total},
     vocês vão ter que decidir quais músicas vão no lado A e quais no B.
  3. As fábricas costumam pedir os WAV de wav-24bit/ separados por lado, e uma prova de prensagem antes da tiragem.
  4. Para o CD, além do áudio pedem o código de barras (UPC) e o modelo da capa.

ANTES DE PUBLICAR
  - Ouçam o álbum inteiro uma vez, do começo ao fim, com fones.
  - Confiram que não há samples nem covers sem permissão.
  - Se o álbum inclui uma música de outra pessoa, vocês precisam da autorização dela.
"""
    cover_note = ("Este álbum todavía no tiene tapa: agregala en Álbumes antes de subirlo a una plataforma." if cover_px == 0 else
                  f"La tapa original mide {cover_px} px; la agrandamos a 3000 px. Si tu distribuidora o la planta de prensado "
                  "pide más calidad, subí una imagen propia de 3000 x 3000 px o más." if cover_px < 3000 else "La tapa está en 3000 x 3000 px.")
    return head + f"""TEMAS
{tl}

Duración total: {total}

QUÉ HAY EN ESTA CARPETA
  wav-24bit/   Los masters en WAV 24 bits. Es el archivo para subir a las plataformas y para prensar.
  mp3-320/     Los mismos temas en MP3 320 kbps, para compartir, escuchar en el celular o subir a redes.
  {f['cover']}/        La tapa cuadrada en JPG. {cover_note}
  {f['lyrics']}/      La letra de cada tema (si la cargaron): .txt para leer y .lrc sincronizado línea por línea.
  tracklist.csv  Orden y duración de los temas.

  Cada master lleva adentro el título, la banda, el álbum y la letra, más el crédito
  "Mastered with Diablo Master Mix". Los temas y sus derechos son 100% de la banda.

CÓMO PUBLICAR EN SPOTIFY, APPLE MUSIC, YOUTUBE MUSIC Y OTRAS
  Estas plataformas no reciben música directo de las bandas: se sube a través de una distribuidora
  (por ejemplo AMA del INAMU, DistroKid o CD Baby). Pasos:
  1. Creá una cuenta en la distribuidora que elijas y compará: algunas cobran por año, otras por lanzamiento
     y AMA es gratis para bandas argentinas registradas en el INAMU.
  2. Cargá la tapa y los WAV de wav-24bit/ en el orden de tracklist.csv.
  3. Completá el nombre de la banda, el título, el año, el género y los autores de cada tema.
     En los créditos de mastering poné: Diablo Master Mix.
  4. DistroKid y CD Baby asignan los códigos ISRC (uno por tema) y UPC (uno por álbum). Para AMA, los ISRC
     los sacás en CAPIF con tu código de productor.
  5. Elegí la fecha de salida. Conviene dejar al menos dos semanas antes para poder pedir un lugar en las listas de Spotify for Artists.
  Antes de publicar en Argentina, registrá tus canciones en SADAIC. Revisá los requisitos actuales de la distribuidora, porque cambian.

LA LETRA EN SPOTIFY Y APPLE MUSIC
  Las plataformas muestran las letras que reciben de Musixmatch. Reclamá el perfil de la banda en
  Musixmatch for Artists (es gratis) y subí la letra de cada tema. El .lrc de {f['lyrics']}/ ya trae los tiempos
  de cada línea, así aparece sincronizada mientras suena.

CÓMO PUBLICAR EN BANDCAMP
  Bandcamp sí recibe música directo de la banda. Creá la cuenta, elegí "Add album" y subí los WAV de wav-24bit/.
  La tapa va en la misma pantalla. Ahí ponés el precio, o "name your price" si querés que cada uno elija cuánto pagar.

CÓMO PRENSAR UN DISCO (LP) O UN CD
  1. Pedí presupuesto a una o dos plantas de prensado. Preguntales qué formato de audio y qué tapa necesitan.
  2. Para vinilo, cada lado dura entre 18 y 22 minutos como máximo para que suene bien. Si el álbum dura {total},
     vas a tener que decidir qué temas van en el lado A y cuáles en el B.
  3. Las plantas suelen pedir los WAV de wav-24bit/ separados por lado, más una prueba de prensado antes de la tirada.
  4. Para el CD, además del audio piden los códigos de barra (UPC) y la plantilla de la tapa.

ANTES DE PUBLICAR
  - Escuchá el álbum entero una vez, de principio a fin, con auriculares.
  - Revisá que no haya samples ni covers sin permiso.
  - Si el álbum incluye un tema de otra persona, necesitás su autorización.
"""


def _build(album_id: int, meta: dict, data_dir: Path):
    out = zip_path(data_dir, album_id)
    out.parent.mkdir(parents=True, exist_ok=True)
    cache = data_dir / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    tracks = meta["tracks"]
    total_steps = len(tracks) * 2 + 2
    done = 0
    lang = meta.get("lang") if meta.get("lang") in FOLDERS else "es"
    names = FOLDERS[lang]
    root = f"{_safe(meta['album'])} - {names['root']}"
    partial = out.with_name(f"{album_id}.{uuid.uuid4().hex[:6]}.part")
    try:
        with zipfile.ZipFile(partial, "w", zipfile.ZIP_STORED) as z:
            for i, t in enumerate(tracks, 1):
                base = f"{i:02d} - {_safe(t['title'])}"
                for ext, folder in (("wav", "wav-24bit"), ("mp3", "mp3-320")):
                    _set(album_id, status="building", step=f"Tema {i} de {len(tracks)} ({ext.upper()})", done=done, total=total_steps)
                    tg = t.get("tags")
                    cached = cache / (f"{t['version_id']}.{tags.signature(tg)}.{ext}" if tg else f"{t['version_id']}.{ext}")
                    if not cached.exists():
                        tmp = cached.with_name(f"{t['version_id']}.tmp{uuid.uuid4().hex[:6]}.{ext}")
                        try:
                            audio.convert(Path(t["flac"]), tmp, ext, tg)
                        except Exception:
                            tmp.unlink(missing_ok=True)
                            raise
                        tmp.replace(cached)
                        if tg:
                            tags.drop_stale(cached, t["version_id"], ext)
                    z.write(cached, f"{root}/{folder}/{base}.{ext}")
                    done += 1
            # letras: .txt para leer y .lrc sincronizado para Musixmatch (Spotify y Apple Music toman las letras de ahí)
            from . import lyrics
            for i, t in enumerate(tracks, 1):
                if not t.get("track_id"):
                    continue
                ls = lyrics.read(t["track_id"]).get("lines") or []
                if not ls:
                    continue
                base = f"{i:02d} - {_safe(t['title'])}"
                z.writestr(f"{root}/{names['lyrics']}/{base}.txt", lyrics.to_txt(ls))
                lrc = lyrics.to_lrc(ls, t["title"], meta.get("band", ""))
                if lrc:
                    z.writestr(f"{root}/{names['lyrics']}/{base}.lrc", lrc)
            _set(album_id, step="Tapa", done=done, total=total_steps)
            cover_px = 0
            if meta.get("cover"):
                from PIL import Image
                im = Image.open(meta["cover"]).convert("RGB")
                cover_px = min(im.size)
                if cover_px < 3000:
                    im = im.resize((3000, 3000), Image.LANCZOS)
                tmpc = data_dir / "tmp" / f"{uuid.uuid4().hex}.jpg"
                tmpc.parent.mkdir(parents=True, exist_ok=True)
                im.save(tmpc, "JPEG", quality=95, optimize=True)
                z.write(tmpc, f"{root}/{names['cover']}/{names['cover']}-3000x3000.jpg")
                tmpc.unlink(missing_ok=True)
            done += 1
            _set(album_id, step="Guía", done=done, total=total_steps)
            csv = names["csv"] + "\n" + "\n".join(
                f'{i},"{t["title"].replace(chr(34), "")}",{_fmt_time(t["duration"])}' for i, t in enumerate(tracks, 1))
            z.writestr(f"{root}/tracklist.csv", csv)
            readme = {"es": "LEEME", "en": "README", "pt": "LEIAME"}[lang]
            z.writestr(f"{root}/{readme}.txt", _guide(meta, cover_px))
            done += 1
        partial.replace(out)
        _set(album_id, status="ready", step="", done=total_steps, total=total_steps,
             size_mb=round(out.stat().st_size / 1e6, 1), built_at=int(time.time()), error=None)
    except Exception as e:  # noqa: BLE001
        partial.unlink(missing_ok=True)
        _set(album_id, status="error", error=str(e)[:300])


def _safe(text: str) -> str:
    import re
    return (re.sub(r"[^\w\- .()]", "", text, flags=re.UNICODE).strip() or "sin-nombre")[:90]


def _cleanup(data_dir: Path):
    folder = data_dir / "cache" / "release"
    if not folder.exists():
        return
    limit = time.time() - KEEP_HOURS * 3600
    for p in folder.iterdir():
        try:
            if p.stat().st_mtime < limit:
                p.unlink()
        except OSError:
            pass


def start(album_id: int, meta: dict, data_dir: Path):
    _cleanup(data_dir)
    with _lock:
        if (_state.get(album_id) or {}).get("status") == "building":
            return
        _state[album_id] = {"status": "building", "step": "Preparando", "done": 0, "total": len(meta["tracks"]) * 2 + 2}
    threading.Thread(target=_build, args=(album_id, meta, data_dir), daemon=True).start()

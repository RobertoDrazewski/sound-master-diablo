"""Catalogo de generos y perfiles de master.

Cada genero apunta a un arquetipo con la "receta" que usa el motor (app/engine.py):
  shape      curva de tono: cuantos dB mas o menos que un master neutro en 10 puntos
             (40, 80, 160, 315, 630, 1250, 2500, 5000, 10000 y 16000 Hz)
  lufs       volumen final tipico del genero (cuanto mas cerca de 0, mas fuerte)
  comp       cuanta compresion/pegada lleva (0 a 1)
  sat        cuanta saturacion "calida" (0 a 1)
  width      ancho estereo (1 = natural)
  drums      cuanto puede sonar la bateria respecto a los demas instrumentos en los medios (dB)
  bass       cuanto pesa el bajo respecto a los demas instrumentos (dB)
Son valores orientativos, pensados para bandas independientes: el oido manda y todo se puede ajustar a mano.
"""
import re
import unicodedata

ANCHORS = [40, 80, 160, 315, 630, 1250, 2500, 5000, 10000, 16000]


def _a(shape, lufs, comp, sat, width, drums, bass, desc):
    return {"shape": shape, "lufs": lufs, "comp": comp, "sat": sat, "width": width,
            "drums": drums, "bass": bass, "desc": desc}


ARCH = {
    "rock": _a([1, 2, 1, -.5, 0, .5, 1.5, 1, .5, 0], -10.5, .50, .35, 1.05, -2.5, -1,
               "Guitarras con cuerpo, batería con pegada y voces al frente."),
    "rock_clasico": _a([.5, 1.5, 1.5, 0, 0, .5, 1, .5, -.5, -1], -11.5, .40, .45, 1.0, -3, -1,
                       "Sonido cálido y natural, con graves redondos y agudos suaves."),
    "hard_rock": _a([1.5, 2.5, 1, -1, -.5, .5, 2, 1.5, 1, 0], -9.5, .60, .40, 1.05, -2, -.5,
                    "Más fuerte y agresivo: graves firmes, medios presentes y brillo en las guitarras."),
    "punk": _a([0, 1, 1, 0, .5, 1, 2, 1.5, 1, 0], -9.5, .65, .45, 1.0, -1.5, -1.5,
               "Crudo y al frente: medios fuertes, energía constante y poca dinámica."),
    "metal": _a([1.5, 3, 1.5, -1.5, -2, -.5, 2.5, 2, 1, 0], -9.0, .70, .30, 1.10, -.5, 0,
                "Graves potentes, medios \"escavados\" para que las guitarras no tapen al bajo y mucho ataque."),
    "stoner": _a([3, 4, 2, 0, -1, 0, .5, 0, -1, -1.5], -10.0, .55, .60, 1.0, -2, 1.5,
                 "Pesado y grueso: mucho grave, saturación cálida y agudos recortados."),
    "grunge": _a([1, 2, 1.5, 0, 0, .5, 1, .5, 0, -.5], -10.0, .55, .50, 1.0, -2, -.5,
                 "Sucio y con cuerpo: medios-bajos llenos y agudos sin brillo exagerado."),
    "indie": _a([0, 1, 1, .5, 0, 0, 0, -.5, -1, -2], -11.5, .40, .40, 1.1, -3, -1,
                "Natural y abierto, con un tono algo cálido y más dinámica."),
    "postpunk": _a([.5, 2, 0, -1, 0, 1, 1.5, 1, 0, -.5], -11.0, .45, .35, 1.1, -2, 1,
                   "Bajo protagonista, guitarras filosas y espacio entre instrumentos."),
    "pop": _a([1, 2, .5, -1, -.5, 0, 1, 2, 2.5, 1.5], -9.5, .55, .20, 1.15, -4, -.5,
              "Brillante y limpio: voz adelante, graves definidos y mucho aire arriba."),
    "pop_rock": _a([1, 2, .5, -.5, 0, .5, 1.5, 1.5, 1.5, .5], -9.8, .55, .30, 1.1, -3, -1,
                   "Mitad rock, mitad pop: guitarras con cuerpo y una voz clara y brillante."),
    "acustico": _a([-1, 0, 1, .5, 0, .5, .5, .5, 0, 0], -13.0, .25, .15, 1.0, -6, -2,
                   "Natural y suave: se cuida la dinámica y no se aplasta el sonido."),
    "funk": _a([1.5, 3, 1, -.5, 0, .5, 1, 1, 1, 0], -11.0, .50, .30, 1.0, -2, 1.5,
               "Bajo y bombo con pegada, medios definidos para el groove."),
    "disco": _a([1, 2.5, .5, -1, -.5, 0, 1, 2, 2, 1], -10.0, .55, .25, 1.15, -2, 1,
                "Brillante y bailable: bajo firme y platos con mucho aire."),
    "jazz": _a([-1, .5, 1.5, 1, 0, 0, 0, -.5, -1, -1], -14.0, .15, .10, 1.0, -5, -3,
               "Natural y con mucha dinámica: casi no se comprime, se cuida el tono."),
    "blues": _a([0, 1, 1.5, .5, 0, .5, 1, 0, -.5, -1], -12.0, .35, .40, 1.0, -3.5, -2,
                "Cálido y con carácter: medios-bajos cuerpudos y agudos suaves."),
    "reggae": _a([2, 4, 1.5, -1.5, -1, -.5, 0, -.5, -1, -1.5], -11.0, .45, .35, 1.0, -3, 2,
                 "Bajo profundo y medios abiertos; el golpe de guitarra y la batería respiran."),
    "ska": _a([.5, 2, .5, -.5, 0, .5, 1.5, 1.5, 1, 0], -10.0, .55, .25, 1.05, -2, -.5,
              "Rápido y brillante: vientos y guitarras al frente con bajo claro."),
    "cumbia": _a([1, 3, 1.5, 0, 0, 1, 1.5, 1, .5, 0], -9.5, .55, .30, 1.0, -2, 1.5,
                 "Bajo redondo y marcado, güiro/percusión con brillo y teclados presentes."),
    "cuarteto": _a([1.5, 3, 1, -.5, 0, 1, 2, 1.5, 1, 0], -9.0, .65, .35, 1.0, -1.5, 1,
                   "Muy fuerte y festivo: bajo y bombo potentes, voces y teclados al frente."),
    "salsa": _a([0, 2, 1, 0, 0, 1, 2, 2, 1.5, 0], -10.5, .45, .20, 1.1, -2, 1,
                "Metales y percusión brillantes, bajo tumbao claro."),
    "urbano": _a([4, 5, 1, -2, -1, 0, 1, 1.5, 2, 1], -8.5, .65, .30, 1.1, 0, 4,
                 "Subgraves enormes, voz clara y mucha presión en el bombo."),
    "folklore": _a([-1, .5, 1, 1, 0, .5, .5, 0, -.5, -1], -13.0, .25, .15, 1.0, -6, -2,
                   "Cálido y natural: guitarras, voz y bombo legüero con espacio."),
    "tango": _a([-1, .5, 1, 1, 0, .5, .5, 0, -.5, -1], -14.0, .20, .15, 1.0, -6, -2,
                "Dinámico y cálido: bandoneón, cuerdas y voz sin aplastar."),
    "electro": _a([2, 4, 1, -1, -.5, 0, 1, 1.5, 2, 1], -8.5, .70, .35, 1.2, 0, 3,
                  "Graves profundos y definidos, brillo arriba y mucha pegada."),
    "ambient": _a([-2, -.5, 1, 1, .5, 0, 0, -.5, -1, -1.5], -16.0, .10, .05, 1.2, -9, -3,
                  "Muy dinámico y espacioso: casi no se toca la dinámica."),
    "clasica": _a([-2, -.5, 1, 1, .5, 0, 0, -.5, -1, -1.5], -18.0, .05, 0, 1.0, -9, -3,
                  "Máxima naturalidad: se cuida el rango dinámico y solo se corrige el tono."),
    "instrumental": _a([.5, 1.5, 1, 0, 0, .5, 1, .5, 0, -.5], -12.5, .40, .30, 1.1, -2.5, -1,
                       "Equilibrado y abierto, pensado para temas sin voz."),
    "neutro": _a([0, 0, 0, 0, 0, 0, 0, 0, 0, 0], -12.0, .40, .25, 1.0, -3, 0,
                 "Perfil neutro: corrige lo justo y lo deja a un volumen cómodo."),
}

# (nombre, familia, arquetipo, ajustes opcionales)
CATALOG = [
    # Rock
    ("rock", "Rock", "rock", {}),
    ("rock and roll", "Rock", "rock_clasico", {"lufs": -11.0}),
    ("rock clásico", "Rock", "rock_clasico", {}),
    ("hard rock", "Rock", "hard_rock", {}),
    ("rock alternativo", "Rock", "grunge", {"lufs": -10.5}),
    ("rock indie", "Rock", "indie", {}),
    ("rock progresivo", "Rock", "rock", {"lufs": -12.0, "comp": .35, "width": 1.15}),
    ("rock psicodélico", "Rock", "stoner", {"lufs": -11.5, "sat": .55, "width": 1.2}),
    ("blues rock", "Rock", "blues", {"lufs": -11.0, "comp": .45}),
    ("garage rock", "Rock", "punk", {"lufs": -10.5, "comp": .5, "sat": .55}),
    ("rock nacional", "Rock", "rock", {"lufs": -10.5}),
    ("surf rock", "Rock", "indie", {"lufs": -11.0, "shape": [0, 1, 0, -.5, 0, .5, 1.5, 2, 1.5, 0]}),
    ("funk rock", "Rock", "funk", {"lufs": -10.0, "comp": .55}),
    ("pop rock", "Rock", "pop_rock", {}),
    # Punk y derivados
    ("punk rock", "Punk y alternativo", "punk", {}),
    ("pop punk", "Punk y alternativo", "punk", {"lufs": -9.0, "shape": [.5, 1.5, 1, -.5, 0, .5, 2, 2, 2, .5]}),
    ("hardcore punk", "Punk y alternativo", "punk", {"lufs": -9.0, "comp": .75}),
    ("post punk", "Punk y alternativo", "postpunk", {}),
    ("grunge", "Punk y alternativo", "grunge", {}),
    ("emo", "Punk y alternativo", "pop_rock", {"lufs": -10.0, "comp": .55}),
    ("shoegaze", "Punk y alternativo", "indie", {"lufs": -11.0, "width": 1.3, "sat": .5, "shape": [.5, 1.5, 1, 0, 0, 0, -.5, 0, .5, 0]}),
    # Metal
    ("metal", "Metal", "metal", {}),
    ("heavy metal", "Metal", "metal", {"lufs": -9.5, "comp": .65}),
    ("thrash metal", "Metal", "metal", {"lufs": -8.5, "comp": .75}),
    ("death metal", "Metal", "metal", {"lufs": -8.5, "comp": .8, "sat": .35}),
    ("black metal", "Metal", "metal", {"lufs": -9.5, "shape": [-.5, 1, .5, -1, -1.5, 0, 2.5, 3, 1.5, .5], "sat": .5}),
    ("power metal", "Metal", "metal", {"lufs": -9.5, "shape": [1, 2.5, 1, -1, -1, 0, 2, 2.5, 2, .5]}),
    ("metal progresivo", "Metal", "metal", {"lufs": -10.0, "comp": .6, "width": 1.15}),
    ("metalcore", "Metal", "metal", {"lufs": -8.5, "comp": .75}),
    ("nu metal", "Metal", "metal", {"lufs": -9.0, "bass": 1.5, "shape": [2, 3.5, 1.5, -1, -1.5, -.5, 2, 1.5, 1, 0]}),
    ("stoner rock", "Metal", "stoner", {}),
    ("doom metal", "Metal", "stoner", {"lufs": -10.5, "comp": .5, "shape": [3.5, 4.5, 2, 0, -1, -.5, 0, -.5, -1.5, -2]}),
    # Pop
    ("pop", "Pop", "pop", {}),
    ("pop acústico", "Pop", "acustico", {"lufs": -12.0, "shape": [-.5, 1, .5, 0, 0, .5, 1, 1.5, 1.5, .5]}),
    ("pop latino", "Pop", "pop", {"lufs": -9.0, "bass": 1}),
    ("indie pop", "Pop", "indie", {"lufs": -10.5, "shape": [0, 1, .5, 0, 0, .5, 1, 1, 1, .5]}),
    ("synthpop", "Pop", "electro", {"lufs": -9.5, "comp": .55}),
    ("balada", "Pop", "acustico", {"lufs": -12.0, "comp": .3}),
    # Funk, soul y R&B
    ("funk", "Funk, soul y R&B", "funk", {}),
    ("soul", "Funk, soul y R&B", "funk", {"lufs": -11.5, "comp": .4, "sat": .4}),
    ("r&b", "Funk, soul y R&B", "urbano", {"lufs": -9.5, "bass": 2.5, "comp": .55}),
    ("disco", "Funk, soul y R&B", "disco", {}),
    # Jazz
    ("jazz", "Jazz", "jazz", {}),
    ("jazz fusión", "Jazz", "jazz", {"lufs": -12.5, "comp": .25, "shape": [0, 1.5, 1, .5, 0, .5, 1, .5, 0, -.5]}),
    ("swing", "Jazz", "jazz", {"lufs": -13.5}),
    ("bossa nova", "Jazz", "acustico", {"lufs": -13.5, "comp": .2}),
    # Reggae y ska
    ("reggae", "Reggae y ska", "reggae", {}),
    ("dub", "Reggae y ska", "reggae", {"lufs": -11.5, "bass": 3, "width": 1.2}),
    ("ska", "Reggae y ska", "ska", {}),
    ("reggae rock", "Reggae y ska", "reggae", {"lufs": -10.0, "comp": .55, "shape": [1.5, 3, 1.5, -1, -.5, .5, 1.5, 1, 0, -.5]}),
    # Latinos
    ("cumbia", "Latino", "cumbia", {}),
    ("cumbia villera", "Latino", "cuarteto", {"lufs": -9.0}),
    ("cuarteto", "Latino", "cuarteto", {}),
    ("salsa", "Latino", "salsa", {}),
    ("merengue y bachata", "Latino", "salsa", {"lufs": -10.0}),
    ("reggaetón", "Latino", "urbano", {"lufs": -8.5}),
    ("trap latino", "Latino", "urbano", {"lufs": -8.5, "bass": 5, "comp": .7}),
    ("folklore argentino", "Latino", "folklore", {}),
    ("tango", "Latino", "tango", {}),
    ("chamamé", "Latino", "folklore", {"lufs": -12.5}),
    ("rock latino", "Latino", "rock", {"lufs": -10.0}),
    # Blues, country, folk y cantautor
    ("blues", "Blues, folk y country", "blues", {}),
    ("country", "Blues, folk y country", "acustico", {"lufs": -11.5, "comp": .4, "shape": [0, 1, 1, 0, 0, .5, 1, 1.5, 1.5, .5]}),
    ("folk", "Blues, folk y country", "acustico", {}),
    ("cantautor", "Blues, folk y country", "acustico", {"lufs": -12.5}),
    ("acústico", "Blues, folk y country", "acustico", {}),
    # Hip hop y electrónica
    ("hip hop", "Hip hop y electrónica", "urbano", {"lufs": -9.0, "bass": 3}),
    ("trap", "Hip hop y electrónica", "urbano", {"lufs": -8.0, "bass": 5, "comp": .7}),
    ("house", "Hip hop y electrónica", "electro", {"lufs": -9.0}),
    ("techno", "Hip hop y electrónica", "electro", {"lufs": -8.5, "shape": [2, 4, 1, -1, -.5, 0, .5, 1, 1.5, .5]}),
    ("drum and bass", "Hip hop y electrónica", "electro", {"lufs": -8.0, "comp": .75}),
    ("electrónica", "Hip hop y electrónica", "electro", {}),
    ("lo-fi", "Hip hop y electrónica", "indie", {"lufs": -13.0, "comp": .3, "sat": .6, "shape": [0, 1, 1, .5, 0, 0, -.5, -1.5, -3, -4]}),
    # Otros
    ("instrumental", "Otros", "instrumental", {}),
    ("ambient", "Otros", "ambient", {}),
    ("clásica", "Otros", "clasica", {}),
    ("banda sonora", "Otros", "ambient", {"lufs": -15.0, "comp": .2}),
    ("neutro", "Otros", "neutro", {}),
]

ALIASES = {  # nombres que ya existian en bases creadas con versiones anteriores
    "metal": "metal", "punk rock": "punk rock", "rock": "rock", "stoner": "stoner rock",
    "post punk": "post punk", "instrumental": "instrumental",
}


def slug(name: str) -> str:
    s = unicodedata.normalize("NFKD", name.lower()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


_BY_SLUG = {}
for _n, _fam, _arch, _over in CATALOG:
    _BY_SLUG[slug(_n)] = (_n, _fam, _arch, _over)
_BY_SLUG[slug("stoner")] = _BY_SLUG[slug("stoner rock")]


def profile(name: str) -> dict:
    """Perfil completo (arquetipo + ajustes) para un nombre de genero. Si no se conoce, perfil neutro."""
    hit = _BY_SLUG.get(slug(name))
    if not hit:
        p = dict(ARCH["neutro"])
        p["family"] = "Otros"
        return p
    _, fam, arch, over = hit
    p = dict(ARCH[arch])
    p.update(over)
    p["family"] = fam
    return p


def family(name: str) -> str:
    hit = _BY_SLUG.get(slug(name))
    return hit[1] if hit else "Otros"


def catalog_rows():
    """(nombre, familia, lufs) del catalogo base."""
    for n, fam, arch, over in CATALOG:
        p = dict(ARCH[arch])
        p.update(over)
        yield n, fam, p["lufs"]

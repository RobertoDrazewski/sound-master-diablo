"""Resumen opcional del analisis con un modelo de OpenAI. Solo texto: nunca se envia el audio."""
import json
import urllib.error
import urllib.request

from .config import OPENAI_API_KEY, OPENAI_MODEL, lang_rule

SYSTEM = (
    "Sos el Asistente Diablo, ayudás a músicos de bandas que saben tocar y grabarse pero no son ingenieros de audio. "
    "Hablá en español rioplatense (voseo), en tono cercano y simple, sin jerga técnica (si usás un término, explicalo en media frase). "
    "Con los datos del análisis de una grabación, escribí como máximo 110 palabras: primero una frase sobre cómo está en general, "
    "después hasta 3 consejos concretos y priorizados para mejorar la próxima grabación o la mezcla, y cerrá diciendo si conviene masterizar ya. "
    "No inventes datos que no estén en el análisis. Sin listas con símbolos raros: usá '1.', '2.', '3.'."
)


def enabled() -> bool:
    return bool(OPENAI_API_KEY)


def summarize(analysis: dict, title: str, style: str | None = None) -> str:
    payload = {"tema": title, "estilo_elegido": style, "veredicto": analysis["verdict_text"],
               "metricas": analysis["metrics"], "consejos_del_analisis": analysis["tips"]}
    body = json.dumps({
        "model": OPENAI_MODEL, "temperature": 0.4, "max_tokens": 350,
        "messages": [{"role": "system", "content": SYSTEM + lang_rule()},
                     {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
    }).encode()
    req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=body, method="POST",
                                 headers={"Authorization": f"Bearer {OPENAI_API_KEY}",
                                          "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"OpenAI respondió {e.code}") from None
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(f"No se pudo consultar a OpenAI: {e}") from None
    return data["choices"][0]["message"]["content"].strip()

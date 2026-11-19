-- 01_DiabloMaster_Diagnostico.lua
-- Diablo Master Mix by Puma Code - diablomastermix.com.ar
--
-- PRIMER PASO. Revisa el proyecto sin cambiar nada y te dice que corregir antes de mezclar y subir:
--   * pistas saturadas al grabar o con volumen muy bajo
--   * pistas sin nombre (los otros scripts reconocen el instrumento por el nombre)
--   * pistas en mute o en solo que quedaron olvidadas
--   * archivos de audio que faltan (offline)
--   * limitadores en el Master (Diablo Master hace el master: conviene subir la mezcla sin limitar)
--   * frecuencia de muestreo y tempo del proyecto
-- El informe completo queda en la consola de REAPER (ReaScript console).

local TITLE = "Diablo Master Mix by Puma Code"

local function msg(t) reaper.ShowMessageBox(t, TITLE, 0) end
local function out(t) reaper.ShowConsoleMsg(t .. "\n") end
local function lin2db(v) if v <= 1e-7 then return -140 end return 20 * math.log(v, 10) end

-- pico de un item de audio (en dBFS, sin contar el volumen del item)
local function item_peak(take, len)
  local src = reaper.GetMediaItemTake_Source(take)
  local sr = reaper.GetMediaSourceSampleRate(src)
  local ch = reaper.GetMediaSourceNumChannels(src)
  if sr <= 0 or ch <= 0 then return nil end
  local acc = reaper.CreateTakeAudioAccessor(take)
  local block = 0.25
  local n = math.floor(sr * block)
  local buf = reaper.new_array(n * ch)
  local peak, t = 0, 0
  while t < len do
    buf.clear()
    reaper.GetAudioAccessorSamples(acc, sr, ch, t, n, buf)
    for s = 1, n * ch do
      local v = buf[s]
      if v < 0 then v = -v end
      if v > peak then peak = v end
    end
    t = t + block
  end
  reaper.DestroyAudioAccessor(acc)
  return peak
end

local function is_generic(name)
  local n = (name or ""):lower():gsub("%s+", "")
  return n == "" or n:match("^track%d*$") or n:match("^pista%d*$") or n:match("^audio%d*$")
end

local LIMITERS = { "limit", "maxim", "pro-l", "ozone", "clipper", "loudmax" }

local function main()
  local ntr = reaper.CountTracks(0)
  if ntr == 0 then msg("El proyecto no tiene pistas.") return end

  reaper.ClearConsole()
  out("==== Diablo Master Mix by Puma Code - Diagnostico del proyecto ====")

  local srate = reaper.GetSetProjectInfo(0, "PROJECT_SRATE", 0, false)
  local use_sr = reaper.GetSetProjectInfo(0, "PROJECT_SRATE_USE", 0, false)
  local bpm = reaper.Master_GetTempo()
  out(("Frecuencia del proyecto: %s | Tempo: %.1f BPM"):format(
    (use_sr == 1 and srate > 0) and (math.floor(srate) .. " Hz") or "la de la placa de sonido", bpm))

  local clipped, low, unnamed, muted, soloed, offline, with_audio = {}, {}, {}, {}, {}, {}, 0
  for i = 0, ntr - 1 do
    local tr = reaper.GetTrack(0, i)
    local _, name = reaper.GetTrackName(tr, "")
    local nitems = reaper.CountTrackMediaItems(tr)
    if nitems > 0 then
      with_audio = with_audio + 1
      local label = ("%d. %s"):format(i + 1, name ~= "" and name or "(sin nombre)")
      if is_generic(name) then unnamed[#unnamed + 1] = label end
      if reaper.GetMediaTrackInfo_Value(tr, "B_MUTE") == 1 then muted[#muted + 1] = label end
      if reaper.GetMediaTrackInfo_Value(tr, "I_SOLO") > 0 then soloed[#soloed + 1] = label end
      local tpeak = 0
      for k = 0, nitems - 1 do
        local it = reaper.GetTrackMediaItem(tr, k)
        local take = reaper.GetActiveTake(it)
        if take and not reaper.TakeIsMIDI(take) then
          local len = reaper.GetMediaItemInfo_Value(it, "D_LENGTH")
          local p = item_peak(take, len)
          if p == nil then offline[#offline + 1] = label
          elseif p > tpeak then tpeak = p end
        end
      end
      local db = lin2db(tpeak)
      out(("  %-34s pico %6.1f dBFS"):format(label, db))
      if tpeak > 0 then
        if db >= -0.3 then clipped[#clipped + 1] = ("%s (%.1f dB)"):format(label, db)
        elseif db < -30 then low[#low + 1] = ("%s (%.1f dB)"):format(label, db) end
      end
    end
  end

  -- limitadores en el master
  local master = reaper.GetMasterTrack(0)
  local limiters = {}
  for fx = 0, reaper.TrackFX_GetCount(master) - 1 do
    local _, fxn = reaper.TrackFX_GetFXName(master, fx, "")
    local l = fxn:lower()
    for _, w in ipairs(LIMITERS) do
      if l:find(w, 1, true) and reaper.TrackFX_GetEnabled(master, fx) then limiters[#limiters + 1] = fxn break end
    end
  end
  local mvol = lin2db(reaper.GetMediaTrackInfo_Value(master, "D_VOL"))

  -- armado del resumen
  local r, todo = {}, 0
  local function add(title, list, advice)
    if #list == 0 then return end
    todo = todo + 1
    r[#r + 1] = "- " .. title .. ":\n    " .. table.concat(list, "\n    ") .. "\n    > " .. advice
    out("\n" .. title .. ":\n  " .. table.concat(list, "\n  ") .. "\n  > " .. advice)
  end
  add("Saturadas al grabar", clipped, "El recorte de la grabacion no se puede arreglar despues. Si se puede, regraba con menos ganancia en la placa (picos cerca de -12 dB).")
  add("Volumen muy bajo", low, "El script de Pre-mezcla las nivela. Si suenan con ruido, grabalas con mas ganancia.")
  add("Archivos que faltan", offline, "REAPER no encuentra el audio. Revisa en File > Project media/FX que esten todos los archivos.")
  add("Pistas sin nombre", unnamed, "Ponele el instrumento al nombre (Bateria, Bajo, Guitarra, Voz, Teclado) para que la Pre-mezcla las reconozca.")
  add("Pistas en mute", muted, "No van a sonar en el render. Sacales el mute si tienen que estar.")
  add("Pistas en solo", soloed, "Con solo activo, el render saca solo esas pistas. Desactiva el solo antes de exportar.")
  if #limiters > 0 then
    add("Limitador en el Master", limiters, "Diablo Master hace el master. El script de Exportar te ofrece apagarlo para subir la mezcla con aire.")
  end
  if math.abs(mvol) > 0.1 then
    out(("\nFader del Master en %.1f dB (el script de Exportar lo ajusta solo si hace falta)."):format(mvol))
  end

  out("\nOrden sugerido: 02 Sincronizar (solo si grabaron por separado), 03 Ajustar al tempo (solo con metronomo), 04 Pre-mezcla, 05 Preparar export, 06 Subir a Diablo Master.")

  if todo == 0 then
    msg(("Todo en orden: %d pistas con audio, sin saturaciones ni pistas olvidadas.\n\nSiguiente paso: Pre-mezcla (04)."):format(with_audio))
  else
    local txt = table.concat(r, "\n\n")
    if #txt > 1500 then txt = txt:sub(1, 1500) .. "\n..." end
    msg(("Revise %d pistas con audio. Hay %d punto(s) para mirar:\n\n%s\n\nEl informe completo esta en la consola de REAPER."):format(with_audio, todo, txt))
  end
end

main()

-- 05_DiabloMaster_Preparar_Export.lua
-- Diablo Master Mix by Puma Code - diablomastermix.com.ar
--
-- ULTIMO PASO ANTES DE SUBIR. Deja el render listo para que Diablo Master haga el mejor master:
--   * Formato WAV 24 bit, estereo, sin normalizar: la mezcla llega tal cual, sin perder calidad.
--   * Si hay un limitador o maximizador en el Master, te ofrece apagarlo: Diablo Master hace
--     el master y necesita la mezcla con aire. Limitar dos veces aplasta el sonido.
--   * Mide la mezcla con un render de prueba (no genera archivo). Si los picos pasan de -3 dBFS
--     baja el fader del Master para dejarlos cerca de -6 dBFS, el margen ideal para masterizar.
--   * Opcional: genera el WAV en la carpeta del proyecto ("Nombre - para Diablo Master.wav").
-- El script 06 (Subir a Diablo Master) usa este mismo formato, asi que despues de este paso
-- solo te queda ejecutarlo.

local TITLE = "Diablo Master Mix by Puma Code"
local WAV24 = "ZXZhdxgAAA=="   -- configuracion de REAPER para WAV 24 bit
local HEADROOM_MAX = -3.0       -- si el pico pasa de esto, se baja el Master
local HEADROOM_TARGET = -6.0    -- a donde se lleva el pico

local function msg(t) reaper.ShowMessageBox(t, TITLE, 0) end
local function ask(t) return reaper.ShowMessageBox(t, TITLE, 4) == 6 end
local function db2lin(db) return 10 ^ (db / 20) end
local function lin2db(v) if v <= 1e-7 then return -140 end return 20 * math.log(v, 10) end

local LIMITERS = { "limit", "maxim", "pro-l", "ozone", "clipper", "loudmax" }

-- busca por nombre la accion "Calculate loudness of master mix ... via dry run render"
-- (los numeros cambian entre versiones; la de "selected tracks" mediria una sola pista)
local function master_dryrun_action(use_ts)
  local sec = reaper.SectionFromUniqueID and reaper.SectionFromUniqueID(0) or 0
  local plain, with_ts
  for id = 42400, 42520 do
    local ok, txt = pcall(reaper.kbd_getTextFromCmd, id, sec)
    if ok and type(txt) == "string" then
      local l = txt:lower()
      if l:find("loudness", 1, true) and l:find("master mix", 1, true) and l:find("dry run", 1, true) then
        if l:find("time selection", 1, true) then with_ts = with_ts or id else plain = plain or id end
      end
    end
  end
  if use_ts then return with_ts or plain end
  return plain or with_ts
end

-- render de prueba del Master para medir pico y loudness; si la version de REAPER no lo
-- permite, devuelve nil y no se toca nada
local function measure_master(use_ts)
  local action = master_dryrun_action(use_ts)
  if not action then return nil end
  local ok, ret, stats = pcall(reaper.GetSetProjectInfo_String, 0, "RENDER_STATS", tostring(action), false)
  if not ok or not ret or type(stats) ~= "string" or stats == "" then return nil end
  local up = ";" .. stats:upper()
  local peak = tonumber(up:match(";PEAK:(%-?[%d%.]+)")) or tonumber(up:match(";TRUEPEAK:(%-?[%d%.]+)"))
  local lufs = tonumber(up:match(";LUFSI:(%-?[%d%.]+)"))
  if not peak or peak > 30 or peak < -150 then return nil end
  return peak, lufs
end

local function main()
  if reaper.CountMediaItems(0) == 0 then msg("El proyecto no tiene audio.") return end

  local master = reaper.GetMasterTrack(0)
  local lims = {}
  for fx = 0, reaper.TrackFX_GetCount(master) - 1 do
    local _, fxn = reaper.TrackFX_GetFXName(master, fx, "")
    local l = fxn:lower()
    for _, w in ipairs(LIMITERS) do
      if l:find(w, 1, true) and reaper.TrackFX_GetEnabled(master, fx) then lims[#lims + 1] = { fx = fx, name = fxn } break end
    end
  end

  reaper.Undo_BeginBlock()
  local notes = {}

  if #lims > 0 then
    local names = {}
    for _, x in ipairs(lims) do names[#names + 1] = x.name end
    if ask("En el Master hay: " .. table.concat(names, ", ") ..
        "\n\nDiablo Master hace el master. Si subis la mezcla ya limitada, se limita dos veces y pierde pegada." ..
        "\n\n¿Lo apago para este render? (Lo podes volver a prender cuando quieras.)") then
      for _, x in ipairs(lims) do reaper.TrackFX_SetEnabled(master, x.fx, false) end
      notes[#notes + 1] = "- Limitador del Master apagado"
    end
  end

  -- formato: WAV 24 bit, estereo, mezcla del Master, sin normalizar ni limitar al renderizar
  reaper.GetSetProjectInfo_String(0, "RENDER_FORMAT", WAV24, true)
  reaper.GetSetProjectInfo(0, "RENDER_SETTINGS", 0, true)
  reaper.GetSetProjectInfo(0, "RENDER_CHANNELS", 2, true)
  reaper.GetSetProjectInfo(0, "RENDER_NORMALIZE", 0, true)
  reaper.GetSetProjectInfo(0, "RENDER_DITHER", 0, true)
  local srate = reaper.GetSetProjectInfo(0, "PROJECT_SRATE", 0, false)
  local use = reaper.GetSetProjectInfo(0, "PROJECT_SRATE_USE", 0, false)
  local sr = (use == 1 and srate >= 44100) and srate or 48000
  reaper.GetSetProjectInfo(0, "RENDER_SRATE", sr, true)
  local ts, te = reaper.GetSet_LoopTimeRange(false, false, 0, 0, false)
  reaper.GetSetProjectInfo(0, "RENDER_BOUNDSFLAG", (te > ts) and 2 or 1, true)
  notes[#notes + 1] = ("- Formato: WAV 24 bit, %d Hz, estereo, sin normalizar"):format(math.floor(sr))
  if te > ts then notes[#notes + 1] = "- Se renderiza solo la seleccion de tiempo (sacala si queres el tema entero)" end

  -- medicion y margen
  local peak, lufs = measure_master(te > ts)
  if peak then
    local line = ("- Pico de la mezcla: %.1f dBFS"):format(peak)
    if lufs then line = line .. (" | Loudness: %.1f LUFS"):format(lufs) end
    notes[#notes + 1] = line
    if peak > HEADROOM_MAX then
      local cut = HEADROOM_TARGET - peak
      local v = reaper.GetMediaTrackInfo_Value(master, "D_VOL")
      reaper.SetMediaTrackInfo_Value(master, "D_VOL", v * db2lin(cut))
      notes[#notes + 1] = ("- Fader del Master bajado %.1f dB para dejar margen (pico cerca de %d dBFS)"):format(-cut, HEADROOM_TARGET)
    elseif peak < -18 then
      notes[#notes + 1] = "- La mezcla esta bastante baja; no pasa nada, Diablo Master la sube al masterizar"
    else
      notes[#notes + 1] = "- Margen perfecto para masterizar"
    end
  else
    notes[#notes + 1] = "- No pude medir la mezcla en esta version de REAPER: dale play y fijate que el medidor del Master no pase de -3 dB (si pasa, baja el fader del Master)"
  end

  reaper.Undo_EndBlock("Diablo Master Mix: preparar export", -1)

  local summary = "Render preparado para Diablo Master:\n\n" .. table.concat(notes, "\n")
  if ask(summary .. "\n\n¿Genero tambien el WAV en la carpeta del proyecto?\n\n(Si vas a subir directo, toca No y ejecuta el script 06: Subir a Diablo Master.)") then
    local _, oldpat = reaper.GetSetProjectInfo_String(0, "RENDER_PATTERN", "", false)
    reaper.GetSetProjectInfo_String(0, "RENDER_PATTERN", "$project - para Diablo Master", true)
    reaper.Main_OnCommand(42230, 0)   -- render con estos ajustes, cierra la ventana solo
    reaper.GetSetProjectInfo_String(0, "RENDER_PATTERN", oldpat, true)
    msg("Listo: el WAV quedo en la carpeta del proyecto.\n\nSiguiente paso: subilo desde la web o con el script 06 (Subir a Diablo Master).")
  end
end

main()

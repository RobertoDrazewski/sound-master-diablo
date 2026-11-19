-- 04_DiabloMaster_PreMezcla.lua
-- Diablo Master Mix by Puma Code - diablomastermix.com.ar
--
-- Deja el proyecto prolijo y balanceado para que el master de Diablo Master salga mejor:
--   * Nivela cada pista a -12 dBFS de pico (gain staging): nada satura y todo entra parejo a
--     los plugins. Toda la pista sube o baja junta, asi se respeta la diferencia entre una
--     estrofa suave y un estribillo fuerte.
--   * Pone un punto de partida de volumen y paneo segun el instrumento, que reconoce por el
--     nombre de la pista: bateria, bajo, voz, guitarra, teclado (en castellano o en ingles).
--     Si hay dos o mas guitarras, las abre a izquierda y derecha.
--   * Recorta el silencio muerto al principio y al final de cada pista y agrega micro-fades
--     para que no haya clics.
--   * Apaga limitadores sueltos en las pistas (aplastan la mezcla) y deja el fader del Master en 0 dB.
-- No toca el sonido de tus plugins ni corta nada del medio de la cancion.
-- Te muestra lo que va a hacer antes de empezar. Se deshace con Ctrl+Z / Cmd+Z.

local TITLE = "Diablo Master Mix by Puma Code"
local PEAK_TARGET_DB = -12.0   -- pico de cada pista antes de faders y plugins
local SILENCE_DB = -50.0       -- por debajo de esto se considera silencio
local MIN_SILENCE = 0.5        -- solo se recortan silencios de mas de medio segundo
local KEEP_BEFORE = 0.05       -- se deja un poquito antes del primer sonido
local KEEP_AFTER = 0.40        -- y un poco de cola despues del ultimo (resonancias, reverb)
local MAX_BOOST_DB = 20.0      -- a una pista muy baja no se le suma mas que esto (subiria el ruido)

local function msg(t) reaper.ShowMessageBox(t, TITLE, 0) end
local function ask(t) return reaper.ShowMessageBox(t, TITLE, 4) == 6 end
local function db2lin(db) return 10 ^ (db / 20) end
local function lin2db(v) if v <= 1e-7 then return -140 end return 20 * math.log(v, 10) end

-- instrumento segun el nombre: rol, fader de partida (dB), paneo
local function role_of(name)
  local n = (name or ""):lower()
  local function has(...) for _, w in ipairs({ ... }) do if n:find(w, 1, true) then return true end end return false end
  if has("kick", "bombo", "snare", "redo", "tom", "hat", "hh", "overhead", "oh ", "drum", "bater", "perc", "bat ") or n == "bat" then
    return "bateria", -2.5, 0
  elseif has("bass", "bajo", "sub") then return "bajo", -3.5, 0
  elseif has("voc", "voz", "vox", "cant", "lead", "coro", "choir") then return "voz", -1.5, 0
  elseif has("guit", "gtr", "gt ", "viol") or n == "gt" then return "guitarra", -4.5, 0
  elseif has("key", "tecl", "synth", "sint", "piano", "organ", "organo", "pad") then return "teclado", -5.0, -0.14
  end
  return "otro", -4.0, 0
end

-- pico, primer y ultimo sonido de un item (tiempos del item)
local function scan(take, len)
  local src = reaper.GetMediaItemTake_Source(take)
  local sr = reaper.GetMediaSourceSampleRate(src)
  local ch = reaper.GetMediaSourceNumChannels(src)
  if sr <= 0 or ch <= 0 then return nil end
  local acc = reaper.CreateTakeAudioAccessor(take)
  local step = 0.02
  local n = math.max(1, math.floor(sr * step))
  local buf = reaper.new_array(n * ch)
  local sil = db2lin(SILENCE_DB)
  local peak, first, last, t = 0, nil, nil, 0
  while t < len do
    buf.clear()
    reaper.GetAudioAccessorSamples(acc, sr, ch, t, n, buf)
    local pk = 0
    for s = 1, n * ch do local v = buf[s] if v < 0 then v = -v end if v > pk then pk = v end end
    if pk > peak then peak = pk end
    if pk >= sil then
      if not first then first = t end
      last = t + step
    end
    t = t + step
  end
  reaper.DestroyAudioAccessor(acc)
  return { peak = peak, first = first, last = last }
end

local function main()
  local ntr = reaper.CountTracks(0)
  local plan, guitars = {}, 0
  for i = 0, ntr - 1 do
    local tr = reaper.GetTrack(0, i)
    if reaper.CountTrackMediaItems(tr) > 0 then
      local _, name = reaper.GetTrackName(tr, "")
      local role, fader, pan = role_of(name)
      if role == "guitarra" then guitars = guitars + 1 end
      plan[#plan + 1] = { tr = tr, name = name ~= "" and name or ("Pista " .. (i + 1)), role = role, fader = fader, pan = pan }
    end
  end
  if #plan == 0 then msg("El proyecto no tiene pistas con audio.") return end

  local roles = {}
  for _, p in ipairs(plan) do roles[#roles + 1] = p.name .. " = " .. p.role end
  if not ask("Pre-mezcla de " .. #plan .. " pistas. Reconoci estos instrumentos:\n\n" .. table.concat(roles, "\n") ..
      "\n\nSi alguna dice \"otro\" y es un instrumento, cancela, ponele el nombre (Bateria, Bajo, Guitarra, Voz, Teclado) y volve a ejecutar." ..
      "\n\nVoy a nivelar, poner volumen y paneo de partida y recortar silencios. ¿Seguimos?") then return end

  reaper.Undo_BeginBlock()
  reaper.PreventUIRefresh(1)

  local gi, trimmed, limiters, report = 0, 0, 0, {}
  for _, p in ipairs(plan) do
    local tr = p.tr
    -- 1. medir toda la pista
    local items, tpeak = {}, 0
    for k = 0, reaper.CountTrackMediaItems(tr) - 1 do
      local it = reaper.GetTrackMediaItem(tr, k)
      local take = reaper.GetActiveTake(it)
      if take and not reaper.TakeIsMIDI(take) then
        local len = reaper.GetMediaItemInfo_Value(it, "D_LENGTH")
        local st = scan(take, len)
        if st then
          local vol = reaper.GetMediaItemInfo_Value(it, "D_VOL")
          local pk = st.peak * vol
          if pk > tpeak then tpeak = pk end
          items[#items + 1] = { it = it, take = take, len = len, st = st, vol = vol }
        end
      end
    end

    -- 2. gain staging: la misma ganancia para todos los items de la pista
    if tpeak > 1e-4 then
      local gdb = math.min(MAX_BOOST_DB, PEAK_TARGET_DB - lin2db(tpeak))
      local g = db2lin(gdb)
      for _, x in ipairs(items) do reaper.SetMediaItemInfo_Value(x.it, "D_VOL", x.vol * g) end
      report[#report + 1] = ("%s: %+.1f dB%s"):format(p.name, gdb, gdb >= MAX_BOOST_DB and " (muy baja: conviene regrabarla con mas ganancia)" or "")
    end

    -- 3. silencio al principio del primer item y al final del ultimo
    table.sort(items, function(a, b)
      return reaper.GetMediaItemInfo_Value(a.it, "D_POSITION") < reaper.GetMediaItemInfo_Value(b.it, "D_POSITION")
    end)
    for idx, x in ipairs(items) do
      local it, take, st = x.it, x.take, x.st
      local rate = reaper.GetMediaItemTakeInfo_Value(take, "D_PLAYRATE")
      if st.first and math.abs(rate - 1) < 1e-6 then
        if idx == 1 and st.first > MIN_SILENCE then
          local cut = st.first - KEEP_BEFORE
          local pos = reaper.GetMediaItemInfo_Value(it, "D_POSITION")
          local offs = reaper.GetMediaItemTakeInfo_Value(take, "D_STARTOFFS")
          reaper.SetMediaItemTakeInfo_Value(take, "D_STARTOFFS", offs + cut)
          reaper.SetMediaItemInfo_Value(it, "D_POSITION", pos + cut)
          reaper.SetMediaItemInfo_Value(it, "D_LENGTH", x.len - cut)
          x.len = x.len - cut
          st.last = st.last and (st.last - cut)
          trimmed = trimmed + 1
        end
        if idx == #items and st.last and (x.len - st.last) > MIN_SILENCE + KEEP_AFTER then
          reaper.SetMediaItemInfo_Value(it, "D_LENGTH", st.last + KEEP_AFTER)
          trimmed = trimmed + 1
        end
      end
      -- micro-fades anti-clic (si ya tenia fades mas largos, se respetan)
      if reaper.GetMediaItemInfo_Value(it, "D_FADEINLEN") < 0.01 then reaper.SetMediaItemInfo_Value(it, "D_FADEINLEN", 0.01) end
      if reaper.GetMediaItemInfo_Value(it, "D_FADEOUTLEN") < 0.02 then reaper.SetMediaItemInfo_Value(it, "D_FADEOUTLEN", 0.02) end
    end

    -- 4. volumen y paneo de partida
    local pan = p.pan
    if p.role == "guitarra" then
      if guitars >= 2 then gi = gi + 1; pan = (gi % 2 == 1) and -0.35 or 0.35 else pan = 0.10 end
    end
    reaper.SetMediaTrackInfo_Value(tr, "D_VOL", db2lin(p.fader))
    reaper.SetMediaTrackInfo_Value(tr, "D_PAN", pan)

    -- 5. limitadores sueltos en la pista
    for fx = 0, reaper.TrackFX_GetCount(tr) - 1 do
      local _, fxn = reaper.TrackFX_GetFXName(tr, fx, "")
      local l = fxn:lower()
      if (l:find("limit", 1, true) or l:find("maxim", 1, true)) and reaper.TrackFX_GetEnabled(tr, fx) then
        reaper.TrackFX_SetEnabled(tr, fx, false)
        limiters = limiters + 1
      end
    end
  end

  reaper.SetMediaTrackInfo_Value(reaper.GetMasterTrack(0), "D_VOL", 1.0)

  reaper.PreventUIRefresh(-1)
  reaper.UpdateArrange()
  reaper.Undo_EndBlock("Diablo Master Mix: pre-mezcla", -1)

  reaper.ShowConsoleMsg("Diablo Master Mix by Puma Code - Pre-mezcla\nGanancia aplicada por pista:\n  " .. table.concat(report, "\n  ") .. "\n")
  msg(("Listo, %d pistas preparadas:\n- Niveladas a %d dBFS de pico (cero saturacion)\n- Volumen y paneo de partida por instrumento%s\n- %d silencio(s) recortados y micro-fades anti-clic\n- %d limitador(es) apagados en pistas\n- Fader del Master en 0 dB\n\nAhora ajusta a gusto (es un punto de partida) y segui con: Preparar export (05).")
    :format(#plan, PEAK_TARGET_DB, guitars >= 2 and " (guitarras abiertas L/R)" or "", trimmed, limiters))
end

main()

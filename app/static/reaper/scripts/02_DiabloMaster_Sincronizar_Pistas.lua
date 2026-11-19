-- 02_DiabloMaster_Sincronizar_Pistas.lua
-- Diablo Master Mix by Puma Code - diablomastermix.com.ar
--
-- OPCIONAL: usalo solo si las pistas se grabaron por separado (cada uno en su casa, con celulares,
-- o importadas de distintos lugares) y quedaron corridas. Si grabaron todos juntos en la misma
-- placa, ya estan sincronizadas: no hace falta.
--
-- Compara cada pista con una de referencia (la bateria, o la pista que tengas seleccionada) a lo
-- largo de los primeros 45 segundos y calcula cuanto esta adelantada o atrasada, con precision
-- de 1 milisegundo. Antes de mover nada te muestra el resultado y te pregunta.
-- Mueve todos los items de cada pista juntos, asi no se desarman los cortes que ya hiciste.
-- Se deshace con Ctrl+Z / Cmd+Z.

local TITLE = "Diablo Master Mix by Puma Code"
local WINDOW_SEC = 45      -- cuanto audio se compara
local MAX_SHIFT = 1.5      -- corrimiento maximo que se corrige (segundos)
local MIN_SHIFT = 0.003    -- por debajo de 3 ms no se toca
local MIN_MATCH = 0.25     -- parecido minimo para confiar en el resultado

local function msg(t) reaper.ShowMessageBox(t, TITLE, 0) end
local function ask(t) return reaper.ShowMessageBox(t, TITLE, 4) == 6 end

local function role_is_drum(name)
  local n = (name or ""):lower()
  return n:find("drum") or n:find("bater") or n:find("bat ") or n == "bat" or n:find("kick") or n:find("bombo")
      or n:find("snare") or n:find("redo") or n:find("overhead") or n:find("perc")
end

-- energia de la pista en ventanas de "step" segundos desde t0 durante dur segundos (tiempo del proyecto)
local function envelope(tr, t0, dur, step)
  local nb = math.floor(dur / step)
  local env = {}
  for b = 1, nb do env[b] = 0 end
  for k = 0, reaper.CountTrackMediaItems(tr) - 1 do
    local it = reaper.GetTrackMediaItem(tr, k)
    local take = reaper.GetActiveTake(it)
    if take and not reaper.TakeIsMIDI(take) and reaper.GetMediaItemInfo_Value(it, "B_MUTE") == 0 then
      local src = reaper.GetMediaItemTake_Source(take)
      local sr = reaper.GetMediaSourceSampleRate(src)
      local ch = reaper.GetMediaSourceNumChannels(src)
      if sr > 0 and ch > 0 then
        local pos = reaper.GetMediaItemInfo_Value(it, "D_POSITION")
        local len = reaper.GetMediaItemInfo_Value(it, "D_LENGTH")
        local first = math.max(1, math.floor((pos - t0) / step) + 1)
        local last = math.min(nb, math.floor((pos + len - t0) / step))
        if last >= first then
          local n = math.max(1, math.floor(sr * step))
          local buf = reaper.new_array(n * ch)
          local acc = reaper.CreateTakeAudioAccessor(take)
          for b = first, last do
            local lt = t0 + (b - 1) * step - pos
            if lt >= 0 and lt + step <= len then
              buf.clear()
              reaper.GetAudioAccessorSamples(acc, sr, ch, lt, n, buf)
              local e = 0
              for s = 1, n * ch do local v = buf[s] e = e + v * v end
              env[b] = env[b] + math.sqrt(e / (n * ch))
            end
          end
          reaper.DestroyAudioAccessor(acc)
        end
      end
    end
  end
  -- se comparan los ataques (subidas de energia), no el volumen parejo
  local flux = { 0 }
  for b = 2, nb do
    local d = env[b] - env[b - 1]
    flux[b] = d > 0 and d or 0
  end
  return flux, nb
end

-- mejor corrimiento (en ventanas) de x respecto de ref, entre lo y hi
local function best_lag(ref, x, nb, lo, hi)
  local rr, xx = 0, 0
  for b = 1, nb do rr = rr + ref[b] * ref[b]; xx = xx + x[b] * x[b] end
  if rr <= 0 or xx <= 0 then return nil, 0 end
  local best, bl = -1, 0
  for L = lo, hi do
    local c = 0
    local a = math.max(1, 1 - L)
    local z = math.min(nb, nb - L)
    for b = a, z do c = c + ref[b] * x[b + L] end
    if c > best then best, bl = c, L end
  end
  return bl, best / math.sqrt(rr * xx)
end

local function main()
  local ntr = reaper.CountTracks(0)
  local tracks, ref = {}, nil
  for i = 0, ntr - 1 do
    local tr = reaper.GetTrack(0, i)
    if reaper.CountTrackMediaItems(tr) > 0 then
      local _, name = reaper.GetTrackName(tr, "")
      tracks[#tracks + 1] = { tr = tr, name = name ~= "" and name or ("Pista " .. (i + 1)) }
    end
  end
  if #tracks < 2 then msg("Hacen falta al menos dos pistas con audio para sincronizar.") return end

  -- referencia: la primera pista seleccionada; si no hay, la bateria; si no, la primera con audio
  for _, t in ipairs(tracks) do if reaper.IsTrackSelected(t.tr) then ref = t break end end
  if not ref then for _, t in ipairs(tracks) do if role_is_drum(t.name) then ref = t break end end end
  ref = ref or tracks[1]

  if not ask("Vas a sincronizar las pistas tomando como referencia: " .. ref.name ..
      "\n\nUsalo solo si se grabaron por separado. Si grabaron todos juntos en la misma placa, ya estan sincronizadas." ..
      "\n\nPrimero se analiza y te muestro el resultado antes de mover nada. Puede tardar unos segundos. ¿Seguimos?") then return end

  local t0 = math.huge
  for _, t in ipairs(tracks) do
    local p = reaper.GetMediaItemInfo_Value(reaper.GetTrackMediaItem(t.tr, 0), "D_POSITION")
    if p < t0 then t0 = p end
  end
  t0 = math.max(0, t0)

  -- etapa gruesa: ventanas de 10 ms en 45 s
  local STEP = 0.01
  local rflux, nb = envelope(ref.tr, t0, WINDOW_SEC, STEP)
  -- tramo de 10 s con mas ataques en la referencia, para la etapa fina
  local best_s, best_sum = 1, -1
  local span = math.floor(10 / STEP)
  for s = 1, math.max(1, nb - span), 50 do
    local sum = 0
    for b = s, math.min(nb, s + span - 1) do sum = sum + rflux[b] end
    if sum > best_sum then best_s, best_sum = s, sum end
  end
  local fine_t0 = t0 + (best_s - 1) * STEP
  local FSTEP = 0.001
  local rfine, nf = envelope(ref.tr, fine_t0, 10, FSTEP)

  local results, lines = {}, {}
  local maxlag = math.floor(MAX_SHIFT / STEP)
  for _, t in ipairs(tracks) do
    if t ~= ref then
      local x = envelope(t.tr, t0, WINDOW_SEC, STEP)
      local L, score = best_lag(rflux, x, nb, -maxlag, maxlag)
      if L and score >= MIN_MATCH then
        -- etapa fina: 1 ms alrededor del resultado grueso
        local xf = envelope(t.tr, fine_t0, 10, FSTEP)
        local Lf = best_lag(rfine, xf, nf, L * 10 - 15, L * 10 + 15)
        local shift = (Lf or L * 10) * FSTEP       -- positivo = la pista llega tarde
        if math.abs(shift) >= MIN_SHIFT then
          results[#results + 1] = { tr = t.tr, shift = shift }
          lines[#lines + 1] = ("%s: %s %d ms (parecido %d%%)"):format(t.name, shift > 0 and "atrasada" or "adelantada",
            math.floor(math.abs(shift) * 1000 + 0.5), math.floor(score * 100 + 0.5))
        else
          lines[#lines + 1] = t.name .. ": ya esta en tiempo"
        end
      else
        lines[#lines + 1] = t.name .. ": no se parece lo suficiente a la referencia, no se toca"
      end
    end
  end

  if #results == 0 then
    msg("Referencia: " .. ref.name .. "\n\n" .. table.concat(lines, "\n") .. "\n\nNo hay nada para mover.")
    return
  end
  if not ask("Referencia: " .. ref.name .. "\n\n" .. table.concat(lines, "\n") ..
      "\n\n¿Muevo las pistas corridas para que queden en tiempo con la referencia?") then return end

  reaper.Undo_BeginBlock()
  reaper.PreventUIRefresh(1)
  for _, r in ipairs(results) do
    for k = 0, reaper.CountTrackMediaItems(r.tr) - 1 do
      local it = reaper.GetTrackMediaItem(r.tr, k)
      local p = reaper.GetMediaItemInfo_Value(it, "D_POSITION")
      local np = p - r.shift
      if np < 0 then
        -- no hay lugar antes del cero: se recorta ese pedacito del principio del audio
        local take = reaper.GetActiveTake(it)
        if take then
          local offs = reaper.GetMediaItemTakeInfo_Value(take, "D_STARTOFFS")
          reaper.SetMediaItemTakeInfo_Value(take, "D_STARTOFFS", offs - np)
        end
        local len = reaper.GetMediaItemInfo_Value(it, "D_LENGTH")
        reaper.SetMediaItemInfo_Value(it, "D_LENGTH", math.max(0.05, len + np))
        np = 0
      end
      reaper.SetMediaItemInfo_Value(it, "D_POSITION", np)
    end
  end
  reaper.PreventUIRefresh(-1)
  reaper.UpdateArrange()
  reaper.Undo_EndBlock("Diablo Master Mix: sincronizar pistas", -1)
  msg(("Listo: se sincronizaron %d pista(s) con %s.\nEscucha el arranque y, si algo no te convence, Ctrl+Z / Cmd+Z lo deshace.\n\nSiguiente paso: Ajustar al tempo (03, opcional) o Pre-mezcla (04)."):format(#results, ref.name))
end

main()

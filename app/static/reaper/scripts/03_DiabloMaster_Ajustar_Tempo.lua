-- 03_DiabloMaster_Ajustar_Tempo.lua
-- Diablo Master Mix by Puma Code - diablomastermix.com.ar
--
-- OPCIONAL: usalo solo si grabaron con metronomo y el tempo del proyecto es el del tema.
-- Si tocaron sin click, no lo uses: la grilla no coincide con la cancion y la desarmaria.
--
-- Como usarlo:
--   1. Selecciona las pistas a corregir (por ejemplo, todos los microfonos de la bateria y el bajo).
--      La PRIMERA pista seleccionada es la que manda: de ahi se toman los golpes.
--   2. Ejecuta el script, elegi la grilla (16 = semicorcheas, 8 = corcheas) y la fuerza.
-- Detecta los golpes y los acerca a la grilla con marcadores de estiramiento (stretch markers).
-- Por defecto los acerca un 70%: se corrige lo que se escapa sin perder el groove humano.
-- Todas las pistas seleccionadas se corrigen con los mismos marcadores, asi los microfonos de
-- la bateria no se desfasan entre si. Se deshace con Ctrl+Z / Cmd+Z.

local TITLE = "Diablo Master Mix by Puma Code"
local MIN_TRANSIENT_DB = -30.0  -- golpes mas suaves que esto no se tocan
local MIN_GAP_SEC = 0.10        -- separacion minima entre golpes
local MIN_MOVE = 0.006          -- desvios menores a 6 ms no se tocan
local MAX_MOVE = 0.120          -- desvios mayores a 120 ms no se tocan (seria otro golpe)

local function msg(t) reaper.ShowMessageBox(t, TITLE, 0) end
local function db2lin(db) return 10 ^ (db / 20) end

-- golpes de la pista de referencia en tiempo del proyecto
local function transients(tr)
  local hits = {}
  for k = 0, reaper.CountTrackMediaItems(tr) - 1 do
    local it = reaper.GetTrackMediaItem(tr, k)
    local take = reaper.GetActiveTake(it)
    if take and not reaper.TakeIsMIDI(take) then
      local src = reaper.GetMediaItemTake_Source(take)
      local sr = reaper.GetMediaSourceSampleRate(src)
      local ch = reaper.GetMediaSourceNumChannels(src)
      if sr > 0 and ch > 0 then
        local pos = reaper.GetMediaItemInfo_Value(it, "D_POSITION")
        local len = reaper.GetMediaItemInfo_Value(it, "D_LENGTH")
        local vol = reaper.GetMediaItemInfo_Value(it, "D_VOL")
        local step = 0.004
        local n = math.max(1, math.floor(sr * step))
        local buf = reaper.new_array(n * ch)
        local acc = reaper.CreateTakeAudioAccessor(take)
        local thr = db2lin(MIN_TRANSIENT_DB)
        local avg, prev, last = 0, 0, -1
        local t = 0
        while t + step < len do
          buf.clear()
          reaper.GetAudioAccessorSamples(acc, sr, ch, t, n, buf)
          local pk = 0
          for s = 1, n * ch do local v = buf[s] if v < 0 then v = -v end if v > pk then pk = v end end
          pk = pk * vol
          -- ataque: subida fuerte sobre el promedio reciente
          if pk >= thr and pk > avg * 2.2 and pk > prev * 1.4 and (pos + t) - last >= MIN_GAP_SEC then
            hits[#hits + 1] = pos + t
            last = pos + t
          end
          avg = avg * 0.9 + pk * 0.1
          prev = pk
          t = t + step
        end
        reaper.DestroyAudioAccessor(acc)
      end
    end
  end
  return hits
end

local function main()
  local sel = {}
  for i = 0, reaper.CountSelectedTracks(0) - 1 do
    local tr = reaper.GetSelectedTrack(0, i)
    if reaper.CountTrackMediaItems(tr) > 0 then sel[#sel + 1] = tr end
  end
  if #sel == 0 then
    msg("Selecciona las pistas a corregir (la primera es la que manda) y volve a ejecutar.\n\nUsalo solo si grabaron con metronomo.")
    return
  end
  local _, refname = reaper.GetTrackName(sel[1], "")

  local ok, vals = reaper.GetUserInputs(TITLE .. " - Ajustar al tempo", 3,
    "Grilla (4, 8, 16 o 32),Fuerza en % (50 a 100),¿Grabaron con metronomo? (si/no),extrawidth=80",
    "16,70,si")
  if not ok then return end
  local div, strength, click = vals:match("^(.-),(.-),(.*)$")
  div = tonumber(div) or 16
  strength = math.max(0.1, math.min(1, (tonumber(strength) or 70) / 100))
  if not (click or ""):lower():find("^s") then
    msg("Sin metronomo la grilla no coincide con el tema y lo desarmaria. Mejor no usar este script.")
    return
  end
  if div ~= 4 and div ~= 8 and div ~= 16 and div ~= 32 then div = 16 end
  local qstep = 4 / div   -- en negras

  reaper.Undo_BeginBlock()
  reaper.PreventUIRefresh(1)

  local hits = transients(sel[1])
  -- destino de cada golpe en la grilla (respeta cambios de tempo del proyecto)
  local moves = {}
  for _, T in ipairs(hits) do
    local qn = reaper.TimeMap2_timeToQN(0, T)
    local G = reaper.TimeMap2_QNToTime(0, math.floor(qn / qstep + 0.5) * qstep)
    local d = G - T
    if math.abs(d) >= MIN_MOVE and math.abs(d) <= MAX_MOVE then
      moves[#moves + 1] = { from = T, to = T + d * strength }
    end
  end

  local touched, skipped = 0, 0
  for _, tr in ipairs(sel) do
    for k = 0, reaper.CountTrackMediaItems(tr) - 1 do
      local it = reaper.GetTrackMediaItem(tr, k)
      local take = reaper.GetActiveTake(it)
      if take and not reaper.TakeIsMIDI(take) then
        local rate = reaper.GetMediaItemTakeInfo_Value(take, "D_PLAYRATE")
        if math.abs(rate - 1) > 1e-6 then
          skipped = skipped + 1       -- items con velocidad cambiada: no se tocan
        else
          local pos = reaper.GetMediaItemInfo_Value(it, "D_POSITION")
          local len = reaper.GetMediaItemInfo_Value(it, "D_LENGTH")
          local offs = reaper.GetMediaItemTakeInfo_Value(take, "D_STARTOFFS")
          -- anclas en el principio y el final: lo que no se corrige no se corre
          reaper.SetTakeStretchMarker(take, -1, 0, offs)
          reaper.SetTakeStretchMarker(take, -1, len, offs + len)
          local lastpos, n = 0.02, 0
          for _, m in ipairs(moves) do
            local p_src = m.from - pos
            local p_new = m.to - pos
            if p_src > 0.03 and p_src < len - 0.03 and p_new > lastpos + 0.02 and p_new < len - 0.03 then
              reaper.SetTakeStretchMarker(take, -1, p_new, offs + p_src)
              lastpos = p_new
              n = n + 1
            end
          end
          if n > 0 then touched = touched + 1 end
        end
      end
    end
  end

  reaper.PreventUIRefresh(-1)
  reaper.UpdateArrange()
  reaper.Undo_EndBlock("Diablo Master Mix: ajustar al tempo", -1)

  if #moves == 0 then
    msg("La pista " .. refname .. " ya esta en tiempo con la grilla: no hubo nada para corregir.")
  else
    msg(("Listo: %d golpes de %s acercados un %d%% a la grilla de 1/%d en %d item(s)%s.\n\nEscuchalo: si suena raro, Ctrl+Z / Cmd+Z lo deshace.\n\nSiguiente paso: Pre-mezcla (04).")
      :format(#moves, refname, math.floor(strength * 100 + 0.5), div, touched,
        skipped > 0 and (" (" .. skipped .. " con velocidad cambiada quedaron igual)") or ""))
  end
end

main()

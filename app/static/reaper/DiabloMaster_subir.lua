-- Diablo Master - subir a la web desde Reaper
-- Renderiza el proyecto (cancion completa o pistas sueltas) y lo sube a tu banda.
-- Uso: Actions > Show action list > New action > Load ReaScript... y elegir este archivo.
-- La primera vez pide la direccion de la web y tu token personal (Cuenta > Token para Reaper).
-- Usa el ultimo formato de render que hayas configurado en Reaper (recomendado: WAV 24 bit).

local SEC = "DiabloMaster"
local WIN = reaper.GetOS():find("Win") ~= nil
local SEP = WIN and "\\" or "/"

local function msg(t) reaper.ShowMessageBox(t, "Diablo Master", 0) end
local function get(k) return reaper.GetExtState(SEC, k) end
local function set(k, v) reaper.SetExtState(SEC, k, v, true) end

local function clean(s) return (s or ""):gsub('[%c"\\\'`$&;|<>]', ""):gsub("^%s+", ""):gsub("%s+$", "") end
local function q(s)
  if WIN then return '"' .. s:gsub('"', "") .. '"' end
  return "'" .. s:gsub("'", "'\\''") .. "'"
end

local function tmpdir()
  local base = WIN and (os.getenv("TEMP") or "C:\\Temp") or (os.getenv("TMPDIR") or "/tmp")
  base = base:gsub("[/\\]$", "")
  local d = base .. SEP .. "diablo-master-render"
  reaper.RecursiveCreateDirectory(d, 0)
  return d
end

local function clear_dir(d)
  local i = 0
  while true do
    local f = reaper.EnumerateFiles(d, i)
    if not f then break end
    os.remove(d .. SEP .. f)
    i = i + 1
  end
end

local function curl(args)
  local bin = WIN and "curl" or "/usr/bin/curl"
  local cmd = bin .. " -sS " .. args
  local out = reaper.ExecProcess(cmd, 0) or ""
  local code, body = out:match("^(%-?%d+)\n?(.*)$")
  return tonumber(code) or -1, body or out
end

local function with_auth(url, token, extra)
  local hdr = "Authorization: Bearer " .. token
  local code, body = curl("-H " .. q(hdr) .. " " .. extra .. " " .. q(url))
  return code, body
end

-- ---------------------------------------------------------------- configuracion
local function configure()
  local ok, vals = reaper.GetUserInputs("Diablo Master - conectar", 2,
    "Direccion de la web,Token personal (pck_...),extrawidth=260",
    (get("url") ~= "" and get("url") or "http://localhost:8010") .. "," .. get("token"))
  if not ok then return false end
  local url, token = vals:match("^(.-),(.*)$")
  url = clean(url):gsub("/+$", "")
  token = clean(token)
  if url == "" or token == "" then msg("Faltan datos.") return false end
  set("url", url) set("token", token) set("band", "")
  return true
end


local function choose_band()
  local url, token = get("url"), get("token")
  local code, body = with_auth(url .. "/me", token, "-m 30")
  if code ~= 0 or not body:find('"bands"') then
    msg("No pude conectar con " .. url .. "\nRevisa la direccion y el token.\n\n(codigo " .. tostring(code) .. ") " .. tostring(body):sub(1, 300))
    set("token", "")
    return false
  end
  local bands = {}
  for id, name in body:gmatch('"id":%s*(%d+),%s*"name":%s*"(.-)"') do
    bands[#bands + 1] = { id = id, name = name }
  end
  if #bands == 0 then msg("Todavia no estas en ninguna banda.") return false end
  local chosen = bands[1]
  if #bands > 1 then
    local lista = {}
    for i, b in ipairs(bands) do lista[#lista + 1] = i .. " = " .. b.name end
    msg("Tus bandas:\n\n" .. table.concat(lista, "\n") .. "\n\nEn la siguiente ventana escribi el numero.")
    local ok, n = reaper.GetUserInputs("Diablo Master - banda", 1, "Numero de banda", "1")
    if not ok then return false end
    chosen = bands[tonumber(n) or 0]
    if not chosen then msg("Numero invalido.") return false end
  end
  set("band", chosen.id) set("band_name", chosen.name)
  -- cada proyecto de Reaper recuerda su banda (se guarda con el proyecto)
  reaper.SetProjExtState(0, SEC, "band", tostring(chosen.id))
  reaper.SetProjExtState(0, SEC, "band_name", chosen.name)
  return true
end

-- ---------------------------------------------------------------- principal
local function main()
  if get("url") == "" or get("token") == "" then
    if not configure() then return end
  end
  local proj = 0
  local _, pband = reaper.GetProjExtState(proj, SEC, "band")
  local _, pband_name = reaper.GetProjExtState(proj, SEC, "band_name")
  if pband ~= "" then
    set("band", pband) set("band_name", pband_name)
  else
    set("band", "")          -- proyecto nuevo: preguntar a que banda pertenece
    if not choose_band() then return end
  end

  local r1, r2 = reaper.GetProjectName(proj, "")
  local pname = (type(r2) == "string" and r2) or (type(r1) == "string" and r1) or ""
  pname = pname:gsub("%.[Rr][Pp][Pp]$", "")
  if pname == "" then
    msg("Primero guarda el proyecto (Cmd+S en Mac, Ctrl+S en Windows) y volve a ejecutar el script.\n\nReaper no puede exportar un proyecto que todavia no tiene nombre.")
    return
  end

  -- si el proyecto tiene varias pistas con audio, sugerir subir por pistas
  local with_audio = 0
  for ti = 0, reaper.CountTracks(proj) - 1 do
    local t0 = reaper.GetTrack(proj, ti)
    if t0 and reaper.CountTrackMediaItems(t0) > 0 then with_audio = with_audio + 1 end
  end
  local def_what = with_audio > 1 and "pistas" or "cancion"

  local ok, vals = reaper.GetUserInputs("Diablo Master - subir a " .. get("band_name"), 4,
    "Nombre del tema o ensayo,Que subir (cancion / pistas),Donde (ensayo / produccion / master),Cambiar (no / banda / conexion),extrawidth=220",
    pname .. "," .. def_what .. "," .. (get("section") ~= "" and get("section") or "ensayo") .. ",no")
  if not ok then return end
  local title, what, where, reconf = vals:match("^(.-),(.-),(.-),(.*)$")
  title = clean(title)
  what = clean(what):lower()
  where = clean(where):lower()
  local section = (where:find("^mas") and "master") or (where:find("^prod") and "produccion") or "ensayo"
  set("section", section)
  local rc = clean(reconf):lower()
  if rc == "conexion" or rc == "si" then
    if configure() and choose_band() then msg("Conexion actualizada. Volve a ejecutar el script.") end
    return
  elseif rc:find("^ban") then
    if not choose_band() then return end
    msg("Listo: este proyecto ahora sube a " .. get("band_name") .. ".\nVolve a ejecutar el script.")
    return
  end
  if title == "" then title = pname end
  local mode = (what:find("pista") or what:find("stem")) and "stems" or (section == "ensayo" and "raw" or "mix")

  if reaper.CountMediaItems(proj) == 0 then
    msg("El proyecto no tiene audio. Arrastra un archivo de audio a una pista (o grabá algo) y volve a ejecutar.")
    return
  end

  local dir = tmpdir()
  clear_dir(dir)

  -- guardar configuracion de render actual para restaurarla despues
  local _, old_file = reaper.GetSetProjectInfo_String(proj, "RENDER_FILE", "", false)
  local _, old_pat = reaper.GetSetProjectInfo_String(proj, "RENDER_PATTERN", "", false)
  local old_set = reaper.GetSetProjectInfo(proj, "RENDER_SETTINGS", 0, false)
  local old_bounds = reaper.GetSetProjectInfo(proj, "RENDER_BOUNDSFLAG", 0, false)

  -- pistas separadas: Reaper solo renderiza las pistas seleccionadas, asi que se eligen solas
  -- (las que tienen audio) y despues se devuelve la seleccion como estaba
  local prev_sel = {}
  if mode == "stems" then
    for i = 0, reaper.CountTracks(proj) - 1 do
      local tr = reaper.GetTrack(proj, i)
      prev_sel[i] = reaper.IsTrackSelected(tr)
      reaper.SetTrackSelected(tr, reaper.CountTrackMediaItems(tr) > 0)
    end
  end

  reaper.GetSetProjectInfo_String(proj, "RENDER_FILE", dir, true)
  if mode == "stems" then
    reaper.GetSetProjectInfo_String(proj, "RENDER_PATTERN", "$track", true)
    reaper.GetSetProjectInfo(proj, "RENDER_SETTINGS", 2, true)      -- solo pistas (stems)
  else
    reaper.GetSetProjectInfo_String(proj, "RENDER_PATTERN", "cancion", true)
    reaper.GetSetProjectInfo(proj, "RENDER_SETTINGS", 0, true)      -- mezcla master
  end
  local ts_start, ts_end = reaper.GetSet_LoopTimeRange(false, false, 0, 0, false)
  reaper.GetSetProjectInfo(proj, "RENDER_BOUNDSFLAG", (ts_end > ts_start) and 2 or 1, true)

  reaper.Main_OnCommand(42230, 0) -- Render con los ultimos ajustes, cierra solo

  reaper.GetSetProjectInfo_String(proj, "RENDER_FILE", old_file, true)
  reaper.GetSetProjectInfo_String(proj, "RENDER_PATTERN", old_pat, true)
  reaper.GetSetProjectInfo(proj, "RENDER_SETTINGS", old_set, true)
  reaper.GetSetProjectInfo(proj, "RENDER_BOUNDSFLAG", old_bounds, true)
  for i, was in pairs(prev_sel) do
    local tr = reaper.GetTrack(proj, i)
    if tr then reaper.SetTrackSelected(tr, was) end
  end

  -- juntar archivos renderizados (nombres seguros para curl)
  local files, i = {}, 0
  while true do
    local f = reaper.EnumerateFiles(dir, i)
    if not f then break end
    i = i + 1
    local ext = f:match("%.([%w]+)$") or ""
    if f ~= "hdr.txt" and ({ wav = 1, flac = 1, mp3 = 1, aif = 1, aiff = 1, ogg = 1, m4a = 1 })[ext:lower()] then
      local safe = f:gsub("[^%w%._%- ]", "_")
      if safe ~= f then os.rename(dir .. SEP .. f, dir .. SEP .. safe) end
      files[#files + 1] = dir .. SEP .. safe
    end
  end
  if #files == 0 then
    local seen, k = {}, 0
    while true do
      local f2 = reaper.EnumerateFiles(dir, k)
      if not f2 then break end
      seen[#seen + 1] = f2
      k = k + 1
    end
    msg("No se genero ningun archivo de audio.\nCarpeta: " .. dir .. "\nContiene: " .. (#seen > 0 and table.concat(seen, ", ") or "nada") ..
        "\n\nHace un render manual una vez (File > Render) con formato WAV y volve a probar.")
    return
  end

  local function fsize(path)
    local fh = io.open(path, "rb")
    if not fh then return 0 end
    local n = fh:seek("end") or 0
    fh:close()
    return n
  end
  local BIG = 90 * 1024 * 1024      -- Cloudflare corta los envios de mas de 100 MB: lo grande se manda por partes
  local PART = 50 * 1024 * 1024
  local big = false
  for _, f in ipairs(files) do if fsize(f) > BIG then big = true end end

  local code, body, http
  local base = get("url") .. "/bands/" .. get("band")
  if not big then
    local args = { "-m 7200", "-w " .. q("\nHTTP:%{http_code}"), "-F " .. q("title=" .. title), "-F " .. q("mode=" .. mode), "-F " .. q("section=" .. section) }
    for _, f in ipairs(files) do args[#args + 1] = "-F " .. q("files=@" .. f) end
    reaper.ShowConsoleMsg("Diablo Master: subiendo " .. #files .. " archivo(s)...\n")
    code, body = with_auth(base .. "/tracks", get("token"), table.concat(args, " "))
    http = tostring(body):match("HTTP:(%d+)")
  else
    local items, failed = {}, nil
    for n, f in ipairs(files) do
      local uid = ("%08x%08x%08x%08x"):format(math.random(0, 0x7fffffff), math.random(0, 0x7fffffff), os.time(), n)
      local total = fsize(f)
      local fh = io.open(f, "rb")
      local idx = 0
      while true do
        local data = fh:read(PART)
        if not data then break end
        local part = dir .. SEP .. "parte.bin"
        local pf = io.open(part, "wb")
        pf:write(data) pf:close()
        data = nil
        local okp = false
        for try = 1, 3 do
          local c, b2 = with_auth(get("url") .. "/uploads/" .. uid .. "/" .. idx, get("token"),
            "-m 1800 -H 'Expect:' -H 'Content-Type: application/octet-stream' -T " .. q(part) .. " -w " .. q("\nHTTP:%{http_code}"))
          if c == 0 and tostring(b2):match("HTTP:(%d+)") == "200" then okp = true break end
          failed = tostring(b2):sub(1, 300)
        end
        os.remove(part)
        if not okp then break end
        failed = nil
        idx = idx + 1
        reaper.ShowConsoleMsg(("Diablo Master: %s, parte %d de %d\n"):format(f:match("[^/\\]+$") or f, idx, math.ceil(total / PART)))
      end
      fh:close()
      if failed then break end
      items[#items + 1] = ('{"upload_id":"%s","filename":"%s","parts":%d}'):format(uid, ((f:match("[^/\\]+$") or "audio.wav"):gsub('"', "")), idx)
    end
    if failed then
      code, http, body = 1, "fallo", "No se pudo subir una parte: " .. failed
    else
      local jf = dir .. SEP .. "items.json"
      local jh = io.open(jf, "w")
      jh:write("[" .. table.concat(items, ",") .. "]") jh:close()
      code, body = with_auth(base .. "/tracks/chunked", get("token"),
        "-m 1800 -w " .. q("\nHTTP:%{http_code}") .. " -F " .. q("title=" .. title) .. " -F " .. q("mode=" .. mode) ..
        " -F " .. q("section=" .. section) .. " -F " .. q("items=<" .. jf))
      http = tostring(body):match("HTTP:(%d+)")
    end
  end
  clear_dir(dir)

  if code == 0 and http == "200" then
    msg("Listo: \"" .. title .. "\" se subio a " .. get("band_name") .. " (" .. section .. ").\nYa lo puede escuchar toda la banda desde la web.")
  else
    msg("No se pudo subir (HTTP " .. tostring(http) .. ").\n\n" .. tostring(body):sub(1, 400))
  end
end

main()

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
  local cmd = "curl -sS " .. args
  local out = reaper.ExecProcess(cmd, -1) or ""
  local code, body = out:match("^(%-?%d+)\n?(.*)$")
  return tonumber(code) or -1, body or out
end

local function with_auth(url, token, extra)
  -- el token va en un archivo temporal (no queda en la lista de procesos)
  local hdr = tmpdir() .. SEP .. "hdr.txt"
  local fh = io.open(hdr, "w")
  if not fh then return -1, "No pude escribir un archivo temporal" end
  fh:write("Authorization: Bearer " .. token .. "\n")
  fh:close()
  local code, body = curl("-H @" .. q(hdr) .. " " .. extra .. " " .. q(url))
  os.remove(hdr)
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
    msg("No pude conectar con " .. url .. "\nRevisa la direccion y el token.\n\n" .. tostring(body):sub(1, 300))
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
  return true
end

-- ---------------------------------------------------------------- principal
local function main()
  if get("url") == "" or get("token") == "" then
    if not configure() then return end
  end
  if get("band") == "" then
    if not choose_band() then return end
  end

  local proj = 0
  local _, pname = reaper.GetProjectName(proj, "")
  pname = pname:gsub("%.[Rr][Pp][Pp]$", "")
  if pname == "" then pname = "Sin titulo" end

  local ok, vals = reaper.GetUserInputs("Diablo Master - subir a " .. get("band_name"), 3,
    "Nombre del tema,Que subir (cancion / pistas),Cambiar conexion (si / no),extrawidth=200",
    pname .. ",cancion,no")
  if not ok then return end
  local title, what, reconf = vals:match("^(.-),(.-),(.*)$")
  title = clean(title)
  what = clean(what):lower()
  if clean(reconf):lower() == "si" then
    if configure() and choose_band() then msg("Conexion actualizada. Volve a ejecutar el script.") end
    return
  end
  if title == "" then title = pname end
  local mode = (what:find("pista") or what:find("stem")) and "stems" or "mix"

  local dir = tmpdir()
  clear_dir(dir)

  -- guardar configuracion de render actual para restaurarla despues
  local _, old_file = reaper.GetSetProjectInfo_String(proj, "RENDER_FILE", "", false)
  local _, old_pat = reaper.GetSetProjectInfo_String(proj, "RENDER_PATTERN", "", false)
  local old_set = reaper.GetSetProjectInfo(proj, "RENDER_SETTINGS", 0, false)
  local old_bounds = reaper.GetSetProjectInfo(proj, "RENDER_BOUNDSFLAG", 0, false)

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
    msg("No se genero ningun archivo de audio. Hace un render manual una vez (File > Render) con formato WAV y volve a probar.")
    return
  end

  local args = { "-m 7200", "-w " .. q("\nHTTP:%{http_code}"), "-F " .. q("title=" .. title), "-F " .. q("mode=" .. mode) }
  for _, f in ipairs(files) do args[#args + 1] = "-F " .. q("files=@" .. f) end

  reaper.ShowConsoleMsg("Diablo Master: subiendo " .. #files .. " archivo(s)...\n")
  local code, body = with_auth(get("url") .. "/bands/" .. get("band") .. "/tracks", get("token"), table.concat(args, " "))
  local http = tostring(body):match("HTTP:(%d+)")
  clear_dir(dir)

  if code == 0 and http == "200" then
    msg("Listo: \"" .. title .. "\" se subio a " .. get("band_name") .. ".\nYa lo pueden escuchar y masterizar desde la web.")
  else
    msg("No se pudo subir (HTTP " .. tostring(http) .. ").\n\n" .. tostring(body):sub(1, 400))
  end
end

main()

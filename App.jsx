import React, { useState, useRef, useEffect } from "react";

/* ═══════════════════════════════════════════════════════════════════
   MIS VIAJES v2 — planificador + bitácora + clip de viaje
   · Ruta con IA: el recorrido en el mapa y las joyitas del camino
   · Fechas: inicio del viaje y días de vacaciones, con cuenta regresiva
   · Bitácora: el diario del viaje, con fotos y videos por día
   · Clip: arma un video del viaje con tus fotos y videos, en el teléfono
   Fotos/videos viven en IndexedDB (espacio de sobra, sin servidores).
   ═══════════════════════════════════════════════════════════════════ */

/* ── TEMAS: el set completo de la app ───────────────────────────────
   Un toque y cambia TODO el entorno: fondos, tarjetas, acentos — y los
   íconos se tiñen solos (heredan el color del tema). */
const TEMAS = {
  ruta40: { nombre: "Ruta 40", bg: "#0E1116", card: "#171B23", card2: "#1E242F", border: "#2A3140", text: "#EDF0F5", sub: "#9AA5B5", muted: "#5F6B7D", accent: "#E8A33D", accent2: "#4DA3FF", ok: "#3DD68C", danger: "#F2555A" },
  playa: { nombre: "Playa", bg: "#F4EFE6", card: "#FFFFFF", card2: "#EFE8DA", border: "#DDD2BE", text: "#27313D", sub: "#5C6B7A", muted: "#93A1AE", accent: "#0FA3B1", accent2: "#F27059", ok: "#2E9E6B", danger: "#D9534F" },
  montania: { nombre: "Montaña", bg: "#101713", card: "#182119", card2: "#202B21", border: "#2E3D30", text: "#EAF2EA", sub: "#9DB3A0", muted: "#647A67", accent: "#8FBF6B", accent2: "#E0A458", ok: "#8FBF6B", danger: "#E36B5B" },
  nocturno: { nombre: "Nocturno", bg: "#0D0B18", card: "#161226", card2: "#1E1833", border: "#2E2650", text: "#EFEAFB", sub: "#A79FC5", muted: "#6B6390", accent: "#A78BFA", accent2: "#38BDF8", ok: "#34D399", danger: "#FB7185" },
  clasico: { nombre: "Clásico claro", bg: "#F6F7F9", card: "#FFFFFF", card2: "#EEF1F5", border: "#D9DEE7", text: "#1E2733", sub: "#5B6673", muted: "#98A2AF", accent: "#D97706", accent2: "#2563EB", ok: "#16A34A", danger: "#DC2626" },
};
const T = { ...TEMAS.ruta40, r: 16, rsm: 11 };
function aplicarTema(k) { Object.assign(T, TEMAS[k] || TEMAS.ruta40); }

const uid = () => Math.random().toString(36).slice(2, 10);
const kmFmt = (m) => m >= 100000 ? `${Math.round(m / 1000)} km` : `${(m / 1000).toFixed(1)} km`;
const hFmt = (s) => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; };
const hoyISO = () => new Date().toISOString().slice(0, 10);
const fFecha = (iso) => { if (!iso) return "—"; const d = new Date(iso + "T12:00:00"); return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" }); };
const diasEntre = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);

/* ── PERFILES: cada código, su propio espacio ────────────────────
   Sin mail, sin contraseña — un código que cada uno elige (o le pasan)
   y a partir de ahí sus viajes quedan separados de los de cualquier
   otro código, sea en el mismo teléfono o en teléfonos distintos.
   No es seguridad real: es solo una separación práctica en familia. */
const PERFIL_ACTIVO_KEY = "viajes_perfil_activo";
const PERFILES_KEY = "viajes_perfiles";
const limpiarCodigo = (c) => String(c || "").trim().toUpperCase().replace(/\s+/g, "");
function listarPerfiles() { try { return JSON.parse(localStorage.getItem(PERFILES_KEY)) || []; } catch { return []; } }
function guardarPerfiles(lista) { try { localStorage.setItem(PERFILES_KEY, JSON.stringify(lista)); } catch { } }
function perfilActivo() { try { return localStorage.getItem(PERFIL_ACTIVO_KEY) || null; } catch { return null; } }
function entrarPerfil(codigo) { try { localStorage.setItem(PERFIL_ACTIVO_KEY, codigo); } catch { } }
function salirPerfil() { try { localStorage.removeItem(PERFIL_ACTIVO_KEY); } catch { } }
function crearPerfil(codigo, nombre) {
  const lista = listarPerfiles();
  if (!lista.some(p => p.codigo === codigo)) { lista.push({ codigo, nombre: nombre.trim(), creado: Date.now() }); guardarPerfiles(lista); }
}

/* ── Persistencia: textos en localStorage, media en IndexedDB ───── */
/* Config global de la app: el fondo elegido y CÓMO les gusta viajar.
   El perfil viajero es lo que hace que la IA planifique COMO USTEDES:
   si aman manejar, les arma roadtrip; si no, ciudades base y trenes. */
let _memCfg = null;
const cargarCfg = () => { try { const x = JSON.parse(localStorage.getItem("viajes_cfg:" + (perfilActivo() || ""))); if (x) return x; } catch { } return _memCfg || {}; };
const guardarCfgLS = (c) => { _memCfg = c; try { localStorage.setItem("viajes_cfg:" + (perfilActivo() || ""), JSON.stringify(c)); } catch { } };
const INTERESES = ["Naturaleza", "Pueblitos", "Gastronomía", "Historia", "Montaña", "Playa", "Vino", "Fotografía", "Aventura", "Descanso"];
function perfilTexto(cfg) {
  const p = [];
  if (cfg.manejo) p.push({ ama: "Aman manejar: prefieren roadtrips y rutas escénicas aunque sumen kilómetros", justo: "Manejan lo justo: tramos cortos, sin palizas de ruta", no: "Prefieren no manejar: ciudades base, trenes, excursiones" }[cfg.manejo]);
  if (cfg.ritmo) p.push({ relax: "Ritmo relajado: pocas paradas, disfrutar cada lugar", mixto: "Ritmo mixto", intenso: "Ritmo intenso: ver todo lo posible" }[cfg.ritmo]);
  if (cfg.presupuesto) p.push({ cuidado: "Presupuesto cuidado", medio: "Presupuesto medio", gustos: "Se dan los gustos" }[cfg.presupuesto]);
  if ((cfg.intereses || []).length) p.push("Les gusta: " + cfg.intereses.join(", "));
  if (cfg.compania) p.push("Viajan: " + cfg.compania);
  if (cfg.notas) p.push(cfg.notas);
  return p.join(". ");
}

let _memLS = null;   // respaldo en RAM cuando no hay localStorage (vista previa)
const cargar = () => { try { const x = JSON.parse(localStorage.getItem("viajes_data:" + (perfilActivo() || ""))); if (x) return x; } catch { } return _memLS || { viajes: [] }; };
const guardarLS = (d) => { _memLS = d; try { localStorage.setItem("viajes_data:" + (perfilActivo() || ""), JSON.stringify(d)); } catch { } };

const _memMedia = new Map();   // respaldo en RAM cuando no hay IndexedDB (vista previa)
const hayIDB = () => { try { return typeof indexedDB !== "undefined" && !!indexedDB; } catch { return false; } };
function abrirIDB() {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("El almacenamiento del teléfono no respondió a tiempo")), 8000);
    const r = indexedDB.open("misviajes", 1);
    r.onupgradeneeded = () => { const st = r.result.createObjectStore("media", { keyPath: "id" }); st.createIndex("viaje", "viajeId"); };
    r.onsuccess = () => { clearTimeout(t); res(r.result); };
    r.onerror = () => { clearTimeout(t); rej(r.error); };
  });
}
async function mediaGuardar(item) { if (!hayIDB()) { _memMedia.set(item.id, item); return true; } const db = await abrirIDB(); return new Promise((res, rej) => { const tx = db.transaction("media", "readwrite"); tx.objectStore("media").put(item); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }); }
async function mediaListar(viajeId) { if (!hayIDB()) return [..._memMedia.values()].filter(m => m.viajeId === viajeId); const db = await abrirIDB(); return new Promise((res, rej) => { const rq = db.transaction("media").objectStore("media").index("viaje").getAll(viajeId); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error); }); }
async function mediaBorrar(id) { if (!hayIDB()) { _memMedia.delete(id); return true; } const db = await abrirIDB(); return new Promise((res) => { const tx = db.transaction("media", "readwrite"); tx.objectStore("media").delete(id); tx.oncomplete = () => res(true); tx.onerror = () => res(false); }); }

/* Fotos comprimidas antes de guardar: 1600px máx, JPEG. Los videos van tal cual. */
async function comprimirFoto(file) {
  return new Promise((res) => {
    let terminado = false;
    const acabar = (v2) => { if (terminado) return; terminado = true; res(v2); };
    // Si la foto vive en iCloud y no está bajada al dispositivo, decodificarla
    // puede demorar mientras Safari la trae. A los 20s seguimos con el archivo
    // original (sin comprimir) en vez de dejar la carga entera colgada.
    const limite = setTimeout(() => { try { URL.revokeObjectURL(url); } catch { } acabar(file); }, 20000);
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      clearTimeout(limite);
      try {
        const esc = Math.min(1, 1600 / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * esc); cv.height = Math.round(img.height * esc);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(b => { URL.revokeObjectURL(url); acabar(b || file); }, "image/jpeg", 0.82);
      } catch { URL.revokeObjectURL(url); acabar(file); }
    };
    img.onerror = () => { clearTimeout(limite); URL.revokeObjectURL(url); acabar(file); };
    img.src = url;
  });
}

/* Corre varias tareas a la vez (concurrencia limitada) en vez de una
   por una en fila. onProgreso se llama cada vez que UNA termina, con
   el total de terminadas hasta ese momento — para la barra de %. */
async function procesarEnParalelo(items, tarea, concurrencia, onProgreso) {
  const resultados = new Array(items.length);
  let siguiente = 0, terminadas = 0;
  async function trabajador() {
    while (siguiente < items.length) {
      const i = siguiente++;
      try { resultados[i] = { ok: true, valor: await tarea(items[i], i) }; }
      catch (e) { resultados[i] = { ok: false, error: e }; }
      terminadas++; if (onProgreso) onProgreso(terminadas, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrencia, items.length) }, trabajador));
  return resultados;
}

/* ── EXIF GPS: la foto sabe de dónde es ──────────────────────────
   Lee las coordenadas escondidas en el archivo (metadata EXIF), sin
   subir nada a ningún lado — todo pasa en el teléfono. Si la foto no
   tiene GPS (capturas de pantalla, fotos bajadas de internet, etc.)
   devuelve null sin romper nada. Formato JPEG únicamente (el que usan
   las cámaras); PNG/HEIC no llevan este tipo de EXIF accesible así. */
async function leerGPSDeFoto(file) {
  try {
    if (!file || !file.type || !file.type.includes("jpeg") && !file.type.includes("jpg")) return null;
    const buf = await file.slice(0, 128 * 1024).arrayBuffer();   // los primeros 128KB alcanzan siempre
    const view = new DataView(buf);
    if (view.getUint16(0) !== 0xFFD8) return null;                // no es JPEG
    let offset = 2;
    while (offset < view.byteLength - 4) {
      if (view.getUint16(offset) !== 0xFFE1) {
        const marker = view.getUint16(offset);
        if ((marker & 0xFF00) !== 0xFF00) break;
        offset += 2 + view.getUint16(offset + 2);
        continue;
      }
      const exifOffset = offset + 4;
      if (view.getUint32(exifOffset) !== 0x45786966) return null;   // "Exif"
      const tiffStart = exifOffset + 6;
      const little = view.getUint16(tiffStart) === 0x4949;
      const g16 = (o) => view.getUint16(o, little), g32 = (o) => view.getUint32(o, little);
      const ifd0 = tiffStart + g32(tiffStart + 4);
      let gpsIfdOffset = null;
      const n0 = g16(ifd0);
      for (let i = 0; i < n0; i++) { const e = ifd0 + 2 + i * 12; if (g16(e) === 0x8825) { gpsIfdOffset = tiffStart + g32(e + 8); break; } }
      if (!gpsIfdOffset) return null;
      const rational = (o) => g32(o) / g32(o + 4);
      const dms = (o) => rational(o) + rational(o + 8) / 60 + rational(o + 16) / 3600;
      let lat = null, lon = null, latRef = "N", lonRef = "E";
      const nG = g16(gpsIfdOffset);
      for (let i = 0; i < nG; i++) {
        const e = gpsIfdOffset + 2 + i * 12; const tag = g16(e); const valOff = tiffStart + g32(e + 8);
        if (tag === 1) latRef = String.fromCharCode(view.getUint8(e + 8));
        else if (tag === 2) lat = dms(valOff);
        else if (tag === 3) lonRef = String.fromCharCode(view.getUint8(e + 8));
        else if (tag === 4) lon = dms(valOff);
      }
      if (lat == null || lon == null) return null;
      if (latRef === "S") lat = -lat; if (lonRef === "W") lon = -lon;
      if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) return null;
      return { lat, lon };
    }
    return null;
  } catch { return null; }
}
async function lugarDesdeFoto(file) {
  const gps = await leerGPSDeFoto(file);
  if (!gps) return null;
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&accept-language=es&lat=${gps.lat}&lon=${gps.lon}`);
    const j = await r.json(); const a = j.address || {};
    const nombre = [a.tourism || a.village || a.town || a.city || a.municipality, a.state || a.country].filter(Boolean).join(", ") || j.display_name?.split(",").slice(0, 2).join(",");
    return nombre ? { nombre, lat: gps.lat, lon: gps.lon } : null;
  } catch { return { nombre: `${gps.lat.toFixed(4)}, ${gps.lon.toFixed(4)}`, lat: gps.lat, lon: gps.lon }; }
}

/* ── Geocodificación / Ruta / Leaflet / IA (igual que v1) ───────── */
async function geocodificar(q) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=es&q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error("No pude buscar ese lugar");
  return ((await r.json()) || []).map(x => ({ nombre: x.display_name, lat: +x.lat, lon: +x.lon }));
}
async function calcularRuta(puntos) {
  if (puntos.length < 2) return null;
  const coords = puntos.map(p => `${p.lon},${p.lat}`).join(";");
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
  if (!r.ok) throw new Error("No pude calcular la ruta");
  const j = await r.json(); const ruta = j.routes && j.routes[0];
  if (!ruta) throw new Error("Sin ruta entre esos puntos");
  return { linea: ruta.geometry.coordinates.map(([lon, lat]) => [lat, lon]), dist: ruta.distance, dur: ruta.duration };
}
let leafletProm = null;
function cargarLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletProm) return leafletProm;
  leafletProm = new Promise((res, rej) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(css);
    const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    s.onload = () => res(window.L); s.onerror = () => rej(new Error("No cargó el mapa")); document.head.appendChild(s);
  });
  return leafletProm;
}
// fetch con límite de tiempo: nunca se queda colgado esperando de más
async function fetchConLimite(url, opciones, limiteMs) {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), limiteMs);
  try { return await fetch(url, { ...opciones, signal: control.signal }); }
  finally { clearTimeout(t); }
}
async function llamarIA(messages, system, maxTokens = 2500) {
  const body = JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, system, messages });
  let j = null;
  try { const r = await fetchConLimite("/api/claude", { method: "POST", headers: { "Content-Type": "application/json" }, body }, 25000); j = await r.json(); } catch { j = null; }
  if (!j || j.error) {
    // vista previa (artefacto): la API se llama directo, sin clave. En
    // producción esta vía normalmente no sirve (sin clave del lado del
    // navegador) — por eso va con su propio límite de tiempo y try/catch,
    // para que si falla, falle rápido y avise, en vez de quedar colgada.
    try {
      const r2 = await fetchConLimite("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body }, 12000);
      j = await r2.json();
    } catch { throw new Error("No pude conectar con la IA (revisá la conexión y probá de nuevo)."); }
  }
  if (j.error) throw new Error(j.error.message || "Error de IA");
  return (j.content || []).map(c => c.text || "").join("\n").trim();
}
/* Código de tiempo WMO → emoji + nombre + qué tan jodido es para manejar */
const CLIMA_COD = (c) => {
  if (c === 0) return { e: "☀️", n: "Despejado", nivel: 0 };
  if (c <= 2) return { e: "🌤", n: "Algo nublado", nivel: 0 };
  if (c === 3) return { e: "☁️", n: "Nublado", nivel: 0 };
  if (c <= 48) return { e: "🌫", n: "Niebla", nivel: 1 };
  if (c <= 57) return { e: "🌦", n: "Llovizna", nivel: 1 };
  if (c <= 67) return { e: "🌧", n: "Lluvia", nivel: 2 };
  if (c <= 77) return { e: "🌨", n: "Nieve", nivel: 3 };
  if (c <= 82) return { e: "🌧", n: "Chaparrones", nivel: 2 };
  if (c <= 86) return { e: "🌨", n: "Nieve fuerte", nivel: 3 };
  return { e: "⛈", n: "Tormenta", nivel: 3 };
};
async function pronostico(lat, lon) {
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,snowfall_sum&timezone=auto&forecast_days=16`);
  if (!r.ok) throw new Error("No pude traer el clima");
  const j = await r.json(); const d = j.daily || {};
  return (d.time || []).map((f, i) => ({
    fecha: f, cod: d.weather_code?.[i] ?? 0,
    max: Math.round(d.temperature_2m_max?.[i] ?? 0), min: Math.round(d.temperature_2m_min?.[i] ?? 0),
    lluvia: d.precipitation_probability_max?.[i] ?? 0, nieve: d.snowfall_sum?.[i] ?? 0,
  }));
}

async function dondeEstoy() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) { rej(new Error("Este dispositivo no tiene GPS disponible")); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      let nombre = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&accept-language=es&lat=${lat}&lon=${lon}`);
        const j = await r.json();
        const a = j.address || {};
        nombre = [a.tourism || a.village || a.town || a.city || a.municipality, a.state].filter(Boolean).join(", ") || j.display_name?.split(",").slice(0, 2).join(",") || nombre;
      } catch { }
      res({ nombre, lat, lon });
    }, () => rej(new Error("No pude leer tu ubicación (¿diste permiso?)")), { enableHighAccuracy: true, timeout: 10000 });
  });
}
const extraerJSON = (t) => { const m = t.match(/\[[\s\S]*\]/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } };

/* ── La IA lee el voucher/boarding pass y completa los datos sola ───
   Foto o PDF, va como imagen/documento directo al mismo endpoint de IA
   de toda la app — nada de OCR aparte, es la misma Claude que arma
   itinerarios la que ahora lee pasajes. */
async function archivoABase64(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
}
async function leerVoucherIA(file) {
  try {
    const esPdf = file.type === "application/pdf";
    const blob = esPdf ? file : await comprimirFoto(file);   // fotos: comprimidas a JPEG, liviano y compatible
    const data = await archivoABase64(blob);
    const bloque = esPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: "image/jpeg", data } };
    const sys = "Sos un asistente que lee boarding passes, pasajes aéreos y confirmaciones de reserva. Extraés los datos exactos del documento. Respondés SOLO un JSON válido, sin texto adicional ni markdown.";
    const prompt = `Leé este pasaje/boarding pass y extraé: aerolínea, número de vuelo, fecha del vuelo, hora de salida, hora de llegada, ciudad de origen, ciudad de destino, y el NOMBRE COMPLETO del aeropuerto de salida si figura (ej: "Aeropuerto Internacional Ministro Pistarini" o "Aeroparque Jorge Newbery" o el código IATA como "EZE"/"AEP").\n\nRespondé SOLO este JSON (dejá "" en lo que no encuentres en el documento):\n{"aerolinea":"","numero":"","fecha":"AAAA-MM-DD","horaSalida":"HH:MM","horaLlegada":"HH:MM","origen":"","destino":"","aeropuertoOrigen":""}`;
    const resp = await llamarIA([{ role: "user", content: [bloque, { type: "text", text: prompt }] }], sys, 700);
    const m = resp.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch (e) { throw new Error(e && e.message ? e.message : "No pude leer el pasaje."); }
}

/* ── Versión y actualización automática ─────────────────────────── */
const APP_VER = "v10.40 · 26 jul 2026";
const _abiertaEn = Date.now();
function bundleActual() {
  try { for (const sc of document.scripts) { const m = (sc.src || "").match(/assets\/[^"']*\.js/); if (m) return m[0]; } } catch { }
  return null;
}
async function hayVersionNueva() {
  const actual = bundleActual();
  if (!actual) return false;   // modo desarrollo o vista previa: no aplica
  try {
    const r = await fetch(window.location.pathname + "?chk=" + Date.now(), { cache: "no-store" });
    const html = await r.text();
    const m = html.match(/assets\/[^"']*\.js/);
    return !!(m && m[0] !== actual);
  } catch { return false; }
}
function UpdateBanner({ seguro = false }) {
  // seguro=true: acá no hay riesgo de perder algo sin guardar (el
  // inicio, sin ningún formulario abierto) -> se actualiza sola siempre,
  // no solo en los primeros 6 segundos. seguro=false (adentro de un
  // viaje, donde puede haber texto a medio escribir): se queda con el
  // aviso chico, prudente, en vez de recargar de sorpresa.
  const [hay, setHay] = useState(false);
  useEffect(() => {
    let vivo = true;
    const chequear = async () => {
      if (!(await hayVersionNueva()) || !vivo) return;
      let yaAutoActualizo = false;
      try { yaAutoActualizo = sessionStorage.getItem("viajes_autoupd") === "1"; } catch { }
      // el reload silencioso pasa COMO MÁXIMO UNA VEZ por sesión (sea por
      // estar en el inicio, sea por los primeros 6s) — si ya se intentó y
      // la diferencia sigue ahí (CDN con propagación lenta, por ejemplo),
      // no insiste solo: pasa al aviso chico para que decidas vos.
      let auto = !yaAutoActualizo && (seguro || Date.now() - _abiertaEn < 6000);
      if (auto) { try { sessionStorage.setItem("viajes_autoupd", "1"); } catch { } window.location.replace(window.location.pathname + "?u=" + Date.now()); return; }
      setHay(true);
    };
    chequear();
    const onVis = () => { if (document.visibilityState === "visible") chequear(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { vivo = false; document.removeEventListener("visibilitychange", onVis); };
  }, [seguro]);
  if (!hay) return null;
  // chiquito, discreto — un chip, no un cartel gritando
  return (<div onClick={() => window.location.replace(window.location.pathname + "?u=" + Date.now())} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.card, border: `1px solid ${T.accent}`, borderRadius: 20, padding: "6px 12px 6px 10px", marginBottom: 12, cursor: "pointer" }}>
    <Ico n="varita" s={12} c={T.accent} />
    <span style={{ fontSize: 11, color: T.text, fontWeight: 700 }}>Hay una versión nueva</span>
    <span style={{ fontSize: 11, color: T.accent, fontWeight: 800, textDecoration: "underline" }}>Actualizar</span>
  </div>);
}

/* ── Globito rojo en el ícono (como Mensajes de iOS) ────────────── */
async function ponerGlobito(n) {
  try {
    if (!("setAppBadge" in navigator)) return;
    if (n > 0) await navigator.setAppBadge(Math.min(99, Math.round(n)));
    else await navigator.clearAppBadge();
  } catch { }
}
function GlobitoPermiso() {
  const [estado, setEstado] = useState(() => {
    try {
      if (!("Notification" in window) || !("setAppBadge" in navigator)) return "no";
      if (localStorage.getItem("viajes_globito_off") === "1") return "no";
      return Notification.permission;
    } catch { return "no"; }
  });
  if (estado !== "default") return null;
  return (<div style={{ display: "flex", alignItems: "center", gap: 9, background: T.card, borderRadius: 12, padding: "10px 12px", margin: "0 0 12px", border: `1px solid ${T.accent}` }}>
    <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: T.text, lineHeight: 1.45 }}>Activá los avisos y el ícono te muestra <b>la cuenta regresiva</b>: los días que faltan para salir, sin abrir la app.</div>
    <button onClick={async () => { try { const p = await Notification.requestPermission(); setEstado(p); if (p === "granted") { try { await navigator.setAppBadge(1); setTimeout(() => navigator.clearAppBadge().catch(() => { }), 1500); } catch { } } } catch { setEstado("denied"); } }}
      style={{ background: T.accent, border: "none", color: "#1a1205", borderRadius: 8, padding: "9px 12px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>Activar</button>
    <button onClick={() => { try { localStorage.setItem("viajes_globito_off", "1"); } catch { } setEstado("no"); }}
      style={{ background: "none", border: "none", color: T.muted, fontSize: 15, cursor: "pointer", padding: "0 2px", flexShrink: 0 }}>×</button>
  </div>);
}

/* El fondo elegido por el usuario, con velo oscuro para que todo se lea */
function Fondo({ cfg, children }) {
  const con = cfg.fondo;
  return (<div style={{ minHeight: "100vh", background: T.bg, position: "relative" }}>
    {con && <div style={{ position: "fixed", inset: 0, backgroundImage: `url(${cfg.fondo})`, backgroundSize: "cover", backgroundPosition: "center", zIndex: 0 }} />}
    {con && <div style={{ position: "fixed", inset: 0, background: `linear-gradient(${T.bg}b8, ${T.bg}e0)`, zIndex: 0 }} />}
    <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
  </div>);
}

function Ico({ n, s = 16, c = "currentColor" }) {
  const P = {
    mapa: "M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3zM9 7v13M15 4v13",
    auto: "M5 16l1.5-5h11L19 16M5 16h14M5 16v3h2v-2h10v2h2v-3M8 8h8",
    chat: "M21 12a8 8 0 01-8 8H4l2-3a8 8 0 1115-5z",
    mas: "M12 5v14M5 12h14", flecha: "M5 12h14M13 6l6 6-6 6",
    tacho: "M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13",
    subir: "M12 19V5M6 11l6-6 6 6", bajar: "M12 5v14M6 13l6 6 6-6",
    estrella: "M12 3l2.7 5.6 6.1.8-4.5 4.2 1.2 6-5.5-3-5.5 3 1.2-6L3.2 9.4l6.1-.8L12 3z",
    volver: "M15 6l-6 6 6 6", gmaps: "M12 2a8 8 0 00-8 8c0 5.4 8 12 8 12s8-6.6 8-12a8 8 0 00-8-8zM12 13a3 3 0 110-6 3 3 0 010 6z",
    lupa: "M11 19a8 8 0 110-16 8 8 0 010 16zM21 21l-4.3-4.3",
    libro: "M4 19V5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zm0 0a2 2 0 002 2h13",
    cam: "M4 8h3l2-2h6l2 2h3v11H4V8zM12 16a3 3 0 100-6 3 3 0 000 6z",
    play: "M8 5v14l11-7-11-7z", cal: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
    peli: "M4 5h16v14H4zM4 9h16M8 5v4M16 5v4M8 15h8",
    descargar: "M12 3v12M7 11l5 5 5-5M4 20h16",
    sol: "M12 17a5 5 0 100-10 5 5 0 000 10zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    tuerca: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.4 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 005 12a7 7 0 00.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2L10 21h4l.4-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6A7 7 0 0019 12z",
    varita: "M6 21l9-9M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2zM19 11l.6 1.2L21 13l-1.4.8L19 15l-.6-1.2L17 13l1.4-.8L19 11z",
    plata: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v10M9.5 9.5c0-1 1-1.8 2.5-1.8s2.5.8 2.5 1.8-1 1.5-2.5 1.8-2.5.8-2.5 1.8 1 1.8 2.5 1.8 2.5-.8 2.5-1.8",
    valija: "M7 8V6a2 2 0 012-2h6a2 2 0 012 2v2M4 8h16v12H4zM9 8v12M15 8v12",
    ticket: "M4 9a2 2 0 002-2h12a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H6a2 2 0 00-2-2v-2a2 2 0 000-4V9zM13 6v2M13 11v2M13 16v2",
    nota: "M9 18a3 3 0 11-6 0 3 3 0 016 0zM21 16a3 3 0 11-6 0 3 3 0 016 0zM9 18V5l12-2v13",
    reloj: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 3",
    brujula: "M12 21a9 9 0 100-18 9 9 0 000 18zM15 9l-2 6-4-2 2-6z",
    avion: "M2.5 19l19-7-19-7 4 7-4 7zM7.5 12h11",
    pin: "M12 21s-7-6.1-7-11a7 7 0 1114 0c0 4.9-7 11-7 11zM12 12a2 2 0 100-4 2 2 0 000 4z",
    comida: "M6 3v7a2 2 0 002 2 2 2 0 002-2V3M8 12v9M17 3c-2 0-3 2-3 5s1 4 3 4M17 3v16",
    cama: "M3 18v-6a2 2 0 012-2h14a2 2 0 012 2v6M3 18v2M21 18v2M3 12V7a1 1 0 011-1h4a1 1 0 011 1v3M11 12V8a1 1 0 011-1h6a2 2 0 012 2v3",
    bus: "M4 16V6a2 2 0 012-2h12a2 2 0 012 2v10M4 16h16M4 16v3h2v-2M18 16v3h2v-2M7 12h10M7 8h10M7.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM16.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
    alerta: "M12 9v4M12 17h.01M10.3 3.9L2.7 17a2 2 0 001.7 3h15.2a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
    gas: "M6 3h8v18H6zM14 8h2l2 2v7a1.5 1.5 0 01-3 0v-3h-1M6 9h8",
    cajero: "M3 6h18v13H3zM3 10h18M7 15h4",
    pastilla: "M8.5 15.5l7-7a3.5 3.5 0 10-5-5l-7 7a3.5 3.5 0 105 5zM8 8l8 8",
    llave: "M14.7 6.3a4 4 0 10-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 002.4-1.1 4 4 0 000-5.7v0z",
    carrito: "M3 4h2l2.4 12.2a2 2 0 002 1.8h8.4a2 2 0 002-1.7L21 8H6M9 21a1 1 0 100-2 1 1 0 000 2zM18 21a1 1 0 100-2 1 1 0 000 2z",
    cruz: "M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6l8-3zM9 12h6M12 9v6",
    check: "M5 12l4.5 4.5L19 7",
    cerrar: "M6 6l12 12M18 6L6 18",
    globo: "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3a13 13 0 010 18M12 3a13 13 0 000 18",
    micuchara: "M6 3v7a2 2 0 002 2 2 2 0 002-2V3M8 12v9M17 3c-2 0-3 2-3 5s1 4 3 4M17 3v16",
    regla: "M3 17L17 3l4 4L7 21zM13 7l2 2M9 11l2 2",
    museo: "M3 21h18M4 21V10L12 4l8 6v11M9 21v-6h6v6",
    tarjeta: "M3 6h18v12H3zM3 10h18M7 15h4",
    sendero: "M6 20c2-6-2-8 0-14M13 20c2-6-2-8 0-14M4 4l2 2M15 4l2 2M9 20h9",
  };
  return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, verticalAlign: "-2px" }}><path d={P[n] || ""} /></svg>);
}

/* ── Mapa (igual que v1) ────────────────────────────────────────── */
/* Distancia real sobre la Tierra entre dos coordenadas (haversine) */
function distM(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function Mapa({ puntos, linea, sugerencias, onAgregarSug, alto = 320 }) {
  const ref = useRef(null); const mapRef = useRef(null); const capaRef = useRef(null);
  // ── medidor estilo Google Maps: tocás el mapa y va sumando ──
  const [midiendo, setMidiendo] = useState(false);
  const [medPts, setMedPts] = useState([]);
  const midiendoRef = useRef(false); midiendoRef.current = midiendo;
  const medRef = useRef(null);
  const medTotal = medPts.reduce((s2, p, i) => i ? s2 + distM(medPts[i - 1], p) : 0, 0);
  useEffect(() => {
    let vivo = true;
    cargarLeaflet().then(L => {
      if (!vivo || !ref.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(ref.current, { zoomControl: true, attributionControl: false }).setView([-34.6, -58.4], 5);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(mapRef.current);
        mapRef.current.on("click", (e) => { if (midiendoRef.current) setMedPts(p => [...p, [e.latlng.lat, e.latlng.lng]]); });
      }
      const map = mapRef.current;
      if (capaRef.current) capaRef.current.remove();
      const capa = L.layerGroup().addTo(map); capaRef.current = capa;
      puntos.forEach((p, i) => {
        const letra = i === 0 ? "A" : i === puntos.length - 1 ? "B" : String(i);
        const color = i === 0 ? T.ok : i === puntos.length - 1 ? T.danger : T.accent2;
        L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "", iconSize: [30, 38], iconAnchor: [15, 36], html: `<div style="width:30px;height:30px;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);color:#fff;font-weight:800;font-size:12px;font-family:system-ui">${letra}</span></div>` }) }).addTo(capa).bindPopup(`<b>${p.nombre.split(",")[0]}</b>`);
      });
      (sugerencias || []).forEach(sg => {
        if (!sg.lat || !sg.lon) return;
        const m = L.marker([sg.lat, sg.lon], { icon: L.divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 13], html: `<div style="width:26px;height:26px;border-radius:50%;background:${T.accent};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:13px">★</div>` }) }).addTo(capa);
        m.bindPopup(`<div style="font-family:system-ui;max-width:200px"><b>${sg.nombre}</b><br/><span style="font-size:11px">${sg.desc || ""}</span><br/><button id="sug_${sg.id}" style="margin-top:6px;background:${T.accent};color:#fff;border:none;border-radius:7px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer">＋ Sumar al recorrido</button></div>`);
        m.on("popupopen", () => { const b = document.getElementById(`sug_${sg.id}`); if (b) b.onclick = () => { onAgregarSug(sg); m.closePopup(); }; });
      });
      if (linea && linea.length) { L.polyline(linea, { color: T.accent, weight: 4, opacity: .9 }).addTo(capa); map.fitBounds(L.latLngBounds(linea), { padding: [30, 30] }); }
      else if (puntos.length) map.fitBounds(L.latLngBounds(puntos.map(p => [p.lat, p.lon])), { padding: [40, 40], maxZoom: 10 });
    }).catch(() => { });
    return () => { vivo = false; };
  }, [puntos, linea, sugerencias]);
  useEffect(() => {
    cargarLeaflet().then(L => {
      if (!mapRef.current) return;
      if (medRef.current) medRef.current.remove();
      const capa = L.layerGroup().addTo(mapRef.current); medRef.current = capa;
      if (!medPts.length) return;
      L.polyline(medPts, { color: T.accent2, weight: 3, dashArray: "6 8", opacity: .95 }).addTo(capa);
      medPts.forEach((p, i) => L.circleMarker(p, { radius: 5, color: "#fff", weight: 2, fillColor: T.accent2, fillOpacity: 1 }).addTo(capa)
        .bindTooltip(i === 0 ? "inicio" : kmFmt(medPts.slice(0, i + 1).reduce((s2, q, j) => j ? s2 + distM(medPts[j - 1], q) : 0, 0)), { permanent: i === medPts.length - 1 && i > 0, direction: "top", offset: [0, -6] }));
    }).catch(() => { });
  }, [medPts, midiendo]);

  return (<div style={{ position: "relative" }}>
    <div ref={ref} style={{ height: alto, borderRadius: T.rsm, overflow: "hidden", border: `1px solid ${T.border}`, background: T.card2 }} />
    {/* medidor estilo Google Maps */}
    <div style={{ position: "absolute", top: 9, right: 9, zIndex: 500, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
      <button onClick={() => { setMidiendo(m => !m); if (midiendo) setMedPts([]); }}
        style={{ background: midiendo ? T.accent2 : T.card, border: `1px solid ${midiendo ? T.accent2 : T.border}`, color: midiendo ? "#fff" : T.sub, borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,.25)" }}><Ico n="regla" s={13} /> {midiendo ? "Cerrar medición" : "Medir"}</button>
      {midiendo && <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 11px", boxShadow: "0 2px 8px rgba(0,0,0,.25)", textAlign: "right" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.accent2 }}>{medPts.length > 1 ? kmFmt(medTotal) : "Tocá el mapa"}</div>
        {medPts.length > 1 && <div style={{ fontSize: 9.5, color: T.muted }}>{medPts.length} puntos · en línea recta</div>}
        {medPts.length > 0 && <div style={{ display: "flex", gap: 5, marginTop: 5, justifyContent: "flex-end" }}>
          <button onClick={() => setMedPts(p => p.slice(0, -1))} style={{ background: T.card2, border: `1px solid ${T.border}`, color: T.sub, borderRadius: 7, padding: "4px 8px", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>↶ Deshacer</button>
          <button onClick={() => setMedPts([])} style={{ background: T.card2, border: `1px solid ${T.border}`, color: T.sub, borderRadius: 7, padding: "4px 8px", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>Borrar</button>
        </div>}
      </div>}
    </div>
  </div>);
}

function BuscarLugar({ placeholder, onElegir }) {
  const [q, setQ] = useState(""); const [res, setRes] = useState([]); const [busc, setBusc] = useState(false);
  async function buscar() { if (!q.trim()) return; setBusc(true); try { setRes(await geocodificar(q)); } catch { setRes([]); } setBusc(false); }
  return (<div>
    <div style={{ display: "flex", gap: 7 }}>
      <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && buscar()} placeholder={placeholder} style={{ flex: 1, background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 13px", fontSize: 14, color: T.text, outline: "none" }} />
      <button onClick={buscar} disabled={busc} style={{ background: T.accent, border: "none", color: "#1a1205", borderRadius: 10, padding: "0 15px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{busc ? "…" : <Ico n="lupa" s={16} />}</button>
    </div>
    {res.length > 0 && <div style={{ marginTop: 6, background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
      {res.map((r, i) => <div key={i} onClick={() => { onElegir(r); setRes([]); setQ(""); }} style={{ padding: "10px 12px", fontSize: 12.5, color: T.text, cursor: "pointer", borderTop: i ? `1px solid ${T.border}` : "none", lineHeight: 1.4 }}>{r.nombre}</div>)}
    </div>}
  </div>);
}

/* ── Cuenta regresiva / día del viaje ───────────────────────────── */
function isoMasDiasSimple(iso, n) { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function BarraViaje({ viaje, actualizar }) {
  const [editando, setEditando] = useState(false);
  const hoy = hoyISO();
  const ini = viaje.fechaInicio, dias = Number(viaje.diasVacaciones) || 0;
  let linea = null;
  if (viaje.vivido) {
    // un viaje que ya pasó: nunca cuenta regresiva, siempre en pasado.
    if (ini && dias > 1) { const finV = isoMasDiasSimple(ini, dias - 1); linea = { t: `Viajaron del ${fFecha(ini)} al ${fFecha(finV)} · ${dias} días`, c: T.sub }; }
    else if (ini) linea = { t: `Viajaron el ${fFecha(ini)}`, c: T.sub };
  } else if (ini && dias) {
    const d = diasEntre(ini, hoy);   // negativo = falta; 0 = hoy arranca
    if (d < 0) linea = { t: `Faltan ${-d} día${d === -1 ? "" : "s"} para salir`, c: T.accent2 };
    else if (d < dias) linea = { t: `Día ${d + 1} de ${dias} · quedan ${dias - d - 1} día${dias - d - 1 === 1 ? "" : "s"} de vacaciones`, c: T.ok };
    else linea = { t: `El viaje terminó (${dias} días) — quedan los recuerdos ↓`, c: T.sub };
  }
  return (<div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rsm, padding: "11px 13px", marginBottom: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <Ico n="cal" s={16} c={T.accent} />
      {linea
        ? <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: linea.c }}>{linea.t}</div>
        : <div style={{ flex: 1, fontSize: 12.5, color: T.sub }}>{viaje.vivido ? "¿Cuándo fue este viaje?" : "¿Cuándo salís y cuántos días tenés?"}</div>}
      <button onClick={() => setEditando(v => !v)} style={{ background: "none", border: `1px solid ${T.border}`, color: T.sub, borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{editando ? "Listo" : ini ? "Editar" : "Cargar"}</button>
    </div>
    {editando && <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10.5, color: T.sub, marginBottom: 3 }}>{viaje.vivido ? "Salieron" : "Salida"}</div>
        <input type="date" value={ini || ""} onChange={e => actualizar({ ...viaje, fechaInicio: e.target.value })} style={{ width: "100%", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "10px", fontSize: 13, color: T.text, colorScheme: "dark" }} />
      </div>
      <div style={{ width: 120 }}>
        <div style={{ fontSize: 10.5, color: T.sub, marginBottom: 3 }}>{viaje.vivido ? "Cuántos días" : "Días de vacaciones"}</div>
        <input type="number" value={viaje.diasVacaciones || ""} onChange={e => actualizar({ ...viaje, diasVacaciones: e.target.value })} placeholder="14" style={{ width: "100%", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "10px", fontSize: 13, color: T.text }} />
      </div>
    </div>}
  </div>);
}

/* ── Miniatura de un archivo de la bitácora ─────────────────────── */
function Mini({ m, onBorrar, sel, onSel, tam = 92 }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { const u = URL.createObjectURL(m.blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [m.id]);
  return (<div style={{ position: "relative", width: tam, height: tam, borderRadius: 10, overflow: "hidden", border: sel ? `2.5px solid ${T.accent}` : `1px solid ${T.border}`, background: "#000", flexShrink: 0 }} onClick={onSel}>
    {url && (m.tipo === "video"
      ? <video src={url} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      : <img src={url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />)}
    {m.tipo === "video" && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}><div style={{ background: "rgba(0,0,0,.45)", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}><Ico n="play" s={15} c="#fff" /></div></div>}
    {sel !== undefined && sel !== false && <div style={{ position: "absolute", top: 5, left: 5, background: T.accent, color: "#1a1205", borderRadius: "50%", width: 20, height: 20, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{sel}</div>}
    {onBorrar && <button onClick={(e) => { e.stopPropagation(); onBorrar(); }} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,.55)", border: "none", color: "#fff", borderRadius: "50%", width: 22, height: 22, fontSize: 12, cursor: "pointer" }}><Ico n="cerrar" s={11} c="#fff" /></button>}
  </div>);
}

/* ═══ BITÁCORA: el diario del viaje ══════════════════════════════ */
function Bitacora({ viaje, actualizar, media, recargarMedia }) {
  const fileRef = useRef(null);
  const [texto, setTexto] = useState("");
  // Un viaje vivido no arranca en "hoy": arranca el día después de la última
  // entrada que ya cargaron (o la fecha de inicio del viaje si es la primera).
  const fechaSugerida = () => {
    if (!viaje.vivido) return hoyISO();
    const fechas = (viaje.bitacora || []).map(e => e.fecha).filter(Boolean).sort();
    return fechas.length ? fechas[fechas.length - 1] : (viaje.fechaInicio || hoyISO());
  };
  const [fecha, setFecha] = useState(fechaSugerida);
  const [subiendo, setSubiendo] = useState(false);
  const [subiendoProg, setSubiendoProg] = useState(0);
  const [pendMedia, setPendMedia] = useState([]);
  const [lugar, setLugar] = useState(null);         // {nombre, lat, lon} — el ancla en el mapa
  const [buscandoGPS, setBuscandoGPS] = useState(false);
  const [buscarLugar, setBuscarLugar] = useState(false);
  const [vista, setVista] = useState(viaje.vivido ? "lista" : "mapa");   // vivido: lista primero, se ven todas las fotos tengan o no lugar marcado
  const [lugarSel, setLugarSel] = useState(null);   // lugar tocado en el mapa
  const entradas = [...(viaje.bitacora || [])].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));

  async function marcarAca() {
    setBuscandoGPS(true);
    try { setLugar(await dondeEstoy()); } catch (e) { alert(e.message); }
    setBuscandoGPS(false);
  }

  async function onArchivos(e) {
    const files = Array.from(e.target.files || []); e.target.value = "";
    if (!files.length) return;
    setSubiendo(true); setSubiendoProg(0);
    const pesadas = files.filter(f => f.size > 150 * 1024 * 1024);
    if (pesadas.length) alert(`${pesadas.map(f => `"${f.name}"`).join(", ")} pesa${pesadas.length > 1 ? "n" : ""} más de 150 MB, no se ${pesadas.length > 1 ? "suben" : "sube"}.`);
    const buenas = files.filter(f => f.size <= 150 * 1024 * 1024);
    const resultados = await procesarEnParalelo(buenas, async (f) => {
      const esVideo = f.type.startsWith("video");
      const blob = esVideo ? f : await comprimirFoto(f);
      const id = uid();
      await mediaGuardar({ id, viajeId: viaje.id, tipo: esVideo ? "video" : "foto", blob, nombre: f.name, ts: Date.now() });
      return id;
    }, 4, (hechas, total) => setSubiendoProg(Math.round((hechas / total) * 100)));
    const ids = resultados.filter(r => r.ok).map(r => r.valor);
    const fallidas = resultados.filter(r => !r.ok).length;
    if (fallidas) alert(`${fallidas} archivo${fallidas > 1 ? "s" : ""} no se pudo${fallidas > 1 ? "n" : ""} guardar (¿sin espacio en el teléfono?).`);
    setPendMedia(p => [...p, ...ids]);
    await recargarMedia();
    if (!lugar) { for (const f of buenas) { const l = await lugarDesdeFoto(f); if (l) { setLugar({ ...l, detectado: true }); break; } } }
    setSubiendo(false);
  }

  function publicar() {
    if (!texto.trim() && pendMedia.length === 0) return;
    const entrada = { id: uid(), fecha, texto: texto.trim(), mediaIds: pendMedia, lugar };
    actualizar({ ...viaje, bitacora: [...(viaje.bitacora || []), entrada] });
    setTexto(""); setPendMedia([]); setLugar(null);
  }

  async function borrarEntrada(en) {
    if (!confirm("¿Borrar esta entrada y sus fotos/videos?")) return;
    for (const id of en.mediaIds || []) await mediaBorrar(id);
    actualizar({ ...viaje, bitacora: (viaje.bitacora || []).filter(x => x.id !== en.id) });
    recargarMedia();
  }

  const deEntrada = (en) => (en.mediaIds || []).map(id => media.find(m => m.id === id)).filter(Boolean);

  return (<div>
    {/* nueva entrada */}
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 9 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: T.text, flex: 1 }}>{viaje.vivido ? "Sumar otro recuerdo de este viaje" : "¿Qué pasó hoy en el viaje?"}</div>
        <input type="date" value={fecha} max={viaje.vivido ? undefined : hoyISO()} onChange={e => setFecha(e.target.value)} style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 9px", fontSize: 12, color: T.text, colorScheme: "dark" }} />
      </div>
      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3} placeholder="Paramos en Rosario, comimos el mejor carlitos de la costanera…"
        style={{ width: "100%", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "11px 13px", fontSize: 13.5, color: T.text, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
      {pendMedia.length > 0 && <div style={{ display: "flex", gap: 7, marginTop: 9, overflowX: "auto", paddingBottom: 3 }}>
        {pendMedia.map(id => { const m = media.find(x => x.id === id); return m ? <Mini key={id} m={m} tam={72} onBorrar={async () => { await mediaBorrar(id); setPendMedia(p => p.filter(x => x !== id)); recargarMedia(); }} /> : null; })}
      </div>}
      {/* el LUGAR: el ancla del recuerdo en el mapa */}
      <div style={{ marginTop: 10 }}>
        {lugar
          ? <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(232,163,61,.1)", border: `1px solid ${T.accent}`, borderRadius: 10, padding: "9px 11px" }}>
            <Ico n="pin" s={14} c={T.accent} />
            <span style={{ flex: 1, fontSize: 12.5, color: T.text, fontWeight: 700 }}>{lugar.nombre}</span>
            <button onClick={() => setLugar(null)} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 14 }}><Ico n="cerrar" s={11} /></button>
          </div>
          : <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {!viaje.vivido && <button onClick={marcarAca} disabled={buscandoGPS} style={{ background: T.card2, border: `1px solid ${T.border}`, color: T.text, borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}><Ico n="pin" s={13} /> {buscandoGPS ? "Buscando…" : "Estoy acá (GPS)"}</button>}
            {(viaje.puntos || []).map((p, i) => <button key={i} onClick={() => setLugar({ nombre: p.nombre.split(",")[0], lat: p.lat, lon: p.lon })} style={{ background: T.card2, border: `1px solid ${T.border}`, color: T.sub, borderRadius: 9, padding: "8px 11px", fontSize: 11.5, cursor: "pointer" }}>{p.nombre.split(",")[0]}</button>)}
            <button onClick={() => setBuscarLugar(v2 => !v2)} style={{ background: T.card2, border: `1px solid ${T.border}`, color: T.sub, borderRadius: 9, padding: "8px 11px", fontSize: 11.5, cursor: "pointer" }}><Ico n="lupa" s={12} /> Otro lugar</button>
          </div>}
        {buscarLugar && !lugar && <div style={{ marginTop: 8 }}><BuscarLugar placeholder="Buscar el lugar del recuerdo…" onElegir={(r) => { setLugar({ nombre: r.nombre.split(",").slice(0, 2).join(","), lat: r.lat, lon: r.lon }); setBuscarLugar(false); }} /></div>}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={() => fileRef.current?.click()} disabled={subiendo} style={{ background: T.card2, border: `1px solid ${T.border}`, color: T.text, borderRadius: 10, padding: "11px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}><Ico n="cam" s={15} c={T.accent} /> {subiendo ? `Guardando… ${subiendoProg}%` : "Fotos / videos"}</button>
        <button onClick={publicar} disabled={subiendo} style={{ flex: 1, background: T.accent, border: "none", color: "#1a1205", borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{viaje.vivido ? "Sumar el recuerdo" : "Guardar en la bitácora"}</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*,video/*" multiple onChange={onArchivos} style={{ display: "none" }} />
    </div>

    {/* Mapa del viaje o lista cronológica */}
    <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
      {[["mapa", "mapa", "Mapa del viaje"], ["lista", "libro", "Lista por día"]].map(([k, ic, l]) => <button key={k} onClick={() => setVista(k)} style={{ flex: 1, padding: "9px", borderRadius: 9, border: `1px solid ${vista === k ? T.accent : T.border}`, background: vista === k ? "rgba(232,163,61,.12)" : T.card, color: vista === k ? T.accent : T.sub, fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Ico n={ic} s={13} /> {l}</button>)}
    </div>

    {vista === "mapa" && <MapaRecuerdos viaje={viaje} entradas={entradas} media={media} lugarSel={lugarSel} setLugarSel={setLugarSel} onBorrarEntrada={borrarEntrada} />}

    {vista === "lista" && entradas.length === 0 && <div style={{ textAlign: "center", color: T.muted, fontSize: 13, padding: "26px 20px", lineHeight: 1.6 }}>La bitácora está vacía.<br />El primer mate en la ruta merece una entrada.</div>}
    {vista === "lista" && entradas.map(en => (<div key={en.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, padding: 14, marginBottom: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: T.accent }}>{fFecha(en.fecha)}{en.lugar ? <span style={{ color: T.sub, fontWeight: 600 }}> · <Ico n="pin" s={10} /> {en.lugar.nombre}</span> : ""}</div>
        <button onClick={() => borrarEntrada(en)} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", padding: 2 }}><Ico n="tacho" s={14} /></button>
      </div>
      {en.texto && <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: deEntrada(en).length ? 9 : 0 }}>{en.texto}</div>}
      {deEntrada(en).length > 0 && <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 3 }}>
        {deEntrada(en).map(m => <MediaGrande key={m.id} m={m} />)}
      </div>}
    </div>))}
  </div>);
}

/* El mapa del viaje: cada lugar con recuerdos es un marcador con su cantidad
   de fotos/videos. Tocás el lugar y abajo aparecen los recuerdos de AHÍ:
   qué vivieron, las fotos, los videos. El viaje entero, en un mapa. */
function MapaRecuerdos({ viaje, entradas, media, lugarSel, setLugarSel, onBorrarEntrada }) {
  const ref = useRef(null); const mapRef = useRef(null); const capaRef = useRef(null);
  // agrupar entradas por lugar (misma coordenada redondeada = mismo lugar)
  const conLugar = entradas.filter(e => e.lugar && e.lugar.lat);
  const grupos = {};
  conLugar.forEach(e => {
    const k = `${e.lugar.lat.toFixed(3)},${e.lugar.lon.toFixed(3)}`;
    if (!grupos[k]) grupos[k] = { lugar: e.lugar, entradas: [] };
    grupos[k].entradas.push(e);
  });
  const lista = Object.values(grupos);

  useEffect(() => {
    let vivo = true;
    cargarLeaflet().then(L => {
      if (!vivo || !ref.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(ref.current, { zoomControl: true, attributionControl: false }).setView([-34.6, -58.4], 4);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(mapRef.current);
      }
      const map = mapRef.current;
      if (capaRef.current) capaRef.current.remove();
      const capa = L.layerGroup().addTo(map); capaRef.current = capa;
      lista.forEach((g, gi) => {
        const nMedia = g.entradas.reduce((s2, e) => s2 + (e.mediaIds || []).length, 0);
        const m = L.marker([g.lugar.lat, g.lugar.lon], {
          icon: L.divIcon({ className: "", iconSize: [36, 36], iconAnchor: [18, 18], html: `<div style="width:36px;height:36px;border-radius:50%;background:#E8A33D;border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#1a1205;font-weight:800;font-size:${nMedia > 9 ? 12 : 14}px;font-family:system-ui">${nMedia || "✎"}</div>` })
        }).addTo(capa);
        m.on("click", () => setLugarSel(g));
      });
      if (lista.length) map.fitBounds(L.latLngBounds(lista.map(g => [g.lugar.lat, g.lugar.lon])), { padding: [45, 45], maxZoom: 9 });
      else if ((viaje.puntos || []).length) map.fitBounds(L.latLngBounds(viaje.puntos.map(p => [p.lat, p.lon])), { padding: [40, 40], maxZoom: 6 });
    }).catch(() => { });
    return () => { vivo = false; };
  }, [JSON.stringify(lista.map(g => [g.lugar.lat, g.lugar.lon, g.entradas.length]))]);

  const deEntrada = (en) => (en.mediaIds || []).map(id => media.find(m => m.id === id)).filter(Boolean);

  return (<div>
    <div ref={ref} style={{ height: 300, borderRadius: T.rsm, overflow: "hidden", border: `1px solid ${T.border}`, background: "#0a0d12" }} />
    {lista.length === 0 && <div style={{ textAlign: "center", color: T.muted, fontSize: 12.5, padding: "18px 20px", lineHeight: 1.6 }}>Todavía no hay recuerdos anclados al mapa.<br />Escribí una entrada y marcá el lugar.</div>}
    {lista.length > 0 && !lugarSel && <div style={{ fontSize: 12, color: T.sub, textAlign: "center", marginTop: 10 }}>Tocá un punto del mapa para revivir lo de ese lugar ({lista.length} lugar{lista.length > 1 ? "es" : ""} con recuerdos)</div>}
    {lugarSel && <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.accent, display: "flex", alignItems: "center", gap: 6 }}><Ico n="pin" s={16} /> {lugarSel.lugar.nombre}</div>
        <div style={{ flex: 1, fontSize: 11, color: T.muted }}>{lugarSel.entradas.length} entrada{lugarSel.entradas.length > 1 ? "s" : ""}</div>
        <button onClick={() => setLugarSel(null)} style={{ background: "none", border: `1px solid ${T.border}`, color: T.sub, borderRadius: 8, padding: "5px 10px", fontSize: 11, cursor: "pointer" }}>Cerrar</button>
      </div>
      {[...lugarSel.entradas].sort((a, b) => (a.fecha || "").localeCompare(b.fecha || "")).map(en => (<div key={en.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.accent}`, borderRadius: T.rsm, padding: 13, marginBottom: 9 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: T.accent }}>{fFecha(en.fecha)}</div>
          <button onClick={() => { onBorrarEntrada(en); setLugarSel(null); }} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", padding: 2 }}><Ico n="tacho" s={13} /></button>
        </div>
        {en.texto && <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: deEntrada(en).length ? 8 : 0 }}>{en.texto}</div>}
        {deEntrada(en).length > 0 && <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 3 }}>{deEntrada(en).map(m => <MediaGrande key={m.id} m={m} />)}</div>}
      </div>))}
    </div>}
  </div>);
}

function MediaGrande({ m, tam = 160 }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { const u = URL.createObjectURL(m.blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [m.id]);
  if (!url) return null;
  // Cuadrado siempre, recortando parejo (objectFit cover) — así una foto
  // horizontal y una vertical quedan del mismo tamaño, una al lado de la otra.
  return m.tipo === "video"
    ? <video src={url} controls playsInline style={{ width: tam, height: tam, borderRadius: 10, background: "#000", flexShrink: 0, objectFit: "cover" }} />
    : <img src={url} style={{ width: tam, height: tam, borderRadius: 10, flexShrink: 0, objectFit: "cover" }} />;
}

/* ═══ CLIP: el video del viaje, hecho en el teléfono ═════════════ */
/* Elegís fotos y videos en orden; el teléfono los cose en un video:
   portada con el nombre del viaje, cada foto con un paneo suave (efecto
   Ken Burns), cada video con sus mejores segundos, y cierre. Sin apps
   externas ni servidores: canvas + MediaRecorder, todo local. */
function ClipMaker({ viaje, media }) {
  const [sel, setSel] = useState([]);          // ids en orden de elección
  const [segVideo, setSegVideo] = useState(4); // segundos por video
  const [generando, setGenerando] = useState(false);
  const [prog, setProg] = useState(0);
  const [clipUrl, setClipUrl] = useState(null);
  const [clipBlob, setClipBlob] = useState(null);
  const soporta = typeof MediaRecorder !== "undefined" && !!document.createElement("canvas").captureStream;

  const toggle = (id) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const orden = (id) => { const i = sel.indexOf(id); return i === -1 ? false : i + 1; };

  async function generar() {
    if (!sel.length) { alert("Elegí al menos una foto o video."); return; }
    setGenerando(true); setProg(0); setClipUrl(null);
    try {
      const W = 1280, H = 720, FPS = 30;
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d");
      const stream = cv.captureStream(FPS);
      const mime = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find(m => MediaRecorder.isTypeSupported(m)) || "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const terminado = new Promise(res => { rec.onstop = res; });
      rec.start(250);

      const frame = () => new Promise(r => requestAnimationFrame(r));
      const cover = (iw, ih, esc = 1) => { const s = Math.max(W / iw, H / ih) * esc; return { w: iw * s, h: ih * s }; };
      const textoCentrado = (lineas, sub) => {
        ctx.fillStyle = "#0E1116"; ctx.fillRect(0, 0, W, H);
        ctx.textAlign = "center"; ctx.fillStyle = "#E8A33D";
        ctx.font = "700 26px system-ui"; ctx.fillText("MIS VIAJES", W / 2, H / 2 - 70);
        ctx.fillStyle = "#EDF0F5"; ctx.font = "800 54px system-ui";
        lineas.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + i * 62));
        if (sub) { ctx.fillStyle = "#9AA5B5"; ctx.font = "500 24px system-ui"; ctx.fillText(sub, W / 2, H / 2 + lineas.length * 62 + 30); }
      };

      // portada (2 s)
      const fechas = viaje.fechaInicio ? `${fFecha(viaje.fechaInicio)} · ${viaje.diasVacaciones || "?"} días` : "";
      for (let f = 0; f < FPS * 2; f++) { textoCentrado([viaje.nombre || "Mi viaje"], fechas); await frame(); }

      const items = sel.map(id => media.find(m => m.id === id)).filter(Boolean);
      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        setProg(Math.round(((idx) / items.length) * 100));
        const url = URL.createObjectURL(it.blob);
        if (it.tipo === "foto") {
          const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
          const frames = Math.round(FPS * 2.8);
          for (let f = 0; f < frames; f++) {
            const t = f / frames;
            const esc = 1.05 + t * 0.12;                       // acercamiento suave
            const { w, h } = cover(img.width, img.height, esc);
            const dx = (W - w) / 2 + (t - 0.5) * 40;           // paneo lateral leve
            ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
            ctx.drawImage(img, dx, (H - h) / 2, w, h);
            await frame();
          }
        } else {
          const vid = document.createElement("video");
          vid.src = url; vid.muted = true; vid.playsInline = true;
          await new Promise((res) => { vid.oncanplay = res; vid.onerror = res; });
          try { await vid.play(); } catch { }
          const tope = performance.now() + Math.min(segVideo, vid.duration || segVideo) * 1000;
          while (performance.now() < tope && !vid.ended) {
            const { w, h } = cover(vid.videoWidth || W, vid.videoHeight || H);
            ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
            try { ctx.drawImage(vid, (W - w) / 2, (H - h) / 2, w, h); } catch { }
            await frame();
          }
          vid.pause();
        }
        URL.revokeObjectURL(url);
      }

      // cierre (2 s)
      for (let f = 0; f < FPS * 2; f++) { textoCentrado(["Fin del viaje ✦"], new Date().getFullYear().toString()); await frame(); }

      rec.stop(); await terminado;
      const blob = new Blob(chunks, { type: mime || "video/webm" });
      setClipBlob(blob); setClipUrl(URL.createObjectURL(blob)); setProg(100);
    } catch (e) { alert("No pude generar el clip: " + e.message); }
    setGenerando(false);
  }

  async function guardarClip() {
    if (!clipBlob) return;
    const ext = (clipBlob.type || "").includes("mp4") ? "mp4" : "webm";
    const file = new File([clipBlob], `${(viaje.nombre || "viaje").replace(/\s+/g, "-")}.${ext}`, { type: clipBlob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: viaje.nombre }); return; } catch { }
    }
    const a = document.createElement("a"); a.href = clipUrl; a.download = file.name; a.click();
  }

  if (!soporta) return <div style={{ color: T.sub, fontSize: 13, padding: 20, textAlign: "center" }}>Este navegador no permite generar video. Actualizá iOS o probá desde Safari.</div>;

  return (<div>
    <div style={{ fontSize: 12.5, color: T.sub, lineHeight: 1.6, marginBottom: 12 }}>Tocá fotos y videos <b style={{ color: T.text }}>en el orden</b> en que querés que aparezcan. Las fotos entran con un paneo suave; de cada video van los primeros <b style={{ color: T.text }}>{segVideo} segundos</b>.</div>
    {media.length === 0 && <div style={{ textAlign: "center", color: T.muted, fontSize: 13, padding: "26px" }}>Todavía no hay fotos ni videos. Cargalos desde la Bitácora.</div>}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
      {media.map(m => <Mini key={m.id} m={m} sel={orden(m.id)} onSel={() => toggle(m.id)} />)}
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <span style={{ fontSize: 12, color: T.sub }}>Segundos por video:</span>
      {[3, 4, 6, 8].map(s2 => <button key={s2} onClick={() => setSegVideo(s2)} style={{ background: segVideo === s2 ? T.accent : T.card, border: `1px solid ${segVideo === s2 ? T.accent : T.border}`, color: segVideo === s2 ? "#1a1205" : T.sub, borderRadius: 8, padding: "6px 11px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{s2}s</button>)}
    </div>
    <button onClick={generar} disabled={generando || !sel.length} style={{ width: "100%", background: generando ? T.card2 : T.accent, border: "none", color: generando ? T.sub : "#1a1205", borderRadius: T.rsm, padding: "14px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
      <Ico n="peli" s={16} /> {generando ? `Generando… ${prog}%` : `Armar el clip (${sel.length} elegido${sel.length === 1 ? "" : "s"})`}
    </button>
    {generando && <div style={{ fontSize: 11, color: T.muted, marginTop: 7, textAlign: "center" }}>Dejá la pantalla abierta mientras se genera — el video se arma en tu teléfono, cuadro por cuadro.</div>}
    {clipUrl && <div style={{ marginTop: 16 }}>
      <video src={clipUrl} controls playsInline style={{ width: "100%", borderRadius: T.rsm, background: "#000" }} />
      <button onClick={guardarClip} style={{ width: "100%", marginTop: 9, background: T.card, border: `1px solid ${T.accent}`, color: T.accent, borderRadius: T.rsm, padding: "13px", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}><Ico n="descargar" s={15} /> Guardar / compartir el clip</button>
    </div>}
  </div>);
}

/* ═══ DEL LUGAR: lo que se come y lo que suena en cada parada ═════
   La otra mitad del viaje: la mesa y la música. La IA arma la guía por
   región según su perfil, y cada artista abre DIRECTO en Spotify. */
/* ── VOZ: hablarle al copiloto y que conteste hablando ─────────────
   Reconocimiento continuo (se reengancha solo cuando iOS lo corta),
   3 segundos de silencio = envía. La respuesta se lee con la voz del
   sistema si la pregunta entró hablando. */
const PAUSA_VOZ = 3000;
function limpiarVozTexto(t) {
  return String(t || "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").replace(/[*_#>`]/g, "").replace(/\s+/g, " ").trim();
}
function hablarTexto(texto) {
  try {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(limpiarVozTexto(texto).slice(0, 1200));
    u.lang = "es-AR"; u.rate = 1.02;
    const voces = window.speechSynthesis.getVoices() || [];
    const v2 = voces.find(x => /es[-_](AR|MX|US|419)/i.test(x.lang)) || voces.find(x => /^es/i.test(x.lang));
    if (v2) u.voice = v2;
    window.speechSynthesis.speak(u);
  } catch { }
}
function usarDictado({ setTexto, onEnviar }) {
  const [escuchando, setEscuchando] = useState(false);
  const recRef = useRef(null);
  const dictRef = useRef({ activo: false, base: "" });
  const silRef = useRef(null);
  const limpiarSil = () => { if (silRef.current) { clearTimeout(silRef.current); silRef.current = null; } };

  function arrancar(reanudar) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let rec; try { rec = new SR(); } catch { setEscuchando(false); return; }
    rec.lang = "es-AR"; rec.interimResults = true; rec.continuous = true;
    if (!reanudar) dictRef.current = { activo: true, base: "" };
    rec.onresult = (e) => {
      if (!dictRef.current.activo) return;
      let fin = "", inter = "";
      for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += t; else inter += t; }
      setTexto((dictRef.current.base + fin + inter).replace(/\s+/g, " ").trimStart());
      if (fin) dictRef.current.base += fin;
      limpiarSil();
      silRef.current = setTimeout(() => parar(true), PAUSA_VOZ);
    };
    rec.onend = () => { recRef.current = null; if (dictRef.current.activo) arrancar(true); else setEscuchando(false); };
    rec.onerror = (e) => {
      recRef.current = null; const err = e && e.error;
      if (dictRef.current.activo && (err === "no-speech" || err === "aborted" || err === "network")) { arrancar(true); return; }
      dictRef.current.activo = false; limpiarSil(); setEscuchando(false);
    };
    recRef.current = rec; setEscuchando(true);
    try { rec.start(); } catch { setEscuchando(false); }
  }
  function parar(mandar) {
    limpiarSil(); dictRef.current.activo = false;
    if (recRef.current) { try { recRef.current.stop(); } catch { } }
    setEscuchando(false);
    if (mandar) setTimeout(() => onEnviar(), 150);
  }
  function toggle() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Este navegador no permite dictar. Usá el micrófono del teclado."); return; }
    try { window.speechSynthesis?.cancel(); } catch { }
    if (escuchando) { parar(true); return; }
    arrancar(false);
  }
  return { escuchando, toggle };
}
function BotonMic({ escuchando, onClick }) {
  return (<button onClick={onClick} style={{ background: escuchando ? "#DC2626" : T.card2, border: `1px solid ${escuchando ? "#DC2626" : T.border}`, color: escuchando ? "#fff" : T.sub, borderRadius: 12, padding: "0 14px", cursor: "pointer", fontSize: 16, minWidth: 46 }}>{escuchando ? "◉" : "🎙"}</button>);
}

function abrirSpotify(q) { window.open(`https://open.spotify.com/search/${encodeURIComponent(q)}`, "_blank"); }
function DelLugarTab({ viaje, perfil, actualizar }) {
  const guia = (viaje.guiaLugar && Array.isArray(viaje.guiaLugar.regiones)) ? viaje.guiaLugar : null;
  const [armando, setArmando] = useState(false);

  async function armar() {
    if (!(viaje.puntos || []).length) { alert("Cargá el recorrido primero (pestaña Ruta)."); return; }
    setArmando(true);
    try {
      const destinos = viaje.puntos.map(p => p.nombre.split(",").slice(0, 2).join(",")).join(" · ");
      const sys = "Sos un guía cultural, gastronómico y de trekking experto, con conocimiento profundo de cada región del mundo. Respondés SOLO con JSON válido, sin texto adicional ni markdown.";
      const prompt = `${perfil ? `Así viaja esta gente: ${perfil}\n\n` : ""}Este es su recorrido: ${destinos}\n\nArmá la guía de COMIDAS TÍPICAS, MÚSICA, y RUTAS/CAMINOS EMBLEMÁTICOS de cada región del recorrido (agrupá paradas cercanas en la misma región; máximo 4 regiones). Comidas: los platos imperdibles con qué son y dónde/cómo probarlos de verdad (mercados, peñas, parajes — no cadenas). Música: el género de la región, 3-4 artistas emblemáticos (clásicos y actuales) y 2-3 canciones que son LA banda sonora de ese lugar. Rutas: si el lugar tiene caminos, senderos o peregrinaciones famosas (ej: si es Santiago de Compostela, los distintos Caminos de Santiago que llegan ahí — Francés, Portugués, del Norte, Inglés, Primitivo, cada uno con su recorrido típico; si es Cusco, el Camino Inca; si es la Patagonia, el W Trek; etc.) — nombrá cada ruta con de dónde a dónde va, cuántos días toma en general, y la dificultad. Si el lugar no tiene ninguna ruta o camino famoso, dejá la lista vacía — no inventes una si no existe de verdad.\n\nRespondé SOLO este JSON:\n{"regiones":[{"nombre":"Quebrada de Humahuaca","comidas":[{"plato":"...","desc":"qué es, 1 frase","donde":"dónde probarlo"}],"genero":"...","artistas":[{"nombre":"...","desc":"1 frase de por qué escucharlo"}],"canciones":["Tema — Artista"],"rutas":[{"nombre":"Camino Francés","recorrido":"de dónde a dónde","dias":"cuántos días toma","dificultad":"fácil/media/difícil"}]}]}`;
      const resp = await llamarIA([{ role: "user", content: prompt }], sys, 3000);
      const m = resp.match(/\{[\s\S]*\}/);
      const plan = m ? JSON.parse(m[0]) : null;
      if (!plan?.regiones?.length) throw new Error("La IA no devolvió la guía. Probá de nuevo.");
      actualizar({ ...viaje, guiaLugar: { regiones: plan.regiones, armadaEl: hoyISO() } });
    } catch (e) { alert(e.message); }
    setArmando(false);
  }

  return (<div>
    {!guia && <div style={{ background: "linear-gradient(135deg, rgba(232,163,61,.12), rgba(77,163,255,.07))", border: `1px solid ${T.accent}`, borderRadius: T.r, padding: 16, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 10 }}><Ico n="nota" s={30} c={T.accent} /><Ico n="comida" s={30} c={T.accent} /></div>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: T.text, marginBottom: 5 }}>Lo que se come y lo que suena</div>
      <div style={{ fontSize: 12.5, color: T.sub, lineHeight: 1.6, marginBottom: 13 }}>La IA arma la guía de tu recorrido: los platos imperdibles de cada región, dónde probarlos de verdad, y la música del lugar — con cada artista listo para sonar en Spotify. La banda sonora del viaje, antes de salir.</div>
      <button onClick={armar} disabled={armando} style={{ background: armando ? T.card2 : T.accent, border: "none", color: armando ? T.sub : "#1a1205", borderRadius: T.rsm, padding: "13px 22px", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}>{armando ? "Armando la guía…" : <><Ico n="varita" s={13} /> Armar la guía del viaje</>}</button>
    </div>}

    {guia && <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button onClick={() => { if (confirm("¿Rehacer la guía con la IA?")) armar(); }} disabled={armando} style={{ background: T.card, border: `1px solid ${T.border}`, color: T.sub, borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{armando ? "…" : "Rehacer"}</button>
      </div>
      {guia.regiones.map((r, ri) => (<div key={ri} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, padding: "14px 15px", marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.accent, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Ico n="pin" s={16} /> {r.nombre}</div>

        {(r.comidas || []).length > 0 && <>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: T.sub, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 7, display: "flex", alignItems: "center", gap: 5 }}><Ico n="comida" s={11} /> Para comer</div>
          {r.comidas.map((c2, ci) => (<div key={ci} style={{ marginBottom: 9, paddingLeft: 10, borderLeft: `2px solid ${T.border}` }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text }}>{c2.plato}</div>
            <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5, marginTop: 1 }}>{c2.desc}</div>
            {c2.donde && <div onClick={() => window.open(`https://www.google.com/maps/search/${encodeURIComponent(c2.donde + " " + r.nombre)}`, "_blank")} style={{ fontSize: 11.5, color: T.accent, marginTop: 4, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(232,163,61,.1)", border: `1px solid ${T.accent}`, borderRadius: 8, padding: "5px 9px" }}><Ico n="gmaps" s={12} c={T.accent} /> {c2.donde}</div>}
          </div>))}
        </>}

        {(r.rutas || []).length > 0 && <>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: T.sub, textTransform: "uppercase", letterSpacing: ".07em", margin: "12px 0 7px", display: "flex", alignItems: "center", gap: 5 }}><Ico n="sendero" s={11} /> Rutas y caminos</div>
          {r.rutas.map((rt, ri) => (<div key={ri} style={{ marginBottom: 9, paddingLeft: 10, borderLeft: `2px solid ${T.border}` }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text }}>{rt.nombre}</div>
            {rt.recorrido && <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5, marginTop: 1 }}>{rt.recorrido}</div>}
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{rt.dias ? `${rt.dias}` : ""}{rt.dias && rt.dificultad ? " · " : ""}{rt.dificultad ? `dificultad ${rt.dificultad}` : ""}</div>
          </div>))}
        </>}

        <div style={{ fontSize: 10.5, fontWeight: 800, color: T.sub, textTransform: "uppercase", letterSpacing: ".07em", margin: "12px 0 7px", display: "flex", alignItems: "center", gap: 5 }}><Ico n="nota" s={11} /> Para escuchar{r.genero ? ` — ${r.genero}` : ""}</div>
        {(r.artistas || []).map((a, ai) => (<div key={ai} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{a.nombre}</div>
            {a.desc && <div style={{ fontSize: 11.5, color: T.sub, lineHeight: 1.45 }}>{a.desc}</div>}
          </div>
          <button onClick={() => abrirSpotify(a.nombre)} style={{ background: "#1DB954", border: "none", color: "#fff", borderRadius: 999, padding: "8px 13px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>▶ Spotify</button>
        </div>))}
        {(r.canciones || []).length > 0 && <div style={{ marginTop: 8, background: T.card2, borderRadius: 10, padding: "9px 11px" }}>
          <div style={{ fontSize: 10.5, color: T.muted, marginBottom: 4 }}>La banda sonora:</div>
          {r.canciones.map((cn, ci) => (<div key={ci} onClick={() => abrirSpotify(cn)} style={{ fontSize: 12.5, color: T.text, padding: "4px 0", cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}><span style={{ color: "#1DB954", fontSize: 11 }}>▶</span> {cn}</div>))}
        </div>}
        <button onClick={() => abrirSpotify(`${r.genero || "música"} ${r.nombre}`)} style={{ width: "100%", marginTop: 10, background: "#1DB954", border: "none", color: "#fff", borderRadius: 10, padding: "11px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>▶ Playlists de {r.nombre} en Spotify</button>
      </div>))}
    </>}
  </div>);
}

/* ═══ RESERVAS: el conserje del viaje ═════════════════════════════
   Todo lo que se reserva o se busca en un viaje, en un solo lugar,
   con el destino y las fechas precargadas en cada enlace. */
const AEROLINEAS_POR_REGION = {
  argentina: { t: "🇦🇷 Dentro de Argentina", aer: [
    ["Aerolíneas Argentinas", "#0A3D8F", "https://www.aerolineas.com.ar/"],
    ["JetSMART", "#5B2A86", "https://www.jetsmart.com/ar/es/"],
    ["Flybondi", "#5A2D82", "https://www.flybondi.com/ar-es"],
  ]},
  sudamerica: { t: "🌎 Sudamérica", aer: [
    ["Aerolíneas Argentinas", "#0A3D8F", "https://www.aerolineas.com.ar/"],
    ["LATAM", "#93003C", "https://www.latamairlines.com/ar/es"],
    ["GOL (Brasil)", "#FF6600", "https://www.voegol.com.br/es"],
    ["Avianca", "#E4032E", "https://www.avianca.com/ar/es/"],
    ["Copa Airlines", "#00205B", "https://www.copaair.com/es/web/ar"],
  ]},
  norteamerica: { t: "🌎 Norteamérica", aer: [
    ["Aerolíneas Argentinas", "#0A3D8F", "https://www.aerolineas.com.ar/"],
    ["LATAM", "#93003C", "https://www.latamairlines.com/ar/es"],
    ["American Airlines", "#0078D2", "https://www.aa.com/es/"],
    ["United", "#002244", "https://www.united.com/es/ar"],
    ["Delta", "#C8102E", "https://es.delta.com/"],
    ["Aeroméxico", "#0A2E5C", "https://aeromexico.com/es-ar"],
  ]},
  europa: { t: "✈️ Europa", aer: [
    ["Aerolíneas Argentinas", "#0A3D8F", "https://www.aerolineas.com.ar/"],
    ["Iberia", "#D7192D", "https://www.iberia.com/ar/"],
    ["LATAM", "#93003C", "https://www.latamairlines.com/ar/es"],
    ["Lufthansa", "#05164D", "https://www.lufthansa.com/ar/es/homepage"],
    ["Air Europa", "#00205B", "https://www.aireuropa.com/ar/es/"],
    ["Air France", "#002157", "https://wwws.airfrance.com.ar/"],
    ["KLM", "#00A1DE", "https://www.klm.com.ar/"],
    ["British Airways", "#075AAA", "https://www.britishairways.com/travel/home/execclub/es_ar"],
  ]},
  mundo: { t: "🌍 Resto del mundo", aer: [
    ["Aerolíneas Argentinas", "#0A3D8F", "https://www.aerolineas.com.ar/"],
    ["LATAM", "#93003C", "https://www.latamairlines.com/ar/es"],
    ["Qatar Airways", "#5C0632", "https://www.qatarairways.com/es-ar/homepage.html"],
    ["Emirates", "#D71921", "https://www.emirates.com/ar/spanish/"],
    ["Turkish Airlines", "#C50034", "https://www.turkishairlines.com/es-ar/"],
  ]},
};
/* El corazón del cálculo: a partir del vuelo (fecha/hora/aeropuerto) y del
   perfil (Mi Casa), decide de dónde salen, cuánto tardan al aeropuerto, y
   a qué hora hay que salir de casa. Devuelve null si falta algún dato
   (sin fecha/hora del vuelo, sin GPS ni Mi Casa, sin poder geolocalizar
   el aeropuerto) — en ese caso, se completa a mano desde el panel. */
async function calcularHorarioVuelo(vuelo, cfg) {
  // Paso 1, resiliente por su cuenta: ¿de dónde salen? No depende de nada
  // más — si el resto falla más abajo, esto igual queda guardado.
  let origen = vuelo.origenCasa || null;
  let origenNota = "";
  if (!origen) {
    if (cfg?.casa) {
      try {
        const aca = await dondeEstoy();
        const cerca = distM([aca.lat, aca.lon], [cfg.casa.lat, cfg.casa.lon]) < 1500;
        origen = cerca ? cfg.casa : aca;
        origenNota = cerca ? "Están en casa — se usó esa dirección." : "No están en casa ahora — se usó su ubicación actual.";
      } catch { origen = cfg.casa; origenNota = "No pude confirmar dónde están — se usó la dirección de casa."; }
    } else return null;   // ni Mi Casa guardada ni de dónde partir: no hay nada para decidir solo
  }
  const patchOrigen = { origenCasa: origen, origenNota };
  if (!vuelo.fecha || !vuelo.horaSalida) return patchOrigen;   // sabemos de dónde salen, falta cuándo

  // Paso 2, puede fallar sin arruinar el paso 1: geolocalizar el aeropuerto.
  let aero;
  try { const res = await geocodificar(vuelo.aeropuertoOrigen || `Aeropuerto ${vuelo.origen}`); aero = res && res[0]; } catch { aero = null; }
  if (!aero) return patchOrigen;

  // Paso 3, la ruta real: si no hay señal o falla OSRM, nos quedamos
  // con el origen igual — no se pierde lo que sí se pudo saber.
  let ruta;
  try { ruta = await calcularRuta([origen, aero]); } catch { ruta = null; }
  if (!ruta) return patchOrigen;

  const anticipacionMin = vuelo.internacional ? 180 : 120, margenMin = 15;
  const minutosViaje = Math.ceil(ruta.dur / 60);
  const salidaVuelo = new Date(`${vuelo.fecha}T${vuelo.horaSalida}:00`);
  const fechaSalir = new Date(salidaVuelo.getTime() - (minutosViaje + anticipacionMin + margenMin) * 60000);
  return {
    ...patchOrigen,
    aeropuertoNombre: aero.nombre, aeropuertoLat: aero.lat, aeropuertoLon: aero.lon,
    distAeropuertoM: ruta.dist, duracionAeropuertoS: ruta.dur, minutosViajeAeropuerto: minutosViaje,
    horaSalirCasa: `${pad2(fechaSalir.getHours())}:${pad2(fechaSalir.getMinutes())}`,
  };
}

function actualizarVuelo(viaje, vueloId, patch) {
  return { ...viaje, vuelos: (viaje.vuelos || []).map(v2 => v2.id === vueloId ? { ...v2, ...patch } : v2) };
}
function pad2(n) { return String(n).padStart(2, "0"); }
function fechaICS(d) { return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`; }

function PanelHorarioVuelo({ viaje, vuelo, actualizar, cfg }) {
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState("");
  const [buscarDir, setBuscarDir] = useState(false);
  const [decisionTxt, setDecisionTxt] = useState(vuelo.origenNota || "");
  const origenCasa = vuelo.origenCasa || null;
  const internacional = !!vuelo.internacional;
  // Ya calculado (al guardar el vuelo, o en una vuelta anterior) -> se lee
  // directo, sin recalcular ni preguntar nada de nuevo.
  const yaCalculado = !!(vuelo.horaSalirCasa && vuelo.aeropuertoLat);
  const horaSalirTxt = vuelo.horaSalirCasa || null;
  const minutosViaje = vuelo.minutosViajeAeropuerto || null;
  const distAeropuerto = vuelo.distAeropuertoM || null;
  const aeropuertoNombre = vuelo.aeropuertoNombre || null;
  const anticipacionMin = internacional ? 180 : 120;

  async function usarGPS() {
    setBuscando(true);
    try { const l = await dondeEstoy(); actualizar(actualizarVuelo(viaje, vuelo.id, { origenCasa: l, horaSalirCasa: null })); setDecisionTxt(""); }
    catch (e) { alert(e.message); }
    setBuscando(false);
  }

  // Solo entra en juego si TODAVÍA no hay nada calculado (vuelos viejos,
  // o el cálculo automático no pudo cerrar en su momento).
  useEffect(() => { if (abierto && !yaCalculado && !origenCasa && cfg?.casa) recalcular(); }, [abierto]);

  async function recalcular() {
    if (!vuelo.fecha || !vuelo.horaSalida) { setError("A este vuelo le falta la fecha o la hora de salida — completala arriba primero."); return; }
    setCalculando(true); setError("");
    try {
      const patch = await calcularHorarioVuelo(vuelo, cfg);
      if (!patch) { setError(origenCasa ? "No pude calcular la ruta hasta el aeropuerto. Revisá la conexión." : "Decime desde dónde salen: GPS o buscá la dirección."); setCalculando(false); return; }
      actualizar(actualizarVuelo(viaje, vuelo.id, patch));
      setDecisionTxt(patch.origenNota || "");
    } catch { setError("No pude calcular la ruta. Probá de nuevo."); }
    setCalculando(false);
  }

  function descargarRecordatorio() {
    if (!horaSalirTxt || minutosViaje == null) return;
    // La misma cuenta que calculó calcularHorarioVuelo: vuelo menos (viaje +
    // anticipación + margen). Recalcularla así (no reparseando el HH:MM)
    // hace que cruzar la medianoche hacia atrás quede bien solo.
    const salidaVuelo = new Date(`${vuelo.fecha}T${vuelo.horaSalida}:00`);
    const fechaSalir = new Date(salidaVuelo.getTime() - (minutosViaje + anticipacionMin + 15) * 60000);
    const fin = new Date(fechaSalir.getTime() + 15 * 60000);
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mis Viajes//ES", "BEGIN:VEVENT",
      `UID:${uid()}@misviajes`, `DTSTAMP:${fechaICS(new Date())}`, `DTSTART:${fechaICS(fechaSalir)}`, `DTEND:${fechaICS(fin)}`,
      `SUMMARY:Salir al aeropuerto — vuelo ${vuelo.numero || ""} a ${vuelo.destino}`.trim(),
      `DESCRIPTION:${(vuelo.aerolinea || "Vuelo")} ${vuelo.numero || ""} sale ${vuelo.horaSalida} desde ${vuelo.origen}. Salir ahora para llegar con tiempo (~${minutosViaje} min de viaje + ${anticipacionMin / 60}h de anticipación).`,
      "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT0M", "DESCRIPTION:Hora de salir al aeropuerto", "END:VALARM",
      "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT15M", "DESCRIPTION:Faltan 15 min para salir al aeropuerto", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `salir-aeropuerto-${vuelo.numero || "vuelo"}.ics`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // Navegación real: abre Apple/Google Maps con la ruta CASA → AEROPUERTO
  // ya cargada, con el tráfico en vivo que maneja el propio Mapa del
  // teléfono — no tratamos de reinventar eso, lo hace mejor la app nativa.
  function navegarAeropuerto(app) {
    if (!origenCasa || !vuelo.aeropuertoLat) return;
    const o = origenCasa, d = { lat: vuelo.aeropuertoLat, lon: vuelo.aeropuertoLon };
    const url = app === "apple"
      ? `https://maps.apple.com/?saddr=${o.lat},${o.lon}&daddr=${d.lat},${d.lon}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&origin=${o.lat},${o.lon}&destination=${d.lat},${d.lon}&travelmode=driving`;
    window.open(url, "_blank");
  }

  return (<div style={{ marginTop: 8 }}>
    <button onClick={() => setAbierto(v2 => !v2)} style={{ width: "100%", background: horaSalirTxt ? "rgba(61,214,140,.08)" : T.card2, border: `1px solid ${horaSalirTxt ? T.ok : T.border}`, color: horaSalirTxt ? T.ok : T.sub, borderRadius: 9, padding: "8px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
      <Ico n="reloj" s={12} /> {horaSalirTxt ? `Salir de casa a las ${horaSalirTxt}` : "¿A qué hora salgo de casa?"}
    </button>
    {abierto && <div style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, marginTop: 7 }}>
      {calculando && <div style={{ fontSize: 11.5, color: T.accent, marginBottom: 9, display: "flex", alignItems: "center", gap: 6 }}><Ico n="pin" s={12} /> Calculando la ruta al aeropuerto…</div>}

      {horaSalirTxt && <div style={{ background: "rgba(61,214,140,.08)", border: `1px solid ${T.ok}`, borderRadius: 9, padding: "10px 11px", marginBottom: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: T.ok }}>Salir a las {horaSalirTxt}</div>
        <div style={{ fontSize: 10.5, color: T.sub, marginTop: 3, lineHeight: 1.5 }}>{aeropuertoNombre?.split(",").slice(0, 2).join(",")} está a ~{kmFmt(distAeropuerto)} · {minutosViaje} min manejando + {anticipacionMin / 60} h de anticipación del vuelo + 15 min de margen.</div>
        {origenCasa && <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>Desde: {origenCasa.nombre.split(",").slice(0, 2).join(",")}{decisionTxt ? ` — ${decisionTxt}` : ""}</div>}
      </div>}

      {!horaSalirTxt && <>
        <div style={{ fontSize: 10.5, color: T.sub, marginBottom: 8 }}>¿Desde dónde salen hacia el aeropuerto?</div>
        {origenCasa ? <div style={{ marginBottom: 9 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(232,163,61,.1)", border: `1px solid ${T.accent}`, borderRadius: 9, padding: "8px 10px" }}>
            <Ico n="pin" s={13} c={T.accent} />
            <span style={{ flex: 1, fontSize: 12, color: T.text, fontWeight: 700 }}>{origenCasa.nombre.split(",").slice(0, 2).join(",")}</span>
            <button onClick={() => { actualizar(actualizarVuelo(viaje, vuelo.id, { origenCasa: null })); setDecisionTxt(""); }} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer" }}><Ico n="cerrar" s={10} /></button>
          </div>
        </div> : <div style={{ display: "flex", gap: 6, marginBottom: 9 }}>
          <button onClick={usarGPS} disabled={buscando} style={{ flex: 1, background: T.card, border: `1px solid ${T.border}`, color: T.text, borderRadius: 9, padding: "9px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}><Ico n="pin" s={12} /> {buscando ? "Buscando…" : "Usar mi ubicación"}</button>
          <button onClick={() => setBuscarDir(v2 => !v2)} style={{ flex: 1, background: T.card, border: `1px solid ${T.border}`, color: T.sub, borderRadius: 9, padding: "9px", fontSize: 11.5, cursor: "pointer" }}>Otra dirección</button>
        </div>}
        {!cfg?.casa && !origenCasa && <div style={{ fontSize: 10, color: T.muted, marginBottom: 9, lineHeight: 1.4 }}>Tip: guardá "Mi casa" en ⚙ Ajustes y esto se completa solo la próxima vez.</div>}
        {buscarDir && !origenCasa && <div style={{ marginBottom: 9 }}><BuscarLugar placeholder="Dirección de salida…" onElegir={(r) => { actualizar(actualizarVuelo(viaje, vuelo.id, { origenCasa: r })); setBuscarDir(false); }} /></div>}

        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: T.sub, marginBottom: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={internacional} onChange={e => actualizar(actualizarVuelo(viaje, vuelo.id, { internacional: e.target.checked }))} />
          Vuelo internacional (3 h de anticipación en vez de 2 h)
        </label>

        <button onClick={recalcular} disabled={calculando || !origenCasa} style={{ width: "100%", background: calculando ? T.card : T.accent, border: "none", color: calculando ? T.sub : "#1a1205", borderRadius: 9, padding: "10px", fontSize: 12, fontWeight: 800, cursor: "pointer", marginBottom: 8 }}>{calculando ? "Calculando…" : "Calcular"}</button>
        {error && <div style={{ fontSize: 11, color: T.danger, marginBottom: 8 }}>{error}</div>}
      </>}

      {horaSalirTxt && <>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button onClick={() => navegarAeropuerto("apple")} style={{ flex: 1, background: T.card, border: `1px solid ${T.border}`, color: T.text, borderRadius: 9, padding: "10px 6px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}><Ico n="auto" s={13} /> Apple Maps</button>
          <button onClick={() => navegarAeropuerto("google")} style={{ flex: 1, background: T.card, border: `1px solid ${T.border}`, color: T.text, borderRadius: 9, padding: "10px 6px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}><Ico n="gmaps" s={13} c={T.accent2} /> Google Maps</button>
        </div>
        <button onClick={descargarRecordatorio} style={{ width: "100%", background: T.accent, border: "none", color: "#1a1205", borderRadius: 9, padding: "11px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}><Ico n="alerta" s={13} /> Agregar recordatorio con alarma</button>
        <div style={{ fontSize: 10, color: T.muted, marginTop: 6, lineHeight: 1.4 }}>El recordatorio suena aunque la app esté cerrada — lo maneja el Calendario del propio iPhone. Los botones de Maps arrancan la navegación con el tráfico en vivo del momento.</div>
        <button onClick={recalcular} disabled={calculando} style={{ width: "100%", background: "none", border: "none", color: T.muted, fontSize: 10.5, cursor: "pointer", padding: "8px 0 0" }}>{calculando ? "Recalculando…" : "↻ Recalcular"}</button>
      </>}
    </div>}
  </div>);
}

function VuelosGuardados({ viaje, actualizar, media, cfg }) {
  const puntos = viaje.puntos || [];   // (bug corregido: antes esta variable no existía acá)
  const [form, setForm] = useState(null);
  const fileRef = useRef(null);        // botón "＋ Agregar": va directo a Fotos/Archivos
  const fileRef2 = useRef(null);       // dentro del formulario, para cambiar el adjunto
  const vuelos = viaje.vuelos || [];
  const IN = { flex: 1, minWidth: 0, background: T.card2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "9px 10px", fontSize: 12.5, color: T.text, outline: "none", boxSizing: "border-box" };

  const [leyendoIA, setLeyendoIA] = useState(false);
  function baseForm(archivo) {
    return { aerolinea: "", numero: "", fecha: "", horaSalida: "", horaLlegada: "", origen: puntos[0]?.nombre?.split(",")[0] || "", destino: puntos[puntos.length - 1]?.nombre?.split(",")[0] || "", aeropuertoOrigen: "", archivo: archivo || null };
  }
  // Un solo camino para "llegó un archivo nuevo": lo adjunta YA (no espera
  // a la IA para que se vea el avance) y en paralelo le pide a la IA que
  // lo lea y complete los campos solos, sea que el formulario ya estuviera
  // abierto (re-adjuntar) o que recién se esté por abrir.
  async function procesarArchivo(f) {
    if (!f) return;
    setForm(prev => ({ ...(prev || baseForm(null)), archivo: f }));
    setLeyendoIA(true);
    let datos = null, errorLectura = "";
    try { datos = await leerVoucherIA(f); }
    catch (e) { errorLectura = e.message || "No pude leer el pasaje."; }
    setLeyendoIA(false);
    if (!datos) { alert(`${errorLectura || "No encontré los datos en la imagen."}\n\nLa foto/PDF ya quedó adjunta igual — completá los campos a mano.`); return; }
    if (datos) setForm(prev => prev ? {
      ...prev,
      aerolinea: datos.aerolinea || prev.aerolinea,
      numero: datos.numero || prev.numero,
      fecha: datos.fecha || prev.fecha,
      horaSalida: datos.horaSalida || prev.horaSalida,
      horaLlegada: datos.horaLlegada || prev.horaLlegada,
      origen: datos.origen || prev.origen,
      destino: datos.destino || prev.destino,
      aeropuertoOrigen: datos.aeropuertoOrigen || prev.aeropuertoOrigen || "",
    } : prev);
  }
  function onElegirVoucher(e) {
    const f = e.target.files?.[0]; e.target.value = "";
    procesarArchivo(f);
  }
  const [guardandoExtra, setGuardandoExtra] = useState(false);
  async function guardar() {
    if (!form.archivo && !form.aerolinea.trim() && !form.numero.trim()) { alert("Adjuntá el pasaje, o cargá al menos la aerolínea o el número de vuelo."); return; }
    let docId = null;
    if (form.archivo) {
      const f = form.archivo; const esPdf = f.type === "application/pdf";
      const blob = esPdf ? f : await comprimirFoto(f);
      docId = uid();
      try { await mediaGuardar({ id: docId, viajeId: viaje.id, tipo: esPdf ? "documento" : "foto", blob, nombre: f.name, ts: Date.now() }); }
      catch { docId = null; alert("No pude guardar el archivo adjunto (¿sin espacio en el teléfono?)."); }
    }
    let vuelo = { id: uid(), aerolinea: form.aerolinea.trim(), numero: form.numero.trim().toUpperCase(), fecha: form.fecha, horaSalida: form.horaSalida, horaLlegada: form.horaLlegada, origen: form.origen.trim(), destino: form.destino.trim(), aeropuertoOrigen: (form.aeropuertoOrigen || "").trim(), docId };
    setGuardandoExtra(true);
    try { const patch = await calcularHorarioVuelo(vuelo, cfg); if (patch) vuelo = { ...vuelo, ...patch }; } catch { }
    setGuardandoExtra(false);
    actualizar({ ...viaje, vuelos: [...vuelos, vuelo] });
    setForm(null);
  }
  function borrar(id) {
    const v2 = vuelos.find(x => x.id === id);
    if (v2?.docId) mediaBorrar(v2.docId);
    actualizar({ ...viaje, vuelos: vuelos.filter(x => x.id !== id) });
  }
  function verDoc(docId) {
    const m = (media || []).find(x => x.id === docId);
    if (!m) { alert("No encuentro el archivo adjunto."); return; }
    window.open(URL.createObjectURL(m.blob), "_blank");
  }

  return (<div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, padding: "13px 14px", marginBottom: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
      <div style={{ flex: 1, fontSize: 13, fontWeight: 800, color: T.text, display: "flex", alignItems: "center", gap: 7 }}><Ico n="avion" s={15} c={T.accent} /> Vuelos ya comprados</div>
      {!form && <button onClick={() => fileRef.current?.click()} style={{ background: "rgba(232,163,61,.12)", border: `1px solid ${T.accent}`, color: T.accent, borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>＋ Agregar</button>}
    </div>
    <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onElegirVoucher} style={{ display: "none" }} />
    {!form && <div style={{ textAlign: "center" }}><button onClick={() => setForm(baseForm(null))} style={{ background: "none", border: "none", color: T.muted, fontSize: 10.5, cursor: "pointer", padding: 4, marginTop: vuelos.length ? 4 : 0 }}>o cargar los datos a mano, sin adjuntar nada</button></div>}
    {vuelos.length === 0 && !form && <div style={{ fontSize: 11.5, color: T.sub, lineHeight: 1.5 }}>Si ya tienen el pasaje sacado en otro lado, cargá el número de vuelo, el horario, y adjuntá el boarding pass — queda a mano en el viaje, sin necesitar señal.</div>}
    {vuelos.map(v2 => (<div key={v2.id} style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: T.text }}>{v2.aerolinea || "Vuelo"}{v2.numero ? `  ${v2.numero}` : ""}</div>
          <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>{v2.origen} → {v2.destino}</div>
          <div style={{ fontSize: 11, color: T.sub }}>{v2.fecha ? fFecha(v2.fecha) : ""}{v2.horaSalida ? ` · sale ${v2.horaSalida}` : ""}{v2.horaLlegada ? ` · llega ${v2.horaLlegada}` : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {v2.docId && <button onClick={() => verDoc(v2.docId)} style={{ background: T.accent, border: "none", color: "#1a1205", borderRadius: 8, padding: "7px 10px", fontSize: 10.5, fontWeight: 800, cursor: "pointer" }}>Ver pasaje</button>}
          <button onClick={() => borrar(v2.id)} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer" }}><Ico n="tacho" s={13} /></button>
        </div>
      </div>
      {v2.destino && (() => {
        const vuelta = vuelos.find(x => x.id !== v2.id && x.fecha && (x.origen || "").toLowerCase().includes((v2.destino || "").toLowerCase().split(",")[0].trim()));
        const f = v2.fecha && vuelta ? { in: v2.fecha, out: vuelta.fecha } : null;   // solo con las dos fechas se pasan; si no, sin fechas (mejor vacío que "undefined" en la URL)
        return (<div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.text, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}><Ico n="cama" s={12} /> Dormir en {v2.destino}</div>
          <HospedajeLinks lugar={v2.destino} f={f} />
        </div>);
      })()}
      <PanelHorarioVuelo viaje={viaje} vuelo={v2} actualizar={actualizar} cfg={cfg} />
    </div>))}

    {vuelos.length > 0 && <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, padding: "13px 14px", marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: T.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}><Ico n="cruz" s={15} c={T.danger} /> Seguro médico de viaje</div>
      <div style={{ fontSize: 11, color: T.sub, lineHeight: 1.5, marginBottom: 10 }}>{vuelos.some(v2 => v2.internacional) ? "Con vuelo internacional, es prácticamente obligatorio — muchos países ni te dejan entrar sin cobertura médica. " : ""}Se contrata una vez para todo el viaje, no por vuelo.</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={() => window.open("https://www.assistcard.com/ar", "_blank")} style={{ background: "#0057A3", border: "none", color: "#fff", borderRadius: 9, padding: "10px 13px", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>Assist Card</button>
        <button onClick={() => window.open("https://www.universal-assistance.com/ar", "_blank")} style={{ background: "#00558C", border: "none", color: "#fff", borderRadius: 9, padding: "10px 13px", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>Universal Assistance</button>
        <button onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent("comparar seguro de viaje a " + (vuelos[vuelos.length - 1]?.destino || ""))}`, "_blank")} style={{ background: T.card2, border: `1px solid ${T.border}`, color: T.sub, borderRadius: 9, padding: "10px 13px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>Comparar otras</button>
      </div>
    </div>}

    {form && <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", gap: 7, marginBottom: 7 }}>
        <input value={form.aerolinea} onChange={e => setForm({ ...form, aerolinea: e.target.value })} placeholder="Aerolínea" style={IN} />
        <input value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} placeholder="N° vuelo (AR1234)" style={{ ...IN, flex: 0.7 }} />
      </div>
      <div style={{ display: "flex", gap: 7, marginBottom: 7 }}>
        <input value={form.origen} onChange={e => setForm({ ...form, origen: e.target.value })} placeholder="Origen" style={IN} />
        <input value={form.destino} onChange={e => setForm({ ...form, destino: e.target.value })} placeholder="Destino" style={IN} />
      </div>
      <div style={{ display: "flex", gap: 7, marginBottom: 9 }}>
        <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} style={{ ...IN, colorScheme: "dark" }} />
        <input type="time" value={form.horaSalida} onChange={e => setForm({ ...form, horaSalida: e.target.value })} placeholder="Sale" style={{ ...IN, colorScheme: "dark" }} />
        <input type="time" value={form.horaLlegada} onChange={e => setForm({ ...form, horaLlegada: e.target.value })} placeholder="Llega" style={{ ...IN, colorScheme: "dark" }} />
      </div>
      <button onClick={() => fileRef2.current?.click()} style={{ width: "100%", background: form.archivo ? "rgba(61,214,140,.1)" : T.card2, border: `1.5px dashed ${form.archivo ? T.ok : T.border}`, color: form.archivo ? T.ok : T.text, borderRadius: 10, padding: "11px", fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 9 }}><Ico n={form.archivo ? "check" : "cam"} s={14} c={form.archivo ? T.ok : T.accent} /> {form.archivo ? `Adjunto: ${form.archivo.name}` : "Adjuntar boarding pass / pasaje (foto o PDF)"}</button>
      <input ref={fileRef2} type="file" accept="image/*,application/pdf" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) procesarArchivo(f); }} style={{ display: "none" }} />
      {leyendoIA && <div style={{ fontSize: 11.5, color: T.accent, marginTop: -3, marginBottom: 9, display: "flex", alignItems: "center", gap: 6 }}><Ico n="varita" s={12} /> Leyendo el pasaje con IA…</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setForm(null)} style={{ flex: 1, background: "none", border: `1px solid ${T.border}`, color: T.sub, borderRadius: 9, padding: "11px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
        <button onClick={guardar} disabled={guardandoExtra} style={{ flex: 2, background: guardandoExtra ? T.card2 : T.accent, border: "none", color: guardandoExtra ? T.sub : "#1a1205", borderRadius: 9, padding: "11px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>{guardandoExtra ? "Calculando la ruta al aeropuerto…" : "Guardar vuelo"}</button>
      </div>
    </div>}
  </div>);
}

function ReservasTab({ viaje, actualizar, media, cfg }) {
  const puntos = viaje.puntos || [];
  const fp = fechasParada(viaje);
  const [lugarSel, setLugarSel] = useState(puntos.length ? puntos[puntos.length - 1].nombre.split(",")[0] : "");
  const [otro, setOtro] = useState("");
  const lugar = otro.trim() || lugarSel;
  // ── Vuelos: modo auto/avión + región elegida ──
  const puntoElegido = !otro.trim() ? puntos.find(p => p.nombre.split(",")[0] === lugarSel) : null;
  const regionSugerida = puntoElegido && /argentina/i.test(puntoElegido.nombre) ? "argentina" : "sudamerica";
  const [modo, setModo] = useState(viaje.modoViaje === "avion" ? "avion" : "auto");   // arranca en el modo elegido al crear el viaje
  const [region, setRegion] = useState(regionSugerida);
  const [origenVuelo, setOrigenVuelo] = useState(puntos[0]?.nombre?.split(",")[0] || "");
  // si el lugar elegido tiene fechas en el itinerario, van al enlace
  const f = Object.entries(fp).find(([n]) => n.toLowerCase().includes(lugar.toLowerCase()))?.[1]
    || (viaje.fechaInicio && viaje.diasVacaciones ? { in: viaje.fechaInicio, out: (() => { const d = new Date(viaje.fechaInicio + "T12:00:00"); d.setDate(d.getDate() + Number(viaje.diasVacaciones)); return d.toISOString().slice(0, 10); })() } : null);
  const q = encodeURIComponent(lugar);
  const abrir = (u) => window.open(u, "_blank");

  const SECCIONES = [
    ["cama:Dormir", [
      ["Booking", "#003580", `https://www.booking.com/searchresults.es.html?ss=${q}${f ? `&checkin=${f.in}&checkout=${f.out}` : ""}&group_adults=2`],
      ["Airbnb", "#FF385C", `https://www.airbnb.com.ar/s/${q}/homes?adults=2${f ? `&checkin=${f.in}&checkout=${f.out}` : ""}`],
      ["Despegar", "#4A148C", `https://www.google.com/search?q=${encodeURIComponent("site:despegar.com.ar paquetes a " + lugar)}`],
      ["Hostels", "#F26722", `https://www.spanish.hostelworld.com/s?q=${q}${f ? `&from=${f.in}&to=${f.out}` : ""}`],
    ]],
    ["auto:Alquilar auto", [
      ["Kayak Autos", "#FF690F", `https://www.kayak.com.ar/cars/${q}${f ? `/${f.in}/${f.out}` : ""}`],
      ["RentalCars", "#0071C2", `https://www.rentalcars.com/es/`],
      ["Hertz", "#FFD100", `https://www.hertz.com.ar/`],
    ]],
    ["comida:Comer", [
      ["Restaurantes cerca", "#34A853", `https://www.google.com/maps/search/${encodeURIComponent("mejores restaurantes en " + lugar)}`],
      ["TripAdvisor", "#00AF87", `https://www.tripadvisor.com.ar/Search?q=${encodeURIComponent(lugar + " restaurantes")}`],
      ["Parrillas", "#B45309", `https://www.google.com/maps/search/${encodeURIComponent("parrilla en " + lugar)}`],
    ]],
    ["ticket:Paseos y actividades", [
      ["Civitatis", "#E4405F", `https://www.civitatis.com/ar/buscar/?q=${q}`],
      ["GetYourGuide", "#FF5533", `https://www.getyourguide.es/s/?q=${q}${f ? `&date_from=${f.in}` : ""}`],
      ["Qué hacer", "#34A853", `https://www.google.com/maps/search/${encodeURIComponent("qué hacer en " + lugar)}`],
    ]],
    ["bus:Micros y trenes", [
      ["Plataforma 10", "#0E7C3A", `https://www.plataforma10.com.ar/`],
      ["Omio (mundo)", "#3E2AD1", `https://www.omio.com.ar/`],
    ]],
  ];

  const AUXILIO = [["gas", "Estación de servicio", "estación de servicio"], ["cajero", "Cajero", "cajero automático"], ["pastilla", "Farmacia", "farmacia de turno"], ["llave", "Gomería", "gomería"], ["carrito", "Supermercado", "supermercado"], ["cruz", "Hospital", "hospital"]];

  return (<div>
    <VuelosGuardados viaje={viaje} actualizar={actualizar} media={media} cfg={cfg} />

    {/* Viaje recién creado, sin destino todavía: buscador con geocode real,
        que además suma el punto al viaje (así Clima, mapa y bitácora
        tienen dónde anclarse más adelante). */}
    {puntos.length === 0 && <div style={{ background: T.card, border: `1px solid ${T.accent}`, borderRadius: T.r, padding: "13px 14px", marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: T.text, marginBottom: 8, display: "flex", alignItems: "center", gap: 7 }}><Ico n="avion" s={15} c={T.accent} /> ¿A dónde vuelan?</div>
      <BuscarLugar placeholder="Bariloche, Roma, donde sea…" onElegir={(r) => { actualizar({ ...viaje, puntos: [...(viaje.puntos || []), r] }); setLugarSel(r.nombre.split(",")[0]); }} />
    </div>}

    {/* dónde */}
    {puntos.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>¿Para dónde?</div>}
    {puntos.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
      {puntos.map((p, i) => { const n = p.nombre.split(",")[0]; const on = !otro && lugarSel === n; return <button key={i} onClick={() => { setLugarSel(n); setOtro(""); }} style={{ background: on ? "rgba(232,163,61,.15)" : T.card, border: `1px solid ${on ? T.accent : T.border}`, color: on ? T.accent : T.sub, borderRadius: 9, padding: "9px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{n}</button>; })}
    </div>}
    {puntos.length > 0 && <input value={otro} onChange={e => setOtro(e.target.value)} placeholder="U otro lugar…"
      style={{ width: "100%", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "11px 13px", fontSize: 13, color: T.text, outline: "none", boxSizing: "border-box", marginBottom: 6 }} />}
    {f && lugar && <div style={{ fontSize: 11.5, color: T.sub, marginBottom: 12 }}>Los enlaces van con fechas: <b style={{ color: T.text }}>{fFecha(f.in)} → {fFecha(f.out)}</b></div>}
    {!f && <div style={{ height: 8 }} />}

    {/* cómo viajan a este lugar */}
    {lugar && <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
      {[["auto", "auto", "En auto"], ["avion", "avion", "En avión"]].map(([k, ic, l]) => <button key={k} onClick={() => setModo(k)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${modo === k ? T.accent : T.border}`, background: modo === k ? "rgba(232,163,61,.12)" : T.card, color: modo === k ? T.accent : T.sub, fontSize: 12.5, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Ico n={ic} s={14} /> {l}</button>)}
    </div>}

    {lugar && modo === "avion" && <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, padding: "13px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 11 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: T.sub, marginBottom: 3 }}>Desde</div>
          <input value={origenVuelo} onChange={e => setOrigenVuelo(e.target.value)} placeholder="Buenos Aires"
            style={{ width: "100%", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "9px 10px", fontSize: 12.5, color: T.text, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: T.sub, marginBottom: 3 }}>Hasta</div>
          <div style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "9px 10px", fontSize: 12.5, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lugar}</div>
        </div>
      </div>

      <div style={{ fontSize: 10.5, fontWeight: 800, color: T.sub, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 7 }}>Buscadores</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 13 }}>
        {[["Google Flights", "#4285F4", `https://www.google.com/travel/flights?q=${encodeURIComponent(`vuelos ${origenVuelo ? "de " + origenVuelo + " " : ""}a ${lugar}` + (f ? " el " + f.in : ""))}`],
          ["Despegar Vuelos", "#4A148C", `https://www.google.com/search?q=${encodeURIComponent("site:despegar.com.ar paquetes a " + lugar)}`],
          ["Kayak", "#FF690F", `https://www.kayak.com.ar/flights`]]
          .map(([nom, color, url]) => <button key={nom} onClick={() => abrir(url)} style={{ background: color, border: "none", color: "#fff", borderRadius: 9, padding: "10px 13px", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>{nom}</button>)}
      </div>

      <div style={{ fontSize: 10.5, fontWeight: 800, color: T.sub, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 7 }}>¿A qué región vuelan?</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {Object.entries(AEROLINEAS_POR_REGION).map(([k, r]) => <button key={k} onClick={() => setRegion(k)} style={{ background: region === k ? "rgba(232,163,61,.15)" : T.card2, border: `1px solid ${region === k ? T.accent : T.border}`, color: region === k ? T.accent : T.sub, borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{r.t}</button>)}
      </div>

      <div style={{ fontSize: 10.5, fontWeight: 800, color: T.sub, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 7 }}>Aerolíneas — elegí con quién buscar</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {AEROLINEAS_POR_REGION[region].aer.map(([nom, color, url]) => <button key={nom} onClick={() => abrir(url)} style={{ background: color, border: "none", color: "#fff", borderRadius: 9, padding: "10px 13px", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>{nom}</button>)}
      </div>
    </div>}

    {/* secciones */}
    {lugar && modo === "auto" && SECCIONES.map(([tit, links]) => { const [ic, titulo] = tit.split(":"); return (<div key={tit} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, padding: "12px 13px", marginBottom: 10 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: T.text, marginBottom: 8, display: "flex", alignItems: "center", gap: 7 }}><Ico n={ic} s={14} c={T.accent} /> {titulo}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {links.map(([nom, color, url]) => <button key={nom} onClick={() => abrir(url)} style={{ background: color, border: "none", color: color === "#FFD100" ? "#1a1205" : "#fff", borderRadius: 9, padding: "10px 13px", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>{nom}</button>)}
      </div>
    </div>); })}

    {/* auxilios en ruta: usan TU ubicación actual */}
    <div style={{ background: "linear-gradient(135deg, rgba(232,163,61,.1), rgba(77,163,255,.06))", border: `1px solid ${T.accent}`, borderRadius: T.r, padding: "12px 13px" }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: T.text, marginBottom: 2, display: "flex", alignItems: "center", gap: 7 }}><Ico n="alerta" s={14} c={T.danger} /> Ya en la ruta, cerca tuyo</div>
      <div style={{ fontSize: 11, color: T.sub, marginBottom: 9 }}>Abren el mapa buscando alrededor de donde estás AHORA.</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {AUXILIO.map(([ic, l, q2]) => <button key={l} onClick={() => abrir(`https://www.google.com/maps/search/${encodeURIComponent(q2)}`)} style={{ background: T.card, border: `1px solid ${T.border}`, color: T.text, borderRadius: 9, padding: "10px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><Ico n={ic} s={13} /> {l}</button>)}
      </div>
    </div>
  </div>);
}

/* ═══ LA VALIJA: el checklist que sabe a dónde van ═══════════════
   Junta lo que la app ya sabe — el destino, el CLIMA de tus días y
   cómo viajan ustedes — y arma el equipaje: qué llevar y por qué.
   Después es tildar mientras se llena la valija. */
function ValijaTab({ viaje, perfil, climaResumen, actualizar }) {
  const valija = (viaje.valija && Array.isArray(viaje.valija.grupos)) ? viaje.valija : null;
  const [armando, setArmando] = useState(false);

  async function armar() {
    if (!(viaje.puntos || []).length) { alert("Cargá el recorrido primero (pestaña Ruta)."); return; }
    setArmando(true);
    try {
      const destinos = viaje.puntos.map(p => p.nombre.split(",")[0]).join(", ");
      const sys = "Sos un viajero experto que arma equipajes perfectos. Respondés SOLO con JSON válido, sin texto adicional ni markdown.";
      const prompt = `Armá el checklist de equipaje para este viaje:\nDestinos: ${destinos}\n${viaje.fechaInicio ? `Salida: ${viaje.fechaInicio} · ${viaje.diasVacaciones || "?"} días\n` : ""}${perfil ? `Cómo viajan: ${perfil}\n` : ""}${climaResumen ? `Pronóstico real por punto:\n${climaResumen}\n` : ""}\nIncluí lo específico del destino y del clima (abrigo si nieva, protector si hay altura o sol fuerte, efectivo si hay zonas sin señal, adaptadores si cambia el enchufe, documentación del auto si es roadtrip). Máximo 30 ítems en 4-6 grupos.\n\nRespondé SOLO este JSON:\n{"grupos":[{"titulo":"Ropa","items":[{"t":"Campera abrigada","por":"las noches en la Puna bajan de 0°"}]}]}`;
      const resp = await llamarIA([{ role: "user", content: prompt }], sys, 2500);
      const m = resp.match(/\{[\s\S]*\}/);
      const plan = m ? JSON.parse(m[0]) : null;
      if (!plan?.grupos?.length) throw new Error("La IA no devolvió el checklist. Probá de nuevo.");
      const grupos = plan.grupos.map(g => ({ titulo: g.titulo, items: (g.items || []).map(it => ({ id: uid(), t: it.t, por: it.por || "", ok: false })) }));
      actualizar({ ...viaje, valija: { grupos, armadaEl: hoyISO() } });
    } catch (e) { alert(e.message); }
    setArmando(false);
  }

  function toggle(gid, iid) {
    actualizar({ ...viaje, valija: { ...valija, grupos: valija.grupos.map((g, gi) => gi !== gid ? g : { ...g, items: g.items.map(it => it.id === iid ? { ...it, ok: !it.ok } : it) }) } });
  }
  function agregarItem(gid, t) {
    if (!t.trim()) return;
    actualizar({ ...viaje, valija: { ...valija, grupos: valija.grupos.map((g, gi) => gi !== gid ? g : { ...g, items: [...g.items, { id: uid(), t: t.trim(), por: "", ok: false }] }) } });
  }
  const totItems = valija ? valija.grupos.reduce((s2, g) => s2 + g.items.length, 0) : 0;
  const listos = valija ? valija.grupos.reduce((s2, g) => s2 + g.items.filter(i => i.ok).length, 0) : 0;

  return (<div>
    {!valija && <div style={{ background: "linear-gradient(135deg, rgba(232,163,61,.12), rgba(77,163,255,.07))", border: `1px solid ${T.accent}`, borderRadius: T.r, padding: 16, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}><Ico n="valija" s={32} c={T.accent} /></div>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: T.text, marginBottom: 5 }}>La valija, armada para este viaje</div>
      <div style={{ fontSize: 12.5, color: T.sub, lineHeight: 1.6, marginBottom: 13 }}>La IA junta el destino, el pronóstico real de tus días{perfil ? " y su estilo de viaje" : ""}, y te dice qué llevar y por qué. Tip: pasá antes por la pestaña Clima así el checklist sale con el pronóstico puesto.</div>
      <button onClick={armar} disabled={armando} style={{ background: armando ? T.card2 : T.accent, border: "none", color: armando ? T.sub : "#1a1205", borderRadius: T.rsm, padding: "13px 22px", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}>{armando ? "Armando la valija…" : <><Ico n="varita" s={13} /> Armar el checklist</>}</button>
    </div>}

    {valija && <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{listos} de {totItems} en la valija</div>
          <div style={{ height: 7, background: T.card2, borderRadius: 5, overflow: "hidden", marginTop: 5 }}><div style={{ height: "100%", width: `${totItems ? Math.round(listos / totItems * 100) : 0}%`, background: listos === totItems && totItems ? T.ok : T.accent, borderRadius: 5, transition: "width .3s" }} /></div>
        </div>
        <button onClick={() => { if (confirm("¿Rehacer el checklist con la IA? Se pierde lo tildado.")) armar(); }} disabled={armando} style={{ background: T.card, border: `1px solid ${T.border}`, color: T.sub, borderRadius: 9, padding: "9px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>{armando ? "…" : "Rehacer"}</button>
      </div>
      {listos === totItems && totItems > 0 && <div style={{ background: "rgba(61,214,140,.08)", border: `1px solid ${T.ok}`, borderRadius: T.rsm, padding: "11px 13px", marginBottom: 13, fontSize: 13, color: T.ok, fontWeight: 800, textAlign: "center" }}>¡Valija completa! Que empiece el viaje.</div>}
      {valija.grupos.map((g, gi) => (<div key={gi} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, padding: "13px 14px", marginBottom: 11 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>{g.titulo} · {g.items.filter(i => i.ok).length}/{g.items.length}</div>
        {g.items.map(it => (<div key={it.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "7px 0", opacity: it.ok ? .55 : 1 }}>
          <div onClick={() => toggle(gi, it.id)} style={{ width: 21, height: 21, borderRadius: 7, border: `2px solid ${it.ok ? T.ok : T.border}`, background: it.ok ? T.ok : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, cursor: "pointer" }}>{it.ok && <span style={{ color: "#0E1116", fontSize: 13, fontWeight: 900 }}>✓</span>}</div>
          <div onClick={() => toggle(gi, it.id)} style={{ minWidth: 0, flex: 1, cursor: "pointer" }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, textDecoration: it.ok ? "line-through" : "none" }}>{it.t}</div>
            {it.por && <div style={{ fontSize: 11, color: T.sub, lineHeight: 1.45, marginTop: 1 }}>{it.por}</div>}
          </div>
          {!it.ok && <button onClick={() => window.open(`https://listado.mercadolibre.com.ar/${encodeURIComponent(it.t)}`, "_blank")} title="Dónde comprarlo" style={{ background: T.card2, border: `1px solid ${T.border}`, color: T.accent, borderRadius: 8, padding: "6px 8px", cursor: "pointer", flexShrink: 0, marginTop: 1 }}><Ico n="carrito" s={13} /></button>}
        </div>))}
        <AgregarItem onAgregar={(t) => agregarItem(gi, t)} />
      </div>))}
    </>}
  </div>);
}
function AgregarItem({ onAgregar }) {
  const [t, setT] = useState("");
  return (<div style={{ display: "flex", gap: 6, marginTop: 6 }}>
    <input value={t} onChange={e => setT(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { onAgregar(t); setT(""); } }} placeholder="Agregar algo…"
      style={{ flex: 1, background: T.card2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 11px", fontSize: 12, color: T.text, outline: "none" }} />
    <button onClick={() => { onAgregar(t); setT(""); }} style={{ background: T.card2, border: `1px solid ${T.border}`, color: T.accent, borderRadius: 8, padding: "0 12px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>＋</button>
  </div>);
}

/* ═══ GASTOS: la pregunta de todo viaje — ¿venimos bien de plata? ═══
   Presupuesto total, cada gasto en dos toques, y la app responde lo
   importante: cuánto por día venimos gastando, cuánto queda, y si a
   este ritmo la plata llega hasta el final del viaje. */
const CAT_GASTOS = [["nafta", "gas", "Nafta/peajes"], ["comida", "comida", "Comida"], ["hospedaje", "cama", "Hospedaje"], ["paseos", "ticket", "Paseos"], ["compras", "carrito", "Compras"], ["otros", "tarjeta", "Otros"]];
const monedaFmt = (n, m) => `${m === "USD" ? "USD " : "$"}${Math.round(n).toLocaleString("es-AR")}`;

function GastosTab({ viaje, actualizar }) {
  const gastos = viaje.gastos || [];
  const moneda = viaje.moneda || "ARS";
  const presu = Number(viaje.presupuesto) || 0;
  const [monto, setMonto] = useState("");
  const [cat, setCat] = useState("comida");
  const [nota, setNota] = useState("");
  const total = gastos.reduce((s2, g) => s2 + (Number(g.monto) || 0), 0);
  const queda = presu - total;

  // días transcurridos del viaje (para el promedio y la proyección)
  const hoy = hoyISO();
  const ini = viaje.fechaInicio, diasV = Number(viaje.diasVacaciones) || 0;
  let diasPasados = 0, diasQuedan = 0, enViaje = false;
  if (ini && diasV) {
    const d = diasEntre(ini, hoy);
    if (d >= 0 && d < diasV) { enViaje = true; diasPasados = d + 1; diasQuedan = diasV - d - 1; }
    else if (d >= diasV) { diasPasados = diasV; }
  }
  const promedioDia = diasPasados > 0 ? total / diasPasados : 0;
  const proyeccion = enViaje && promedioDia > 0 ? total + promedioDia * diasQuedan : null;
  const alcanza = proyeccion !== null && presu > 0 ? proyeccion <= presu : null;

  function agregar() {
    const m = Number(String(monto).replace(",", ".")); if (!m || m <= 0) return;
    actualizar({ ...viaje, gastos: [...gastos, { id: uid(), fecha: hoy, monto: m, cat, nota: nota.trim() }] });
    setMonto(""); setNota("");
  }
  const porCat = CAT_GASTOS.map(([k, l]) => ({ k, l, v: gastos.filter(g => g.cat === k).reduce((s2, g) => s2 + g.monto, 0) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const porDia = {};
  gastos.forEach(g => { porDia[g.fecha] = (porDia[g.fecha] || 0) + g.monto; });
  const diasLista = Object.keys(porDia).sort().reverse();

  return (<div>
    {/* presupuesto y estado */}
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, padding: 15, marginBottom: 13 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10.5, color: T.sub, marginBottom: 3 }}>Presupuesto del viaje</div>
          <input value={viaje.presupuesto || ""} onChange={e => actualizar({ ...viaje, presupuesto: e.target.value })} inputMode="numeric" placeholder="500000"
            style={{ width: "100%", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "10px 11px", fontSize: 15, fontWeight: 800, color: T.text, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: T.sub, marginBottom: 3 }}>Moneda</div>
          <div style={{ display: "flex", gap: 5 }}>
            {["ARS", "USD"].map(m2 => <button key={m2} onClick={() => actualizar({ ...viaje, moneda: m2 })} style={{ background: moneda === m2 ? T.accent : T.card2, border: `1px solid ${moneda === m2 ? T.accent : T.border}`, color: moneda === m2 ? "#1a1205" : T.sub, borderRadius: 9, padding: "10px 12px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>{m2}</button>)}
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div><div style={{ fontSize: 10, color: T.muted }}>Gastado</div><div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{monedaFmt(total, moneda)}</div></div>
        <div><div style={{ fontSize: 10, color: T.muted }}>Queda</div><div style={{ fontSize: 16, fontWeight: 800, color: presu ? (queda >= 0 ? T.ok : T.danger) : T.muted }}>{presu ? monedaFmt(queda, moneda) : "—"}</div></div>
        <div><div style={{ fontSize: 10, color: T.muted }}>Promedio/día</div><div style={{ fontSize: 16, fontWeight: 800, color: T.accent }}>{diasPasados ? monedaFmt(promedioDia, moneda) : "—"}</div></div>
      </div>
      {proyeccion !== null && presu > 0 && <div style={{ marginTop: 11, background: alcanza ? "rgba(61,214,140,.08)" : "rgba(242,85,90,.1)", border: `1px solid ${alcanza ? T.ok : T.danger}`, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.55, color: alcanza ? T.ok : T.danger, fontWeight: 700 }}>
        {alcanza
          ? `✓ A este ritmo llegan bien: proyección ${monedaFmt(proyeccion, moneda)} de ${monedaFmt(presu, moneda)}. Sobrarían ${monedaFmt(presu - proyeccion, moneda)}.`
          : `⚠ A este ritmo se pasan: proyección ${monedaFmt(proyeccion, moneda)} contra ${monedaFmt(presu, moneda)}. Para llegar, el tope diario de acá al final es ${monedaFmt(Math.max(0, queda / Math.max(1, diasQuedan)), moneda)}.`}
      </div>}
    </div>

    {/* cargar gasto */}
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, padding: 14, marginBottom: 13 }}>
      <div style={{ display: "flex", gap: 7, marginBottom: 9 }}>
        <input value={monto} onChange={e => setMonto(e.target.value)} inputMode="decimal" placeholder={`Monto (${moneda})`}
          style={{ flex: 1, background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 13px", fontSize: 15, fontWeight: 800, color: T.text, outline: "none", minWidth: 0 }} />
        <button onClick={agregar} style={{ background: T.accent, border: "none", color: "#1a1205", borderRadius: 10, padding: "0 18px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>＋</button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {CAT_GASTOS.map(([k, l]) => <button key={k} onClick={() => setCat(k)} style={{ background: cat === k ? "rgba(232,163,61,.15)" : T.card2, border: `1px solid ${cat === k ? T.accent : T.border}`, color: cat === k ? T.accent : T.sub, borderRadius: 9, padding: "8px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{l}</button>)}
      </div>
      <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota (opcional): parrilla en Cafayate…"
        style={{ width: "100%", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: T.text, outline: "none", boxSizing: "border-box" }} />
    </div>

    {/* por categoría */}
    {porCat.length > 0 && <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, padding: 14, marginBottom: 13 }}>
      {porCat.map(c2 => (<div key={c2.k} style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
          <span style={{ color: T.text, fontWeight: 700 }}>{c2.l}</span><span style={{ color: T.sub, fontWeight: 800 }}>{monedaFmt(c2.v, moneda)}</span>
        </div>
        <div style={{ height: 6, background: T.card2, borderRadius: 4, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.round(c2.v / total * 100)}%`, background: T.accent, borderRadius: 4 }} /></div>
      </div>))}
    </div>}

    {/* por día */}
    {diasLista.map(f => (<div key={f} style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, fontWeight: 800, color: T.accent, marginBottom: 5 }}>
        <span>{fFecha(f)}</span><span>{monedaFmt(porDia[f], moneda)}</span>
      </div>
      {gastos.filter(g => g.fecha === f).map(g => (<div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 11px", marginBottom: 5 }}>
        <span style={{ fontSize: 14 }}>{(CAT_GASTOS.find(c2 => c2[0] === g.cat) || ["", "💳"])[1].split(" ")[0]}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{monedaFmt(g.monto, moneda)}</div>
          {g.nota && <div style={{ fontSize: 11, color: T.sub }}>{g.nota}</div>}
        </div>
        <button onClick={() => actualizar({ ...viaje, gastos: gastos.filter(x => x.id !== g.id) })} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", padding: 3 }}><Ico n="tacho" s={14} /></button>
      </div>))}
    </div>))}
    {gastos.length === 0 && <div style={{ textAlign: "center", color: T.muted, fontSize: 13, padding: "22px", lineHeight: 1.6 }}>Sin gastos todavía.<br />La primera carga de nafta inaugura la cuenta.</div>}
  </div>);
}

/* ═══ DORMIR Y TURISMO ═══════════════════════════════════════════
   Enlaces con el destino y las fechas YA cargadas: un toque y estás
   viendo hospedajes de esa parada para esas noches. Más el acceso a
   la información turística oficial del lugar. */
function fechasParada(viaje) {
  // A partir de la salida y las noches de cada parada, calcula el
  // check-in / check-out de cada lugar del itinerario.
  const out = {};
  if (!viaje.fechaInicio || !(viaje.itinerario || []).length) return out;
  let cursor = viaje.fechaInicio;
  for (const it of viaje.itinerario) {
    const noches = Math.max(0, Number(it.noches) || 0);
    if (noches > 0) {
      const fin = new Date(cursor + "T12:00:00"); fin.setDate(fin.getDate() + noches);
      out[it.nombre] = { in: cursor, out: fin.toISOString().slice(0, 10), noches };
      cursor = out[it.nombre].out;
    }
  }
  return out;
}
function HospedajeLinks({ lugar, f }) {
  const q = encodeURIComponent(lugar);
  const fechasB = f ? `&checkin=${f.in}&checkout=${f.out}` : "";
  const fechasA = f ? `&checkin=${f.in}&checkout=${f.out}` : "";
  const abrir = (u) => window.open(u, "_blank");
  const btn = (fondo, color, texto, url) => (
    <button onClick={() => abrir(url)} style={{ background: fondo, border: "none", color, borderRadius: 9, padding: "9px 11px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>{texto}</button>
  );
  return (<div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
    {btn("#003580", "#fff", "Booking", `https://www.booking.com/searchresults.es.html?ss=${q}${fechasB}&group_adults=2`)}
    {btn("#FF385C", "#fff", "Airbnb", `https://www.airbnb.com.ar/s/${q}/homes?adults=2${fechasA}`)}
    {btn("#4A148C", "#fff", "Despegar", `https://www.google.com/search?q=${encodeURIComponent("site:despegar.com.ar paquetes a " + lugar)}`)}
    <button onClick={() => abrir(`https://www.google.com/search?q=${encodeURIComponent("turismo oficial " + lugar + " qué visitar")}`)} style={{ background: T.card2, border: "none", color: T.sub, borderRadius: 9, padding: "10px 13px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><Ico n="museo" s={13} /> Turismo oficial</button>
  </div>);
}

/* ═══ PLANNER IA: "quiero ir a Italia" → el itinerario COMO USTEDES ═══
   Le decís a dónde, desde dónde y cuántos días. La IA lee tu perfil viajero
   (¿aman manejar? ¿ritmo relajado? ¿pueblitos y vino?) y arma el itinerario
   que USTEDES harían: las paradas caen al mapa listas, con sus porqués. */
function PlannerIA({ viaje, actualizar, perfil, cfg }) {
  const [destino, setDestino] = useState("");
  const [desde, setDesde] = useState(cfg?.casa?.nombre || "Buenos Aires, Argentina");
  const [dias, setDias] = useState(viaje.diasVacaciones || "14");
  const [armando, setArmando] = useState(false);
  const [cambiarDesde, setCambiarDesde] = useState(!cfg?.casa);   // si hay Mi Casa, arranca sin pedir nada

  async function armar() {
    if (!destino.trim()) { alert("Decime a dónde quieren ir."); return; }
    setArmando(true);
    try {
      const sys = "Sos un planificador de viajes de primer nivel, con conocimiento profundo del mundo. Respondés SOLO con JSON válido, sin texto adicional ni markdown.";
      const prompt = `${perfil ? `ASÍ VIAJA ESTA GENTE (armá el itinerario exactamente para ellos): ${perfil}\n\n` : ""}Quieren viajar a: ${destino}\nSalen desde: ${desde}\nDías disponibles: ${dias}\n\nANTES de armar nada, pensá: ¿qué es lo que hace FAMOSO a este destino — lo principal, lo que nadie que va ahí se puede perder? Ejemplos de cómo pensarlo: Egipto → las pirámides de Giza y el Nilo. Mendoza → la Ruta del Vino y las bodegas. Santiago de Compostela → el Camino de Santiago. Cusco → Machu Picchu y el Camino Inca. Orlando → los parques Disney. Alemania, según la ciudad → historia (Berlín: el Muro; Múnich: la Oktoberfest). Si esa atracción central es EN SÍ un recorrido de varios días (un camino de peregrinación, una ruta del vino, la Ruta 40), las paradas del itinerario tienen que ser LAS ETAPAS de ese recorrido — pueblos y tramos en orden — no una ciudad genérica con noches sueltas. Si es un sitio puntual (pirámides, un parque, una torre), asegurate de que al menos una parada esté dedicada explícitamente a eso, con el "por_que" explicando por qué es lo imperdible. Armá el MEJOR itinerario posible para ellos: el orden de lugares, cuántas noches en cada uno, y por qué cada lugar es para ELLOS. Si aman manejar, roadtrip con rutas lindas; si no, ciudades base y traslados cómodos. Si el destino requiere avión desde el origen, la primera parada es la ciudad de llegada.\n\nRespondé SOLO este JSON:\n{"nombre_viaje":"...","atraccion_principal":"1 frase: lo imperdible de este viaje y por qué armamos el recorrido así","paradas":[{"nombre":"Ciudad o lugar","pais_o_provincia":"...","noches":2,"por_que":"1 frase pensada para ellos, conectada con lo imperdible del lugar","lat":-00.0000,"lon":-00.0000}]}`;
      const resp = await llamarIA([{ role: "user", content: prompt }], sys, 3000);
      const m = resp.match(/\{[\s\S]*\}/);
      const plan = m ? JSON.parse(m[0]) : null;
      if (!plan || !plan.paradas?.length) throw new Error("La IA no devolvió un itinerario válido. Probá de nuevo.");
      const ps = plan.paradas.filter(p => p.lat && p.lon).map(p => ({ nombre: `${p.nombre}, ${p.pais_o_provincia || ""}`.replace(/, $/, ""), lat: p.lat, lon: p.lon }));
      actualizar({
        ...viaje,
        nombre: plan.nombre_viaje || viaje.nombre,
        puntos: ps,
        itinerario: plan.paradas.map(p => ({ nombre: p.nombre, noches: p.noches, por_que: p.por_que })),
        atraccionPrincipal: plan.atraccion_principal || "",
        diasVacaciones: viaje.diasVacaciones || dias,
      });
    } catch (e) { alert(e.message); }
    setArmando(false);
  }

  return (<div style={{ background: "linear-gradient(135deg, rgba(232,163,61,.12), rgba(77,163,255,.07))", border: `1px solid ${T.accent}`, borderRadius: T.r, padding: 16, marginBottom: 16 }}>
    <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 3 }}><Ico n="varita" s={17} c={T.accent} /> ¿A dónde quieren ir?</div>
    <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.55, marginBottom: 12 }}>{perfil ? "La IA ya sabe cómo viajan ustedes. Decile el destino y arma el itinerario a su medida." : "Tip: cargá su estilo de viaje en Ajustes ⚙ y el itinerario sale hecho para ustedes."}</div>
    <input value={destino} onChange={e => setDestino(e.target.value)} placeholder="Italia · Jujuy · Costa de Brasil · donde sea"
      style={{ width: "100%", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "13px 14px", fontSize: 14.5, color: T.text, outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
      {cambiarDesde ? <input value={desde} onChange={e => setDesde(e.target.value)} placeholder="¿Desde dónde salen?"
        style={{ flex: 1, background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "11px 13px", fontSize: 13, color: T.text, outline: "none", minWidth: 0 }} />
        : <div onClick={() => setCambiarDesde(true)} style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "0 12px", fontSize: 12.5, color: T.sub, cursor: "pointer", minWidth: 0 }}>
          <Ico n="pin" s={12} c={T.accent} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Salen desde {desde.split(",")[0]}</span>
        </div>}
      <input value={dias} onChange={e => setDias(e.target.value)} inputMode="numeric" placeholder="días"
        style={{ width: 70, background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "11px", fontSize: 13, color: T.text, outline: "none", textAlign: "center" }} />
    </div>
    <button onClick={armar} disabled={armando} style={{ width: "100%", background: armando ? T.card2 : T.accent, border: "none", color: armando ? T.sub : "#1a1205", borderRadius: T.rsm, padding: "14px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>{armando ? "Armando su itinerario…" : <><Ico n="varita" s={13} /> Armar el itinerario para nosotros</>}</button>
  </div>);
}

/* ═══ AJUSTES: hacé la app TUYA ══════════════════════════════════ */
function Ajustes({ cfg, guardarCfg, cerrar, onSalir }) {
  const perfil = (listarPerfiles().find(p => p.codigo === perfilActivo()) || {});
  const fondoRef = useRef(null);
  const [notas, setNotas] = useState(cfg.notas || "");
  const [guardado, setGuardado] = useState(false);
  function guardarTodo() {
    guardarCfg({ ...cfg, notas: notas.trim() });
    setGuardado(true);
    setTimeout(() => cerrar(), 900);   // confirmación visible y vuelve solo
  }
  async function subirFondo(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    // comprimida y como dataURL: el fondo carga al instante, siempre
    const blob = await comprimirFoto(f);
    const r = new FileReader();
    r.onload = () => guardarCfg({ ...cfg, fondo: r.result });
    r.readAsDataURL(blob);
  }
  const chip = (activo) => ({ background: activo ? "rgba(232,163,61,.15)" : T.card2, border: `1px solid ${activo ? T.accent : T.border}`, color: activo ? T.accent : T.sub, borderRadius: 9, padding: "9px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" });
  return (<div style={{ position: "fixed", inset: 0, zIndex: 200, background: T.bg, overflowY: "auto" }}>
    <div style={{ padding: "14px 16px", paddingTop: "max(14px, env(safe-area-inset-top))", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${T.border}` }}>
      <button onClick={cerrar} style={{ background: "none", border: "none", color: T.text, cursor: "pointer", padding: 4 }}><Ico n="volver" s={22} /></button>
      <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Ajustes</div>
    </div>
    <div style={{ padding: 18, paddingBottom: 60 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 9 }}>Nombre de la app</div>
      <div style={{ fontSize: 11.5, color: T.sub, lineHeight: 1.5, marginBottom: 10 }}>Ponele el nombre que quieras: el de la familia, el del grupo de amigos, la marca si la vas a compartir.</div>
      <input defaultValue={cfg.titulo || ""} onBlur={e => guardarCfg({ ...cfg, titulo: e.target.value.trim() })} placeholder="Mis Viajes"
        style={{ width: "100%", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 15, fontWeight: 800, color: T.text, outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
      <input defaultValue={cfg.lema || ""} onBlur={e => guardarCfg({ ...cfg, lema: e.target.value.trim() })} placeholder="Lema chiquito de arriba (ej: Ruta abierta)"
        style={{ width: "100%", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "11px 14px", fontSize: 12.5, color: T.text, outline: "none", boxSizing: "border-box", marginBottom: 24 }} />

      <div style={{ fontSize: 11, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>🏠 Mi casa</div>
      <div style={{ fontSize: 11.5, color: T.sub, lineHeight: 1.5, marginBottom: 10 }}>La guardás una vez y listo: cuando calculen la hora de salir al aeropuerto, la app sabe de dónde salen sin preguntar cada vez. Si ese día no están en casa, usa su ubicación real en el momento.</div>
      {cfg.casa ? <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(232,163,61,.1)", border: `1px solid ${T.accent}`, borderRadius: 10, padding: "10px 12px", marginBottom: 24 }}>
        <Ico n="pin" s={14} c={T.accent} />
        <span style={{ flex: 1, fontSize: 12.5, color: T.text, fontWeight: 700 }}>{cfg.casa.nombre.split(",").slice(0, 2).join(",")}</span>
        <button onClick={() => guardarCfg({ ...cfg, casa: null })} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer" }}><Ico n="cerrar" s={11} /></button>
      </div> : <div style={{ marginBottom: 24 }}>
        <BuscarLugarConGPS onElegir={(r) => guardarCfg({ ...cfg, casa: r })} />
      </div>}

      <div style={{ fontSize: 11, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 9 }}>Tema de la app</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        {Object.entries(TEMAS).map(([k, t2]) => { const on = (cfg.tema || "ruta40") === k; return (
          <button key={k} onClick={() => guardarCfg({ ...cfg, tema: k })} style={{ background: t2.bg, border: `2px solid ${on ? t2.accent : T.border}`, borderRadius: 12, padding: "10px 12px", cursor: "pointer", minWidth: 96 }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              {[t2.accent, t2.accent2, t2.card2].map((c3, i) => <span key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: c3, border: `1px solid ${t2.border}` }} />)}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: t2.text, textAlign: "left" }}>{t2.nombre}</div>
          </button>); })}
      </div>
      <div style={{ fontSize: 11, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 9 }}>Fondo de pantalla</div>
      <div style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 24 }}>
        <div style={{ width: 84, height: 84, borderRadius: 12, border: `1px solid ${T.border}`, background: cfg.fondo ? `url(${cfg.fondo}) center/cover` : T.card, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <button onClick={() => fondoRef.current?.click()} style={{ width: "100%", background: T.accent, border: "none", color: "#1a1205", borderRadius: 10, padding: "11px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", marginBottom: 6 }}><Ico n="cam" s={14} /> Elegir foto de fondo</button>
          {cfg.fondo && <button onClick={() => guardarCfg({ ...cfg, fondo: null })} style={{ width: "100%", background: "none", border: `1px solid ${T.border}`, color: T.sub, borderRadius: 10, padding: "9px", fontSize: 12, cursor: "pointer" }}>Quitar fondo</button>}
        </div>
        <input ref={fondoRef} type="file" accept="image/*" onChange={subirFondo} style={{ display: "none" }} />
      </div>

      <div style={{ fontSize: 11, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>Nuestro estilo de viaje</div>
      <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.55, marginBottom: 13 }}>Contale a la app cómo les gusta viajar. Cada vez que la IA arme un itinerario o sugiera paradas, va a planificar COMO USTEDES.</div>

      <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 7 }}>¿Les gusta manejar?</div>
      <div style={{ display: "flex", gap: 7, marginBottom: 15, flexWrap: "wrap" }}>
        {[["ama", "Amamos la ruta"], ["justo", "Lo justo"], ["no", "Preferimos no manejar"]].map(([k, l]) => <button key={k} onClick={() => guardarCfg({ ...cfg, manejo: k })} style={chip(cfg.manejo === k)}>{l}</button>)}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 7 }}>Ritmo</div>
      <div style={{ display: "flex", gap: 7, marginBottom: 15, flexWrap: "wrap" }}>
        {[["relax", "🧉 Relajado"], ["mixto", "Mixto"], ["intenso", "⚡ Ver todo"]].map(([k, l]) => <button key={k} onClick={() => guardarCfg({ ...cfg, ritmo: k })} style={chip(cfg.ritmo === k)}>{l}</button>)}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 7 }}>Presupuesto</div>
      <div style={{ display: "flex", gap: 7, marginBottom: 15, flexWrap: "wrap" }}>
        {[["cuidado", "Cuidado"], ["medio", "Medio"], ["gustos", "Darnos los gustos"]].map(([k, l]) => <button key={k} onClick={() => guardarCfg({ ...cfg, presupuesto: k })} style={chip(cfg.presupuesto === k)}>{l}</button>)}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 7 }}>Lo que nos gusta</div>
      <div style={{ display: "flex", gap: 7, marginBottom: 15, flexWrap: "wrap" }}>
        {INTERESES.map(i => { const on = (cfg.intereses || []).includes(i); return <button key={i} onClick={() => guardarCfg({ ...cfg, intereses: on ? cfg.intereses.filter(x => x !== i) : [...(cfg.intereses || []), i] })} style={chip(on)}>{i}</button>; })}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 7 }}>Viajamos…</div>
      <div style={{ display: "flex", gap: 7, marginBottom: 15, flexWrap: "wrap" }}>
        {["En pareja", "En familia", "Con amigos", "Con mascota", "Solo/a"].map(c2 => <button key={c2} onClick={() => guardarCfg({ ...cfg, compania: cfg.compania === c2 ? "" : c2 })} style={chip(cfg.compania === c2)}>{c2}</button>)}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 7 }}>Algo más que la IA deba saber</div>
      <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3} placeholder="Ej: paramos siempre en cabañas, evitamos peajes, viajamos con el perro…"
        style={{ width: "100%", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "11px 13px", fontSize: 13, color: T.text, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />

      <button onClick={guardarTodo} style={{ width: "100%", marginTop: 16, background: guardado ? T.ok : T.accent, border: "none", color: guardado ? "#fff" : "#1a1205", borderRadius: T.rsm, padding: "15px", fontSize: 14.5, fontWeight: 800, cursor: "pointer", transition: "background .25s" }}>{guardado ? "✓ Guardado — la IA ya viaja como ustedes" : "✓ Guardar mi estilo"}</button>
      <div style={{ fontSize: 11, color: T.muted, textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>Los botones de arriba se guardan solos al tocarlos; este botón asegura también el texto libre y confirma todo junto.</div>
      <div style={{ fontSize: 11, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: ".08em", marginTop: 26, marginBottom: 9 }}>Este perfil</div>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rsm, padding: "12px 13px" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{perfil.nombre || "—"}</div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>Código: {perfilActivo()}</div>
        <div style={{ fontSize: 10.5, color: T.sub, lineHeight: 1.5, marginTop: 6 }}>Los viajes de este perfil están separados de cualquier otro código, en este teléfono o en cualquier otro.</div>
        <button onClick={() => { if (confirm("¿Cerrar este perfil? Tus viajes quedan guardados — volvés a entrar con el mismo código.")) onSalir(); }} style={{ width: "100%", marginTop: 10, background: "none", border: `1px solid ${T.border}`, color: T.sub, borderRadius: 9, padding: "10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cerrar este perfil</button>
      </div>
      <div style={{ textAlign: "center", fontSize: 11, color: T.muted, marginTop: 18 }}>{APP_VER} — la app se chequea sola al abrir y se actualiza apenas hay versión nueva.</div>
    </div>
  </div>);
}

/* ═══ CLIMA: ¿salimos, corremos la salida, o esperamos? ══════════ */
function ClimaTab({ viaje, onResumen }) {
  const [datos, setDatos] = useState(null);   // [{punto, dias:[...]}]
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState("");
  const puntos = viaje.puntos || [];

  async function traer() {
    if (!puntos.length) { setErr("Cargá el recorrido primero (pestaña Ruta)."); return; }
    setCargando(true); setErr("");
    try {
      const res = [];
      for (const p of puntos) res.push({ punto: p, dias: await pronostico(p.lat, p.lon) });
      setDatos(res);
      // resumen para el copiloto: que la IA pueda opinar sobre postergar
      const resumen = res.map(r => {
        const feos = r.dias.filter(d => CLIMA_COD(d.cod).nivel >= 2 || d.nieve > 0).slice(0, 4)
          .map(d => `${d.fecha.slice(5)}: ${CLIMA_COD(d.cod).n}${d.nieve > 0 ? ` (${d.nieve}cm nieve)` : ""}`).join("; ");
        return `${r.punto.nombre.split(",")[0]}: ${feos || "sin alertas en 16 días"}`;
      }).join("\n");
      onResumen(resumen);
    } catch (e) { setErr(e.message); }
    setCargando(false);
  }
  useEffect(() => { if (puntos.length && !datos) traer(); }, []);

  // días del viaje resaltados (si la salida entra en los próximos 16 días)
  const enViaje = (fecha) => {
    if (!viaje.fechaInicio || !viaje.diasVacaciones) return false;
    const d = diasEntre(viaje.fechaInicio, fecha);
    return d >= 0 && d < Number(viaje.diasVacaciones);
  };

  // alertas: nieve o tormenta/lluvia fuerte en días del viaje (o próximos 7 si no hay fecha)
  const alertas = [];
  (datos || []).forEach(r => r.dias.forEach(d => {
    const c = CLIMA_COD(d.cod);
    const relevante = viaje.fechaInicio ? enViaje(d.fecha) : diasEntre(hoyISO(), d.fecha) <= 7;
    if (relevante && (c.nivel >= 3 || (c.nivel >= 2 && d.lluvia >= 70))) {
      alertas.push({ lugar: r.punto.nombre.split(",")[0], fecha: d.fecha, c, nieve: d.nieve });
    }
  }));

  return (<div>
    <div style={{ fontSize: 12.5, color: T.sub, lineHeight: 1.6, marginBottom: 12 }}>Pronóstico de 16 días para cada punto del recorrido. Los días de TU viaje se marcan en dorado. Si se viene nieve o tormenta, la app avisa — y le podés preguntar al copiloto si conviene correr la salida.</div>

    {alertas.length > 0 && <div style={{ background: "rgba(242,85,90,.1)", border: `1px solid ${T.danger}`, borderRadius: T.rsm, padding: "12px 13px", marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: T.danger, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}><Ico n="alerta" s={13} /> Ojo con estos días del viaje</div>
      {alertas.slice(0, 6).map((a, i) => <div key={i} style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>{a.c.e} <b>{a.lugar}</b> — {fFecha(a.fecha)}: {a.c.n}{a.nieve > 0 ? ` (~${a.nieve} cm de nieve)` : ""}</div>)}
      <div style={{ fontSize: 11.5, color: T.sub, marginTop: 7 }}>Tocá el botón del copiloto 💬 y preguntale: "¿me conviene postergar la salida?" — ya tiene estos datos cargados.</div>
    </div>}
    {datos && alertas.length === 0 && <div style={{ background: "rgba(61,214,140,.08)", border: `1px solid ${T.ok}`, borderRadius: T.rsm, padding: "11px 13px", marginBottom: 14, fontSize: 12.5, color: T.ok, fontWeight: 700 }}>✓ Sin nieve ni tormentas a la vista en el recorrido. Ruta despejada.</div>}

    {cargando && <div style={{ textAlign: "center", color: T.sub, fontSize: 13, padding: 20 }}>Trayendo el pronóstico de cada punto…</div>}
    {err && <div style={{ textAlign: "center", color: T.danger, fontSize: 12.5, padding: 12 }}>{err}</div>}

    {(datos || []).map((r, ri) => (<div key={ri} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, padding: "13px 14px", marginBottom: 11 }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text, marginBottom: 9, display: "flex", alignItems: "center", gap: 6 }}><Ico n="pin" s={14} /> {r.punto.nombre.split(",").slice(0, 2).join(",")}</div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
        {r.dias.map((d, di) => {
          const c = CLIMA_COD(d.cod); const ev = enViaje(d.fecha);
          return (<div key={di} style={{ flexShrink: 0, width: 66, textAlign: "center", background: ev ? "rgba(232,163,61,.14)" : T.card2, border: `1px solid ${ev ? T.accent : T.border}`, borderRadius: 10, padding: "8px 4px" }}>
            <div style={{ fontSize: 10, color: ev ? T.accent : T.muted, fontWeight: ev ? 800 : 600 }}>{fFecha(d.fecha)}</div>
            <div style={{ fontSize: 20, margin: "3px 0" }}>{c.e}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.text }}>{d.max}°<span style={{ color: T.muted, fontWeight: 600 }}>/{d.min}°</span></div>
            {d.lluvia >= 40 && <div style={{ fontSize: 9.5, color: T.accent2, marginTop: 1 }}>💧{d.lluvia}%</div>}
            {d.nieve > 0 && <div style={{ fontSize: 9.5, color: "#fff", marginTop: 1 }}>❄ {d.nieve}cm</div>}
          </div>);
        })}
      </div>
    </div>))}
    {datos && <button onClick={traer} disabled={cargando} style={{ width: "100%", background: T.card, border: `1px solid ${T.border}`, color: T.sub, borderRadius: T.rsm, padding: "11px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Actualizar pronóstico</button>}
  </div>);
}

/* ═══ PANTALLA DE UN VIAJE (pestañas: Ruta / Bitácora / Clip) ════ */
function PantallaViaje({ viaje, actualizar, volver, cfg = {} }) {
  const perfil = perfilTexto(cfg);
  const [tab, setTab] = useState(viaje.vivido ? "bitacora" : (viaje.modoViaje === "avion" ? "reservas" : "ruta"));
  const [ruta, setRuta] = useState(null);
  const [calc, setCalc] = useState(false);
  const [err, setErr] = useState("");
  const [sugiriendo, setSugiriendo] = useState(false);
  const [chatAbierto, setChatAbierto] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const porVozRefC = useRef(false);
  const chatInputRef = useRef(""); chatInputRef.current = chatInput;
  const enviarRefC = useRef(null);
  const dictadoC = usarDictado({ setTexto: setChatInput, onEnviar: () => { porVozRefC.current = true; enviarRefC.current && enviarRefC.current(); } });
  const [media, setMedia] = useState([]);
  const chatEndRef = useRef(null);
  const [climaResumen, setClimaResumen] = useState("");
  const [puntoAbierto, setPuntoAbierto] = useState(null);   // qué parada tiene el detalle desplegado
  const [plannerAbierto, setPlannerAbierto] = useState(false);   // pedirle a la IA el viaje completo, aunque ya haya puntos

  const puntos = viaje.puntos || [];
  const sugerencias = viaje.sugerencias || [];
  const recargarMedia = async () => { try { setMedia((await mediaListar(viaje.id)).sort((a, b) => a.ts - b.ts)); } catch { } };
  useEffect(() => { recargarMedia(); }, [viaje.id]);

  useEffect(() => {
    let vivo = true; setErr("");
    if (puntos.length >= 2) {
      setCalc(true);
      calcularRuta(puntos).then(r => { if (vivo) { setRuta(r); setCalc(false); } }).catch(e => { if (vivo) { setErr(e.message); setRuta(null); setCalc(false); } });
    } else setRuta(null);
    return () => { vivo = false; };
  }, [JSON.stringify(puntos.map(p => [p.lat, p.lon]))]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs, chatBusy]);

  const setPuntos = (ps) => actualizar({ ...viaje, puntos: ps });
  const mover = (i, dir) => { const ps = [...puntos]; const j = i + dir; if (j < 0 || j >= ps.length) return; [ps[i], ps[j]] = [ps[j], ps[i]]; setPuntos(ps); };
  const sacar = (i) => setPuntos(puntos.filter((_, j) => j !== i));
  const resumenPuntos = () => puntos.map((p, i) => `${i === 0 ? "Origen" : i === puntos.length - 1 ? "Destino" : `Parada ${i}`}: ${p.nombre.split(",").slice(0, 2).join(",")}`).join("\n");

  async function sugerirConIA() {
    if (puntos.length < 2) { alert("Cargá origen y destino primero."); return; }
    setSugiriendo(true);
    try {
      const sys = "Sos un guía de viajes experto en rutas por auto, con conocimiento profundo de Argentina y el mundo. Respondés SOLO con un array JSON válido, sin texto adicional ni markdown.";
      const prompt = `${perfil ? `Así viajamos nosotros: ${perfil}\n\n` : ""}Estoy planificando este viaje en auto:\n${resumenPuntos()}\n\nSugerime entre 8 y 12 lugares LINDOS o de interés que estén SOBRE el recorrido o a un desvío corto (máx ~40 km): pueblos con encanto, miradores, parques nacionales, comidas típicas imperdibles, sitios históricos. Evitá los que ya son paradas.\n\nRespondé SOLO este JSON:\n[{"nombre":"...","localidad":"...","provincia_o_region":"...","desc":"por qué vale la pena, 1-2 frases","desvio_km":0,"lat":-00.0000,"lon":-00.0000}]`;
      const resp = await llamarIA([{ role: "user", content: prompt }], sys, 3000);
      const lista = extraerJSON(resp);
      if (!lista || !lista.length) throw new Error("La IA no devolvió sugerencias válidas. Probá de nuevo.");
      actualizar({ ...viaje, sugerencias: lista.filter(x => x && x.nombre && x.lat && x.lon).map(x => ({ ...x, id: uid() })) });
    } catch (e) { alert(e.message); }
    setSugiriendo(false);
  }

  function agregarSugerencia(sg) {
    const nueva = { nombre: `${sg.nombre}, ${sg.localidad || ""}`.replace(/, $/, ""), lat: sg.lat, lon: sg.lon };
    const ps = [...puntos]; ps.splice(Math.max(1, ps.length - 1), 0, nueva);
    actualizar({ ...viaje, puntos: ps, sugerencias: sugerencias.filter(x => x.id !== sg.id) });
  }

  async function enviarChat() {
    const t = chatInputRef.current.trim(); if (!t || chatBusy) return;
    setChatInput("");
    const msgs = [...chatMsgs, { role: "user", content: t }];
    setChatMsgs(msgs); setChatBusy(true);
    try {
      const sys = `Sos el copiloto de viaje de la app Mis Viajes. Conocés rutas, pueblos, comida y lugares de Argentina y el mundo. Contestás en voseo, cálido y concreto, como un amigo que ya hizo ese viaje.${perfil ? ` Así viaja esta gente (tenelo SIEMPRE en cuenta): ${perfil}.` : ""} Viaje actual:\n${resumenPuntos()}${ruta ? `\nDistancia: ${kmFmt(ruta.dist)} — Manejo: ${hFmt(ruta.dur)}` : ""}${viaje.fechaInicio ? `\nSalida: ${viaje.fechaInicio} · ${viaje.diasVacaciones || "?"} días de vacaciones` : ""}${climaResumen ? `\nPronóstico por punto del recorrido (días con alertas):\n${climaResumen}\nSi te preguntan si conviene postergar o correr la salida, usá estos datos y sé concreto.` : ""}${(viaje.gastos || []).length ? `\nGastos: llevan gastado ${(viaje.gastos || []).reduce((s2, g) => s2 + (Number(g.monto) || 0), 0)} ${viaje.moneda || "ARS"}${viaje.presupuesto ? ` de un presupuesto de ${viaje.presupuesto}` : ""}.` : ""}`;
      const resp = await llamarIA(msgs.slice(-12), sys, 1500);
      setChatMsgs(prev => [...prev, { role: "assistant", content: resp }]);
      if (porVozRefC.current) { porVozRefC.current = false; hablarTexto(resp); }
    } catch { setChatMsgs(prev => [...prev, { role: "assistant", content: "Uy, no pude responder (¿hay internet?). Probá de nuevo." }]); }
    setChatBusy(false);
  }
  enviarRefC.current = enviarChat;

  function abrirAppleMaps() {
    // Apple Maps es el navegador nativo de CarPlay: lo que abras acá
    // aparece en la pantalla del auto al enchufar el teléfono.
    if (puntos.length < 2) return;
    const o = puntos[0], d = puntos[puntos.length - 1];
    const medio = puntos.slice(1, -1).map(p => `${p.lat},${p.lon}`);
    // Apple encadena paradas con "+to:"; si el auto/iOS no soporta la cadena,
    // igual navega al destino final.
    const daddr = [...medio, `${d.lat},${d.lon}`].join("+to:");
    window.open(`https://maps.apple.com/?saddr=${o.lat},${o.lon}&daddr=${daddr}&dirflg=d`, "_blank");
  }

  function abrirGoogleMaps() {
    if (puntos.length < 2) return;
    const o = puntos[0], d = puntos[puntos.length - 1];
    const wp = puntos.slice(1, -1).map(p => `${p.lat},${p.lon}`).join("|");
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${o.lat},${o.lon}&destination=${d.lat},${d.lon}${wp ? `&waypoints=${encodeURIComponent(wp)}` : ""}&travelmode=driving`, "_blank");
  }

  const TABS = viaje.vivido
    ? [["bitacora", "Bitácora", "libro"], ["ruta", "Mapa del viaje", "mapa"], ["lugar", "Del lugar", "nota"], ["clip", "Clip", "peli"]]
    : [["ruta", "Ruta", "mapa"], ["reservas", "Reservas", "ticket"], ["clima", "Clima", "sol"], ["lugar", "Del lugar", "nota"], ["gastos", "Gastos", "plata"], ["valija", "Valija", "valija"], ["bitacora", "Bitácora", "libro"], ["clip", "Clip", "peli"]];

  return (<div style={{ minHeight: "100vh", paddingBottom: 90 }}>
    <div style={{ padding: "14px 16px 0", paddingTop: "max(14px, env(safe-area-inset-top))" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={volver} style={{ background: "none", border: "none", color: T.text, cursor: "pointer", padding: 4 }}><Ico n="volver" s={22} /></button>
        <input value={viaje.nombre} onChange={e => actualizar({ ...viaje, nombre: e.target.value })} style={{ flex: 1, background: "none", border: "none", color: T.text, fontSize: 17, fontWeight: 800, outline: "none" }} />
        {ruta && <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.accent }}>{kmFmt(ruta.dist)}</div>
          <div style={{ fontSize: 10.5, color: T.sub }}>{hFmt(ruta.dur)}</div>
        </div>}
      </div>
      <div style={{ display: "flex", gap: 5, margin: "12px 0 0", overflowX: "auto", paddingBottom: 2 }}>
        {TABS.map(([k, l, ic]) => <button key={k} onClick={() => setTab(k)} style={{ flexShrink: 0, padding: "10px 13px", borderRadius: 10, border: `1px solid ${tab === k ? T.accent : T.border}`, background: tab === k ? "rgba(232,163,61,.12)" : T.card, color: tab === k ? T.accent : T.sub, fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}><Ico n={ic} s={14} /> {l}</button>)}
      </div>
    </div>

    <div style={{ padding: 16 }}>
      <UpdateBanner />
      <BarraViaje viaje={viaje} actualizar={actualizar} />

      {tab === "ruta" && (puntos.length === 0 || plannerAbierto) && <PlannerIA viaje={viaje} actualizar={(v2) => { actualizar(v2); setPlannerAbierto(false); }} perfil={perfil} cfg={cfg} />}
      {tab === "ruta" && viaje.atraccionPrincipal && <div style={{ background: "linear-gradient(135deg, rgba(232,163,61,.14), rgba(77,163,255,.08))", border: `1px solid ${T.accent}`, borderRadius: T.r, padding: "12px 14px", marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Ico n="estrella" s={17} c={T.accent} />
        <div><div style={{ fontSize: 10.5, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 3 }}>Lo imperdible de este viaje</div>
        <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.5 }}>{viaje.atraccionPrincipal}</div></div>
      </div>}
      {tab === "ruta" && <>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
            <div style={{ flex: 1, fontSize: 11, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: ".08em" }}>{puntos.length === 0 ? "¿De dónde a dónde?" : `Recorrido (${puntos.length} puntos)`}</div>
            {puntos.length > 0 && !plannerAbierto && <button onClick={() => setPlannerAbierto(true)} style={{ background: "rgba(232,163,61,.12)", border: `1px solid ${T.accent}`, color: T.accent, borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}><Ico n="varita" s={12} /> Rehacer con IA</button>}
          </div>
          <div style={{ fontSize: 11.5, color: T.sub, lineHeight: 1.5, marginBottom: 10 }}>Tocá cualquier parada para ver hospedaje y turismo de ESE lugar — no solo del destino final.</div>
          {puntos.map((p, i) => { const abierto = puntoAbierto === i; return (<div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rsm, marginBottom: 7, overflow: "hidden" }}>
            <div onClick={() => setPuntoAbierto(abierto ? null : i)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 12px", cursor: "pointer" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: i === 0 ? T.ok : i === puntos.length - 1 ? T.danger : T.accent2, color: "#fff", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i === 0 ? "A" : i === puntos.length - 1 ? "B" : i}</div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.text, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nombre.split(",").slice(0, 2).join(",")}</div>
              <span style={{ fontSize: 10, color: T.muted }}>{abierto ? "▲" : "▼"}</span>
              {i > 0 && i < puntos.length - 1 && <>
                <button onClick={(e) => { e.stopPropagation(); mover(i, -1); }} style={{ background: "none", border: "none", color: T.sub, cursor: "pointer", padding: 3 }}><Ico n="subir" s={15} /></button>
                <button onClick={(e) => { e.stopPropagation(); mover(i, 1); }} style={{ background: "none", border: "none", color: T.sub, cursor: "pointer", padding: 3 }}><Ico n="bajar" s={15} /></button>
              </>}
              {puntos.length > 2 || i > 0 ? <button onClick={(e) => { e.stopPropagation(); sacar(i); }} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", padding: 3 }}><Ico n="tacho" s={15} /></button> : null}
            </div>
            {abierto && <div style={{ padding: "0 12px 12px" }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: T.text, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}><Ico n="cama" s={12} /> Dormir en {p.nombre.split(",")[0]}</div>
              <HospedajeLinks lugar={p.nombre.split(",").slice(0, 2).join(",")} f={(fechasParada(viaje))[p.nombre] || null} />
            </div>}
          </div>); })}
          <div style={{ marginTop: 10 }}>
            <BuscarLugar placeholder={puntos.length === 0 ? "¿De dónde salís? (ej: Buenos Aires)" : puntos.length === 1 ? "¿A dónde vas? (ej: Salta)" : "Agregar otra parada…"}
              onElegir={(r) => setPuntos(puntos.length < 2 ? [...puntos, r] : [...puntos.slice(0, -1), r, puntos[puntos.length - 1]])} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <Mapa puntos={puntos} linea={ruta?.linea} sugerencias={sugerencias} onAgregarSug={agregarSugerencia} />
        </div>
        {calc && <div style={{ fontSize: 12, color: T.sub, marginTop: 8, textAlign: "center" }}>Calculando la ruta…</div>}
        {err && <div style={{ fontSize: 12, color: T.danger, marginTop: 8, textAlign: "center" }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={sugerirConIA} disabled={sugiriendo} style={{ flex: 1, background: sugiriendo ? T.card2 : T.accent, border: "none", color: sugiriendo ? T.sub : "#1a1205", borderRadius: T.rsm, padding: "13px 8px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}><Ico n="estrella" s={15} /> {sugiriendo ? "Buscando joyitas…" : "¿Qué hay lindo para ver?"}</button>
          <button onClick={abrirGoogleMaps} disabled={puntos.length < 2} style={{ flex: 1, background: T.card, border: `1px solid ${T.border}`, color: T.text, borderRadius: T.rsm, padding: "13px 8px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}><Ico n="gmaps" s={15} c={T.accent2} /> Navegar con Maps</button>
        </div>
        {puntos.length >= 2 && <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rsm, padding: "11px 12px" }}>
          <Ico n="auto" s={18} c={T.text} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: T.sub, lineHeight: 1.45 }}><b style={{ color: T.text }}>Verlo en el auto:</b> mandá el viaje al navegador y enchufá el teléfono — aparece en CarPlay / Android Auto con todas las paradas.</div>
          <button onClick={abrirAppleMaps} style={{ background: T.card2, border: `1px solid ${T.border}`, color: T.text, borderRadius: 9, padding: "9px 11px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}> Apple Maps</button>
        </div>}
        {(viaje.itinerario || []).length > 0 && <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 9 }}>El plan, pensado para ustedes</div>
          {(() => { const fp = fechasParada(viaje); return viaje.itinerario.map((it, i) => { const f = fp[it.nombre]; return (<div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.rsm, padding: "11px 12px", marginBottom: 7 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.accent, flexShrink: 0, paddingTop: 1 }}>{it.noches ? `${it.noches} noche${it.noches > 1 ? "s" : ""}` : "paso"}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{it.nombre}{f && <span style={{ color: T.sub, fontWeight: 600, fontSize: 11.5 }}>  {fFecha(f.in)} → {fFecha(f.out)}</span>}</div>
                {it.por_que && <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5, marginTop: 2 }}>{it.por_que}</div>}
              </div>
            </div>
            {(it.noches > 0 || !viaje.itinerario.some(x => x.noches > 0)) && <HospedajeLinks lugar={it.nombre} f={f} />}
          </div>); }); })()}
        </div>}
        {sugerencias.length > 0 && <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 9, display: "flex", alignItems: "center", gap: 6 }}><Ico n="estrella" s={13} /> Joyitas en el camino ({sugerencias.length})</div>
          {sugerencias.map(sg => (<div key={sg.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.accent}`, borderRadius: T.rsm, padding: "11px 12px", marginBottom: 7 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text }}>{sg.nombre}</div>
                <div style={{ fontSize: 11, color: T.sub, marginTop: 1 }}>{[sg.localidad, sg.provincia_o_region].filter(Boolean).join(", ")}{sg.desvio_km ? ` · desvío ${sg.desvio_km} km` : " · sobre la ruta"}</div>
                <div style={{ fontSize: 12, color: T.sub, marginTop: 5, lineHeight: 1.5 }}>{sg.desc}</div>
              </div>
              <button onClick={() => agregarSugerencia(sg)} style={{ background: T.accent, border: "none", color: "#1a1205", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>＋ Sumar</button>
            </div>
          </div>))}
        </div>}
      </>}

      {tab === "clima" && <ClimaTab viaje={viaje} onResumen={setClimaResumen} />}
      {tab === "reservas" && <ReservasTab viaje={viaje} actualizar={actualizar} media={media} cfg={cfg} />}
      {tab === "lugar" && <DelLugarTab viaje={viaje} perfil={perfil} actualizar={actualizar} />}
      {tab === "gastos" && <GastosTab viaje={viaje} actualizar={actualizar} />}
      {tab === "valija" && <ValijaTab viaje={viaje} perfil={perfil} climaResumen={climaResumen} actualizar={actualizar} />}
      {tab === "bitacora" && <Bitacora viaje={viaje} actualizar={actualizar} media={media} recargarMedia={recargarMedia} />}
      {tab === "clip" && <ClipMaker viaje={viaje} media={media} />}
    </div>

    <button onClick={() => setChatAbierto(true)} style={{ position: "fixed", right: 18, bottom: "max(18px, env(safe-area-inset-bottom))", width: 58, height: 58, borderRadius: "50%", background: T.accent, border: "none", boxShadow: "0 6px 20px rgba(232,163,61,.4)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}><Ico n="chat" s={26} c="#1a1205" /></button>

    {chatAbierto && <div style={{ position: "fixed", inset: 0, zIndex: 100, background: T.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 16px", paddingTop: "max(14px, env(safe-area-inset-top))", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${T.border}` }}>
        <button onClick={() => setChatAbierto(false)} style={{ background: "none", border: "none", color: T.text, cursor: "pointer", padding: 4 }}><Ico n="volver" s={22} /></button>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>Copiloto</div>
          <div style={{ fontSize: 10.5, color: T.sub }}>Rutas alternativas, qué ver, dónde comer</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {chatMsgs.length === 0 && <div style={{ color: T.muted, fontSize: 13, lineHeight: 1.7, padding: "20px 6px" }}>Preguntas que le podés hacer:<br />· "¿Hay una ruta alternativa más linda aunque sea más larga?"<br />· "¿Dónde conviene parar a dormir a mitad de camino?"<br />· "¿Qué comida típica no me puedo perder?"</div>}
        {chatMsgs.map((m, i) => (<div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
          <div style={{ maxWidth: "85%", background: m.role === "user" ? T.accent : T.card, color: m.role === "user" ? "#1a1205" : T.text, borderRadius: 14, padding: "11px 14px", fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{m.content}</div>
        </div>))}
        {chatBusy && <div style={{ color: T.sub, fontSize: 12.5 }}>Pensando…</div>}
        <div ref={chatEndRef} />
      </div>
      <div style={{ padding: "10px 14px", paddingBottom: "max(12px, env(safe-area-inset-bottom))", borderTop: `1px solid ${T.border}` }}>
        {dictadoC.escuchando && <div style={{ fontSize: 11.5, color: "#DC2626", fontWeight: 800, textAlign: "center", marginBottom: 7 }}>◉ Escuchando… quedate {PAUSA_VOZ / 1000} segundos en silencio y lo mando</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <BotonMic escuchando={dictadoC.escuchando} onClick={dictadoC.toggle} />
          <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && enviarChat()} placeholder="Hablá o escribí…" style={{ flex: 1, background: T.card2, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 14, color: T.text, outline: "none", minWidth: 0 }} />
          <button onClick={enviarChat} disabled={chatBusy} style={{ background: T.accent, border: "none", color: "#1a1205", borderRadius: 12, padding: "0 16px", fontWeight: 800, cursor: "pointer" }}><Ico n="flecha" s={17} /></button>
        </div>
      </div>
    </div>}
  </div>);
}

/* La tarjeta de cada viaje respira: pasa las fotos de ESE viaje en un
   fundido suave. Abrís la app y los recuerdos te salen a buscar. */
function CardViaje({ v, onAbrir, onBorrar }) {
  const [fotos, setFotos] = useState([]);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    let urls = [];
    mediaListar(v.id).then(ms => {
      urls = ms.filter(m => m.tipo === "foto").slice(0, 8).map(m => URL.createObjectURL(m.blob));
      setFotos(urls);
    }).catch(() => { });
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [v.id]);
  useEffect(() => {
    if (fotos.length < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % fotos.length), 3500);
    return () => clearInterval(t);
  }, [fotos.length]);
  const o = v.puntos?.[0]?.nombre?.split(",")[0]; const d = v.puntos?.length > 1 ? v.puntos[v.puntos.length - 1].nombre.split(",")[0] : null;
  const nEnt = (v.bitacora || []).length;
  return (<div onClick={onAbrir} style={{ position: "relative", borderRadius: T.r, overflow: "hidden", border: `1px solid ${T.border}`, marginBottom: 11, cursor: "pointer", minHeight: fotos.length ? 150 : 76, background: T.card }}>
    {fotos.map((u, i) => <div key={i} style={{ position: "absolute", inset: 0, backgroundImage: `url(${u})`, backgroundSize: "cover", backgroundPosition: "center", opacity: i === idx ? 1 : 0, transition: "opacity 1.4s ease" }} />)}
    {fotos.length > 0 && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(rgba(14,17,22,.1) 30%, rgba(14,17,22,.85))" }} />}
    <div style={{ position: "relative", padding: "15px 16px", display: "flex", alignItems: "flex-end", minHeight: fotos.length ? 150 : 76, boxSizing: "border-box" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", textShadow: fotos.length ? "0 1px 6px rgba(0,0,0,.6)" : "none" }}>{v.nombre}</div>
        <div style={{ fontSize: 11.5, color: fotos.length ? "rgba(255,255,255,.85)" : T.sub, marginTop: 2, textShadow: fotos.length ? "0 1px 4px rgba(0,0,0,.6)" : "none" }}>{v.vivido ? "Viaje vivido" : (o && d ? `${o} → ${d}` : o ? `Desde ${o}` : "Sin recorrido aún")}{v.fechaInicio ? ` · ${v.vivido ? fFecha(v.fechaInicio) : "sale " + fFecha(v.fechaInicio)}` : ""}{nEnt ? ` · ${nEnt} recuerdo${nEnt > 1 ? "s" : ""}` : ""}</div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onBorrar(); }} style={{ background: "rgba(0,0,0,.35)", border: "none", color: "rgba(255,255,255,.8)", borderRadius: 9, cursor: "pointer", padding: "7px 8px" }}><Ico n="tacho" s={15} /></button>
    </div>
  </div>);
}

/* ═══ COPILOTO DE IDEAS: ¿a dónde vamos la próxima? ══════════════
   El chat de la portada: sin destino, sin viaje creado. "Tengo 4 días,
   ¿a dónde me recomendás?" — y contesta conociendo su estilo y los
   viajes que ya hicieron. La charla donde nace el próximo viaje. */
function BuscarLugarConGPS({ onElegir }) {
  const [buscando, setBuscando] = useState(false);
  async function usarGPS() {
    setBuscando(true);
    try { onElegir(await dondeEstoy()); } catch (e) { alert(e.message); }
    setBuscando(false);
  }
  return (<div>
    <button onClick={usarGPS} disabled={buscando} style={{ width: "100%", background: T.card2, border: `1px solid ${T.border}`, color: T.text, borderRadius: 10, padding: "11px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}><Ico n="pin" s={13} c={T.accent} /> {buscando ? "Buscando…" : "Usar mi ubicación actual"}</button>
    <BuscarLugar placeholder="O buscá la dirección…" onElegir={onElegir} />
  </div>);
}

function ChatIdeas({ cfg, viajes, onCrearViaje }) {
  const [abierto, setAbierto] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [armando, setArmando] = useState(false);

  // El puente real: toma la charla (el destino que eligieron, cuántos días,
  // desde dónde) y arma el viaje COMPLETO — mismo itinerario con hospedaje
  // y todo que arma el planificador — sin que tengan que retipear nada.
  async function armarViajeDeLaCharla() {
    if (msgs.length < 2) { alert("Contame primero a dónde quieren ir, y elegí una opción."); return; }
    setArmando(true);
    try {
      const sysExtraer = "Analizás una charla sobre planificar un viaje. Respondés SOLO JSON, sin texto ni markdown.";
      const promptExtraer = `Leé esta charla y decime si ya eligieron un destino concreto para viajar (no una lista de opciones — UNO elegido), desde dónde salen, y cuántos días tienen.\n\nCHARLA:\n${msgs.map(m => `${m.role === "user" ? "Usuario" : "Copiloto"}: ${m.content}`).join("\n")}\n\nRespondé SOLO este JSON:\n{"elegido":true,"destino":"lugar concreto","desde":"ciudad de origen si se menciona, si no poné \"\"","dias":0}\nSi todavía no hay UN destino claro (siguen viendo opciones), poné "elegido":false.`;
      const respExtraer = await llamarIA([{ role: "user", content: promptExtraer }], sysExtraer, 400);
      const mE = respExtraer.match(/\{[\s\S]*\}/);
      const datos = mE ? JSON.parse(mE[0]) : null;
      if (!datos || !datos.elegido || !datos.destino) { alert("Todavía no veo un destino elegido en la charla — decime cuál les gustó y lo armo."); setArmando(false); return; }

      const perfil = perfilTexto(cfg);
      const destino = datos.destino, desde = datos.desde || cfg?.casa?.nombre || "Buenos Aires, Argentina", dias = datos.dias || 7;
      const sys = "Sos un planificador de viajes de primer nivel, con conocimiento profundo del mundo. Respondés SOLO con JSON válido, sin texto adicional ni markdown.";
      const prompt = `${perfil ? `ASÍ VIAJA ESTA GENTE (armá el itinerario exactamente para ellos): ${perfil}\n\n` : ""}Quieren viajar a: ${destino}\nSalen desde: ${desde}\nDías disponibles: ${dias}\n\nANTES de armar nada, pensá: ¿qué es lo que hace FAMOSO a este destino — lo principal, lo que nadie que va ahí se puede perder? Ejemplos de cómo pensarlo: Egipto → las pirámides de Giza y el Nilo. Mendoza → la Ruta del Vino y las bodegas. Santiago de Compostela → el Camino de Santiago. Cusco → Machu Picchu y el Camino Inca. Orlando → los parques Disney. Alemania, según la ciudad → historia (Berlín: el Muro; Múnich: la Oktoberfest). Si esa atracción central es EN SÍ un recorrido de varios días (un camino de peregrinación, una ruta del vino, la Ruta 40), las paradas del itinerario tienen que ser LAS ETAPAS de ese recorrido — pueblos y tramos en orden — no una ciudad genérica con noches sueltas. Si es un sitio puntual (pirámides, un parque, una torre), asegurate de que al menos una parada esté dedicada explícitamente a eso, con el "por_que" explicando por qué es lo imperdible. Armá el MEJOR itinerario posible para ellos: el orden de lugares, cuántas noches en cada uno, y por qué cada lugar es para ELLOS. Si aman manejar, roadtrip con rutas lindas; si no, ciudades base y traslados cómodos. Si el destino requiere avión desde el origen, la primera parada es la ciudad de llegada.\n\nRespondé SOLO este JSON:\n{"nombre_viaje":"...","atraccion_principal":"1 frase: lo imperdible de este viaje y por qué armamos el recorrido así","paradas":[{"nombre":"Ciudad o lugar","pais_o_provincia":"...","noches":2,"por_que":"1 frase pensada para ellos, conectada con lo imperdible del lugar","lat":-00.0000,"lon":-00.0000}]}`;
      const resp = await llamarIA([{ role: "user", content: prompt }], sys, 3000);
      const m = resp.match(/\{[\s\S]*\}/);
      const plan = m ? JSON.parse(m[0]) : null;
      if (!plan || !plan.paradas?.length) throw new Error("La IA no devolvió un itinerario válido. Probá de nuevo.");
      const ps = plan.paradas.filter(p => p.lat && p.lon).map(p => ({ nombre: `${p.nombre}, ${p.pais_o_provincia || ""}`.replace(/, $/, ""), lat: p.lat, lon: p.lon }));
      const v = {
        id: uid(), nombre: plan.nombre_viaje || destino, creado: Date.now(), modoViaje: "auto",
        puntos: ps, sugerencias: [], bitacora: [], fechaInicio: "", diasVacaciones: String(dias),
        itinerario: plan.paradas.map(p => ({ nombre: p.nombre, noches: p.noches, por_que: p.por_que })),
        atraccionPrincipal: plan.atraccion_principal || "",
      };
      onCrearViaje(v);
      setAbierto(false);
    } catch (e) { alert(e.message || "No pude armar el viaje. Probá de nuevo."); }
    setArmando(false);
  }

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const porVozRef = useRef(false);
  const inputRef2 = useRef(""); inputRef2.current = input;
  const dictado = usarDictado({ setTexto: setInput, onEnviar: () => { porVozRef.current = true; enviarRefI.current && enviarRefI.current(); } });
  const enviarRefI = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const SUGERIDAS = ["Tengo 4 días, ¿a dónde me recomendás?", "Escapada en auto, ¿qué hay lindo cerca?", "¿A dónde conviene ir en esta época?", "Sorprendeme con un destino"];

  async function enviar(texto) {
    const t = (texto ?? inputRef2.current).trim(); if (!t || busy) return;
    setInput("");
    const nuevos = [...msgs, { role: "user", content: t }];
    setMsgs(nuevos); setBusy(true);
    try {
      const perfil = perfilTexto(cfg);
      const hechos = (viajes || []).map(v2 => { const o = v2.puntos?.[0]?.nombre?.split(",")[0]; const d = v2.puntos?.length > 1 ? v2.puntos[v2.puntos.length - 1].nombre.split(",")[0] : null; return d ? `${v2.nombre} (${o} → ${d})` : v2.nombre; }).join("; ");
      const hoy = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
      const sys = `Sos el copiloto de ideas de la app Mis Viajes: un amigo viajado que ayuda a elegir el PRÓXIMO destino. Hoy es ${hoy} (tené en cuenta la estación y la época del año). Contestás en voseo, cálido y concreto.${perfil ? ` Así viaja esta gente (planificá SIEMPRE para ellos): ${perfil}.` : ""}${cfg?.casa ? ` Salen siempre desde: ${cfg.casa.nombre} (es de dónde parte cualquier viaje que armes — NUNCA preguntes de dónde salen, ya lo sabés).` : ""}${hechos ? ` Viajes que ya tienen en la app (evitá repetirlos salvo que pidan volver): ${hechos}.` : ""} Cuando recomiendes destinos: da 2 o 3 opciones concretas con el porqué pensado para ellos (qué comer, qué ver, cuántos km o cómo llegar). Si falta un dato clave (días, época — nunca el origen si ya lo sabés), preguntalo corto. Cuando ya hayan elegido UN destino concreto (no antes), decíselos: que toquen el botón "Armar este viaje ahora" acá abajo y arma todo solo, con hospedaje incluido.`;
      const resp = await llamarIA(nuevos.slice(-12), sys, 1600);
      setMsgs(prev => [...prev, { role: "assistant", content: resp }]);
      if (porVozRef.current) { porVozRef.current = false; hablarTexto(resp); }
    } catch { setMsgs(prev => [...prev, { role: "assistant", content: "Uy, no pude responder (¿hay internet?). Probá de nuevo." }]); }
    setBusy(false);
  }
  enviarRefI.current = enviar;

  return (<>
    {/* la tarjeta-invitación en la portada */}
    <div onClick={() => setAbierto(true)} style={{ background: "linear-gradient(135deg, rgba(232,163,61,.14), rgba(77,163,255,.08))", border: `1px solid ${T.accent}`, borderRadius: T.r, padding: "14px 16px", marginBottom: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}><Ico n="brujula" s={24} c={T.accent} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: T.text }}>¿A dónde vamos la próxima?</div>
        <div style={{ fontSize: 11.5, color: T.sub, marginTop: 2, lineHeight: 1.45 }}>Preguntale al copiloto sin cargar nada: "tengo 4 días, ¿qué me recomendás?"</div>
      </div>
      <Ico n="chat" s={20} c={T.accent} />
    </div>

    {abierto && <div style={{ position: "fixed", inset: 0, zIndex: 150, background: T.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 16px", paddingTop: "max(14px, env(safe-area-inset-top))", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${T.border}` }}>
        <button onClick={() => setAbierto(false)} style={{ background: "none", border: "none", color: T.text, cursor: "pointer", padding: 4 }}><Ico n="volver" s={22} /></button>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text, display: "flex", alignItems: "center", gap: 7 }}><Ico n="brujula" s={17} c={T.accent} /> ¿A dónde vamos?</div>
          <div style={{ fontSize: 10.5, color: T.sub }}>El copiloto ya sabe cómo viajan y qué viajes hicieron</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {msgs.length === 0 && <div>
          <div style={{ color: T.sub, fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>Todavía no hace falta saber el destino — para eso estoy. Tocá una pregunta o escribí la tuya:</div>
          {SUGERIDAS.map((q, i) => <button key={i} onClick={() => enviar(q)} style={{ display: "block", width: "100%", textAlign: "left", background: T.card, border: `1px solid ${T.border}`, color: T.text, borderRadius: 12, padding: "13px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 8 }}>{q}</button>)}
        </div>}
        {msgs.map((m, i) => (<div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
          <div style={{ maxWidth: "85%", background: m.role === "user" ? T.accent : T.card, color: m.role === "user" ? "#1a1205" : T.text, borderRadius: 14, padding: "11px 14px", fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{m.content}</div>
        </div>))}
        {busy && <div style={{ color: T.sub, fontSize: 12.5 }}>Pensando destinos…</div>}
        <div ref={endRef} />
      </div>
      <div style={{ padding: "10px 14px", paddingBottom: "max(12px, env(safe-area-inset-bottom))", borderTop: `1px solid ${T.border}` }}>
        {msgs.length >= 2 && <button onClick={armarViajeDeLaCharla} disabled={armando} style={{ width: "100%", background: armando ? T.card2 : T.accent, border: "none", color: armando ? T.sub : "#1a1205", borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 800, cursor: "pointer", marginBottom: 9, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}><Ico n="varita" s={14} /> {armando ? "Armando el viaje, con hospedaje y todo…" : "Armar este viaje ahora"}</button>}
        {dictado.escuchando && <div style={{ fontSize: 11.5, color: "#DC2626", fontWeight: 800, textAlign: "center", marginBottom: 7 }}>◉ Escuchando… quedate {PAUSA_VOZ / 1000} segundos en silencio y lo mando</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <BotonMic escuchando={dictado.escuchando} onClick={dictado.toggle} />
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && enviar()} placeholder="Hablá o escribí: ¿a dónde vamos…?"
            style={{ flex: 1, background: T.card2, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 14, color: T.text, outline: "none", minWidth: 0 }} />
          <button onClick={() => enviar()} disabled={busy} style={{ background: T.accent, border: "none", color: "#1a1205", borderRadius: 12, padding: "0 16px", fontWeight: 800, cursor: "pointer" }}><Ico n="flecha" s={17} /></button>
        </div>
      </div>
    </div>}
  </>);
}

/* ═══ VIAJE YA VIVIDO: cargar de una las fotos de un viaje pasado ═══ */
function NuevoVivido({ onCrear, cerrar }) {
  const [nombre, setNombre] = useState("");
  const [etapas, setEtapas] = useState([{ id: uid(), lugarTxt: "", lugarSel: null, fecha: hoyISO(), archivos: [], resLugar: [], buscando: false, detectando: false }]);
  const [subiendo, setSubiendo] = useState(false);
  const [prog, setProg] = useState(0);
  const fileRefs = useRef({});

  const setEtapa = (id, patch) => setEtapas(prev => prev.map(e => e.id === id ? { ...e, ...(typeof patch === "function" ? patch(e) : patch) } : e));

  function agregarEtapa() {
    setEtapas(prev => {
      const ultima = prev[prev.length - 1];
      const sig = ultima?.fecha ? new Date(ultima.fecha + "T12:00:00") : new Date();
      if (ultima?.fecha) sig.setDate(sig.getDate() + 1);
      return [...prev, { id: uid(), lugarTxt: "", lugarSel: null, fecha: sig.toISOString().slice(0, 10), archivos: [], resLugar: [], buscando: false, detectando: false }];
    });
  }
  function quitarEtapa(id) { setEtapas(prev => prev.length > 1 ? prev.filter(e => e.id !== id) : prev); }
  function moverEtapa(id, dir) {
    setEtapas(prev => { const i = prev.findIndex(e => e.id === id); const j = i + dir; if (j < 0 || j >= prev.length) return prev; const arr = [...prev]; [arr[i], arr[j]] = [arr[j], arr[i]]; return arr; });
  }
  async function buscarLugarEtapa(id, txt) {
    if (!txt.trim()) return;
    setEtapa(id, { buscando: true });
    try { const r = await geocodificar(txt); setEtapa(id, { resLugar: r, buscando: false }); } catch { setEtapa(id, { resLugar: [], buscando: false }); }
  }
  async function elegirArchivosEtapa(id, files) {
    setEtapa(id, e => ({ archivos: [...e.archivos, ...files] }));
    const et = etapas.find(e => e.id === id);
    if (et && !et.lugarSel) {
      setEtapa(id, { detectando: true });
      for (const f of files) { const l = await lugarDesdeFoto(f); if (l) { setEtapa(id, { lugarSel: { ...l, detectado: true }, detectando: false }); return; } }
      setEtapa(id, { detectando: false });
    }
  }

  async function crear() {
    if (!nombre.trim()) { alert("Ponele un nombre al viaje."); return; }
    const totalArchivos = etapas.reduce((s2, e) => s2 + e.archivos.length, 0);
    if (!totalArchivos) { alert("Elegí al menos una foto o video en alguna etapa."); return; }
    setSubiendo(true); setProg(0);
    const viajeId = uid();
    let hechasGlobal = 0;
    const errores = [];
    const bitacora = [];
    const puntos = [];
    for (const et of etapas) {
      const pesadas = et.archivos.filter(f => f.size > 150 * 1024 * 1024);
      const buenas = et.archivos.filter(f => f.size <= 150 * 1024 * 1024);
      pesadas.forEach(f => errores.push(`${f.name}: pesa más de 150 MB`));
      const resultados = await procesarEnParalelo(buenas, async (f) => {
        const esVideo = f.type.startsWith("video");
        const blob = esVideo ? f : await comprimirFoto(f);
        const id = uid();
        await mediaGuardar({ id, viajeId, tipo: esVideo ? "video" : "foto", blob, nombre: f.name, ts: Date.now() });
        return id;
      }, 4, (hechas) => { setProg(Math.round(((hechasGlobal + hechas) / totalArchivos) * 100)); });
      hechasGlobal += buenas.length;
      const mediaIds = resultados.filter(r => r.ok).map(r => r.valor);
      resultados.filter(r => !r.ok).forEach(r => errores.push(`no se pudo guardar (${r.error && r.error.message || r.error || "espacio lleno o bloqueado"})`));
      if (mediaIds.length > 0 || et.lugarSel) bitacora.push({ id: uid(), fecha: et.fecha || hoyISO(), texto: "", mediaIds, lugar: et.lugarSel ? { nombre: et.lugarSel.nombre.split(",").slice(0, 2).join(","), lat: et.lugarSel.lat, lon: et.lugarSel.lon } : null });
      if (et.lugarSel) puntos.push({ nombre: et.lugarSel.nombre, lat: et.lugarSel.lat, lon: et.lugarSel.lon });
    }
    const totalGuardadas = bitacora.reduce((s2, b) => s2 + b.mediaIds.length, 0);
    if (totalGuardadas === 0) {
      setSubiendo(false);
      alert(`No pude guardar ninguna foto/video.\n\n${errores.slice(0, 4).join("\n")}${errores.length > 4 ? `\n… y ${errores.length - 4} más` : ""}\n\nProbá con menos archivos por vez, o revisá que el teléfono tenga espacio libre.`);
      return;
    }
    if (errores.length > 0) alert(`Se guardaron ${totalGuardadas} de ${totalArchivos}. No se pudieron guardar:\n${errores.slice(0, 4).join("\n")}`);
    const fechaInicio = etapas[0]?.fecha || hoyISO();
    const diasVac = etapas.length > 1 ? String(Math.max(1, diasEntre(fechaInicio, etapas[etapas.length - 1].fecha || fechaInicio) + 1)) : "";
    const viaje = { id: viajeId, nombre: nombre.trim(), creado: Date.now(), vivido: true, puntos, sugerencias: [], bitacora, fechaInicio, diasVacaciones: diasVac };
    onCrear(viaje);
    setSubiendo(false);
  }

  return (<div style={{ position: "fixed", inset: 0, zIndex: 200, background: T.bg, overflowY: "auto" }}>
    <div style={{ padding: "14px 16px", paddingTop: "max(14px, env(safe-area-inset-top))", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${T.border}` }}>
      <button onClick={cerrar} style={{ background: "none", border: "none", color: T.text, cursor: "pointer", padding: 4 }}><Ico n="volver" s={22} /></button>
      <div style={{ fontSize: 16, fontWeight: 800, color: T.text, display: "flex", alignItems: "center", gap: 8 }}><Ico n="cam" s={18} c={T.text} /> Un viaje ya vivido</div>
    </div>
    <div style={{ padding: 18, paddingBottom: 60 }}>
      <div style={{ fontSize: 12.5, color: T.sub, lineHeight: 1.6, marginBottom: 18 }}>Para los viajes de antes de la app: contá el recorrido que hicieron, etapa por etapa — Buenos Aires → Mendoza → San Martín de los Andes — con las fotos de cada lugar. Queda guardado como si lo hubieran cargado en el momento.</div>

      <div style={{ fontSize: 11, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>¿Qué viaje fue?</div>
      <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Cruce de cordillera con los chicos"
        style={{ width: "100%", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 14, color: T.text, outline: "none", boxSizing: "border-box", marginBottom: 20 }} />

      {etapas.map((et, i) => (<div key={et.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, padding: 15, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: i === 0 ? T.ok : i === etapas.length - 1 && etapas.length > 1 ? T.danger : T.accent2, color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i === 0 ? "A" : i === etapas.length - 1 && etapas.length > 1 ? "B" : i}</div>
          <div style={{ flex: 1, fontSize: 12.5, fontWeight: 800, color: T.text }}>{et.lugarSel ? et.lugarSel.nombre.split(",").slice(0, 2).join(",") : `Etapa ${i + 1}`}</div>
          {i > 0 && <button onClick={() => moverEtapa(et.id, -1)} style={{ background: "none", border: "none", color: T.sub, cursor: "pointer", padding: 3 }}><Ico n="subir" s={14} /></button>}
          {i < etapas.length - 1 && <button onClick={() => moverEtapa(et.id, 1)} style={{ background: "none", border: "none", color: T.sub, cursor: "pointer", padding: 3 }}><Ico n="bajar" s={14} /></button>}
          {etapas.length > 1 && <button onClick={() => quitarEtapa(et.id)} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", padding: 3 }}><Ico n="tacho" s={14} /></button>}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: T.sub, marginBottom: 3 }}>¿Dónde?</div>
            {et.lugarSel ? <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(232,163,61,.1)", border: `1px solid ${T.accent}`, borderRadius: 9, padding: "9px 10px" }}>
              <Ico n="pin" s={13} c={T.accent} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: T.text, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{et.lugarSel.nombre.split(",").slice(0, 2).join(",")}</div>
                {et.lugarSel.detectado && <div style={{ fontSize: 9.5, color: T.accent }}>De la foto ✓</div>}
              </div>
              <button onClick={() => setEtapa(et.id, { lugarSel: null })} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer" }}><Ico n="cerrar" s={11} /></button>
            </div> : <div>
              <div style={{ display: "flex", gap: 5 }}>
                <input value={et.lugarTxt} onChange={e => setEtapa(et.id, { lugarTxt: e.target.value })} onKeyDown={e => e.key === "Enter" && buscarLugarEtapa(et.id, et.lugarTxt)} placeholder="Mendoza"
                  style={{ flex: 1, minWidth: 0, background: T.card2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "9px 10px", fontSize: 12.5, color: T.text, outline: "none" }} />
                <button onClick={() => buscarLugarEtapa(et.id, et.lugarTxt)} disabled={et.buscando} style={{ background: T.card2, border: `1px solid ${T.border}`, color: T.accent, borderRadius: 9, padding: "0 11px", cursor: "pointer", fontSize: 11.5 }}>{et.buscando ? "…" : "Buscar"}</button>
              </div>
              {et.resLugar.length > 0 && <div style={{ marginTop: 5, background: T.card2, border: `1px solid ${T.border}`, borderRadius: 9, overflow: "hidden" }}>
                {et.resLugar.map((r, ri) => <div key={ri} onClick={() => setEtapa(et.id, { lugarSel: r, resLugar: [], lugarTxt: "" })} style={{ padding: "8px 10px", fontSize: 11.5, color: T.text, cursor: "pointer", borderTop: ri ? `1px solid ${T.border}` : "none" }}>{r.nombre}</div>)}
              </div>}
              {et.detectando && <div style={{ fontSize: 10.5, color: T.sub, marginTop: 5, display: "flex", alignItems: "center", gap: 5 }}><Ico n="pin" s={11} /> Buscando la ubicación en la foto…</div>}
            </div>}
          </div>
          <div style={{ width: 118 }}>
            <div style={{ fontSize: 10, color: T.sub, marginBottom: 3 }}>¿Cuándo?</div>
            <input type="date" value={et.fecha} max={hoyISO()} onChange={e => setEtapa(et.id, { fecha: e.target.value })}
              style={{ width: "100%", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "9px 8px", fontSize: 12, color: T.text, outline: "none", colorScheme: "dark", boxSizing: "border-box" }} />
          </div>
        </div>

        <button onClick={() => fileRefs.current[et.id]?.click()} style={{ width: "100%", background: T.card2, border: `1.5px dashed ${T.border}`, color: T.text, borderRadius: 10, padding: "12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}><Ico n="cam" s={15} c={T.accent} /> {et.archivos.length ? `${et.archivos.length} elegidas — agregar más` : "Fotos y videos de acá"}</button>
        <input ref={r => fileRefs.current[et.id] = r} type="file" accept="image/*,video/*" multiple onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ""; elegirArchivosEtapa(et.id, files); }} style={{ display: "none" }} />
        {et.archivos.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
          {et.archivos.map((f, fi) => (<div key={fi} style={{ position: "relative", width: 60, height: 60, borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}`, background: T.card2 }}>
            {f.type.startsWith("video") ? <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Ico n="peli" s={16} c={T.sub} /></div> : <img src={URL.createObjectURL(f)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            <button onClick={() => setEtapa(et.id, e2 => ({ archivos: e2.archivos.filter((_, j) => j !== fi) }))} style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,.55)", border: "none", color: "#fff", borderRadius: "50%", width: 17, height: 17, fontSize: 10, cursor: "pointer" }}><Ico n="cerrar" s={11} c="#fff" /></button>
          </div>))}
        </div>}
      </div>))}

      <button onClick={agregarEtapa} style={{ width: "100%", background: "none", border: `1.5px dashed ${T.accent}`, color: T.accent, borderRadius: T.r, padding: "13px", fontSize: 13, fontWeight: 800, cursor: "pointer", marginBottom: 20 }}><Ico n="mas" s={15} /> Agregar otra etapa del recorrido</button>

      <button onClick={crear} disabled={subiendo} style={{ width: "100%", background: subiendo ? T.card2 : T.accent, border: "none", color: subiendo ? T.sub : "#1a1205", borderRadius: T.rsm, padding: "15px", fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>{subiendo ? `Guardando el viaje… ${prog}%` : "✓ Guardar como viaje vivido"}</button>
    </div>
  </div>);
}

/* ═══ APP: LISTA DE VIAJES ═══════════════════════════════════════ */
/* Pantalla de entrada: sin mail, sin contraseña. Un código que cada
   quien elige (o le pasan) separa los espacios. Si el código ya existe
   en ESTE teléfono, entra directo; si es nuevo, pide un nombre y lo crea. */
/* La bienvenida: se muestra UNA vez, apenas se crea un código nuevo.
   Mismos campos que "Mi estilo de viaje" en Ajustes — nada nuevo que
   aprender, solo que ahora aparece antes de arrancar, no escondido. */
function Bienvenida({ nombre, onListo }) {
  const [cfgLocal, setCfgLocal] = useState({});
  const [notas, setNotas] = useState("");
  const chip = (activo) => ({ background: activo ? "rgba(232,163,61,.15)" : T.card2, border: `1px solid ${activo ? T.accent : T.border}`, color: activo ? T.accent : T.sub, borderRadius: 9, padding: "9px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" });
  const set = (patch) => setCfgLocal(c => ({ ...c, ...patch }));

  function terminar() { onListo({ ...cfgLocal, notas: notas.trim() }); }

  return (<div style={{ minHeight: "100vh", background: T.bg, padding: 22, paddingTop: "max(22px, env(safe-area-inset-top))", paddingBottom: "max(22px, env(safe-area-inset-bottom))" }}>
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>¡Hola, {nombre}! 👋</div>
      <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.55, marginTop: 6 }}>Antes de arrancar, contanos cómo les gusta viajar — cada vez que la IA arme un itinerario o sugiera algo, va a planificar COMO USTEDES. Un minuto y listo.</div>
    </div>

    <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 7 }}>¿Les gusta manejar?</div>
    <div style={{ display: "flex", gap: 7, marginBottom: 18, flexWrap: "wrap" }}>
      {[["ama", "Amamos la ruta"], ["justo", "Lo justo"], ["no", "Preferimos no manejar"]].map(([k, l]) => <button key={k} onClick={() => set({ manejo: k })} style={chip(cfgLocal.manejo === k)}>{l}</button>)}
    </div>
    <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 7 }}>Ritmo</div>
    <div style={{ display: "flex", gap: 7, marginBottom: 18, flexWrap: "wrap" }}>
      {[["relax", "🧉 Relajado"], ["mixto", "Mixto"], ["intenso", "⚡ Ver todo"]].map(([k, l]) => <button key={k} onClick={() => set({ ritmo: k })} style={chip(cfgLocal.ritmo === k)}>{l}</button>)}
    </div>
    <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 7 }}>Presupuesto</div>
    <div style={{ display: "flex", gap: 7, marginBottom: 18, flexWrap: "wrap" }}>
      {[["cuidado", "Cuidado"], ["medio", "Medio"], ["gustos", "Darnos los gustos"]].map(([k, l]) => <button key={k} onClick={() => set({ presupuesto: k })} style={chip(cfgLocal.presupuesto === k)}>{l}</button>)}
    </div>
    <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 7 }}>Lo que nos gusta</div>
    <div style={{ display: "flex", gap: 7, marginBottom: 18, flexWrap: "wrap" }}>
      {INTERESES.map(i => { const on = (cfgLocal.intereses || []).includes(i); return <button key={i} onClick={() => set({ intereses: on ? cfgLocal.intereses.filter(x => x !== i) : [...(cfgLocal.intereses || []), i] })} style={chip(on)}>{i}</button>; })}
    </div>
    <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 7 }}>Viajamos…</div>
    <div style={{ display: "flex", gap: 7, marginBottom: 18, flexWrap: "wrap" }}>
      {["En pareja", "En familia", "Con amigos", "Con mascota", "Solo/a"].map(c2 => <button key={c2} onClick={() => set({ compania: cfgLocal.compania === c2 ? "" : c2 })} style={chip(cfgLocal.compania === c2)}>{c2}</button>)}
    </div>
    <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 7 }}>Algo más que la IA deba saber (opcional)</div>
    <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3} placeholder="Ej: paramos siempre en cabañas, evitamos peajes, viajamos con el perro…"
      style={{ width: "100%", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "11px 13px", fontSize: 13, color: T.text, outline: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 22 }} />

    <button onClick={terminar} style={{ width: "100%", background: T.accent, border: "none", color: "#1a1205", borderRadius: T.rsm, padding: "16px", fontSize: 14.5, fontWeight: 800, cursor: "pointer", marginBottom: 10 }}>✓ Listo, arrancar</button>
    <button onClick={() => onListo({})} style={{ width: "100%", background: "none", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", padding: 8 }}>Saltear por ahora (lo cargo después en Ajustes)</button>
  </div>);
}

function SelectorPerfil({ onEntrar }) {
  const [codigo, setCodigo] = useState("");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState(null);   // {codigo, nombre} de un perfil recién creado -> pasa por Bienvenida
  const conocidos = listarPerfiles();

  if (nuevo) return <Bienvenida nombre={nuevo.nombre} onListo={(cfgNueva) => { guardarCfgLS(cfgNueva); onEntrar(nuevo.codigo); }} />;

  function intentar() {
    const c = limpiarCodigo(codigo);
    if (c.length < 4) { alert("El código tiene que tener al menos 4 caracteres."); return; }
    const existe = conocidos.some(p => p.codigo === c);
    if (existe) { entrarPerfil(c); onEntrar(c); }
    else setCreando(true);
  }
  function confirmarCreacion() {
    const c = limpiarCodigo(codigo);
    if (!nombreNuevo.trim()) { alert("Poné un nombre para este perfil."); return; }
    crearPerfil(c, nombreNuevo);
    entrarPerfil(c);   // ya queda activo, así lo que cargue la Bienvenida se guarda en ESTE perfil
    setNuevo({ codigo: c, nombre: nombreNuevo.trim() });   // perfil nuevo -> pasa por la bienvenida antes de entrar
  }

  return (<div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column", justifyContent: "center", padding: 24 }}>
    <div style={{ textAlign: "center", marginBottom: 30 }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}><Ico n="brujula" s={38} c={T.accent} /></div>
      <div style={{ fontSize: 22, fontWeight: 800, color: T.text }}>Mis Viajes</div>
      <div style={{ fontSize: 12.5, color: T.sub, marginTop: 6, lineHeight: 1.5 }}>Cada código tiene su propio espacio, separado del resto.<br />Sin mail, sin contraseña — el que uses vos.</div>
    </div>

    {!creando ? <>
      <input value={codigo} onChange={e => setCodigo(e.target.value)} onKeyDown={e => e.key === "Enter" && intentar()} placeholder="Tu código (ej: VALEN2026)"
        autoCapitalize="characters" style={{ background: T.card, border: `1.5px solid ${T.border}`, borderRadius: 12, padding: "15px 16px", fontSize: 16, color: T.text, outline: "none", textAlign: "center", fontWeight: 700, letterSpacing: 1, marginBottom: 12 }} />
      <button onClick={intentar} style={{ background: T.accent, border: "none", color: "#1a1205", borderRadius: 12, padding: "15px", fontSize: 14.5, fontWeight: 800, cursor: "pointer", marginBottom: conocidos.length ? 22 : 0 }}>Entrar</button>

      {conocidos.length > 0 && <>
        <div style={{ fontSize: 10.5, color: T.muted, textAlign: "center", marginBottom: 10 }}>Perfiles usados en este teléfono</div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "center" }}>
          {conocidos.map(p => <button key={p.codigo} onClick={() => { entrarPerfil(p.codigo); onEntrar(p.codigo); }} style={{ background: T.card, border: `1px solid ${T.border}`, color: T.text, borderRadius: 20, padding: "9px 15px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{p.nombre}</button>)}
        </div>
      </>}
    </> : <>
      <div style={{ fontSize: 13, color: T.text, textAlign: "center", marginBottom: 14, lineHeight: 1.5 }}>El código <b style={{ color: T.accent }}>{limpiarCodigo(codigo)}</b> es nuevo acá.<br />¿De quién es este perfil?</div>
      <input value={nombreNuevo} onChange={e => setNombreNuevo(e.target.value)} onKeyDown={e => e.key === "Enter" && confirmarCreacion()} placeholder="Tu nombre"
        style={{ background: T.card, border: `1.5px solid ${T.border}`, borderRadius: 12, padding: "14px 16px", fontSize: 15, color: T.text, outline: "none", textAlign: "center", marginBottom: 12 }} />
      <button onClick={confirmarCreacion} style={{ background: T.accent, border: "none", color: "#1a1205", borderRadius: 12, padding: "15px", fontSize: 14.5, fontWeight: 800, cursor: "pointer", marginBottom: 10 }}>Crear mi perfil</button>
      <button onClick={() => setCreando(false)} style={{ background: "none", border: "none", color: T.sub, fontSize: 12.5, cursor: "pointer", padding: 8 }}>← Volver</button>
    </>}
  </div>);
}

export default function MisViajes() {
  const [perfil, setPerfil] = useState(perfilActivo);
  if (!perfil) return <SelectorPerfil onEntrar={setPerfil} />;
  return <MisViajesApp key={perfil} onSalir={() => { salirPerfil(); setPerfil(null); }} />;
}

function MisViajesApp({ onSalir }) {
  const [data, setData] = useState(cargar);
  const [cfg, setCfg] = useState(cargarCfg);
  aplicarTema(cfg.tema);   // el tema se aplica ANTES de dibujar nada
  useEffect(() => { try { document.title = cfg.titulo || "Mis Viajes"; } catch { } }, [cfg.titulo]);
  const [viajeId, setViajeId] = useState(null);
  const [ajustes, setAjustes] = useState(false);
  const [vivido, setVivido] = useState(false);
  const [eligiendoModo, setEligiendoModo] = useState(false);
  const guardar = (d) => { setData(d); guardarLS(d); };
  const guardarCfg = (c) => { setCfg(c); guardarCfgLS(c); };
  // El ícono muestra los días que faltan para el próximo viaje (hasta 60 días antes).
  useEffect(() => {
    const hoy = hoyISO();
    const proximos = (data.viajes || [])
      .filter(v2 => v2.fechaInicio && diasEntre(hoy, v2.fechaInicio) > 0 && diasEntre(hoy, v2.fechaInicio) <= 60)
      .map(v2 => diasEntre(hoy, v2.fechaInicio));
    ponerGlobito(proximos.length ? Math.min(...proximos) : 0);
  }, [data]);

  const viaje = (data.viajes || []).find(v => v.id === viajeId);
  if (viaje) return <Fondo key={cfg.tema || "ruta40"} cfg={cfg}><PantallaViaje viaje={viaje} cfg={cfg}
    actualizar={(v) => guardar({ ...data, viajes: data.viajes.map(x => x.id === v.id ? v : x) })}
    volver={() => setViajeId(null)} /></Fondo>;

  function nuevoViaje(modo) {
    const v = { id: uid(), nombre: "Nuevo viaje", creado: Date.now(), modoViaje: modo, puntos: [], sugerencias: [], bitacora: [], fechaInicio: "", diasVacaciones: "" };
    guardar({ ...data, viajes: [v, ...(data.viajes || [])] });
    setViajeId(v.id);
    setEligiendoModo(false);
  }
  function crearViajeYEntrar(v) {
    guardar({ ...data, viajes: [v, ...(data.viajes || [])] });
    setViajeId(v.id);
  }

  async function borrarViaje(v) {
    if (!confirm(`¿Borrar "${v.nombre}" con su bitácora, fotos y videos?`)) return;
    try { for (const m of await mediaListar(v.id)) await mediaBorrar(m.id); } catch { }
    guardar({ ...data, viajes: data.viajes.filter(x => x.id !== v.id) });
  }

  return (<Fondo key={(cfg.tema || "ruta40") + "_h"} cfg={cfg}><div style={{ minHeight: "100vh" }}>
    {ajustes && <Ajustes cfg={cfg} guardarCfg={guardarCfg} cerrar={() => setAjustes(false)} onSalir={onSalir} />}
    <div style={{ padding: "26px 20px 18px", paddingTop: "max(26px, env(safe-area-inset-top))", display: "flex", alignItems: "flex-start" }}>
      <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: T.accent, textTransform: "uppercase", letterSpacing: ".14em" }}><Ico n="auto" s={14} /> {cfg.lema || "Ruta abierta"}</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: T.text, margin: "6px 0 4px", letterSpacing: "-.02em" }}>{cfg.titulo || "Mis Viajes"}</h1>
      <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.5 }}>Planificá el recorrido, escribí la bitácora, y volvé con el clip del viaje armado.</div>
      </div>
      <button onClick={() => setAjustes(true)} style={{ background: T.card, border: `1px solid ${T.border}`, color: T.sub, borderRadius: 11, padding: "10px 11px", cursor: "pointer" }}><Ico n="tuerca" s={18} /></button>
    </div>
    <div style={{ padding: "0 20px 40px" }}>
      <UpdateBanner seguro />
      <GlobitoPermiso />
      <ChatIdeas cfg={cfg} viajes={data.viajes || []} onCrearViaje={crearViajeYEntrar} />
      {vivido && <NuevoVivido cerrar={() => setVivido(false)} onCrear={(v2) => { guardar({ ...data, viajes: [v2, ...data.viajes] }); setVivido(false); setViajeId(v2.id); }} />}
      {eligiendoModo && <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setEligiendoModo(false)}>
        <div onClick={e => e.stopPropagation()} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, padding: 22, width: "100%", maxWidth: 340 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.text, textAlign: "center", marginBottom: 4 }}>¿Cómo van a viajar?</div>
          <div style={{ fontSize: 12, color: T.sub, textAlign: "center", lineHeight: 1.5, marginBottom: 18 }}>Si es en auto, arrancamos con el mapa y la ruta.<br />Si es en avión, vamos directo a buscar el pasaje.</div>
          <button onClick={() => nuevoViaje("auto")} style={{ width: "100%", background: T.accent, border: "none", color: "#1a1205", borderRadius: T.rsm, padding: "16px", fontSize: 14.5, fontWeight: 800, cursor: "pointer", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Ico n="auto" s={17} /> En auto</button>
          <button onClick={() => nuevoViaje("avion")} style={{ width: "100%", background: T.card2, border: `1px solid ${T.border}`, color: T.text, borderRadius: T.rsm, padding: "16px", fontSize: 14.5, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Ico n="avion" s={17} /> En avión</button>
        </div>
      </div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <button onClick={() => setEligiendoModo(true)} style={{ flex: 1, background: T.accent, border: "none", color: "#1a1205", borderRadius: T.r, padding: "16px 10px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}><Ico n="mas" s={16} /> Viaje nuevo</button>
        <button onClick={() => setVivido(true)} style={{ flex: 1, background: T.card, border: `1px solid ${T.accent}`, color: T.accent, borderRadius: T.r, padding: "16px 10px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}><Ico n="reloj" s={16} /> Ya vivido</button>
      </div>
      {(data.viajes || []).length === 0 && <div style={{ textAlign: "center", color: T.muted, fontSize: 13, padding: "30px 20px", lineHeight: 1.6 }}>Todavía no hay viajes.<br />Buenos Aires → Salta te está esperando.</div>}
      {(data.viajes || []).map(v => <CardViaje key={v.id} v={v} onAbrir={() => setViajeId(v.id)} onBorrar={() => borrarViaje(v)} />)}
    </div>
  </div></Fondo>);
}

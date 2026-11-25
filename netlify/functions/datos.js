// Lee la hoja de Google con una cuenta de servicio. La hoja NO es pública:
// solo se comparte con el email de esa cuenta. Sin dependencias externas.
const crypto = require("crypto");
let cache = { token: null, exp: 0 };

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cache.token && cache.exp - 60 > now) return cache.token;

  const email = (process.env.GOOGLE_CLIENT_EMAIL || "").trim();
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key) throw Object.assign(new Error("Falta configurar las credenciales en Netlify."), { code: 500 });

  const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "RS256", typ: "JWT" });
  const claim = b64({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  });
  const sig = crypto.createSign("RSA-SHA256").update(head + "." + claim).sign(key, "base64url");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: head + "." + claim + "." + sig,
    }),
  });
  const json = await res.json();
  if (!res.ok) { console.error("Token error:", json); throw Object.assign(new Error("Las credenciales de Google no son válidas."), { code: 502 }); }
  cache = { token: json.access_token, exp: now + (json.expires_in || 3600) };
  return cache.token;
}

exports.handler = async event => {
  const reply = (code, body, extra = {}) => ({
    statusCode: code,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extra },
    body: JSON.stringify(body),
  });
  if (event.httpMethod !== "GET") return reply(405, { error: "Método no permitido." });

  try {
    const faltan = ["GOOGLE_CLIENT_EMAIL", "GOOGLE_PRIVATE_KEY", "SHEET_ID"].filter(k => !(process.env[k] || "").trim());
    if (faltan.length) return reply(500, { error: "La función no ve estas variables: " + faltan.join(", ") + ". Si ya las has creado en Netlify, vuelve a desplegar el sitio para que se apliquen." });
    const id = process.env.SHEET_ID.trim();
    const tab = (process.env.SHEET_TAB || "").trim();
    const range = (tab ? "'" + tab.replace(/'/g, "''") + "'!" : "") + "A:D";
    const token = await getToken();

    const res = await fetch(
      "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(id) + "/values/" + encodeURIComponent(range),
      { headers: { Authorization: "Bearer " + token } }
    );
    if (!res.ok) {
      console.error("Sheets error:", res.status, await res.text());
      const msg = res.status === 403 || res.status === 404
        ? "No se puede leer la hoja. Comprueba que está compartida con la cuenta de servicio y que el ID y la pestaña son correctos."
        : "Error al consultar Google Sheets.";
      return reply(502, { error: msg });
    }
    const data = await res.json();
    // Caché de 1 minuto: evita llamar a Google en cada visita y los cambios se ven enseguida
    return reply(200, { rows: data.values || [] }, { "Cache-Control": "public, max-age=60" });
  } catch (e) {
    console.error(e);
    return reply(e.code || 500, { error: e.message || "Error interno." });
  }
};

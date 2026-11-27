/* ============ CONFIGURACIÓN ============
   MODO "privado": lee la hoja a través de la función de Netlify (hoja privada).
   MODO "ejemplo": usa datos-ejemplo.csv (para probar en local sin la función). */
const CONFIG = { MODO: "privado" };

/* ---------- Utilidades ---------- */
function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); rows.push(row); row = []; f = "";
    } else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const norm = s => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/* Devuelve [{ id, nombre, opciones: [{id, nombre, descripcion}] }] */
async function loadData() {
  let rows;
  if (CONFIG.MODO === "ejemplo") {
    const res = await fetch("datos-ejemplo.csv", { cache: "no-store" });
    if (!res.ok) throw new Error("No se pudo leer datos-ejemplo.csv");
    rows = parseCSV(await res.text());
  } else {
    const res = await fetch("/.netlify/functions/datos");
    let json = {};
    try { json = await res.json(); } catch {}
    if (!res.ok) throw new Error(json.error || "No se pudo leer la hoja (" + res.status + ").");
    rows = json.rows;
  }
  rows = rows.filter(r => r.some(c => String(c || "").trim()));
  if (!rows.length) throw new Error("La hoja está vacía.");
  const head = rows.shift().map(norm);
  const iC = head.indexOf("categoria"), iO = head.indexOf("opcion"),
        iD = head.indexOf("descripcion"), iR = head.indexOf("orden");
  if (iC < 0 || iO < 0) throw new Error("Faltan las columnas Categoria y Opcion en la hoja.");
  const cats = new Map();
  rows.forEach((r, n) => {
    const cat = (r[iC] || "").trim(), opt = (r[iO] || "").trim();
    if (!cat || !opt) return;
    const key = norm(cat); // "Padres" y "padres" cuentan como la misma categoría
    if (!cats.has(key)) cats.set(key, { id: "c" + cats.size, nombre: cat, opciones: [] });
    const orden = parseFloat(r[iR]);
    cats.get(key).opciones.push({ nombre: opt, descripcion: (r[iD] || "").trim(), orden: isNaN(orden) ? n : orden, n });
  });
  return [...cats.values()].map(c => {
    c.opciones.sort((a, b) => a.orden - b.orden || a.n - b.n);
    c.opciones.forEach((o, i) => o.id = c.id + "o" + i);
    return c;
  });
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v);
  }
  kids.forEach(k => e.append(k));
  return e;
}
function showError(box, err) {
  box.replaceChildren(el("p", { class: "aviso", role: "alert", text: "No se han podido cargar los contenidos. " + err.message }));
}

/* ---------- Página 1: formulario ---------- */
async function initForm() {
  const box = document.getElementById("categorias");
  let data;
  try { data = await loadData(); } catch (e) { return showError(box, e); }
  box.replaceChildren();

  data.forEach(c => {
    const fs = el("fieldset", { class: "cat" }, el("legend", { text: c.nombre }));
    c.opciones.forEach(o => {
      const id = "chk-" + o.id;
      const row = el("div", { class: "opcion" });
      row.append(el("input", { type: "checkbox", id, value: o.nombre, "data-cat": c.nombre }),
                 el("label", { for: id, text: o.nombre }));
      if (o.descripcion) {
        const tid = "tip-" + o.id;
        const btn = el("button", { type: "button", class: "tip-btn", "aria-label": "Ver descripción de " + o.nombre, "aria-expanded": "false", "aria-controls": tid, text: "i" });
        const tip = el("span", { class: "tip", id: tid, role: "tooltip", text: o.descripcion });
        const wrap = el("span", { class: "tip-wrap" }, btn, tip);
        btn.addEventListener("click", e => { e.stopPropagation(); toggleTip(wrap); });
        row.append(wrap);
      }
      fs.append(row);
    });
    box.append(fs);
  });

  const closeAll = () => document.querySelectorAll(".tip-wrap.abierto").forEach(w => toggleTip(w, false));
  function toggleTip(w, force) {
    const open = force ?? !w.classList.contains("abierto");
    if (open) closeAll();
    w.classList.toggle("abierto", open);
    w.querySelector("button").setAttribute("aria-expanded", open);
  }
  document.addEventListener("click", closeAll);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeAll(); });

  const out = document.getElementById("resultado");
  document.getElementById("generar").addEventListener("click", () => {
    const sel = [];
    data.forEach(c => c.opciones.forEach(o => {
      if (document.getElementById("chk-" + o.id).checked) sel.push(o.nombre.replace(/[.\s]+$/, ""));
    }));
    out.value = sel.length ? sel.join(". ") + "." : "No has marcado ninguna opción.";
    out.parentElement.hidden = false;
  });
  document.getElementById("limpiar").addEventListener("click", () => {
    box.querySelectorAll("input:checked").forEach(i => i.checked = false);
    out.value = ""; out.parentElement.hidden = true;
  });
  const copiar = document.getElementById("copiar");
  copiar.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(out.value); } catch { out.select(); document.execCommand("copy"); }
    copiar.textContent = "Copiado"; setTimeout(() => copiar.textContent = "Copiar texto", 1500);
  });
}

/* ---------- Página 2: información ---------- */
async function initInfo() {
  const box = document.getElementById("lista");
  const q = document.getElementById("buscar");
  const count = document.getElementById("contador");
  let data;
  try { data = await loadData(); } catch (e) { return showError(box, e); }
  box.replaceChildren();

  const items = [];
  data.forEach(c => {
    const cd = el("details", { class: "cat" }, el("summary", { text: c.nombre }));
    const inner = el("div", { class: "hijos" });
    const entries = c.opciones.map(o => {
      const od = el("details", { class: "opt" }, el("summary", { text: o.nombre }),
        el("p", { text: o.descripcion || "Sin descripción." }));
      inner.append(od);
      return { od, text: norm(o.nombre + " " + o.descripcion) };
    });
    cd.append(inner); box.append(cd);
    items.push({ cd, entries, catText: norm(c.nombre) });
  });
  const vacio = el("p", { class: "aviso", hidden: "" , text: "Ninguna opción coincide con la búsqueda." });
  box.append(vacio);

  function filtrar() {
    const terms = norm(q.value).split(/\s+/).filter(Boolean);
    let total = 0;
    items.forEach(it => {
      const catMatch = terms.length && terms.every(t => it.catText.includes(t));
      let visibles = 0;
      it.entries.forEach(en => {
        const ok = !terms.length || catMatch || terms.every(t => en.text.includes(t));
        en.od.hidden = !ok;
        en.od.open = !!terms.length && ok && !catMatch;
        if (ok) visibles++;
      });
      it.cd.hidden = visibles === 0;
      it.cd.open = !!terms.length && visibles > 0;
      total += visibles;
    });
    vacio.hidden = !(terms.length && total === 0);
    count.textContent = terms.length ? total + (total === 1 ? " resultado" : " resultados") : "";
  }
  q.addEventListener("input", filtrar);
}

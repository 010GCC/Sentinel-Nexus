import { companyEmailCheck, leadGrade, networkType, orgName } from "./scoring.js";

// Same-origin API on soluniplabs.com; falls back to the public proxy elsewhere (e.g. a local file)
const API = location.protocol === "file:" ? "https://ipinfo-proxy.gclark523.workers.dev" : "/api";
const BATCH = 50;
const CONCURRENCY = 2;

const $ = (id) => document.getElementById(id);
const state = { mode: "csv", headers: [], rows: [], results: [], filter: "all", search: "", sort: null, abort: null };

/* ---------------- CSV ---------------- */
export function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const delim = (() => {
    const first = text.split(/\r?\n/, 1)[0] || "";
    const counts = { ",": 0, ";": 0, "\t": 0 };
    let q = false;
    for (const ch of first) { if (ch === '"') q = !q; else if (!q && ch in counts) counts[ch]++; }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ",";
  })();
  const rows = [];
  let row = [], field = "", i = 0, q = false;
  while (i < text.length) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
    i++;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

function toCSV(rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    // neutralize spreadsheet formula injection
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? "'" + s : s;
    return /[",\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

const GUESS = {
  ip: [/^ip$/, /ip[\s_-]*address/, /^(user|client|remote|visitor|submission)[\s_-]*ip/, /\bip\b/, /ipv4|ipv6/],
  email: [/^e-?mail$/, /e-?mail[\s_-]*address/, /e-?mail/],
  company: [/^company$/, /company[\s_-]*name/, /^(organization|organisation|org|account|account name|business)$/, /company|organi[sz]ation|employer/],
  country: [/^country$/, /country/],
  region: [/^(state|region|province)$/, /state|region|province/],
};
function guessColumn(headers, kind) {
  const h = headers.map((x) => x.toLowerCase().trim());
  for (const re of GUESS[kind]) {
    const idx = h.findIndex((x) => re.test(x) && !(kind === "ip" && /zip|ship|tip/.test(x)));
    if (idx >= 0) return idx;
  }
  return -1;
}

function fillMap() {
  const opts = ['<option value="-1">(none)</option>', ...state.headers.map((h, i) => `<option value="${i}">${escapeHtml(h || "Column " + (i + 1))}</option>`)].join("");
  for (const [id, kind] of [["mIp", "ip"], ["mEmail", "email"], ["mCompany", "company"], ["mCountry", "country"], ["mRegion", "region"]]) {
    $(id).innerHTML = opts;
    $(id).value = String(guessColumn(state.headers, kind));
  }
  // No header row? If no IP column was found, look for a column of IPs
  if ($("mIp").value === "-1" && state.rows.length) {
    const idx = state.headers.findIndex((_, i) => state.rows.slice(0, 10).filter((r) => isIp(r[i])).length >= Math.min(3, state.rows.length));
    if (idx >= 0) $("mIp").value = String(idx);
  }
  $("map").hidden = false;
}

function loadCSVText(text, name) {
  const all = parseCSV(text);
  if (!all.length) return setStatus("That file looks empty.", true);
  const firstIsHeader = !all[0].some(isIp) && !all[0].some((c) => /@/.test(c));
  state.headers = firstIsHeader ? all[0] : all[0].map((_, i) => "Column " + (i + 1));
  state.rows = firstIsHeader ? all.slice(1) : all;
  $("fileName").textContent = `${name}: ${state.rows.length} rows, ${state.headers.length} columns`;
  fillMap();
  setStatus("Check the column choices, then press Enrich.");
}

/* ---------------- helpers ---------------- */
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
function isIp(s) { s = String(s || "").trim(); return IPV4.test(s) || (/^[0-9a-f:]+$/i.test(s) && s.split(":").length > 2); }
function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function setStatus(msg, err = false) { $("status").textContent = msg; $("status").className = "status" + (err ? " err" : ""); }
function setProgress(p) { $("bar").style.width = Math.round(p * 100) + "%"; }

async function lookupAll(ips, signal, onProgress) {
  const unique = [...new Set(ips.filter(Boolean))];
  const out = new Map();
  const chunks = [];
  for (let i = 0; i < unique.length; i += BATCH) chunks.push(unique.slice(i, i + BATCH));
  let done = 0, next = 0;
  async function worker() {
    while (next < chunks.length) {
      if (signal.aborted) return;
      const chunk = chunks[next++];
      let tries = 0;
      for (;;) {
        try {
          const r = await fetch(`${API}/batch`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ips: chunk }), signal });
          if (r.status === 429 && tries++ < 3) { await new Promise((res) => setTimeout(res, 15000 * tries)); continue; }
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
          j.results.forEach((res, k) => out.set(chunk[k], res));
          break;
        } catch (e) {
          if (signal.aborted) return;
          chunk.forEach((ip) => out.set(ip, { ip, error: e.message }));
          break;
        }
      }
      done += chunk.length;
      onProgress(done / unique.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker));
  return out;
}

/* ---------------- run ---------------- */
async function run() {
  let items; // { ip, email, company, country, region, src }
  if (state.mode === "paste") {
    const ips = $("ips").value.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!ips.length) return setStatus("Paste at least one IP address.", true);
    items = ips.map((ip) => ({ ip, src: null }));
  } else {
    if (!state.rows.length) return setStatus("Choose a CSV file first, or switch to Paste IPs.", true);
    const col = (id) => Number($(id).value);
    const [ci, ce, cc, cn, cr] = ["mIp", "mEmail", "mCompany", "mCountry", "mRegion"].map(col);
    if (ci < 0 && ce < 0) return setStatus("Pick at least an IP column or an Email column.", true);
    const get = (r, i) => (i >= 0 ? String(r[i] ?? "").trim() : "");
    items = state.rows.map((r) => ({ ip: get(r, ci), email: get(r, ce), company: get(r, cc), country: get(r, cn), region: get(r, cr), src: r }));
  }
  if (items.length > 5000) return setStatus("Please run 5,000 rows or fewer at a time.", true);

  state.abort = new AbortController();
  $("run").disabled = true; $("cancel").hidden = false; setProgress(0);
  const ipCount = new Set(items.map((x) => x.ip).filter(Boolean)).size;
  setStatus(ipCount ? `Looking up ${ipCount} unique IPs...` : "Scoring emails...");
  const t0 = performance.now();
  let info = new Map();
  try {
    if (ipCount) info = await lookupAll(items.map((x) => x.ip), state.abort.signal, (p) => { setProgress(p); setStatus(`Looking up IPs... ${Math.round(p * 100)}%`); });
  } finally {
    $("run").disabled = false; $("cancel").hidden = true;
  }
  if (state.abort.signal.aborted) { setStatus("Cancelled."); return; }

  state.results = items.map((x) => {
    const i = x.ip ? info.get(x.ip) || null : null;
    const em = companyEmailCheck(x.email, x.company);
    const g = state.mode === "csv" ? leadGrade(x, i, em) : { grade: "-", points: "", reasons: [] };
    return { ...x, info: i, email_check: em, lead: g, net: i && !i.error ? networkType(i) : "" };
  });
  setProgress(1);
  const errs = state.results.filter((r) => r.info?.error).length;
  setStatus(`Done in ${((performance.now() - t0) / 1000).toFixed(1)}s.` + (errs ? ` ${errs} IP lookups failed (see the Error column).` : ""), errs > 0 && errs === state.results.length);
  render();
}

/* ---------------- table ---------------- */
function columns() {
  const csv = state.mode === "csv";
  return [
    ...(csv ? [["Grade", (r) => r.lead.grade], ["Points", (r) => r.lead.points], ["Why", (r) => r.lead.reasons.join("; "), "wrap"], ["Email", (r) => r.email], ["Company", (r) => r.company], ["Email match", (r) => (r.email ? r.email_check.score.toFixed(2) : "")], ["Match reason", (r) => (r.email ? r.email_check.reason : ""), "wrap"]] : []),
    ["IP", (r) => r.ip], ["Network", (r) => r.net], ["Org", (r) => (r.info ? orgName(r.info) : "")],
    ["City", (r) => r.info?.city], ["Region", (r) => r.info?.region], ["Country", (r) => r.info?.country],
    ["Postal", (r) => r.info?.postal], ["Timezone", (r) => r.info?.timezone], ["Hostname", (r) => r.info?.hostname],
    ["Loc", (r) => r.info?.loc], ["Error", (r) => r.info?.error],
  ];
}

function visible() {
  let rows = state.results;
  if (state.filter !== "all") rows = rows.filter((r) => r.lead.grade === state.filter);
  if (state.search) {
    const q = state.search.toLowerCase();
    rows = rows.filter((r) => [r.ip, r.email, r.company, r.info?.city, r.info?.region, r.info?.country, r.info?.org].join(" ").toLowerCase().includes(q));
  }
  if (state.sort) {
    const [, get] = columns()[state.sort.col];
    const dir = state.sort.dir;
    rows = [...rows].sort((a, b) => {
      const x = get(a) ?? "", y = get(b) ?? "";
      const nx = Number(x), ny = Number(y);
      const cmp = x !== "" && y !== "" && !isNaN(nx) && !isNaN(ny) ? nx - ny : String(x).localeCompare(String(y));
      return cmp * dir;
    });
  }
  return rows;
}

function render() {
  $("results").hidden = false;
  const csv = state.mode === "csv";
  document.querySelector(".toolbar").querySelectorAll(".chip").forEach((c) => (c.style.display = csv ? "" : "none"));
  document.querySelector(".summary").style.display = csv ? "" : "none";
  const count = (g) => state.results.filter((r) => r.lead.grade === g).length;
  $("sTotal").textContent = state.results.length; $("sA").textContent = count("A"); $("sB").textContent = count("B"); $("sC").textContent = count("C");

  const cols = columns();
  const thead = document.querySelector("#table thead");
  thead.innerHTML = "<tr>" + cols.map(([h], i) => `<th data-col="${i}">${h}${state.sort?.col === i ? (state.sort.dir > 0 ? " &#9650;" : " &#9660;") : ""}</th>`).join("") + "</tr>";
  const rows = visible();
  const body = rows.slice(0, 1000).map((r) => "<tr>" + cols.map(([h, get, cls]) => {
    const v = get(r) ?? "";
    if (h === "Grade") return `<td><span class="grade g${escapeHtml(v)}">${escapeHtml(v)}</span></td>`;
    if (h === "Network") return `<td>${v ? `<span class="net ${escapeHtml(v)}">${escapeHtml(v)}</span>` : ""}</td>`;
    if (h === "Error") return `<td class="err-cell">${escapeHtml(v)}</td>`;
    return `<td${cls ? ` class="${cls}"` : ""}>${escapeHtml(v)}</td>`;
  }).join("") + "</tr>").join("");
  document.querySelector("#table tbody").innerHTML = body + (rows.length > 1000 ? `<tr><td colspan="${cols.length}" class="muted">Showing 1,000 of ${rows.length} rows. The download includes all of them.</td></tr>` : "");
}

function exportCSV() {
  const rows = visible();
  const enrich = [
    ["solunip_grade", (r) => r.lead.grade], ["solunip_points", (r) => r.lead.points], ["solunip_reasons", (r) => r.lead.reasons.join("; ")],
    ["email_domain", (r) => r.email_check.domain], ["is_corporate_email", (r) => (r.email ? r.email_check.isCorporate : "")],
    ["is_freemail", (r) => (r.email ? r.email_check.isFreemail : "")], ["is_disposable_email", (r) => (r.email ? r.email_check.isDisposable : "")],
    ["company_email_score", (r) => (r.email ? r.email_check.score : "")], ["company_email_reason", (r) => (r.email ? r.email_check.reason : "")],
    ["ip_network_type", (r) => r.net], ["ip_org", (r) => (r.info ? orgName(r.info) : "")], ["ip_hostname", (r) => r.info?.hostname],
    ["ip_city", (r) => r.info?.city], ["ip_region", (r) => r.info?.region], ["ip_country", (r) => r.info?.country],
    ["ip_postal", (r) => r.info?.postal], ["ip_loc", (r) => r.info?.loc], ["ip_timezone", (r) => r.info?.timezone], ["ip_error", (r) => r.info?.error],
  ];
  let out;
  if (state.mode === "csv") {
    out = [[...state.headers, ...enrich.map(([h]) => h)], ...rows.map((r) => [...state.headers.map((_, i) => r.src[i] ?? ""), ...enrich.map(([, g]) => g(r) ?? "")])];
  } else {
    const keep = enrich.filter(([h]) => h.startsWith("ip_"));
    out = [["ip", ...keep.map(([h]) => h)], ...rows.map((r) => [r.ip, ...keep.map(([, g]) => g(r) ?? "")])];
  }
  const blob = new Blob(["﻿" + toCSV(out)], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `solunip-enriched-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------------- wiring ---------------- */
function setMode(m) {
  state.mode = m;
  document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === m)));
  $("panel-csv").hidden = m !== "csv"; $("panel-paste").hidden = m !== "paste";
}
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => setMode(t.dataset.tab)));

function readFile(f) {
  if (!f) return;
  if (f.size > 20 * 1024 * 1024) return setStatus("That file is over 20 MB. Split it into smaller files.", true);
  const r = new FileReader();
  r.onload = () => loadCSVText(String(r.result), f.name);
  r.onerror = () => setStatus("Couldn't read that file.", true);
  r.readAsText(f);
}
$("file").addEventListener("change", (e) => readFile(e.target.files[0]));
const drop = $("drop");
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => readFile(e.dataTransfer.files[0]));

$("run").addEventListener("click", () => run().catch((e) => { setStatus(e.message, true); $("run").disabled = false; $("cancel").hidden = true; }));
$("cancel").addEventListener("click", () => state.abort?.abort());
$("export").addEventListener("click", exportCSV);
$("search").addEventListener("input", (e) => { state.search = e.target.value; render(); });
document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => {
  state.filter = c.dataset.grade;
  document.querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === c));
  render();
}));
document.querySelector("#table thead").addEventListener("click", (e) => {
  const th = e.target.closest("th"); if (!th) return;
  const col = Number(th.dataset.col);
  state.sort = state.sort?.col === col ? { col, dir: -state.sort.dir } : { col, dir: 1 };
  render();
});
$("sample").addEventListener("click", () => {
  setMode("csv");
  loadCSVText([
    "First Name,Last Name,Email,Company,Country,State,IP Address",
    "Eni,Who,eniwho@eni3.com,eniwher3,United States,OH,8.8.8.8",
    "Sam,Lee,sam@eliteap.com,Elite Advanced Polymers,Canada,ON,1.1.1.1",
    "Mike,Ross,mike.ross77@gmail.com,Northwind Logistics,United States,OH,9.9.9.9",
    "Test,User,test@mailinator.com,Fortune Corp,United States,CA,159.89.0.1",
  ].join("\n"), "sample.csv");
});

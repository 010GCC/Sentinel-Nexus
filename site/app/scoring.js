// SolunIP Labs scoring: email-to-company match, network type, and lead grade.
// Pure functions, no DOM. Used by the app and by tests/scoring.test.mjs.

export const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.ca", "ymail.com", "rocketmail.com",
  "hotmail.com", "hotmail.co.uk", "outlook.com", "live.com", "msn.com", "aol.com", "icloud.com", "me.com",
  "mac.com", "protonmail.com", "proton.me", "pm.me", "gmx.com", "gmx.net", "gmx.de", "web.de", "mail.com",
  "zoho.com", "zohomail.com", "yandex.com", "yandex.ru", "mail.ru", "qq.com", "163.com", "126.com",
  "comcast.net", "verizon.net", "att.net", "sbcglobal.net", "bellsouth.net", "charter.net", "cox.net",
  "earthlink.net", "optonline.net", "frontier.com", "windstream.net", "fastmail.com", "hey.com", "tutanota.com",
  "rediffmail.com", "libero.it", "orange.fr", "free.fr", "laposte.net", "t-online.de", "btinternet.com",
  "sky.com", "shaw.ca", "rogers.com", "bigpond.com", "naver.com", "hanmail.net",
]);

export const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "10minutemail.com",
  "tempmail.com", "temp-mail.org", "tempmailo.com", "yopmail.com", "trashmail.com", "getnada.com",
  "dispostable.com", "maildrop.cc", "throwawaymail.com", "fakeinbox.com", "mintemail.com", "mohmal.com",
  "emailondeck.com", "spamgourmet.com", "mailnesia.com", "burnermail.io", "inboxkitten.com", "tempr.email",
  "discard.email", "mytemp.email", "moakt.com", "33mail.com", "spambox.us", "mailcatch.com",
]);

const LEGAL_SUFFIXES = new Set([
  "inc", "incorporated", "corp", "corporation", "co", "company", "llc", "llp", "lp", "ltd", "limited", "plc",
  "gmbh", "ag", "kg", "sa", "sas", "sarl", "srl", "spa", "bv", "nv", "oy", "ab", "as", "aps", "pty", "pte",
  "kk", "sdn", "bhd", "pvt", "the", "de", "cv",
]);

// Words too common to prove a match on their own
const GENERIC = new Set([
  "tech", "technology", "technologies", "global", "group", "solutions", "services", "systems", "international",
  "industries", "holdings", "partners", "consulting", "marketing", "digital", "media", "labs", "enterprises",
  "america", "american", "national", "united", "general", "first", "new", "best", "pro", "smart", "data",
  "software", "network", "networks", "management", "capital", "health", "energy", "solar", "design", "and",
  "of", "for", "usa", "us", "inc", "online", "web", "net", "info", "world", "home", "mail",
]);

const ABBREV = {
  manufacturing: ["mfg", "manuf"], international: ["intl", "int"], technologies: ["tech"], technology: ["tech"],
  systems: ["sys"], solutions: ["sol", "solns"], services: ["svc", "svcs", "serv"], engineering: ["eng", "engr"],
  industries: ["ind", "inds"], associates: ["assoc"], laboratories: ["labs", "lab"], brothers: ["bros"],
  national: ["natl"], american: ["amer"], management: ["mgmt"], development: ["dev"], products: ["prod", "prods"],
  equipment: ["equip"], machinery: ["mach"], company: ["co"], corporation: ["corp"], group: ["grp"],
  aerospace: ["aero"], electric: ["elec"], electronics: ["elec"], mountain: ["mtn"], north: ["n"], south: ["s"],
};

const PUBLIC_SUFFIX_2 = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "ltd.uk", "plc.uk", "com.au", "net.au", "org.au", "co.nz", "co.jp",
  "co.in", "co.za", "com.br", "com.mx", "com.cn", "com.sg", "com.hk", "co.kr", "com.tr", "com.ar", "co.il",
]);

export function stripAccents(s) {
  return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

export function companyTokens(name) {
  const t = stripAccents(name).toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const kept = t.filter((w) => !LEGAL_SUFFIXES.has(w));
  return kept.length ? kept : t;
}

export function emailParts(email) {
  const m = String(email || "").trim().toLowerCase().match(/^([^\s@]+)@([a-z0-9.-]+\.[a-z]{2,})$/);
  if (!m) return null;
  const domain = m[2].replace(/^www\./, "");
  const labels = domain.split(".");
  const last2 = labels.slice(-2).join(".");
  const coreIdx = PUBLIC_SUFFIX_2.has(last2) ? labels.length - 3 : labels.length - 2;
  const core = labels[Math.max(0, coreIdx)] || "";
  return { local: m[1], domain, root: labels.slice(Math.max(0, coreIdx)).join("."), core };
}

function bigrams(s) {
  const out = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}
export function dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a), B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const counts = new Map();
  A.forEach((g) => counts.set(g, (counts.get(g) || 0) + 1));
  let hits = 0;
  B.forEach((g) => { const c = counts.get(g); if (c) { hits++; counts.set(g, c - 1); } });
  return (2 * hits) / (A.length + B.length);
}

// Do company tokens appear, in order, to spell out the domain? Allows abbreviations and 3+ char prefixes.
function sequential(tokens, dom) {
  function walk(ti, pos) {
    if (pos === dom.length) return ti === tokens.length || tokens.slice(ti).every((t) => GENERIC.has(t) || LEGAL_SUFFIXES.has(t));
    if (ti >= tokens.length) return false;
    const t = tokens[ti];
    const options = new Set([t, ...(ABBREV[t] || [])]);
    for (let k = Math.min(t.length, dom.length - pos); k >= 3; k--) options.add(t.slice(0, k));
    if (t.length < 3) options.add(t);
    for (const o of options) if (o && dom.startsWith(o, pos) && walk(ti + 1, pos + o.length)) return true;
    // a token may be skipped if it's generic ("Park Aerospace Group" -> parkaerospace)
    if (GENERIC.has(t) && walk(ti + 1, pos)) return true;
    return false;
  }
  return tokens.length >= 2 && walk(0, 0);
}

function acronym(tokens, dom) {
  if (tokens.length < 2) return false;
  const initials = tokens.map((t) => t[0]).join("");
  if (initials.length >= 3 && (dom === initials || dom.startsWith(initials))) return true;
  // first word + initials of the rest: "Elite Advanced Polymers" -> eliteap
  const firstPlus = tokens[0] + tokens.slice(1).map((t) => t[0]).join("");
  if (dom === firstPlus) return true;
  // initials + last word: "Ohio Valley Electric" -> ovelectric
  const plusLast = tokens.slice(0, -1).map((t) => t[0]).join("") + tokens[tokens.length - 1];
  return dom === plusLast;
}

/**
 * Score how well an email's domain matches a company name.
 * Returns { score 0..1, reason, isCorporate, isFreemail, isDisposable, domain }
 */
export function companyEmailCheck(email, company) {
  const parts = emailParts(email);
  if (!parts) return { score: 0, reason: email ? "Invalid email format" : "No email", isCorporate: false, isFreemail: false, isDisposable: false, domain: "" };
  const { local, root, core } = parts;
  const isDisposable = DISPOSABLE.has(root) || DISPOSABLE.has(parts.domain);
  const isFreemail = !isDisposable && (FREEMAIL.has(root) || FREEMAIL.has(parts.domain));
  const base = { isDisposable, isFreemail, isCorporate: !isFreemail && !isDisposable, domain: parts.domain };

  const tokens = companyTokens(company);
  if (!tokens.length) return { ...base, score: 0, reason: "No company name" };
  const comp = tokens.join("");
  const dom = core.replace(/[^a-z0-9]/g, "");
  if (isDisposable) return { ...base, score: 0, reason: "Throwaway email domain" };

  if (isFreemail) {
    const loc = local.replace(/[^a-z0-9]/g, "");
    if (comp.length >= 4 && (loc.includes(comp) || (loc.length >= 4 && comp.includes(loc)))) {
      return { ...base, score: 0.7, reason: "Free-mail, but the username matches the company" };
    }
    return { ...base, score: 0, reason: "Free-mail address" };
  }

  if (dom === comp) return { ...base, score: 1, reason: "Domain matches company name" };

  const distinct = tokens.filter((t) => !GENERIC.has(t));
  const shorter = dom.length < comp.length ? dom : comp;
  const longer = dom.length < comp.length ? comp : dom;
  if (shorter.length >= 4 && longer.includes(shorter) && !GENERIC.has(shorter)) {
    const anchored = longer.startsWith(shorter) || distinct.some((t) => t.length >= 4 && shorter.includes(t));
    if (anchored) return { ...base, score: 0.9, reason: "Company name contained in domain (or vice versa)" };
  }

  if (sequential(tokens, dom)) return { ...base, score: 0.8, reason: "Company words spell out the domain" };
  if (acronym(tokens, dom)) return { ...base, score: 0.75, reason: "Domain matches company initials" };

  if (GENERIC.has(dom)) return { ...base, score: 0, reason: "Domain is a generic word" };

  const lenRatio = Math.min(comp.length, dom.length) / Math.max(comp.length, dom.length);
  const d = lenRatio >= 0.6 && Math.min(comp.length, dom.length) >= 6 ? dice(comp, dom) : 0;
  if (d >= 0.6) return { ...base, score: 0.7, reason: `Close spelling match (${Math.round(d * 100)}%)` };

  // Shortened name: the domain is the start of the company name plus its ending ("eniwher3" -> eni3)
  if (dom.length >= 4 && dom.length < comp.length) {
    for (let k = dom.length - 1; k >= 3; k--) {
      if (comp.startsWith(dom.slice(0, k)) && comp.endsWith(dom.slice(k))) return { ...base, score: 0.7, reason: "Domain looks like a shortened company name" };
    }
  }

  const hit = distinct.find((t) => t.length >= 4 && dom.includes(t));
  if (hit) return { ...base, score: 0.6, reason: `Domain contains "${hit}"` };

  return { ...base, score: 0, reason: "Domain doesn't match company" };
}

const HOSTING_HINTS = [
  "amazon", "aws", "google llc", "google cloud", "googleusercontent", "1e100.net", "dns.google", "microsoft azure", "azure", "digitalocean", "linode",
  "akamai", "ovh", "hetzner", "vultr", "choopa", "contabo", "leaseweb", "m247", "datacamp", "cdn77", "hostinger",
  "godaddy", "rackspace", "oracle cloud", "alibaba", "tencent", "scaleway", "packet host", "psychz", "quadranet",
  "colocrossing", "hostwinds", "ionos", "server", "hosting", "datacenter", "data center", "vps", "cloud",
  "zenlayer", "tzulo", "clouvider", "worldstream", "servers", "dedicated", "colo",
];
const MOBILE_HINTS = ["t-mobile", "verizon wireless", "cellco", "at&t mobility", "vodafone", "sprint", "mobile", "wireless", "telcel", "jio"];
const ISP_HINTS = ["comcast", "charter", "spectrum", "cox", "frontier", "centurylink", "lumen", "windstream", "mediacom",
  "optimum", "altice", "rogers", "shaw", "bell canada", "telus", "bt ", "virgin media", "sky ", "deutsche telekom",
  "orange", "telefonica", "at&t", "verizon", "google fiber", "brightspeed", "wow", "suddenlink", "broadband", "cable", "telecom", "communications"];

/** Classify an IPinfo record's network: hosting, mobile, isp, business, unknown */
export function networkType(info) {
  if (!info) return "unknown";
  const priv = info.privacy;
  if (priv && (priv.vpn || priv.proxy || priv.tor || priv.relay)) return "anonymizer";
  if (priv && priv.hosting) return "hosting";
  const declared = info.company?.type || info.asn?.type;
  if (declared === "hosting") return "hosting";
  if (declared === "isp") return "isp";
  if (declared === "business" || declared === "edu" || declared === "gov") return "business";
  if (info.carrier?.name) return "mobile";
  const org = String(info.org || info.as_name || "").toLowerCase() + " " + String(info.hostname || "").toLowerCase();
  if (!org.trim()) return "unknown";
  if (HOSTING_HINTS.some((h) => org.includes(h))) return "hosting";
  if (MOBILE_HINTS.some((h) => org.includes(h))) return "mobile";
  if (ISP_HINTS.some((h) => org.includes(h))) return "isp";
  return "business";
}

export function orgName(info) {
  return String(info?.company?.name || info?.org || "").replace(/^AS\d+\s+/, "");
}

const US_STATES = { al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california", co: "colorado", ct: "connecticut", de: "delaware", fl: "florida", ga: "georgia", hi: "hawaii", id: "idaho", il: "illinois", in: "indiana", ia: "iowa", ks: "kansas", ky: "kentucky", la: "louisiana", me: "maine", md: "maryland", ma: "massachusetts", mi: "michigan", mn: "minnesota", ms: "mississippi", mo: "missouri", mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire", nj: "new jersey", nm: "new mexico", ny: "new york", nc: "north carolina", nd: "north dakota", oh: "ohio", ok: "oklahoma", or: "oregon", pa: "pennsylvania", ri: "rhode island", sc: "south carolina", sd: "south dakota", tn: "tennessee", tx: "texas", ut: "utah", vt: "vermont", va: "virginia", wa: "washington", wv: "west virginia", wi: "wisconsin", wy: "wyoming", dc: "district of columbia", ab: "alberta", bc: "british columbia", mb: "manitoba", nb: "new brunswick", nl: "newfoundland and labrador", ns: "nova scotia", on: "ontario", pe: "prince edward island", qc: "quebec", sk: "saskatchewan" };
const COUNTRY_ALIASES = { us: ["us", "usa", "united states", "united states of america", "america"], gb: ["gb", "uk", "united kingdom", "great britain", "england", "scotland", "wales"], ca: ["ca", "canada"], de: ["de", "germany", "deutschland"], fr: ["fr", "france"], in: ["in", "india"], au: ["au", "australia"], mx: ["mx", "mexico"], br: ["br", "brazil"], cn: ["cn", "china"], jp: ["jp", "japan"], nl: ["nl", "netherlands", "holland"], it: ["it", "italy"], es: ["es", "spain"] };

function norm(s) { return stripAccents(s).toLowerCase().trim(); }
export function countryMatches(formCountry, ipCountry) {
  const f = norm(formCountry), c = norm(ipCountry);
  if (!f || !c) return null;
  if (f === c) return true;
  const aliases = COUNTRY_ALIASES[c];
  return aliases ? aliases.includes(f) : null; // unknown alias: don't guess
}
export function regionMatches(formRegion, ipRegion) {
  const f = norm(formRegion), r = norm(ipRegion);
  if (!f || !r) return null;
  return f === r || US_STATES[f] === r;
}

/**
 * Combine signals into a 0-100 score and an A/B/C grade.
 * row: { email, company, country, region }  info: IPinfo record (or null)
 */
export function leadGrade(row, info, email = companyEmailCheck(row.email, row.company)) {
  let pts = 50;
  const why = [];
  const hasEmail = Boolean(row.email);

  if (hasEmail) {
    if (email.isDisposable) { pts -= 35; why.push("throwaway email"); }
    else if (email.isFreemail) { pts += email.score >= 0.7 ? 15 : 5; why.push(email.score >= 0.7 ? "free-mail but username matches company" : "free-mail address"); }
    else if (email.score >= 0.75) { pts += 40; why.push("corporate email matches company"); }
    else if (email.score >= 0.6) { pts += 25; why.push("corporate email partly matches company"); }
    else if (email.domain) { pts += 5; why.push("corporate email, company doesn't match domain"); }
    else { pts -= 15; why.push("invalid email"); }
  }

  if (info && !info.error) {
    const net = networkType(info);
    if (net === "anonymizer") { pts -= 30; why.push("VPN/proxy/Tor IP"); }
    else if (net === "hosting") { pts -= 25; why.push("datacenter/hosting IP"); }
    else if (net === "business") { pts += 5; why.push("business network"); }

    const org = companyTokens(orgName(info)).join("");
    const comp = companyTokens(row.company).join("");
    if (comp.length >= 4 && org.length >= 4 && (org.includes(comp) || comp.includes(org))) { pts += 20; why.push("IP owned by the company"); }

    const cm = countryMatches(row.country, info.country);
    if (cm === true) { pts += 5; why.push("country matches"); }
    else if (cm === false) { pts -= 15; why.push(`IP in ${info.country}, form says ${row.country}`); }
    if (cm !== false) {
      const rm = regionMatches(row.region, info.region);
      if (rm === true) { pts += 5; why.push("region matches"); }
      else if (rm === false && cm === true) { why.push(`region differs (IP: ${info.region})`); }
    }
  } else if (info?.error) {
    why.push("IP lookup failed");
  }

  pts = Math.max(0, Math.min(100, pts));
  const grade = pts >= 70 ? "A" : pts >= 45 ? "B" : "C";
  return { points: pts, grade, reasons: why };
}

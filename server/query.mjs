// Minimal PostgREST query-string parser + filter/order/project for the
// subset of operations supabase-js generates for this app.

const OPS = ["gte", "lte", "gt", "lt", "neq", "eq", "like", "ilike", "in", "is"];

function parseFilterValue(op, raw) {
  if (op === "in") {
    const inner = raw.replace(/^\(/, "").replace(/\)$/, "");
    return inner.split(",").map((v) => v.trim());
  }
  if (op === "is") return raw === "null" ? null : raw === "true" ? true : raw === "false" ? false : raw;
  return raw;
}

function asNum(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
// Compare numerically when both sides are numbers, otherwise lexicographically
// (e.g. ISO date strings "2026-10-31" must compare as strings, not NaN).
function cmp(actual, val) {
  const a = asNum(actual); const b = asNum(val);
  if (a != null && b != null) return a - b;
  const sa = String(actual); const sb = String(val);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
function applyOp(actual, op, val) {
  if (op === "eq") return String(actual) === String(val);
  if (op === "neq") return String(actual) !== String(val);
  if (op === "gt") return cmp(actual, val) > 0;
  if (op === "lt") return cmp(actual, val) < 0;
  if (op === "gte") return cmp(actual, val) >= 0;
  if (op === "lte") return cmp(actual, val) <= 0;
  if (op === "like") return new RegExp("^" + String(val).replace(/%/g, ".*").replace(/\?/g, ".") + "$").test(String(actual));
  if (op === "ilike") return new RegExp("^" + String(val).replace(/%/g, ".*").replace(/\?/g, ".") + "$", "i").test(String(actual));
  if (op === "in") return val.map((v) => String(v)).includes(String(actual));
  if (op === "is") return actual == null ? val === null : false;
  return true;
}

// Parse a single "col.op.val" or "col=in.(a,b)" clause.
function parseClause(clause) {
  for (const op of OPS) {
    const marker = `.${op}.`;
    const idx = clause.indexOf(marker);
    if (idx > -1) {
      const col = clause.slice(0, idx);
      const val = clause.slice(idx + marker.length);
      return { col, op, val: parseFilterValue(op, val) };
    }
  }
  // bare col=val handled elsewhere
  return null;
}

export function filterRows(rows, url) {
  let out = [...rows];
  const q = url.searchParams;

  // simple column filters: ?col=op.val  (supabase .eq/.gte/.lt/...)
  for (const [key, value] of q.entries()) {
    if (["select", "order", "or", "and", "limit", "offset", "page"].includes(key)) continue;
    const clause = parseClause(`${key}.${value}`);
    // value may already be "op.val"; rebuild as "col.op.val"
    const dot = value.indexOf(".");
    if (dot > -1 && OPS.includes(value.slice(0, dot))) {
      const op = value.slice(0, dot);
      const val = value.slice(dot + 1);
      out = out.filter((r) => r[key] !== undefined && applyOp(r[key], op, parseFilterValue(op, val)));
    } else {
      // plain equality ?col=val
      out = out.filter((r) => String(r[key]) === String(value));
    }
  }

  // or=col.op.val,col.op.val
  const or = q.get("or");
  if (or) {
    const clauses = or.split(",").map((c) => parseClause(c)).filter(Boolean);
    out = out.filter((r) => clauses.some((c) => r[c.col] !== undefined && applyOp(r[c.col], c.op, c.val)));
  }
  const and = q.get("and");
  if (and) {
    const clauses = and.split(",").map((c) => parseClause(c)).filter(Boolean);
    out = out.filter((r) => clauses.every((c) => r[c.col] !== undefined && applyOp(r[c.col], c.op, c.val)));
  }

  // order=col.asc,col2.desc
  const order = q.get("order");
  if (order) {
    const specs = order.split(",").map((s) => {
      const [col, dir] = s.split(".");
      return { col, asc: (dir || "asc") === "asc" };
    });
    out.sort((a, b) => {
      for (const { col, asc } of specs) {
        let cmp = 0;
        const av = a[col]; const bv = b[col];
        if (av == null && bv == null) cmp = 0;
        else if (av == null) cmp = -1;
        else if (bv == null) cmp = 1;
        else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
        else cmp = String(av).localeCompare(String(bv));
        if (cmp !== 0) return asc ? cmp : -cmp;
      }
      return 0;
    });
  }

  // limit / offset
  const limit = Number(q.get("limit"));
  const offset = Number(q.get("offset")) || 0;
  if (Number.isFinite(limit) && limit > 0) {
    out = out.slice(offset, offset + limit);
  } else if (offset) {
    out = out.slice(offset);
  }
  return out;
}

export function projectRows(rows, select) {
  if (!select || select === "*") return rows;
  const cols = select.split(",").map((c) => c.trim()).filter(Boolean);
  return rows.map((r) => {
    const o = {};
    for (const c of cols) if (c in r) o[c] = r[c];
    return o;
  });
}


"use strict";
/* ----------------------------------------------------------- helpers */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const pct = (x, d = 1) => (x * 100).toFixed(d) + "%";
const compact = n => new Intl.NumberFormat("en", { notation:"compact", maximumFractionDigits:2 }).format(n);
const whole = n => new Intl.NumberFormat("en").format(n);

async function api(url, opts) {
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

const state = { stats:null, threshold:0.3, options:null, base:{}, labelled:null, rendered:{}, documents:[], selectedDocuments:new Set(), documentsInitialized:false, conversation:[], investigationClaims:[] };

/* ------------------------------------------------------------ tooltip */
const tip = $("#tip");
function showTip(html, x, y) {
  tip.innerHTML = html; tip.style.display = "block";
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.max(8, Math.min(x + 12, innerWidth - w - 8)) + "px";
  tip.style.top = (y - h - 12 < 8 ? y + 18 : y - h - 12) + "px";
}
const hideTip = () => { tip.style.display = "none"; };
function bindTip(el, html) {
  el.addEventListener("mousemove", e => showTip(html, e.clientX, e.clientY));
  el.addEventListener("mouseleave", hideTip);
  el.addEventListener("focus", () => { const r = el.getBoundingClientRect(); showTip(html, r.left + r.width / 2, r.top); });
  el.addEventListener("blur", hideTip);
}
const rowTip = r => `<b>${esc(r.label)}</b><br>${pct(r.rate)} fraud<br>${whole(Math.round(r.rate * r.n))} of ${whole(r.n)} claims`;

/* -------------------------------------------------------- chart parts */
function niceMax(v) {
  const steps = [0.05, 0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8, 1];
  return steps.find(s => s >= v * 1.05) || 1;
}

function hbar(host, rows, ref) {
  const max = Math.max(...rows.map(r => r.rate), ref) * 1.12;
  host.innerHTML = rows.map((r, i) => `
    <div class="hrow" tabindex="0" data-i="${i}">
      <span class="hlabel" title="${esc(r.label)}">${esc(r.label)}</span>
      <span class="htrack"><span class="hfill" style="width:${(r.rate / max * 100).toFixed(2)}%"></span>
        <span class="htick" style="left:${(ref / max * 100).toFixed(2)}%"></span></span>
      <span class="hval">${pct(r.rate)}</span>
    </div>`).join("") +
    `<p class="note"><span class="dash"></span>Overall rate ${pct(ref)}</p>`;
  host.querySelectorAll(".hrow").forEach(el => bindTip(el, rowTip(rows[+el.dataset.i])));
}

function vbar(host, rows, ref) {
  const max = niceMax(Math.max(...rows.map(r => r.rate), ref));
  const peak = rows.reduce((a, b) => (b.rate > a.rate ? b : a));
  const ticks = [0, max / 2, max];
  host.innerHTML = `<div class="vwrap"><div class="vplot">
      ${ticks.map(t => `<div class="vgrid" style="bottom:${t / max * 100}%"></div><span class="vtick" style="bottom:${t / max * 100}%">${pct(t, 0)}</span>`).join("")}
      <div class="vref" style="bottom:${ref / max * 100}%"></div>
      <div class="vcols">${rows.map((r, i) => `
        <div class="vcol" tabindex="0" data-i="${i}">
          <span class="vfill" style="height:${(r.rate / max * 100).toFixed(2)}%"></span>
          ${r === peak ? `<span class="vval" style="bottom:calc(${(r.rate / max * 100).toFixed(2)}% + 4px)">${pct(r.rate)}</span>` : ""}
        </div>`).join("")}</div>
    </div>
    <div class="vlabels">${rows.map(r => `<span>${esc(r.label)}</span>`).join("")}</div></div>
    <p class="note"><span class="dash"></span>Overall rate ${pct(ref)}</p>`;
  host.querySelectorAll(".vcol").forEach(el => bindTip(el, rowTip(rows[+el.dataset.i])));
}

function lineChart(host, rows, ref) {
  const W = host.clientWidth || 600, H = 230, m = { l:44, r:14, t:14, b:30 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const max = niceMax(Math.max(...rows.map(r => r.rate), ref));
  const x = i => m.l + (rows.length === 1 ? iw / 2 : i * iw / (rows.length - 1));
  const y = v => m.t + ih - v / max * ih;
  const path = rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r.rate).toFixed(1)}`).join(" ");
  const xl = rows.map((r, i) => r.label.endsWith("Q1") ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${r.label.slice(0, 4)}</text>` : "").join("");
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Fraud rate by quarter">
    ${[0, max / 2, max].map(t => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)"/><text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${pct(t, 0)}</text>`).join("")}
    <line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--ink-3)"/>
    <line x1="${m.l}" x2="${W - m.r}" y1="${y(ref)}" y2="${y(ref)}" stroke="var(--ink-3)" stroke-width="2" stroke-dasharray="5 4" opacity=".8"/>
    ${xl}
    <path d="${path}" fill="none" stroke="var(--series)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <g id="cur" style="display:none"><line y1="${m.t}" y2="${m.t + ih}" stroke="var(--ink-3)"/><circle r="5" fill="var(--series)" stroke="var(--surface)" stroke-width="2"/></g>
    <rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" id="hit"/></svg>
    <p class="note"><span class="dash"></span>Overall rate ${pct(ref)}</p>`;
  const svg = host.querySelector("svg"), cur = svg.querySelector("#cur");
  const hit = svg.querySelector("#hit");
  hit.addEventListener("mousemove", e => {
    const b = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(rows.length - 1, Math.round(((e.clientX - b.left) - m.l) / iw * (rows.length - 1))));
    cur.style.display = "";
    cur.querySelector("line").setAttribute("x1", x(i)); cur.querySelector("line").setAttribute("x2", x(i));
    cur.querySelector("circle").setAttribute("cx", x(i)); cur.querySelector("circle").setAttribute("cy", y(rows[i].rate));
    showTip(rowTip(rows[i]), e.clientX, e.clientY);
  });
  hit.addEventListener("mouseleave", () => { cur.style.display = "none"; hideTip(); });
}

function tableView(rows) {
  return `<div class="tablewrap"><table><thead><tr><th>Group</th><th class="r">Fraud rate</th><th class="r">Fraud claims</th><th class="r">Claims</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${esc(r.label)}</td><td class="r">${pct(r.rate)}</td><td class="r">${whole(Math.round(r.rate * r.n))}</td><td class="r">${whole(r.n)}</td></tr>`).join("")}
  </tbody></table></div>`;
}

/* a titled chart card with a chart / table switch */
function card({ title, takeaway, rows, kind, ref }) {
  const el = document.createElement("section");
  el.className = "panel";
  el.innerHTML = `<div class="card-head"><div><h3>${esc(title)}</h3><p class="takeaway">${takeaway}</p></div>
    <button class="toggle" type="button" aria-pressed="false">View as table</button></div><div class="body"></div>`;
  const body = $(".body", el), btn = $(".toggle", el);
  const draw = () => {
    const asTable = btn.getAttribute("aria-pressed") === "true";
    if (asTable) { body.className = "body"; body.innerHTML = tableView(rows); }
    else if (kind === "line") { body.className = "body line-host"; lineChart(body, rows, ref); }
    else { body.className = "body"; (kind === "h" ? hbar : vbar)(body, rows, ref); }
    btn.textContent = asTable ? "View as chart" : "View as table";
  };
  btn.addEventListener("click", () => { btn.setAttribute("aria-pressed", btn.getAttribute("aria-pressed") === "true" ? "false" : "true"); draw(); });
  el._draw = draw; draw();
  if (kind === "line") queueMicrotask(draw);   // redraw once attached, so the width is measured correctly
  return el;
}

/* plain-language takeaways, computed from the data */
const hi = rows => rows.reduce((a, b) => (b.rate > a.rate ? b : a));
const lo = rows => rows.reduce((a, b) => (b.rate < a.rate ? b : a));
function spread(rows, unit = "") {
  const a = hi(rows), b = lo(rows);
  return `Highest: <b>${esc(a.label)}${unit}</b> at ${pct(a.rate)}. Lowest: <b>${esc(b.label)}${unit}</b> at ${pct(b.rate)}.`;
}
function flatOrSpread(rows, what, unit = "") {
  const a = hi(rows), b = lo(rows);
  return a.rate - b.rate < 0.04
    ? `${what} makes little difference: every group sits between ${pct(b.rate)} and ${pct(a.rate)}.`
    : spread(rows, unit);
}

/* ------------------------------------------------------------ views */
function renderOverview() {
  const s = state.stats, k = s.kpis, ref = k.fraud_rate;
  const top = hi(s.by_provider_type);
  const rest = s.by_provider_type.filter(r => r !== top);
  const restRate = rest.reduce((t, r) => t + r.rate * r.n, 0) / rest.reduce((t, r) => t + r.n, 0);
  $("#ov-title").textContent = top.rate > restRate * 1.5
    ? `${top.label} claims are fraud ${pct(top.rate, 0)} of the time`
    : "Where fraud concentrates";
  $("#ov-sub").textContent = top.rate > restRate * 1.5
    ? `That is ${(top.rate / restRate).toFixed(1)} times the rate of every other provider type combined (${pct(restRate, 0)}).`
    : "Share of claims labelled fraudulent, broken down by who provides the care.";

  $("#kpis").innerHTML = [
    ["Claims analysed", whole(k.claims), `${s.date_range[0].slice(0, 4)} to ${s.date_range[1].slice(0, 4)}`],
    ["Labelled fraud", pct(k.fraud_rate), `${whole(k.fraud_claims)} claims`],
    ["Average claim", compact(k.avg_claim_amount), "per claim"],
    ["Money in fraud claims", pct(k.fraud_money_share), "of total claim value"],
  ].map(([l, v, sub]) => `<div class="kpi"><div class="kpi-label">${l}</div><div class="kpi-value">${v}</div><div class="kpi-sub">${sub}</div></div>`).join("");

  const grid = $("#ov-grid"); grid.innerHTML = "";
  grid.append(
    card({ title:"Fraud rate by provider type", takeaway:spread(s.by_provider_type), rows:s.by_provider_type, kind:"h", ref }),
    card({ title:"Fraud rate by provider specialty", takeaway:spread(s.by_specialty), rows:s.by_specialty, kind:"h", ref }),
    card({ title:"Fraud rate by quarter", takeaway:flatOrSpread(s.by_quarter, "Time"), rows:s.by_quarter, kind:"line", ref }),
    card({ title:"Fraud rate by service type", takeaway:spread(s.by_service_type), rows:s.by_service_type, kind:"h", ref }),
  );
}

function renderPatterns() {
  const s = state.stats, ref = s.kpis.fraud_rate, g = $("#pat-grid");
  g.innerHTML = "";
  g.append(
    card({ title:"By number of procedures", takeaway:spread(s.by_procedures, " procedures"), rows:s.by_procedures, kind:"v", ref }),
    card({ title:"By provider-patient distance (miles)", takeaway:spread(s.by_distance, " miles"), rows:s.by_distance, kind:"v", ref }),
    card({ title:"By claim amount", takeaway:spread(s.by_amount), rows:s.by_amount, kind:"v", ref }),
    card({ title:"By patient age", takeaway:flatOrSpread(s.by_age, "Age"), rows:s.by_age, kind:"v", ref }),
    card({ title:"By admission type", takeaway:flatOrSpread(s.by_admission_type, "Admission type"), rows:s.by_admission_type, kind:"h", ref }),
  );
}

async function renderClaims() {
  const limit = $("#limit").value, scope = $("#scope").value;
  const data = await api(`/api/top-claims?limit=${limit}&scope=${scope}`);
  const lvl = { High:["high", "▲"], Medium:["medium", "◆"], Low:["low", "●"] };
  const fill = { High:"var(--crit)", Medium:"var(--warn)", Low:"var(--good)" };
  const t = state.stats && state.stats.test;
  $("#claims-sub").textContent = scope === "test" && t
    ? `On ${whole(t.n)} claims the model never saw, it flagged ${whole(t.flagged)} at its ${pct(data.threshold, 0)} threshold. ${pct(t.precision, 0)} of those flags were labelled fraud, and it caught ${pct(t.recall, 0)} of all labelled fraud.`
    : `The ${data.count} highest scores across all ${whole(data.pool)} claims, at the model's ${pct(data.threshold, 0)} alert threshold.`;
  $("#claims-note").textContent = scope === "test"
    ? "These claims were set aside before training, so the scores show how the model performs on claims it has not seen."
    : "This list includes claims the model learned from, so its top scores look more certain than they would on new claims.";
  $("#claims-table").innerHTML = `<table><thead><tr>
      <th>Claim</th><th>Provider</th><th>Specialty</th><th class="r">Amount</th><th class="r">Procedures</th><th class="r">Distance (mi)</th>
      <th class="r">Model score</th><th>Risk</th><th>Dataset label</th></tr></thead><tbody>
    ${data.claims.map(c => { const [cls, ico] = lvl[c.risk_level]; return `<tr>
      <td class="num">#${c.claim_id}</td><td>${esc(c.provider_type)}</td><td>${esc(c.specialty)}</td>
      <td class="r">${compact(c.claim_amount)}</td><td class="r">${c.procedures}</td><td class="r">${c.distance_miles}</td>
      <td class="r"><span class="cellbar"><i><b style="width:${c.probability * 100}%;background:${fill[c.risk_level]}"></b></i>${pct(c.probability, 0)}</span></td>
      <td><span class="badge ${cls}"><i aria-hidden="true">${ico}</i>${c.risk_level}</span></td>
      <td>${c.labelled_fraud ? "Fraud" : "Not fraud"}</td></tr>`; }).join("")}
    </tbody></table>`;
}

function normalizeInvestigationClaim(row) {
  const out = {};
  const mapping = {
    claim_id: "Claim_ID",
    claim_number: "Claim_ID",
    policy_number: "Policy_Number",
    claim_amount: "Claim_Amount",
    claim_date: "Claim_Date",
    service_date: "Service_Date",
    provider_name: "Provider_Name",
    provider_type: "Provider_Type",
    provider_specialty: "Provider_Specialty",
    service_type: "Service_Type",
    hospital_id: "Hospital_ID",
    diagnosis_code: "Diagnosis_Code",
    invoice_number: "Invoice_Number",
    claim_status: "Claim_Status",
  };
  for (const [sourceKey, targetKey] of Object.entries(mapping)) {
    if (row[sourceKey] !== undefined && row[sourceKey] !== null)
      out[targetKey] = row[sourceKey];
  }
  return out;
}

function renderInvestigationStatus(host, title, message) {
  host.innerHTML = `<div class="panel" style="padding:14px 16px;"><h3>${esc(title)}</h3><p class="assistant-note">${esc(message)}</p></div>`;
}

function renderInvestigationTable(rows, { emptyText, columns }) {
  if (!rows.length) {
    return `<p class="assistant-note">${esc(emptyText)}</p>`;
  }
  return `<table><thead><tr>${columns.map(col => `<th>${esc(col)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function renderInvestigationFieldRows(fields) {
  const entries = [
    ["policy_number", "Policy number"],
    ["claim_number", "Claim number"],
    ["invoice_number", "Invoice number"],
    ["provider_name", "Provider name"],
    ["claim_amount", "Claim amount"],
    ["admission_date", "Admission date"],
    ["discharge_date", "Discharge date"],
    ["service_date", "Service date"],
    ["invoice_date", "Invoice date"],
    ["diagnosis", "Diagnosis"],
    ["treatment", "Treatment"],
  ];
  return entries.map(([key, label]) => {
    const value = fields[key] ?? "unavailable";
    const escaped = esc(String(value));
    return `<div class="field"><label for="investigation-field-${key}">${esc(label)}</label><input id="investigation-field-${key}" name="${key}" value="${escaped}" /></div>`;
  }).join("");
}

async function renderInvestigationPage() {
  const reviewHost = $("#investigation-results");
  const reviewFormHost = $("#investigation-review");
  const policyHost = $("#investigation-policy");
  const duplicateHost = $("#investigation-duplicates");
  const anomalyHost = $("#investigation-anomalies");
  const summaryHost = $("#investigation-summary");
  const errorHost = $("#investigation-error");
  errorHost.hidden = true;
  reviewFormHost.innerHTML = "<p class=\"assistant-note\">Loading claim review data…</p>";

  try {
    const [reviewData, claimDocuments, policies] = await Promise.all([
      api("/api/review-claims?limit=25"),
      api("/api/claim-documents"),
      api("/api/documents"),
    ]);

    const reviewClaims = reviewData.claims || [];
    state.investigationClaims = reviewClaims;
    const claimDocs = claimDocuments.claim_documents || [];
    const policyDocs = policies.documents || [];

    if (!reviewClaims.length) {
      reviewHost.innerHTML = `<p class="assistant-note">No claim rows are available yet.</p>`;
    } else {
      const rows = reviewClaims.map(claim => [
        `<button class="linkbtn" type="button" data-investigation-claim="${esc(claim.claim_id || "unknown")}">${esc(claim.claim_id || "unknown")}</button>`,
        esc(claim.provider_type || "unavailable"),
        esc(claim.service_type || "unavailable"),
        esc(claim.claim_amount == null ? "unavailable" : `$${Number(claim.claim_amount).toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 })}`),
      ]);
      reviewHost.innerHTML = renderInvestigationTable(rows, {
        emptyText: "No claims available to review.",
        columns: ["Claim", "Provider", "Service", "Amount"],
      });
      reviewHost.querySelectorAll("[data-investigation-claim]").forEach(button => {
        button.addEventListener("click", () => {
          const claimId = button.getAttribute("data-investigation-claim");
          const match = reviewClaims.find(claim => String(claim.claim_id || "") === String(claimId));
          if (!match) return;
          const fields = {
            policy_number: match.policy_number || "unavailable",
            claim_number: match.claim_id || "unavailable",
            invoice_number: "unavailable",
            provider_name: match.provider_type || "unavailable",
            claim_amount: match.claim_amount == null ? "unavailable" : `$${Number(match.claim_amount).toFixed(2)}`,
            admission_date: "unavailable",
            discharge_date: "unavailable",
            service_date: match.service_date || "unavailable",
            invoice_date: "unavailable",
            diagnosis: "unavailable",
            treatment: "unavailable",
          };
          reviewFormHost.innerHTML = `<form id="investigation-review-form" class="fields-grid"><div class="rowctl"><h3>Review claim ${esc(claimId)}</h3></div>${renderInvestigationFieldRows(fields)}<div class="actions"><button class="btn primary" type="submit">Save corrections</button><button class="btn" type="button" id="investigation-verify-button">Verify policy</button><button class="btn" type="button" id="investigation-duplicate-button">Check duplicates</button></div></form>`;
          const form = $("#investigation-review-form");
          form.addEventListener("submit", async event => {
            event.preventDefault();
            const payload = {};
            form.querySelectorAll("input[name]").forEach(input => {
              payload[input.name] = input.value.trim() || "unavailable";
            });
            const selectedDocument = claimDocs[0];
            if (!selectedDocument) {
              errorHost.textContent = "Upload a claim document before saving corrections.";
              errorHost.hidden = false;
              return;
            }
            try {
              const response = await api(`/api/claim-documents/${encodeURIComponent(selectedDocument.id)}/review`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              const doc = response.claim_document;
              const corrected = doc.corrected_extraction || doc.raw_extraction || { fields: payload };
              const values = corrected.fields || {};
              reviewFormHost.innerHTML = `<form id="investigation-review-form" class="fields-grid"><div class="rowctl"><h3>Review claim ${esc(claimId)}</h3></div>${renderInvestigationFieldRows(values)}<div class="actions"><button class="btn primary" type="submit">Save corrections</button><button class="btn" type="button" id="investigation-verify-button">Verify policy</button><button class="btn" type="button" id="investigation-duplicate-button">Check duplicates</button></div></form>`;
              bindInvestigationReviewActions();
            } catch (err) {
              errorHost.textContent = err.message;
              errorHost.hidden = false;
            }
          });
          bindInvestigationReviewActions();
        });
      });
    }

    const policyOptions = policyDocs.filter(doc => doc.status === "ready").map(doc => `<option value="${esc(doc.id)}">${esc(doc.filename)}</option>`).join("");
    policyHost.innerHTML = policyOptions
      ? `<label for="investigation-policy-picker">Policy document</label><select id="investigation-policy-picker">${policyOptions}</select><button class="btn primary" type="button" id="run-policy-verification">Verify</button><div id="investigation-policy-results" style="margin-top:12px;"></div>`
      : `<p class="assistant-note">Upload a policy document in the Policy Document Assistant tab before running verification.</p>`;
    if (policyOptions) {
      $("#run-policy-verification").addEventListener("click", async () => {
        const form = $("#investigation-review-form");
        if (!form) {
          policyHost.querySelector("#investigation-policy-results").innerHTML = `<p class="assistant-note">Select a claim to review before verifying.</p>`;
          return;
        }
        const fields = {};
        form.querySelectorAll("input[name]").forEach(input => {
          fields[input.name] = input.value.trim() || "unavailable";
        });
        const documentId = $("#investigation-policy-picker").value;
        try {
          const result = await api("/api/policy-verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ policy_document_id: documentId, claim_fields: fields }),
          });
          const findings = result.findings || [];
          const rows = findings.map(f => [
            esc(f.claim_field || "unknown"),
            esc(f.status || "Inconclusive"),
            esc(f.document_name || "unavailable"),
            esc(f.quote || "unavailable"),
            esc(f.reason || "No reason recorded."),
          ]);
          $("#investigation-policy-results").innerHTML = renderInvestigationTable(rows, {
            emptyText: "No policy evidence was available for this claim.",
            columns: ["Claim field", "Status", "Document", "Quote", "Reason"],
          });
        } catch (err) {
          $("#investigation-policy-results").innerHTML = `<p class="assistant-note">${esc(err.message)}</p>`;
        }
      });
    }

    const anomalyPayload = {
      claims: reviewClaims.map(claim => ({
        Claim_ID: claim.claim_id,
        Claim_Amount: claim.claim_amount,
        Provider_Type: claim.provider_type,
        Service_Type: claim.service_type,
        Policy_Number: claim.policy_number,
      })),
      group_by: ["Provider_Type", "Service_Type"],
      min_group_size: 20,
    };
    try {
      const anomaly = await api("/api/anomaly-detection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(anomalyPayload),
      });
      const anomalies = anomaly.anomalies || [];
      if (!anomalies.length) {
        anomalyHost.innerHTML = `<p class="assistant-note">No amount anomalies were found in this comparison set.</p>`;
      } else {
        anomalyHost.innerHTML = renderInvestigationTable(anomalies.map(item => [
          esc(item.claim_id || "unknown"),
          esc(item.severity || "Low"),
          esc(item.group || "global baseline"),
          `$${Number(item.claim_amount || 0).toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 })}`,
          `${Number(item.score || 0).toFixed(2)}`,
          esc(item.reason || "Manual review recommended."),
        ]), {
          emptyText: "No anomalies flagged.",
          columns: ["Claim ID", "Severity", "Comparison", "Amount", "Score", "Reason"],
        });
      }
    } catch (err) {
      anomalyHost.innerHTML = `<p class="assistant-note">${esc(err.message)}</p>`;
    }

    const duplicatePayload = {
      claim: reviewClaims[0] ? normalizeInvestigationClaim(reviewClaims[0]) : {},
      comparisons: reviewClaims.slice(1).map(normalizeInvestigationClaim),
      exact_threshold: 0.96,
      near_threshold: 0.82,
    };
    if (reviewClaims.length > 1) {
      try {
        const duplicate = await api("/api/duplicate-claims", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(duplicatePayload),
        });
        const candidates = duplicate.candidates || [];
        if (!candidates.length) {
          duplicateHost.innerHTML = `<p class="assistant-note">No duplicate or near-duplicate records were found.</p>`;
        } else {
          duplicateHost.innerHTML = renderInvestigationTable(candidates.map(item => [
            esc(item.match_type || "near"),
            `${Number(item.score || 0).toFixed(2)}`,
            esc(item.reference_record && item.reference_record.Claim_ID ? item.reference_record.Claim_ID : "unknown"),
            esc(item.reasons && item.reasons.length ? item.reasons.map(r => `${r.field}: ${r.details}`).join(" | ") : "No reason recorded."),
          ]), {
            emptyText: "No duplicates identified.",
            columns: ["Match type", "Score", "Reference claim", "Reasons"],
          });
        }
      } catch (err) {
        duplicateHost.innerHTML = `<p class="assistant-note">${esc(err.message)}</p>`;
      }
    } else {
      duplicateHost.innerHTML = `<p class="assistant-note">Add more claim records to compare duplicates.</p>`;
    }

    const summary = [];
    const errors = [];
    if (!claimDocs.length) errors.push("No claim document uploaded yet.");
    if (!policyDocs.filter(doc => doc.status === "ready").length) errors.push("No policy document selected for verification.");
    if (!reviewClaims.length) errors.push("No reviewable claim rows are available.");
    summary.push(...(errors.length ? errors : ["Claim extraction, policy verification, duplicate review, and anomaly checks are available for human review."]));
    const reviewPayload = {
      title: "Human review summary",
      details: summary,
      nextSteps: [
        "Confirm the extracted claim values before policy review.",
        "Check evidence-backed policy mismatches and waiting periods with a human reviewer.",
        "Review any duplicate or near-duplicate candidates before making a final decision.",
        "Assess anomaly severities with the comparison group and document the limits of the model.",
      ],
    };
    summaryHost.innerHTML = `<div class="assistant-note"><ul>${reviewPayload.details.map(item => `<li>${esc(item)}</li>`).join("")}</ul><p><strong>Recommended next steps</strong></p><ul>${reviewPayload.nextSteps.map(item => `<li>${esc(item)}</li>`).join("")}</ul></div>`;

    if (!claimDocs.length && reviewClaims.length) {
      const first = reviewClaims[0];
      reviewFormHost.innerHTML = `<form id="investigation-review-form" class="fields-grid"><div class="rowctl"><h3>Review claim ${esc(first.claim_id || "unknown")}</h3></div>${renderInvestigationFieldRows({
        policy_number: first.policy_number || "unavailable",
        claim_number: first.claim_id || "unavailable",
        invoice_number: "unavailable",
        provider_name: first.provider_type || "unavailable",
        claim_amount: first.claim_amount == null ? "unavailable" : `$${Number(first.claim_amount).toFixed(2)}`,
        admission_date: "unavailable",
        discharge_date: "unavailable",
        service_date: first.service_date || "unavailable",
        invoice_date: "unavailable",
        diagnosis: "unavailable",
        treatment: "unavailable",
      })}<div class="actions"><button class="btn primary" type="submit">Save corrections</button><button class="btn" type="button" id="investigation-verify-button">Verify policy</button><button class="btn" type="button" id="investigation-duplicate-button">Check duplicates</button></div></form>`;
      bindInvestigationReviewActions();
    }

    if (claimDocs.length) {
      const nextDoc = claimDocs[0];
      const raw = nextDoc.corrected_extraction ? JSON.parse(nextDoc.corrected_extraction) : nextDoc.raw_extraction ? JSON.parse(nextDoc.raw_extraction) : { fields: {} };
      const fields = raw.fields || {};
      reviewFormHost.innerHTML = `<form id="investigation-review-form" class="fields-grid"><div class="rowctl"><h3>Review claim document ${esc(nextDoc.filename || nextDoc.id)}</h3></div>${renderInvestigationFieldRows(fields)}<div class="actions"><button class="btn primary" type="submit">Save corrections</button><button class="btn" type="button" id="investigation-verify-button">Verify policy</button><button class="btn" type="button" id="investigation-duplicate-button">Check duplicates</button></div></form>`;
      bindInvestigationReviewActions();
    }
    attachInvestigationUploadHandlers();
  } catch (error) {
    reviewHost.innerHTML = `<p class="assistant-note">${esc(error.message)}</p>`;
    policyHost.innerHTML = `<p class="assistant-note">${esc(error.message)}</p>`;
    duplicateHost.innerHTML = `<p class="assistant-note">${esc(error.message)}</p>`;
    anomalyHost.innerHTML = `<p class="assistant-note">${esc(error.message)}</p>`;
    summaryHost.innerHTML = `<p class="assistant-note">${esc(error.message)}</p>`;
  }
}

function bindInvestigationReviewActions() {
  const form = $("#investigation-review-form");
  if (!form) return;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const claimDocId = form.dataset.claimDocId;
    const payload = {};
    form.querySelectorAll("input[name]").forEach(input => {
      payload[input.name] = input.value.trim() || "unavailable";
    });
    if (!claimDocId) {
      const resultsHost = $("#investigation-policy-results");
      if (resultsHost) resultsHost.innerHTML = `<p class="assistant-note">Upload or select a claim document before saving corrections.</p>`;
      return;
    }
    try {
      const response = await api(`/api/claim-documents/${encodeURIComponent(claimDocId)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const corrected = response.claim_document.corrected_extraction || response.claim_document.raw_extraction || { fields: payload };
      form.innerHTML = `${renderInvestigationFieldRows(corrected.fields || payload)}<div class="actions"><button class="btn primary" type="submit">Save corrections</button><button class="btn" type="button" id="investigation-verify-button">Verify policy</button><button class="btn" type="button" id="investigation-duplicate-button">Check duplicates</button></div>`;
      form.dataset.claimDocId = claimDocId;
      bindInvestigationReviewActions();
    } catch (error) {
      $("#investigation-error").textContent = error.message;
      $("#investigation-error").hidden = false;
    }
  });
  const verifyButton = $("#investigation-verify-button");
  if (verifyButton) {
    verifyButton.addEventListener("click", async () => {
      const selector = $("#investigation-policy-picker");
      if (!selector || !selector.value) {
        const policyResults = $("#investigation-policy-results");
        if (policyResults) policyResults.innerHTML = `<p class="assistant-note">Upload a policy document first.</p>`;
        return;
      }
      const fields = {};
      form.querySelectorAll("input[name]").forEach(input => {
        fields[input.name] = input.value.trim() || "unavailable";
      });
      try {
        const result = await api("/api/policy-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ policy_document_id: selector.value, claim_fields: fields }),
        });
        const findings = result.findings || [];
        const resultsHost = $("#investigation-policy-results");
        if (!resultsHost) return;
        if (!findings.length) {
          resultsHost.innerHTML = `<p class="assistant-note">No policy evidence was found for this claim.</p>`;
          return;
        }
        resultsHost.innerHTML = renderInvestigationTable(findings.map(item => [
          esc(item.claim_field || "unknown"),
          esc(item.status || "Inconclusive"),
          esc(item.document_name || "unavailable"),
          esc(item.quote || "unavailable"),
          esc(item.reason || "No reason recorded."),
        ]), {
          emptyText: "No policy findings.",
          columns: ["Claim field", "Status", "Document", "Quote", "Reason"],
        });
      } catch (err) {
        const resultsHost = $("#investigation-policy-results");
        if (resultsHost) resultsHost.innerHTML = `<p class="assistant-note">${esc(err.message)}</p>`;
      }
    });
  }

  const duplicateButton = $("#investigation-duplicate-button");
  if (duplicateButton) {
    duplicateButton.addEventListener("click", async () => {
      const fields = {};
      form.querySelectorAll("input[name]").forEach(input => {
        fields[input.name] = input.value.trim() || "unavailable";
      });
      const comparisons = (state.investigationClaims || []).map(normalizeInvestigationClaim);
      try {
        const result = await api("/api/duplicate-claims", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claim: fields, comparisons }),
        });
        const candidates = result.candidates || [];
        const host = $("#investigation-duplicates");
        if (!candidates.length) {
          host.innerHTML = `<p class="assistant-note">No duplicate or near-duplicate records were flagged.</p>`;
          return;
        }
        host.innerHTML = renderInvestigationTable(candidates.map(item => [
          esc(item.match_type || "near"),
          `${Number(item.score || 0).toFixed(2)}`,
          esc(item.reference_record && item.reference_record.Claim_ID ? item.reference_record.Claim_ID : "unknown"),
          esc(item.reasons && item.reasons.length ? item.reasons.map(r => `${r.field}: ${r.details}`).join(" | ") : "No reason recorded."),
        ]), {
          emptyText: "No duplicate candidates.",
          columns: ["Match type", "Score", "Reference claim", "Reasons"],
        });
      } catch (err) {
        const host = $("#investigation-duplicates");
        host.innerHTML = `<p class="assistant-note">${esc(err.message)}</p>`;
      }
    });
  }
}

function attachInvestigationUploadHandlers() {
  const form = $("#investigation-upload-form");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const input = $("#investigation-file");
    if (!input || !input.files || !input.files.length) {
      $("#investigation-error").textContent = "Choose a PDF, TXT, DOCX, or image file to extract.";
      $("#investigation-error").hidden = false;
      return;
    }
    const formData = new FormData();
    formData.append("file", input.files[0]);
    try {
      const result = await api("/api/claim-documents", { method: "POST", body: formData });
      const doc = result.claim_document;
      if (!doc || !doc.id) {
        throw new Error("The claim document was uploaded but no identifier was returned.");
      }
      const detail = await api(`/api/claim-documents/${encodeURIComponent(doc.id)}`);
      const raw = detail.claim_document;
      const extracted = raw.corrected_extraction || raw.raw_extraction || { fields: {} };
      const fields = extracted.fields || {};
      $("#investigation-review").innerHTML = `<form id="investigation-review-form" class="fields-grid" data-claim-doc-id="${esc(doc.id)}"><div class="rowctl"><h3>Extracted values</h3></div>${renderInvestigationFieldRows(fields)}<div class="actions"><button class="btn primary" type="submit">Save corrections</button><button class="btn" type="button" id="investigation-verify-button">Verify policy</button><button class="btn" type="button" id="investigation-duplicate-button">Check duplicates</button></div></form>`;
      bindInvestigationReviewActions();
      $("#investigation-error").hidden = true;
      await renderInvestigationPage();
    } catch (error) {
      $("#investigation-error").textContent = error.message;
      $("#investigation-error").hidden = false;
    }
  });
}

/* ------------------------------------------------------ claim checker */
const FORM = [
  ["Claim", [
    ["Claim_Amount", "Claim amount", "number", { step:"any", min:0 }],
    ["Deductible_Amount", "Deductible", "number", { step:"any", min:0 }],
    ["CoPay_Amount", "Co-pay", "number", { step:"any", min:0 }],
    ["Number_of_Procedures", "Number of procedures", "number", { step:1, min:1 }],
    ["Service_Type", "Service type", "select"],
    ["Claim_Submitted_Late", "Submitted late", "bool"],
  ]],
  ["Patient", [
    ["Patient_Age", "Age", "number", { step:1, min:0, max:120 }],
    ["Patient_Gender", "Gender", "select"],
    ["Number_of_Previous_Claims_Patient", "Previous claims (patient)", "number", { step:1, min:0 }],
  ]],
  ["Provider and stay", [
    ["Provider_Type", "Provider type", "select"],
    ["Provider_Specialty", "Specialty", "select"],
    ["Number_of_Previous_Claims_Provider", "Previous claims (provider)", "number", { step:1, min:0 }],
    ["Provider_Patient_Distance_Miles", "Distance to provider (miles)", "number", { step:"any", min:0 }],
    ["Admission_Type", "Admission type", "select"],
    ["Discharge_Type", "Discharge type", "select"],
    ["Length_of_Stay_Days", "Length of stay (days)", "number", { step:1, min:0 }],
  ]],
  ["Dates", [
    ["Service_Date", "Service date", "date"],
    ["Claim_Date", "Claim date", "date"],
    ["Policy_Expiration_Date", "Policy expires", "date"],
  ]],
];

function buildForm() {
  const form = $("#claim-form");
  form.innerHTML = FORM.map(([legend, fields]) => `<fieldset class="fieldset"><legend>${legend}</legend><div class="fields">
    ${fields.map(([key, label, type, attrs = {}]) => {
      let control;
      if (type === "select") {
        const opts = (state.options && state.options[key]) || [];
        control = `<select id="f-${key}" name="${key}"><option value="">Typical</option>${opts.map(o => `<option>${esc(o)}</option>`).join("")}</select>`;
      } else if (type === "bool") {
        control = `<select id="f-${key}" name="${key}"><option value="">Typical</option><option value="1">Yes</option><option value="0">No</option></select>`;
      } else {
        control = `<input id="f-${key}" name="${key}" type="${type}" placeholder="Typical" ${Object.entries(attrs).map(([a, v]) => `${a}="${v}"`).join(" ")}>`;
      }
      return `<div class="field"><label for="f-${key}">${label}</label>${control}</div>`;
    }).join("")}</div></fieldset>`).join("") +
    `<div class="actions"><button class="btn primary" type="submit">Score claim</button>
      <button class="btn" type="button" id="load-sample">Load a real claim</button>
      <button class="btn" type="button" id="clear-form">Clear</button></div>`;

  form.addEventListener("submit", e => { e.preventDefault(); scoreClaim(); });
  $("#load-sample").addEventListener("click", () => loadSample(true));
  $("#clear-form").addEventListener("click", () => { form.reset(); state.base = {}; state.labelled = null; $("#result").innerHTML = `<h2>Model result</h2><p class="hint">Fill in the claim and select Score claim.</p>`; });
  form.addEventListener("input", () => { state.labelled = null; const n = $(".labelnote"); if (n) n.remove(); });
}

function fillForm(claim) {
  FORM.flatMap(([, f]) => f).forEach(([key, , type]) => {
    const el = $(`#f-${key}`); let v = claim[key];
    if (v === undefined || v === null) { el.value = ""; return; }
    if (type === "bool") v = (v === true || v === 1 || v === "1" || v === "True" || v === "true") ? "1" : "0";
    el.value = String(v);
  });
}

async function loadSample(score) {
  try {
    const s = await api("/api/sample-claim");
    state.base = s.claim; fillForm(s.claim); state.labelled = s.labelled_fraud;
    if (score) await scoreClaim(s.labelled_fraud);
  } catch (e) { showError(e.message); }
}

function collect() {
  const claim = { ...state.base };
  FORM.flatMap(([, f]) => f).forEach(([key, , type]) => {
    const v = $(`#f-${key}`).value;
    if (v === "") { delete claim[key]; return; }
    claim[key] = (type === "number" || type === "bool") ? Number(v) : v;
  });
  return claim;
}

async function scoreClaim(labelled = null) {
  const out = $("#result");
  try {
    const res = (await api("/predict", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(collect()) })).results[0];
    const p = res.fraud_probability, t = state.threshold;
    const [cls, ico, color, name] = { High:["high", "▲", "var(--crit)", "High risk"], Medium:["medium", "◆", "var(--warn)", "Medium risk"], Low:["low", "●", "var(--good)", "Low risk"] }[res.risk_level];
    const verdict = res.is_fraud
      ? `At or above the ${pct(t, 0)} alert threshold. This claim should go to manual review.`
      : p >= t / 2
        ? `Below the ${pct(t, 0)} alert threshold, but high enough to keep an eye on.`
        : `Well below the ${pct(t, 0)} alert threshold. No review needed.`;
    out.innerHTML = `<h2>Model result</h2>
      <div class="score"><span class="score-num">${pct(p, 0)}</span><span class="badge ${cls}"><i aria-hidden="true">${ico}</i>${name}</span></div>
      <div class="meter" role="img" aria-label="Fraud probability ${pct(p, 0)}, alert threshold ${pct(t, 0)}">
        <div class="meter-track"><div class="meter-fill" id="mfill" style="background:${color}"></div></div>
        <div class="meter-tick" style="left:${t * 100}%"><span>Alert at ${pct(t, 0)}</span></div>
      </div>
      <div class="scale"><span>0%</span><span>100%</span></div>
      <p class="verdict">${verdict}</p>
      ${labelled === null ? "" : `<p class="labelnote">In the dataset, this claim is labelled <b>${labelled ? "fraud" : "not fraud"}</b>. The model never saw this claim during training.</p>`}`;
    requestAnimationFrame(() => requestAnimationFrame(() => { $("#mfill").style.width = (p * 100) + "%"; }));
  } catch (e) { out.innerHTML = `<h2>Model result</h2><p class="hint">${esc(e.message)}</p>`; }
}

/* --------------------------------------------------------- routing */
const VIEWS = ["overview", "check", "claims", "patterns", "investigation", "assistant"];
async function show(name) {
  if (!VIEWS.includes(name)) name = "overview";
  VIEWS.forEach(v => { $(`#view-${v}`).hidden = v !== name; });
  document.querySelectorAll(".nav a").forEach(a => {
    if (a.dataset.view === name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  hideTip();
  try {
    if (name === "overview" && state.stats) renderOverview();
    if (name === "patterns" && state.stats) renderPatterns();
    if (name === "claims") await renderClaims();
    if (name === "check" && !state.rendered.check) { state.rendered.check = true; buildForm(); await loadSample(true); }
    if (name === "investigation") await renderInvestigationPage();
    if (name === "assistant") await refreshDocuments();
  } catch (e) { showError(e.message); }
}
addEventListener("hashchange", () => show(location.hash.slice(1)));
let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { const v = location.hash.slice(1) || "overview"; if (v === "overview" || v === "patterns") show(v); }, 150); });
["#limit", "#scope"].forEach(id => $(id).addEventListener("change", () => renderClaims().catch(e => showError(e.message))));

/* ----------------------------------------------------- policy assistant */
function selectedDocumentIds() {
  return [...state.selectedDocuments].filter(id => state.documents.some(doc => doc.id === id && doc.status === "ready"));
}

function renderDocuments() {
  const host = $("#document-list");
  if (!state.documents.length) {
    host.innerHTML = `<p class="assistant-note">No documents uploaded yet.</p>`;
    return;
  }
  host.innerHTML = state.documents.map(doc => `
    <div class="document-row">
      <input type="checkbox" data-select-document="${esc(doc.id)}" aria-label="Include ${esc(doc.filename)} in search" ${state.selectedDocuments.has(doc.id) ? "checked" : ""} ${doc.status !== "ready" ? "disabled" : ""}>
      <span class="document-name">${esc(doc.filename)}<span class="document-meta">${esc(doc.status)}${doc.page_count ? ` · ${doc.page_count} pages` : ""}${doc.chunk_count ? ` · ${doc.chunk_count} passages` : ""}${doc.error ? ` · ${esc(doc.error)}` : ""}</span></span>
      <button type="button" class="document-delete" data-delete-document="${esc(doc.id)}" aria-label="Delete ${esc(doc.filename)}">Delete</button>
    </div>`).join("");
  host.querySelectorAll("[data-select-document]").forEach(control => control.addEventListener("change", () => {
    if (control.checked) state.selectedDocuments.add(control.dataset.selectDocument);
    else state.selectedDocuments.delete(control.dataset.selectDocument);
  }));
  host.querySelectorAll("[data-delete-document]").forEach(button => button.addEventListener("click", () => deleteDocument(button.dataset.deleteDocument)));
}

async function refreshDocuments() {
  state.documents = (await api("/api/documents")).documents;
  const available = new Set(state.documents.filter(doc => doc.status === "ready").map(doc => doc.id));
  state.selectedDocuments = new Set([...state.selectedDocuments].filter(id => available.has(id)));
  if (!state.documentsInitialized) {
    state.selectedDocuments = available;
    state.documentsInitialized = true;
  }
  renderDocuments();
}

async function deleteDocument(id) {
  try {
    await api(`/api/documents/${encodeURIComponent(id)}`, { method:"DELETE" });
    state.documents = state.documents.filter(doc => doc.id !== id);
    state.selectedDocuments.delete(id);
    renderDocuments();
  } catch (error) {
    $("#upload-error").textContent = error.message;
    $("#upload-error").hidden = false;
  }
}

function appendChatMessage(role, text, sources = []) {
  const entry = { role, text, sources };
  state.conversation.push(entry);
  const log = $("#chat-log");
  if (state.conversation.length === 1) log.innerHTML = "";
  const message = document.createElement("article");
  message.className = `chat-message ${role}`;
  const heading = document.createElement("h3");
  heading.textContent = role === "user" ? "You" : "Document-grounded answer";
  const body = document.createElement("p");
  body.textContent = text;
  message.append(heading, body);
  if (role === "assistant") {
    if (sources.length) {
      const refs = document.createElement("div");
      refs.className = "chat-sources";
      refs.innerHTML = sources.map((source, index) => `
        <div class="source-card">
          <button class="source-ref" type="button" data-source-document="${esc(source.document_id)}">[${index + 1}] ${esc(source.filename)}${source.page ? ` · page ${source.page}` : source.section ? ` · ${esc(source.section)}` : ""}</button>
          <blockquote>${esc(source.excerpt)}</blockquote>
        </div>`).join("");
      message.append(refs);
      refs.querySelectorAll("[data-source-document]").forEach(button => button.addEventListener("click", () => {
        const id = button.dataset.sourceDocument;
        state.selectedDocuments.add(id);
        renderDocuments();
        $("#document-list").scrollIntoView({ behavior:"smooth", block:"nearest" });
      }));
    }
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "btn copy-answer";
    copy.textContent = "Copy answer";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = "Copied";
      } catch (_) {
        copy.textContent = "Copy unavailable";
      }
    });
    message.append(copy);
  }
  log.append(message);
  log.scrollTop = log.scrollHeight;
}

$("#upload-form").addEventListener("submit", async event => {
  event.preventDefault();
  const input = $("#document-file"), submit = event.currentTarget.querySelector("button[type=submit]");
  $("#upload-error").hidden = true;
  if (!input.files.length) return;
  submit.disabled = true;
  submit.textContent = "Processing document…";
  const form = new FormData();
  form.append("file", input.files[0]);
  try {
    const result = await api("/api/documents", { method:"POST", body:form });
    state.selectedDocuments.add(result.document.id);
    input.value = "";
    await refreshDocuments();
    state.selectedDocuments.add(result.document.id);
    renderDocuments();
  } catch (error) {
    $("#upload-error").textContent = error.message;
    $("#upload-error").hidden = false;
    await refreshDocuments();
  } finally {
    submit.disabled = false;
    submit.textContent = "Upload and process";
  }
});

$("#chat-form").addEventListener("submit", async event => {
  event.preventDefault();
  const input = $("#chat-question"), button = $("#ask-button"), question = input.value.trim();
  if (!question) return;
  $("#chat-error").hidden = true;
  $("#chat-retry").hidden = true;
  appendChatMessage("user", question);
  button.disabled = true;
  button.textContent = "Searching…";
  try {
    const result = await api("/api/chat", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ question, document_ids:selectedDocumentIds() }),
    });
    appendChatMessage("assistant", result.answer, result.sources);
    input.value = "";
  } catch (error) {
    $("#chat-error").textContent = error.message;
    $("#chat-error").hidden = false;
    $("#chat-retry").hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "Ask";
    input.focus();
  }
});

$("#chat-retry").addEventListener("click", () => $("#chat-form").requestSubmit());

$(".suggestions").addEventListener("click", event => {
  const question = event.target.dataset.question;
  if (!question) return;
  $("#chat-question").value = question;
  $("#chat-question").focus();
});
$("#refresh-documents").addEventListener("click", () => refreshDocuments().catch(error => {
  $("#upload-error").textContent = error.message;
  $("#upload-error").hidden = false;
}));

function showError(msg) {
  $("#banner").innerHTML = `<div class="banner" role="alert"><b>Could not reach the API.</b> ${esc(msg)}<br>
    Start it with <code>python api/app.py</code> and open <code>http://127.0.0.1:5000</code> in your browser.</div>`;
}

/* ------------------------------------------------------------- theme */
const themeBtn = $("#theme-btn");
try { const t = localStorage.getItem("theme"); if (t) document.documentElement.dataset.theme = t; } catch (_) {}
themeBtn.addEventListener("click", () => {
  const dark = (document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
  const next = dark ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch (_) {}
});

/* -------------------------------------------------------------- start */
(async function init() {
  try {
    const [h, stats, options] = await Promise.all([api("/health"), api("/api/stats"), api("/api/options")]);
    state.threshold = h.threshold; state.stats = stats; state.options = options;
    $("#banner").innerHTML = "";
  } catch (e) { showError(e.message); }
  show(location.hash.slice(1) || "overview");
})();

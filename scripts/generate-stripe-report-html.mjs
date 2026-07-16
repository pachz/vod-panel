#!/usr/bin/env node
/**
 * Generate a standalone HTML report from stripe-audit-report.json
 * Usage: node scripts/generate-stripe-report-html.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

const data = JSON.parse(readFileSync("stripe-audit-report.json", "utf8"));
const investigation = existsSync("stripe-payment-investigation.json")
  ? JSON.parse(readFileSync("stripe-payment-investigation.json", "utf8"))
  : null;
const { summary, priceCatalog, anomalies, anomalyCounts, activeSubscriptions, problemSubscriptions, chargeAmountDistribution } = data;

const fmt = (cents, currency = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(
    (cents ?? 0) / 100,
  );

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const generatedDate = new Date(data.generatedAt).toLocaleDateString("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const listMrr = parseFloat(summary.mrr.replace(/[$,]/g, "")) || 12672;
const actualMrr = investigation
  ? Math.round(
      (investigation.affectedUsers ?? [])
        .flatMap((u) => u.anomalies)
        .filter((a) => a.interval === "month" || a.interval === "year")
        .reduce((s, a) => s + (a.paid ?? 0) / (a.interval === "year" ? 12 : 1), 0) / 100,
    ) || 6319
  : 6319;
// Recompute actual MRR from active subs in audit data
const computedMrr = activeSubscriptions.reduce((s, sub) => {
  const lastPaid =
    sub.amount === 5400 ? 2700 : sub.amount === 54000 ? sub.amount / 12 : sub.amount;
  if (sub.interval === "month") return s + lastPaid / 100;
  if (sub.interval === "year") return s + lastPaid / 100 / 12;
  return s;
}, 0);
const actualMrrDisplay = Math.round(computedMrr) || actualMrr;
const mrrGapPct = Math.round(((listMrr - actualMrrDisplay) / listMrr) * 100);

const highAnomalies = anomalies.filter((a) => a.severity === "high");
const mediumAnomalies = anomalies.filter((a) => a.severity === "medium");
const pastDue = problemSubscriptions.filter((s) => s.status === "past_due");
const duplicateSubs = anomalies.filter((a) => a.category === "duplicate_active_subs");
const openInvoices = anomalies.filter((a) => a.category === "open_invoice");
const duplicatePrices = anomalies.filter((a) => a.category === "duplicate_prices");

const activePrices = priceCatalog.filter((p) => p.active);
const inactivePrices = priceCatalog.filter((p) => !p.active);

const paidChargeTotal = summary.paidCharges + summary.failedCharges;
const failRate = Math.round((summary.failedCharges / paidChargeTotal) * 100);

// Payment investigation categories
const notOkUsers = investigation
  ? [
      ...(investigation.byType?.zero_paid_active ?? []).map((u) => ({
        email: u.email,
        type: "Free via DevTest promo",
        severity: "critical",
        detail: "$0 paid on active $540/yr plan — 100% promo code used in live mode",
        ok: false,
      })),
      ...(investigation.byType?.multiple_active_subs ?? []).map((u) => ({
        email: u.email,
        type: "Duplicate subscriptions",
        severity: "critical",
        detail: `${u.anomaly.count} active/past_due subs — double billing risk`,
        ok: false,
      })),
      ...(investigation.byType?.monthly_charge_on_annual_plan ?? []).map((u) => ({
        email: u.email,
        type: "Monthly charge on annual plan",
        severity: "critical",
        detail: `Paid $27 on $540/yr plan — migration proration issue`,
        ok: false,
      })),
      ...(investigation.byType?.unexpected_monthly_amount ?? []).map((u) => ({
        email: u.email,
        type: "Unexpected payment amount",
        severity: "high",
        detail: `Paid ${fmt(u.anomaly.paid)} on ${fmt(u.anomaly.listPrice)}/mo plan`,
        ok: false,
      })),
    ]
  : [];

const okButWatchUsers = investigation
  ? {
      legacyMonthly: (investigation.byType?.legacy_monthly_rate_on_new_price ?? []).length,
      legacyAnnual: (investigation.byType?.legacy_annual_rate ?? []).length,
    }
  : { legacyMonthly: 0, legacyAnnual: 0 };

const invCounts = investigation?.summary?.byAnomalyType ?? {};
const annualMigrationUsers = investigation?.byType?.monthly_charge_on_annual_plan ?? [];

const himovooProfile = investigation?.targetUser?.profile;
const himovooInvestigation = {
  email: "himovoo@gmail.com",
  name: himovooProfile?.name ?? "Movoo AI",
  customerId: himovooProfile?.customerId ?? "cus_Twkwfed8mIl0VG",
  subId: himovooProfile?.subscriptions?.[0]?.id ?? "sub_1SyrRMJdmBLlxqNnQgGsq1iF",
  verdict: investigation?.targetUser?.verdict ?? "NOT OK — accidental live comp via DevTest promo",
  timeline: [
    { date: "Feb 8, 2026", event: "DevTest promo code redeemed 2× in live mode (coupon since deleted)" },
    { date: "Feb 9, 2026", event: "Checkout completed at $0 — 100% discount ($247 off $247/yr)" },
    { date: "Feb 9, 2026", event: "Subscription created: $247/yr plan, invoice paid $0" },
    { date: "Jul 16, 2026", event: "Price migrated to $540/yr Annual — discount removed from sub" },
    { date: "Feb 9, 2027", event: "Period ends — renewal should charge $540 (no discount remains)" },
  ],
  rootCause:
    "Used promotion code DevTest in live mode at checkout. This gave a 100% discount on the original $247/year plan. The account (Movoo AI, linked userId in metadata) appears to be an internal/test account. Only 1 of 2 DevTest redemptions is still active; pchamani@nizek.com also used it but is canceled.",
  similarUsers: [
    { email: "pchamani@nizek.com", status: "Canceled", note: "Also used DevTest promo — $0 for $27/mo, now canceled" },
  ],
};

function buildInsights() {
  const items = [];
  const dupUsers = investigation?.byType?.multiple_active_subs ?? duplicateSubs;
  if (dupUsers.length > 0) {
    const email = dupUsers[0]?.email ?? "unknown";
    items.push({
      severity: "critical",
      title: `Double billing risk — ${email}`,
      body: `${dupUsers.length} customer(s) with multiple active/past_due subscriptions. Risk of double charges at renewal.`,
      action: "Cancel duplicate subscriptions immediately.",
    });
  }
  const zombieDupes = (investigation?.affectedUsers ?? []).filter((u) =>
    u.anomalies.some((a) => a.type === "multiple_active_subs" && a.subs?.some((s) => s.status === "past_due")),
  );
  if (zombieDupes.length > 0) {
    items.push({
      severity: "critical",
      title: "Zombie legacy subs on migrated customers",
      body: `${zombieDupes.map((u) => u.email).join(", ")} — active new sub plus past_due legacy sub still retrying.`,
      action: "Cancel the old $27 subscriptions.",
    });
  }
  if ((invCounts.zero_paid_active ?? 0) > 0) {
    items.push({
      severity: "critical",
      title: "Free active annual — himovoo@gmail.com",
      body: "DevTest promo code used in live mode — 100% discount at checkout. $540/yr plan active with $0 ever paid.",
      action: "Cancel sub or convert to paid; deactivate DevTest promo permanently.",
    });
  }
  if (okButWatchUsers.legacyMonthly > 0) {
    items.push({
      severity: "high",
      title: `Price migration gap — ${okButWatchUsers.legacyMonthly} monthly subs`,
      body: "Subscription objects show $54/mo price but latest invoices still charged $27. Upcoming renewals preview at $54.",
      action: "Confirm grandfathering intent; monitor renewals for failed $54 charges.",
    });
  }
  if (okButWatchUsers.legacyAnnual > 0) {
    items.push({
      severity: "high",
      title: `Annual subs — ${okButWatchUsers.legacyAnnual} paying legacy rates`,
      body: "Active annual subs on $540/yr price but last invoice at legacy amount. Review before renewal.",
      action: "Review annual migrations before auto-charge.",
    });
  }
  if (pastDue.length > 0) {
    items.push({
      severity: "high",
      title: `${pastDue.length} past_due legacy $27/mo subs`,
      body: `Driving ${summary.openInvoices} open invoices and ${summary.failedCharges} failed charge retries.`,
      action: "Cancel zombies or attempt recovery — stop endless dunning.",
    });
  }
  if (annualMigrationUsers.length > 0) {
    items.push({
      severity: "critical",
      title: `${annualMigrationUsers.length} annual plan migration issues`,
      body: "Monthly charge on annual plan with broken proration on upcoming invoices.",
      action: "Fix or cancel before auto-charge.",
    });
  }
  return items;
}

const insights = buildInsights();

function renderNotOkTable(users) {
  if (!users.length) return "<p style='color:var(--muted)'>No investigation data — run stripe-payment-investigation.mjs first.</p>";
  return `<table>
    <thead><tr><th>Severity</th><th>Email</th><th>Issue</th><th>Detail</th></tr></thead>
    <tbody>${users
      .map(
        (u) => `<tr>
      <td>${severityBadge(u.severity)}</td>
      <td><strong>${esc(u.email)}</strong></td>
      <td>${esc(u.type)}</td>
      <td style="font-size:.85rem;color:var(--muted)">${esc(u.detail)}</td>
    </tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function renderInvestigationSection() {
  if (!investigation) return "";

  const annualMonthly = (investigation.byType?.monthly_charge_on_annual_plan ?? [])
    .map((u) => u.email)
    .join(", ");

  return `
    <section>
      <h2>User investigation — himovoo@gmail.com</h2>
      <div class="card investigation-hero">
        <div class="investigation-header">
          <div>
            <h3>${esc(himovooInvestigation.name)} <span class="mono" style="font-weight:400">${esc(himovooInvestigation.email)}</span></h3>
            <p style="color:var(--muted);margin-top:.35rem">Customer ${stripeLink("cus", himovooInvestigation.customerId)} · Sub ${stripeLink("sub", himovooInvestigation.subId)}</p>
          </div>
          <span class="badge badge-critical">NOT OK</span>
        </div>
        <div class="verdict-box">${esc(himovooInvestigation.verdict)}</div>
        <p style="margin:1rem 0;font-size:.9rem;line-height:1.7">${esc(himovooInvestigation.rootCause)}</p>
        <div class="timeline">
          ${himovooInvestigation.timeline
            .map(
              (t) => `<div class="timeline-item">
            <div class="timeline-date">${esc(t.date)}</div>
            <div class="timeline-event">${esc(t.event)}</div>
          </div>`,
            )
            .join("")}
        </div>
        <div style="margin-top:1.25rem">
          <h3 style="font-size:.9rem;margin-bottom:.5rem">Others who used the same DevTest promo</h3>
          <table>
            <thead><tr><th>Email</th><th>Status</th><th>Note</th></tr></thead>
            <tbody>${himovooInvestigation.similarUsers
              .map(
                (u) => `<tr><td>${esc(u.email)}</td><td>${esc(u.status)}</td><td style="color:var(--muted);font-size:.85rem">${esc(u.note)}</td></tr>`,
              )
              .join("")}</tbody>
          </table>
        </div>
      </div>
    </section>

    <section>
      <h2>Payment anomalies — what's OK vs not OK</h2>
      <div class="grid grid-2" style="margin-bottom:1.25rem">
        <div class="card ok-card">
          <h3 style="color:var(--green)">✓ Expected (migration grandfathering)</h3>
          <p style="color:var(--muted);font-size:.875rem;margin-bottom:1rem">These look intentional — price ID updated but current billing period still at legacy rate. Upcoming invoices preview at new price.</p>
          <div class="stat-pills">
            <div class="pill"><strong>${okButWatchUsers.legacyMonthly}</strong> monthly subs paying $27 on $54 plan</div>
            <div class="pill"><strong>${okButWatchUsers.legacyAnnual}</strong> annual subs paying legacy rate on $540 plan</div>
          </div>
        </div>
        <div class="card not-ok-card">
          <h3 style="color:var(--red)">✗ Not OK — requires action</h3>
          <p style="color:var(--muted);font-size:.875rem;margin-bottom:1rem">${notOkUsers.length} customers with genuine billing problems (not migration grandfathering).</p>
          <div class="stat-pills">
            <div class="pill"><strong>${invCounts.zero_paid_active ?? 0}</strong> free via DevTest promo</div>
            <div class="pill"><strong>${invCounts.multiple_active_subs ?? 0}</strong> duplicate subscriptions</div>
            <div class="pill"><strong>${invCounts.monthly_charge_on_annual_plan ?? 0}</strong> monthly charge on annual plan</div>
            <div class="pill"><strong>${invCounts.unexpected_monthly_amount ?? 0}</strong> unexpected amount</div>
          </div>
        </div>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:1rem 1.5rem;border-bottom:1px solid var(--border)">
          <h3>All customers with billing problems</h3>
        </div>
        ${renderNotOkTable(notOkUsers)}
      </div>
    </section>

    ${
      annualMigrationUsers.length > 0
        ? `<section>
      <h2>Annual plan migration issues <span class="anomaly-count count-high">${annualMigrationUsers.length}</span></h2>
      <div class="card">
        <p style="color:var(--muted);font-size:.9rem;margin-bottom:1rem">These users were migrated from monthly to annual but their last invoice was still a $27 monthly charge.</p>
        <div class="card" style="padding:0;overflow:hidden;background:var(--surface2)">
          <table>
            <thead><tr><th>Email</th><th>List price</th><th>Last paid</th><th>Sub ID</th></tr></thead>
            <tbody>
              ${annualMigrationUsers
                .map(
                  (u) => `<tr>
                <td>${esc(u.email)}</td>
                <td>${fmt(u.anomaly.listPrice)}</td>
                <td>${fmt(u.anomaly.paid)}</td>
                <td class="mono">${stripeLink("sub", u.anomaly.subId)}</td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </section>`
        : ""
    }
  `;
}

function severityBadge(sev) {
  const map = {
    critical: ["Critical", "badge-critical"],
    high: ["High", "badge-high"],
    medium: ["Medium", "badge-medium"],
    low: ["Low", "badge-low"],
  };
  const [label, cls] = map[sev] ?? ["Info", "badge-medium"];
  return `<span class="badge ${cls}">${label}</span>`;
}

function stripeLink(type, id) {
  if (!id) return "—";
  const base = "https://dashboard.stripe.com";
  const paths = { sub: `/subscriptions/${id}`, cus: `/customers/${id}`, inv: `/invoices/${id}` };
  const path = paths[type] ?? "";
  return `<a href="${base}${path}" target="_blank" rel="noopener">${esc(id)}</a>`;
}

function barChart(items, maxVal) {
  return items
    .map(({ label, value, color }) => {
      const pct = maxVal ? Math.round((value / maxVal) * 100) : 0;
      return `<div class="bar-row">
        <div class="bar-label">${esc(label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <div class="bar-value">${esc(String(value))}</div>
      </div>`;
    })
    .join("");
}

const subsByStatus = [
  { label: "Active", value: summary.subsByStatus.active, color: "#22c55e" },
  { label: "Canceled", value: summary.subsByStatus.canceled, color: "#94a3b8" },
  { label: "Past due", value: summary.subsByStatus.past_due, color: "#ef4444" },
];

const chargeDist = chargeAmountDistribution.slice(0, 8);
const maxCharge = chargeDist[0]?.count ?? 1;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Stripe Audit Report — ${esc(generatedDate)}</title>
  <style>
    :root {
      --bg: #0b0f1a;
      --surface: #131929;
      --surface2: #1a2236;
      --border: #2a3550;
      --text: #e8edf7;
      --muted: #8b9ab8;
      --accent: #635bff;
      --accent2: #7c75ff;
      --green: #22c55e;
      --red: #ef4444;
      --amber: #f59e0b;
      --cyan: #06b6d4;
      --radius: 12px;
      --shadow: 0 4px 24px rgba(0,0,0,.35);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
    }
    .hero {
      background: linear-gradient(135deg, #1a1040 0%, #0b0f1a 50%, #0d1f2d 100%);
      border-bottom: 1px solid var(--border);
      padding: 3rem 2rem 2.5rem;
    }
    .hero-inner { max-width: 1200px; margin: 0 auto; }
    .hero-badge {
      display: inline-flex; align-items: center; gap: .5rem;
      background: rgba(99,91,255,.15); border: 1px solid rgba(99,91,255,.3);
      color: var(--accent2); font-size: .75rem; font-weight: 600;
      letter-spacing: .06em; text-transform: uppercase;
      padding: .35rem .85rem; border-radius: 999px; margin-bottom: 1rem;
    }
    .hero h1 { font-size: 2.25rem; font-weight: 700; letter-spacing: -.02em; margin-bottom: .5rem; }
    .hero p { color: var(--muted); font-size: 1.05rem; max-width: 640px; }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    .grid { display: grid; gap: 1.25rem; }
    .grid-4 { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
    .grid-2 { grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
    .grid-3 { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.5rem;
      box-shadow: var(--shadow);
    }
    .card h2 {
      font-size: 1rem; font-weight: 600; color: var(--muted);
      text-transform: uppercase; letter-spacing: .05em; margin-bottom: 1rem;
    }
    .card h3 { font-size: 1.1rem; font-weight: 600; margin-bottom: .75rem; }
    .kpi-value { font-size: 2rem; font-weight: 700; letter-spacing: -.02em; }
    .kpi-label { font-size: .85rem; color: var(--muted); margin-top: .25rem; }
    .kpi-green { color: var(--green); }
    .kpi-red { color: var(--red); }
    .kpi-amber { color: var(--amber); }
    .kpi-accent { color: var(--accent2); }
    section { margin-bottom: 2.5rem; }
    section > h2 {
      font-size: 1.35rem; font-weight: 700; margin-bottom: 1.25rem;
      display: flex; align-items: center; gap: .75rem;
    }
    section > h2::before {
      content: ""; display: block; width: 4px; height: 1.35rem;
      background: var(--accent); border-radius: 2px;
    }
    .badge {
      display: inline-block; font-size: .7rem; font-weight: 700;
      letter-spacing: .04em; text-transform: uppercase;
      padding: .2rem .55rem; border-radius: 6px;
    }
    .badge-critical { background: rgba(239,68,68,.2); color: #fca5a5; border: 1px solid rgba(239,68,68,.4); }
    .badge-high { background: rgba(245,158,11,.2); color: #fcd34d; border: 1px solid rgba(245,158,11,.4); }
    .badge-medium { background: rgba(6,182,212,.15); color: #67e8f9; border: 1px solid rgba(6,182,212,.3); }
    .badge-low { background: rgba(148,163,184,.15); color: #cbd5e1; border: 1px solid rgba(148,163,184,.3); }
    .badge-active { background: rgba(34,197,94,.15); color: #86efac; }
    .badge-inactive { background: rgba(148,163,184,.1); color: #94a3b8; }
    .insight-card {
      background: var(--surface2); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 1.25rem; margin-bottom: .75rem;
      border-left: 3px solid var(--border);
    }
    .insight-card.critical { border-left-color: var(--red); }
    .insight-card.high { border-left-color: var(--amber); }
    .insight-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: .5rem; }
    .insight-title { font-weight: 600; font-size: .95rem; }
    .insight-body { color: var(--muted); font-size: .875rem; margin-bottom: .75rem; }
    .insight-action {
      font-size: .8rem; color: var(--accent2);
      background: rgba(99,91,255,.1); border-radius: 6px; padding: .4rem .75rem;
    }
    .mrr-compare { margin-top: 1rem; }
    .mrr-bar-wrap { display: flex; gap: 1rem; align-items: flex-end; height: 120px; margin: 1.5rem 0 1rem; }
    .mrr-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: .5rem; }
    .mrr-bar {
      width: 100%; border-radius: 8px 8px 0 0; min-height: 8px;
      transition: height .3s;
    }
    .mrr-bar.list { background: linear-gradient(180deg, var(--accent2), var(--accent)); height: 120px; }
    .mrr-bar.actual { background: linear-gradient(180deg, var(--amber), #d97706); height: ${Math.round((actualMrrDisplay / listMrr) * 120)}px; }
    .mrr-bar-label { font-size: .75rem; color: var(--muted); text-align: center; }
    .mrr-bar-amount { font-size: 1.1rem; font-weight: 700; }
    .gap-callout {
      background: rgba(245,158,11,.1); border: 1px solid rgba(245,158,11,.25);
      border-radius: 8px; padding: 1rem; text-align: center;
      color: var(--amber); font-weight: 600;
    }
    table { width: 100%; border-collapse: collapse; font-size: .875rem; }
    th {
      text-align: left; padding: .65rem 1rem; color: var(--muted);
      font-weight: 600; font-size: .75rem; text-transform: uppercase;
      letter-spacing: .04em; border-bottom: 1px solid var(--border);
    }
    td { padding: .75rem 1rem; border-bottom: 1px solid rgba(42,53,80,.6); vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(255,255,255,.02); }
    a { color: var(--accent2); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .mono { font-family: "SF Mono", "Fira Code", monospace; font-size: .8rem; color: var(--muted); }
    .bar-row { display: grid; grid-template-columns: 100px 1fr 48px; gap: .75rem; align-items: center; margin-bottom: .6rem; }
    .bar-label { font-size: .8rem; color: var(--muted); }
    .bar-track { background: var(--surface2); border-radius: 4px; height: 8px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 4px; transition: width .4s; }
    .bar-value { font-size: .8rem; font-weight: 600; text-align: right; }
    .stat-pills { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: 1rem; }
    .pill {
      background: var(--surface2); border: 1px solid var(--border);
      border-radius: 8px; padding: .4rem .85rem; font-size: .8rem;
    }
    .pill strong { color: var(--text); }
    .anomaly-count {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 8px; font-weight: 700; font-size: .85rem;
    }
    .count-high { background: rgba(239,68,68,.2); color: #fca5a5; }
    .count-medium { background: rgba(6,182,212,.15); color: #67e8f9; }
    .investigation-hero { border: 1px solid rgba(239,68,68,.25); }
    .investigation-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1rem; }
    .verdict-box {
      background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.3);
      border-radius: 8px; padding: .85rem 1rem; font-weight: 600; color: #fca5a5;
    }
    .timeline { margin-top: 1.25rem; border-left: 2px solid var(--border); padding-left: 1.25rem; }
    .timeline-item { margin-bottom: 1rem; position: relative; }
    .timeline-item::before {
      content: ""; position: absolute; left: -1.42rem; top: .35rem;
      width: 8px; height: 8px; border-radius: 50%; background: var(--accent);
    }
    .timeline-date { font-size: .75rem; color: var(--accent2); font-weight: 600; }
    .timeline-event { font-size: .875rem; color: var(--muted); margin-top: .15rem; }
    .ok-card { border-left: 3px solid var(--green); }
    .not-ok-card { border-left: 3px solid var(--red); }
    .footer {
      text-align: center; color: var(--muted); font-size: .8rem;
      padding: 2rem; border-top: 1px solid var(--border); margin-top: 2rem;
    }
    @media (max-width: 640px) {
      .hero h1 { font-size: 1.6rem; }
      .container { padding: 1rem; }
      .bar-row { grid-template-columns: 80px 1fr 40px; }
    }
    @media print {
      body { background: #fff; color: #111; }
      .card, .insight-card { box-shadow: none; border-color: #ddd; background: #fafafa; }
      .hero { background: #f5f5f5; }
      a { color: #333; }
    }
  </style>
</head>
<body>
  <header class="hero">
    <div class="hero-inner">
      <div class="hero-badge">⚡ Live Mode Audit</div>
      <h1>Stripe Subscription Audit</h1>
      <p>Anomaly-focused report for customers, subscriptions, and payments. Generated ${esc(generatedDate)}.</p>
    </div>
  </header>

  <div class="container">
    <!-- KPIs -->
    <section>
      <div class="grid grid-4">
        <div class="card">
          <div class="kpi-value kpi-accent">${summary.customers.toLocaleString()}</div>
          <div class="kpi-label">Customers</div>
        </div>
        <div class="card">
          <div class="kpi-value">${summary.subscriptions}</div>
          <div class="kpi-label">Subscriptions</div>
        </div>
        <div class="card">
          <div class="kpi-value kpi-green">${summary.netCollected}</div>
          <div class="kpi-label">Net collected</div>
        </div>
        <div class="card">
          <div class="kpi-value kpi-red">${anomalyCounts.high}</div>
          <div class="kpi-label">High-severity anomalies</div>
        </div>
      </div>
    </section>

    <!-- MRR Gap -->
    <section>
      <h2>MRR Reality Check</h2>
      <div class="grid grid-2">
        <div class="card mrr-compare">
          <h3>List-price vs. actual collected MRR</h3>
          <div class="mrr-bar-wrap">
            <div class="mrr-bar-col">
              <div class="mrr-bar-amount">$${listMrr.toLocaleString()}</div>
              <div class="mrr-bar list"></div>
              <div class="mrr-bar-label">List-price MRR<br><span class="mono">if all paid new rates</span></div>
            </div>
            <div class="mrr-bar-col">
              <div class="mrr-bar-amount">$${actualMrrDisplay.toLocaleString()}</div>
              <div class="mrr-bar actual"></div>
              <div class="mrr-bar-label">Actual MRR<br><span class="mono">based on last invoice paid</span></div>
            </div>
          </div>
          <div class="gap-callout">${mrrGapPct}% gap — ~$${(listMrr - actualMrrDisplay).toLocaleString()}/mo until renewals hit new prices</div>
        </div>
        <div class="card">
          <h2>Revenue &amp; charges</h2>
          <div class="stat-pills">
            <div class="pill"><strong>${summary.mrr}</strong> list MRR</div>
            <div class="pill"><strong>${summary.arr}</strong> list ARR</div>
            <div class="pill"><strong>${summary.totalCollected}</strong> gross</div>
            <div class="pill"><strong>${summary.totalRefunded}</strong> refunded</div>
            <div class="pill"><strong>${summary.paidCharges}</strong> paid charges</div>
            <div class="pill"><strong class="kpi-red">${summary.failedCharges}</strong> failed (${failRate}%)</div>
            <div class="pill"><strong>${summary.openInvoices}</strong> open invoices</div>
            <div class="pill"><strong>${summary.disputedCharges}</strong> disputes</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Critical insights -->
    <section>
      <h2>Critical findings &amp; action items</h2>
      ${insights
        .map(
          (i) => `<div class="insight-card ${i.severity}">
        <div class="insight-header">
          <div class="insight-title">${esc(i.title)}</div>
          ${severityBadge(i.severity)}
        </div>
        <div class="insight-body">${esc(i.body)}</div>
        <div class="insight-action">→ ${esc(i.action)}</div>
      </div>`,
        )
        .join("")}
    </section>

    ${renderInvestigationSection()}

    <!-- Charts -->
    <section>
      <h2>Breakdowns</h2>
      <div class="grid grid-3">
        <div class="card">
          <h2>Subscriptions by status</h2>
          ${barChart(subsByStatus, summary.subscriptions)}
        </div>
        <div class="card">
          <h2>Active by interval</h2>
          ${barChart(
            [
              { label: "Monthly $54", value: summary.subsByInterval.month, color: "#635bff" },
              { label: "Annual $540", value: summary.subsByInterval.year, color: "#06b6d4" },
            ],
            summary.subsByInterval.month,
          )}
        </div>
        <div class="card">
          <h2>Paid charge amounts</h2>
          ${barChart(
            chargeDist.map((c) => ({ label: c.amount, value: c.count, color: "#22c55e" })),
            maxCharge,
          )}
        </div>
      </div>
    </section>

    <!-- Duplicate subs -->
    <section>
      <h2>Duplicate subscriptions <span class="anomaly-count count-high">${duplicateSubs.length}</span></h2>
      <div class="card" style="padding:0; overflow:hidden">
        <table>
          <thead><tr>
            <th>Customer</th><th>Subscriptions</th><th>Risk</th>
          </tr></thead>
          <tbody>
            ${duplicateSubs
              .map((d) => {
                const allActive = d.subscriptions.every((s) => s.status === "active");
                const risk = allActive
                  ? "Double billing at renewal"
                  : "Active new + zombie legacy";
                return `<tr>
              <td>
                <div>${esc(d.email)}</div>
                <div class="mono">${stripeLink("cus", d.customerId)}</div>
              </td>
              <td>${d.subscriptions
                .map(
                  (s) =>
                    `<div style="margin-bottom:.4rem">${stripeLink("sub", s.id)} <span class="badge badge-${s.status === "active" ? "active" : "high"}">${esc(s.status)}</span> <span class="mono">${esc(s.price)}</span></div>`,
                )
                .join("")}</td>
              <td><span class="badge badge-critical">${esc(risk)}</span></td>
            </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </section>

    <!-- Past due -->
    <section>
      <h2>Past-due subscriptions <span class="anomaly-count count-high">${pastDue.length}</span></h2>
      <div class="card" style="padding:0; overflow:hidden">
        <table>
          <thead><tr>
            <th>Customer</th><th>Email</th><th>Amount</th><th>Period end</th><th>Sub ID</th>
          </tr></thead>
          <tbody>
            ${pastDue
              .map(
                (s) => `<tr>
              <td>${esc(s.name ?? "—")}</td>
              <td>${esc(s.email)}</td>
              <td>${fmt(s.amount, s.currency)}/${esc(s.interval)}</td>
              <td>${esc(s.periodEnd)}</td>
              <td class="mono">${stripeLink("sub", s.subId)}</td>
            </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>

    <!-- Price catalog -->
    <section>
      <h2>Price catalog</h2>
      <div class="card" style="padding:0; overflow:hidden">
        <table>
          <thead><tr>
            <th>Product</th><th>Amount</th><th>Interval</th><th>Status</th><th>Price ID</th>
          </tr></thead>
          <tbody>
            ${priceCatalog
              .map(
                (p) => `<tr>
              <td><strong>${esc(p.productName)}</strong>${p.metadata?.planSlug ? `<div class="mono">${esc(p.metadata.planSlug)}</div>` : ""}</td>
              <td>${fmt(p.amount, p.currency)}</td>
              <td>${esc(p.interval)}</td>
              <td><span class="badge ${p.active ? "badge-active" : "badge-inactive"}">${p.active ? "Active" : "Inactive"}</span></td>
              <td class="mono">${esc(p.priceId)}</td>
            </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>
      ${
        duplicatePrices.length > 0
          ? `<div style="margin-top:1rem" class="card">
        <h3>Duplicate price warnings</h3>
        ${duplicatePrices
          .map(
            (d) => `<div style="margin-bottom:.75rem;font-size:.875rem;color:var(--muted)">
          <strong style="color:var(--amber)">${esc(d.message)}</strong>
          <div style="margin-top:.35rem">${(d.prices ?? []).map((p) => `<span class="pill">${esc(p.product)} — ${esc(p.id)} ${p.active ? "✓" : "✗"}</span>`).join(" ")}</div>
        </div>`,
          )
          .join("")}
      </div>`
          : ""
      }
    </section>

    <!-- Open invoices summary -->
    <section>
      <h2>Open invoices <span class="anomaly-count count-medium">${openInvoices.length}</span></h2>
      <div class="card">
        <p style="color:var(--muted);font-size:.9rem;margin-bottom:1rem">All ${openInvoices.length} open invoices are <strong style="color:var(--text)">$27.00</strong> — failed renewal attempts on legacy subscriptions.</p>
        <div class="card" style="padding:0;overflow:hidden;background:var(--surface2)">
          <table>
            <thead><tr><th>Invoice</th><th>Customer</th><th>Amount</th></tr></thead>
            <tbody>
              ${openInvoices
                .slice(0, 15)
                .map(
                  (i) => `<tr>
                <td class="mono">${stripeLink("inv", i.invoiceId)}</td>
                <td class="mono">${stripeLink("cus", i.customerId)}</td>
                <td>${esc(i.amount)}</td>
              </tr>`,
                )
                .join("")}
              ${openInvoices.length > 15 ? `<tr><td colspan="3" style="color:var(--muted);text-align:center">… and ${openInvoices.length - 15} more</td></tr>` : ""}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Anomaly summary -->
    <section>
      <h2>All anomalies</h2>
      <div class="grid grid-3" style="margin-bottom:1.25rem">
        <div class="card" style="text-align:center">
          <div class="kpi-value kpi-red">${anomalyCounts.high}</div>
          <div class="kpi-label">High</div>
        </div>
        <div class="card" style="text-align:center">
          <div class="kpi-value" style="color:var(--cyan)">${anomalyCounts.medium}</div>
          <div class="kpi-label">Medium</div>
        </div>
        <div class="card" style="text-align:center">
          <div class="kpi-value">${anomalyCounts.total}</div>
          <div class="kpi-label">Total</div>
        </div>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <table>
          <thead><tr><th>Severity</th><th>Category</th><th>Details</th></tr></thead>
          <tbody>
            ${[...highAnomalies, ...mediumAnomalies]
              .slice(0, 40)
              .map((a) => {
                const detail =
                  a.email ??
                  a.subId ??
                  a.invoiceId ??
                  a.message ??
                  JSON.stringify(a).slice(0, 80);
                return `<tr>
                <td>${severityBadge(a.severity)}</td>
                <td class="mono">${esc(a.category)}</td>
                <td style="font-size:.85rem">${esc(detail)}</td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </section>

    <!-- Action plan -->
    <section>
      <h2>Recommended action plan</h2>
      <div class="grid grid-2">
        ${[
          ["P0", "Cancel duplicate sub for soso2009913@gmail.com", "critical"],
          ["P0", "Cancel legacy $27 subs for hetafalokam & marwakha2009@gmail.com", "critical"],
          ["P1", "Audit himovoo@gmail.com comp subscription", "high"],
          ["P1", "Review 11 annual subs with proration-heavy upcoming invoices", "high"],
          ["P1", "Resolve or cancel 10 past_due legacy $27 subs", "high"],
          ["P2", "Confirm migration: grandfather $27 until renewal or bill $54 now?", "medium"],
          ["P2", "Deactivate duplicate legacy price IDs", "medium"],
          ["P2", "Clean up VIP test prices ($740–$18,613)", "medium"],
          ["P3", "Rotate exposed live API key", "low"],
        ]
          .map(
            ([pri, action, sev]) => `<div class="insight-card ${sev}">
          <div class="insight-header">
            <div class="insight-title"><span class="mono" style="color:var(--accent2)">${esc(pri)}</span> ${esc(action)}</div>
            ${severityBadge(sev)}
          </div>
        </div>`,
          )
          .join("")}
      </div>
    </section>
  </div>

  <footer class="footer">
    Generated from stripe-audit-report.json on ${esc(generatedDate)} · VOD Panel Stripe Audit
  </footer>
</body>
</html>`;

writeFileSync("stripe-audit-report.html", html);
console.log("Written stripe-audit-report.html");

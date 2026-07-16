#!/usr/bin/env node
/**
 * Deep investigation of payment anomalies — finds users whose
 * subscription list-price differs from what they actually paid.
 */
import Stripe from "stripe";
import { readFileSync, writeFileSync } from "fs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const fmt = (cents, cur = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur.toUpperCase() }).format(
    (cents ?? 0) / 100,
  );

async function paginate(fn) {
  const items = [];
  let after;
  while (true) {
    const p = await fn({ limit: 100, starting_after: after });
    items.push(...p.data);
    if (!p.has_more) break;
    after = p.data[p.data.length - 1].id;
  }
  return items;
}

async function investigateCustomer(customerId, email) {
  const [customer, subs, charges, invoices, events] = await Promise.all([
    stripe.customers.retrieve(customerId, { expand: ["subscriptions"] }),
    stripe.subscriptions.list({ customer: customerId, status: "all", expand: ["data.items.data.price", "data.latest_invoice", "data.discount"] }),
    stripe.charges.list({ customer: customerId, limit: 100 }),
    stripe.invoices.list({ customer: customerId, limit: 100 }),
    stripe.events.list({ type: "customer.subscription.created", limit: 20 }).catch(() => ({ data: [] })),
  ]);

  const subDetails = [];
  for (const sub of subs.data) {
    const item = sub.items.data[0];
    const listPrice = item?.price?.unit_amount ?? 0;
    let upcoming = null;
    try {
      upcoming = await stripe.invoices.createPreview({ subscription: sub.id });
    } catch (e) {
      upcoming = { error: e.message };
    }

    const invHistory = invoices.data
      .filter((i) => i.subscription === sub.id)
      .map((i) => ({
        id: i.id,
        status: i.status,
        total: i.total,
        paid: i.amount_paid,
        created: new Date(i.created * 1000).toISOString().slice(0, 10),
        lines: i.lines?.data?.map((l) => ({
          desc: l.description,
          amount: l.amount,
          priceId: l.price?.id,
        })),
        discount: i.discount?.coupon?.id ?? null,
      }));

    subDetails.push({
      id: sub.id,
      status: sub.status,
      created: new Date(sub.created * 1000).toISOString(),
      priceId: item?.price?.id,
      productName: item?.price?.nickname ?? item?.price?.id,
      listAmount: listPrice,
      interval: item?.price?.recurring?.interval,
      discount: sub.discount?.coupon?.id ?? null,
      latestInvoice: sub.latest_invoice
        ? {
            id: typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice.id,
            paid: typeof sub.latest_invoice === "object" ? sub.latest_invoice.amount_paid : null,
            total: typeof sub.latest_invoice === "object" ? sub.latest_invoice.total : null,
            status: typeof sub.latest_invoice === "object" ? sub.latest_invoice.status : null,
            lines:
              typeof sub.latest_invoice === "object"
                ? sub.latest_invoice.lines?.data?.map((l) => l.description)
                : null,
          }
        : null,
      upcoming:
        upcoming?.error
          ? { error: upcoming.error }
          : upcoming
            ? { total: upcoming.total, lines: upcoming.lines?.data?.map((l) => l.description) }
            : null,
      invoiceHistory: invHistory,
      metadata: sub.metadata,
    });
  }

  const paidCharges = charges.data
    .filter((c) => c.paid)
    .map((c) => ({
      id: c.id,
      amount: c.amount,
      refunded: c.amount_refunded,
      created: new Date(c.created * 1000).toISOString().slice(0, 10),
      description: c.description,
    }));

  return {
    customerId,
    email: customer.email ?? email,
    name: customer.name,
    created: new Date(customer.created * 1000).toISOString().slice(0, 10),
    metadata: customer.metadata,
    balance: customer.balance,
    delinquent: customer.delinquent,
    subscriptions: subDetails,
    paidCharges,
    totalPaid: paidCharges.reduce((s, c) => s + c.amount - c.refunded, 0),
    allInvoices: invoices.data.map((i) => ({
      id: i.id,
      status: i.status,
      total: i.total,
      paid: i.amount_paid,
      sub: i.subscription,
      created: new Date(i.created * 1000).toISOString().slice(0, 10),
    })),
  };
}

function classifyAnomaly(profile) {
  const issues = [];
  for (const sub of profile.subscriptions) {
    if (!["active", "trialing", "past_due"].includes(sub.status)) continue;
    const list = sub.listAmount;
    const paid = sub.latestInvoice?.paid ?? 0;

    if (list > 0 && paid === 0 && sub.latestInvoice?.status === "paid") {
      issues.push({ type: "zero_paid_active", subId: sub.id, list, paid, severity: "critical" });
    } else if (list > 0 && paid > 0 && paid < list * 0.5) {
      issues.push({ type: "severe_underpayment", subId: sub.id, list, paid, severity: "critical" });
    } else if (list > 0 && paid > 0 && paid !== list) {
      issues.push({ type: "price_mismatch", subId: sub.id, list, paid, severity: "high" });
    }
    if (sub.discount) {
      issues.push({ type: "has_discount", subId: sub.id, coupon: sub.discount, severity: "low" });
    }
  }
  const activeCount = profile.subscriptions.filter((s) =>
    ["active", "trialing", "past_due"].includes(s.status),
  ).length;
  if (activeCount > 1) {
    issues.push({ type: "multiple_active_subs", count: activeCount, severity: "critical" });
  }
  return issues;
}

async function main() {
  const targetEmail = process.argv[2] ?? "himovoo@gmail.com";
  console.error(`Investigating ${targetEmail} and scanning all active subs for similar patterns...`);

  // 1. Deep dive target user
  const custList = await stripe.customers.list({ email: targetEmail, limit: 5 });
  if (!custList.data.length) {
    console.error("Customer not found:", targetEmail);
    process.exit(1);
  }
  const targetProfile = await investigateCustomer(custList.data[0].id, targetEmail);
  const targetIssues = classifyAnomaly(targetProfile);

  // 2. Scan all active subscriptions for payment mismatches
  const allSubs = await paginate((p) =>
    stripe.subscriptions.list({ ...p, status: "all", expand: ["data.items.data.price", "data.latest_invoice", "data.customer"] }),
  );

  const mismatchUsers = new Map();

  for (const sub of allSubs) {
    if (!["active", "trialing", "past_due"].includes(sub.status)) continue;
    const item = sub.items.data[0];
    const listPrice = item?.price?.unit_amount ?? 0;
    const interval = item?.price?.recurring?.interval;
    const latestInv = sub.latest_invoice;
    const paid = typeof latestInv === "object" ? (latestInv?.amount_paid ?? 0) : 0;
    const invStatus = typeof latestInv === "object" ? latestInv?.status : null;

    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    const email = typeof sub.customer === "object" ? sub.customer?.email : null;

    let anomalyType = null;
    let severity = "medium";

    // Zero paid but active
    if (listPrice > 0 && paid === 0 && invStatus === "paid" && sub.status === "active") {
      anomalyType = "zero_paid_active";
      severity = "critical";
    }
    // $27 paid on $54 monthly
    else if (listPrice === 5400 && paid === 2700 && interval === "month") {
      anomalyType = "legacy_monthly_rate_on_new_price";
      severity = "high";
    }
    // $27 paid on $540 annual
    else if (listPrice === 54000 && paid === 2700 && interval === "year") {
      anomalyType = "monthly_charge_on_annual_plan";
      severity = "critical";
    }
    // Annual legacy rates
    else if (listPrice === 54000 && paid > 0 && paid < 54000 && ![2700, 5400].includes(paid)) {
      anomalyType = "legacy_annual_rate";
      severity = "high";
    }
    // Full mismatch (not grandfathered monthly)
    else if (listPrice > 0 && paid > 0 && paid !== listPrice && interval === "month" && listPrice === 5400 && paid !== 2700) {
      anomalyType = "unexpected_monthly_amount";
      severity = "high";
    }

    if (!anomalyType) continue;

    if (!mismatchUsers.has(customerId)) {
      mismatchUsers.set(customerId, {
        customerId,
        email,
        anomalies: [],
      });
    }
    mismatchUsers.get(customerId).anomalies.push({
      type: anomalyType,
      severity,
      subId: sub.id,
      status: sub.status,
      listPrice,
      paid,
      interval,
      product: item?.price?.id,
      created: new Date(sub.created * 1000).toISOString().slice(0, 10),
    });
  }

  // Multiple active subs per customer
  const activeByCustomer = new Map();
  for (const sub of allSubs) {
    if (!["active", "trialing", "past_due"].includes(sub.status)) continue;
    const cid = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (!activeByCustomer.has(cid)) activeByCustomer.set(cid, []);
    activeByCustomer.get(cid).push(sub);
  }
  for (const [cid, subs] of activeByCustomer) {
    if (subs.length <= 1) continue;
    const email = typeof subs[0].customer === "object" ? subs[0].customer?.email : null;
    if (!mismatchUsers.has(cid)) {
      mismatchUsers.set(cid, { customerId: cid, email, anomalies: [] });
    }
    mismatchUsers.get(cid).anomalies.push({
      type: "multiple_active_subs",
      severity: "critical",
      count: subs.length,
      subs: subs.map((s) => ({
        id: s.id,
        status: s.status,
        price: s.items.data[0]?.price?.unit_amount,
        priceId: s.items.data[0]?.price?.id,
      })),
    });
  }

  // Group by anomaly type
  const byType = {};
  for (const user of mismatchUsers.values()) {
    for (const a of user.anomalies) {
      if (!byType[a.type]) byType[a.type] = [];
      byType[a.type].push({ ...user, anomaly: a });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    targetUser: {
      email: targetEmail,
      profile: targetProfile,
      issues: targetIssues,
      verdict: targetIssues.some((i) => i.severity === "critical")
        ? "NOT OK — requires action"
        : targetIssues.length
          ? "Review recommended"
          : "OK",
    },
    summary: {
      totalAffectedCustomers: mismatchUsers.size,
      byAnomalyType: Object.fromEntries(
        Object.entries(byType).map(([k, v]) => [k, v.length]),
      ),
    },
    affectedUsers: [...mismatchUsers.values()].sort((a, b) => {
      const sev = (u) => Math.min(...u.anomalies.map((a) => ({ critical: 0, high: 1, medium: 2 }[a.severity] ?? 3)));
      return sev(a) - sev(b);
    }),
    byType,
  };

  writeFileSync("stripe-payment-investigation.json", JSON.stringify(report, null, 2));

  // Console summary
  console.log(JSON.stringify({
    target: {
      email: targetEmail,
      verdict: report.targetUser.verdict,
      issues: targetIssues,
      subscriptions: targetProfile.subscriptions.map((s) => ({
        id: s.id,
        status: s.status,
        list: fmt(s.listAmount),
        lastPaid: fmt(s.latestInvoice?.paid),
        upcoming: s.upcoming?.error ? s.upcoming.error : fmt(s.upcoming?.total),
        invoiceHistory: s.invoiceHistory,
      })),
      allCharges: targetProfile.paidCharges,
    },
    similarUsers: Object.fromEntries(
      Object.entries(byType).map(([type, users]) => [
        type,
        users.map((u) => ({ email: u.email, ...u.anomaly })),
      ]),
    ),
    counts: report.summary.byAnomalyType,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

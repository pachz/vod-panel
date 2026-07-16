#!/usr/bin/env node
/**
 * One-off Stripe audit script. Run with:
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-audit.mjs
 */

import Stripe from "stripe";
import { writeFileSync } from "fs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function paginate(listFn, key) {
  const items = [];
  let starting_after;
  while (true) {
    const params = { limit: 100 };
    if (starting_after) params.starting_after = starting_after;
    const page = await listFn(params);
    items.push(...page.data);
    if (!page.has_more) break;
    starting_after = page.data[page.data.length - 1].id;
  }
  return items;
}

function fmt(cents, currency = "usd") {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function intervalLabel(price) {
  if (!price) return "unknown";
  const iv = price.recurring?.interval;
  const count = price.recurring?.interval_count ?? 1;
  if (!iv) return "one-time";
  if (count === 1) return iv;
  return `${count} ${iv}`;
}

async function main() {
  console.error("Fetching Stripe data...");

  const [customers, subscriptions, charges, invoices, prices, products] =
    await Promise.all([
      paginate((p) => stripe.customers.list({ ...p, expand: ["data.subscriptions"] }), "customers"),
      paginate((p) => stripe.subscriptions.list({ ...p, status: "all", expand: ["data.items.data.price", "data.customer"] }), "subscriptions"),
      paginate((p) => stripe.charges.list(p), "charges"),
      paginate((p) => stripe.invoices.list(p), "invoices"),
      paginate((p) => stripe.prices.list({ ...p, active: undefined, expand: ["data.product"] }), "prices"),
      paginate((p) => stripe.products.list({ ...p, active: undefined }), "products"),
    ]);

  console.error(`Loaded: ${customers.length} customers, ${subscriptions.length} subs, ${charges.length} charges, ${invoices.length} invoices`);

  const priceMap = new Map(prices.map((p) => [p.id, p]));
  const productMap = new Map(products.map((p) => [p.id, p]));
  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const anomalies = [];

  const addAnomaly = (severity, category, message, details = {}) => {
    anomalies.push({ severity, category, message, ...details });
  };

  // --- Price catalog summary ---
  const priceSummary = prices.map((p) => {
    const product = typeof p.product === "string" ? productMap.get(p.product) : p.product;
    return {
      priceId: p.id,
      productId: typeof p.product === "string" ? p.product : p.product?.id,
      productName: product?.name ?? "unknown",
      active: p.active,
      amount: p.unit_amount,
      currency: p.currency,
      interval: intervalLabel(p),
      nickname: p.nickname,
      metadata: p.metadata,
    };
  });

  const activePrices = priceSummary.filter((p) => p.active);
  const recurringPrices = priceSummary.filter((p) => p.interval !== "one-time");

  // Group prices by amount+interval to find duplicates
  const priceGroups = new Map();
  for (const p of recurringPrices) {
    const key = `${p.amount}-${p.currency}-${p.interval}`;
    if (!priceGroups.has(key)) priceGroups.set(key, []);
    priceGroups.get(key).push(p);
  }
  for (const [key, group] of priceGroups) {
    if (group.length > 1) {
      addAnomaly("medium", "duplicate_prices", `Multiple prices for same amount/interval: ${key}`, {
        prices: group.map((p) => ({ id: p.priceId, product: p.productName, active: p.active })),
      });
    }
  }

  // --- Subscription analysis ---
  const subsByStatus = {};
  const subsByPrice = {};
  const subsByInterval = { month: 0, year: 0, other: 0, one_time: 0 };
  let mrrCents = 0;
  let arrCents = 0;

  const subRows = subscriptions.map((sub) => {
    const cust = typeof sub.customer === "string" ? customerMap.get(sub.customer) : sub.customer;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    const item = sub.items.data[0];
    const price = item?.price;
    const priceId = typeof price === "string" ? price : price?.id;
    const fullPrice = priceId ? priceMap.get(priceId) ?? price : null;
    const product = fullPrice?.product
      ? typeof fullPrice.product === "string"
        ? productMap.get(fullPrice.product)
        : fullPrice.product
      : null;

    const amount = fullPrice?.unit_amount ?? price?.unit_amount ?? 0;
    const currency = fullPrice?.currency ?? price?.currency ?? "usd";
    const interval = fullPrice?.recurring?.interval ?? price?.recurring?.interval;
    const qty = item?.quantity ?? 1;

    subsByStatus[sub.status] = (subsByStatus[sub.status] ?? 0) + 1;
    subsByPrice[priceId ?? "none"] = (subsByPrice[priceId ?? "none"] ?? 0) + 1;

    if (sub.status === "active" || sub.status === "trialing") {
      const monthlyEquiv = interval === "year" ? (amount * qty) / 12 : interval === "month" ? amount * qty : 0;
      if (interval === "year") {
        subsByInterval.year++;
        arrCents += amount * qty;
        mrrCents += monthlyEquiv;
      } else if (interval === "month") {
        subsByInterval.month++;
        mrrCents += amount * qty;
        arrCents += amount * qty * 12;
      } else {
        subsByInterval.other++;
      }
    }

    const periodStart = sub.current_period_start ?? item?.current_period_start;
    const periodEnd = sub.current_period_end ?? item?.current_period_end;

    return {
      subId: sub.id,
      status: sub.status,
      customerId,
      email: cust?.email ?? null,
      name: cust?.name ?? null,
      priceId,
      productName: product?.name ?? null,
      amount,
      currency,
      interval,
      qty,
      periodStart: fmtDate(periodStart),
      periodEnd: fmtDate(periodEnd),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      canceledAt: fmtDate(sub.canceled_at),
      created: fmtDate(sub.created),
      discount: sub.discount?.coupon?.id ?? null,
      metadata: sub.metadata,
    };
  });

  // Multiple active subs per customer
  const activeSubsByCustomer = new Map();
  for (const sub of subscriptions) {
    if (!["active", "trialing", "past_due", "unpaid"].includes(sub.status)) continue;
    const cid = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (!activeSubsByCustomer.has(cid)) activeSubsByCustomer.set(cid, []);
    activeSubsByCustomer.get(cid).push(sub);
  }
  for (const [cid, subs] of activeSubsByCustomer) {
    if (subs.length > 1) {
      const cust = customerMap.get(cid);
      addAnomaly("high", "duplicate_active_subs", `Customer has ${subs.length} active/past_due subs`, {
        customerId: cid,
        email: cust?.email,
        subscriptions: subs.map((s) => ({ id: s.id, status: s.status, price: s.items.data[0]?.price?.id })),
      });
    }
  }

  // Subscriptions on inactive/unknown prices
  for (const row of subRows) {
    if (!["active", "trialing", "past_due"].includes(row.status)) continue;
    const priceInfo = priceSummary.find((p) => p.priceId === row.priceId);
    if (!priceInfo) {
      addAnomaly("high", "unknown_price", `Active sub uses price not in catalog`, row);
    } else if (!priceInfo.active) {
      addAnomaly("high", "inactive_price", `Active sub on deactivated price`, row);
    }
    if (!row.interval || (row.interval !== "month" && row.interval !== "year")) {
      addAnomaly("medium", "weird_interval", `Active sub with non-standard billing interval`, row);
    }
    if (row.amount === 0) {
      addAnomaly("medium", "zero_amount", `Active sub with $0 price`, row);
    }
    if (row.discount) {
      addAnomaly("low", "discounted_sub", `Active sub has coupon/discount`, row);
    }
  }

  // Past due / unpaid
  const problemSubs = subRows.filter((s) => ["past_due", "unpaid", "incomplete"].includes(s.status));
  for (const row of problemSubs) {
    addAnomaly("high", "payment_problem", `Subscription in ${row.status} status`, row);
  }

  // Cancel at period end but still active
  const cancelPending = subRows.filter((s) => s.status === "active" && s.cancelAtPeriodEnd);
  for (const row of cancelPending) {
    addAnomaly("low", "cancel_pending", `Active but cancel_at_period_end=true`, row);
  }

  // --- Customer analysis ---
  const customersWithNoEmail = customers.filter((c) => !c.email && !c.deleted);
  if (customersWithNoEmail.length > 0) {
    addAnomaly("medium", "no_email", `${customersWithNoEmail.length} customers without email`, {
      count: customersWithNoEmail.length,
      sample: customersWithNoEmail.slice(0, 5).map((c) => c.id),
    });
  }

  const deletedCustomersWithActiveSubs = [];
  for (const [cid, subs] of activeSubsByCustomer) {
    const cust = customerMap.get(cid);
    if (cust?.deleted) {
      deletedCustomersWithActiveSubs.push({ customerId: cid, subs: subs.map((s) => s.id) });
    }
  }
  for (const row of deletedCustomersWithActiveSubs) {
    addAnomaly("high", "deleted_customer_active_sub", `Deleted customer still has active subs`, row);
  }

  // Customers with charges but no subscription
  const customersWithSubs = new Set(subscriptions.map((s) => (typeof s.customer === "string" ? s.customer : s.customer?.id)));
  const customersWithSuccessfulCharges = new Set(
    charges.filter((c) => c.paid && !c.refunded).map((c) => (typeof c.customer === "string" ? c.customer : c.customer?.id)).filter(Boolean)
  );
  const chargedNoSub = [...customersWithSuccessfulCharges].filter((cid) => !customersWithSubs.has(cid));
  if (chargedNoSub.length > 0) {
    addAnomaly("medium", "charged_no_sub", `${chargedNoSub.length} customers paid but have no subscription record`, {
      count: chargedNoSub.length,
      sample: chargedNoSub.slice(0, 10).map((cid) => ({
        customerId: cid,
        email: customerMap.get(cid)?.email,
      })),
    });
  }

  // --- Payment / charge analysis ---
  const paidCharges = charges.filter((c) => c.paid);
  const refundedCharges = charges.filter((c) => c.refunded);
  const failedCharges = charges.filter((c) => !c.paid && c.status === "failed");
  const disputedCharges = charges.filter((c) => c.disputed);

  const totalCollected = paidCharges.reduce((s, c) => s + c.amount, 0);
  const totalRefunded = refundedCharges.reduce((s, c) => s + c.amount_refunded, 0);

  // Amount distribution on charges
  const chargeAmounts = new Map();
  for (const c of paidCharges) {
    const key = `${c.amount}-${c.currency}`;
    chargeAmounts.set(key, (chargeAmounts.get(key) ?? 0) + 1);
  }
  const unexpectedChargeAmounts = [...chargeAmounts.entries()].filter(([key]) => {
    const [amount] = key.split("-");
    const knownAmounts = new Set(recurringPrices.map((p) => String(p.amount)));
    // also allow common partial amounts
    return !knownAmounts.has(amount);
  });
  if (unexpectedChargeAmounts.length > 0) {
    addAnomaly("medium", "unexpected_charge_amounts", "Charge amounts that don't match any recurring price", {
      amounts: unexpectedChargeAmounts
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([k, count]) => ({ amount: k, count })),
    });
  }

  for (const c of disputedCharges) {
    addAnomaly("high", "dispute", `Charge disputed`, {
      chargeId: c.id,
      amount: fmt(c.amount, c.currency),
      customerId: c.customer,
      created: fmtDate(c.created),
    });
  }

  // --- Invoice analysis ---
  const openInvoices = invoices.filter((i) => i.status === "open");
  const uncollectible = invoices.filter((i) => i.status === "uncollectible");
  const voidInvoices = invoices.filter((i) => i.status === "void");

  for (const inv of openInvoices) {
    addAnomaly("medium", "open_invoice", `Open/unpaid invoice`, {
      invoiceId: inv.id,
      customerId: inv.customer,
      amount: fmt(inv.amount_due, inv.currency),
      dueDate: fmtDate(inv.due_date),
    });
  }
  for (const inv of uncollectible) {
    addAnomaly("high", "uncollectible", `Uncollectible invoice`, {
      invoiceId: inv.id,
      customerId: inv.customer,
      amount: fmt(inv.amount_due, inv.currency),
    });
  }

  // Invoice vs subscription amount mismatches (paid invoices)
  const paidInvoices = invoices.filter((i) => i.status === "paid" && i.subscription);
  for (const inv of paidInvoices) {
    const sub = subscriptions.find((s) => s.id === inv.subscription);
    if (!sub) continue;
    const priceId = sub.items.data[0]?.price?.id;
    const price = priceMap.get(priceId);
    const expected = (price?.unit_amount ?? 0) * (sub.items.data[0]?.quantity ?? 1);
    const paid = inv.amount_paid;
    if (expected > 0 && Math.abs(paid - expected) > 1 && !inv.discount) {
      addAnomaly("medium", "invoice_amount_mismatch", `Paid invoice amount differs from subscription price`, {
        invoiceId: inv.id,
        subscriptionId: inv.subscription,
        expected: fmt(expected, inv.currency),
        paid: fmt(paid, inv.currency),
        customerId: inv.customer,
      });
    }
  }

  // --- Revenue by price ---
  const revenueByPrice = {};
  for (const inv of invoices.filter((i) => i.status === "paid")) {
    for (const line of inv.lines?.data ?? []) {
      const priceId = line.price?.id ?? "unknown";
      if (!revenueByPrice[priceId]) {
        const p = priceMap.get(priceId);
        revenueByPrice[priceId] = {
          priceId,
          productName: p ? (typeof p.product === "string" ? productMap.get(p.product)?.name : p.product?.name) : line.description,
          interval: intervalLabel(p ?? line.price),
          amount: p?.unit_amount ?? line.price?.unit_amount,
          currency: inv.currency,
          invoiceCount: 0,
          totalPaid: 0,
        };
      }
      revenueByPrice[priceId].invoiceCount++;
      revenueByPrice[priceId].totalPaid += line.amount;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      customers: customers.length,
      subscriptions: subscriptions.length,
      charges: charges.length,
      invoices: invoices.length,
      prices: prices.length,
      products: products.length,
      subsByStatus,
      subsByInterval,
      activeSubsByPrice: Object.fromEntries(
        Object.entries(subsByPrice)
          .filter(([priceId]) => {
            const sub = subRows.find((r) => r.priceId === priceId && ["active", "trialing"].includes(r.status));
            return !!sub;
          })
          .sort((a, b) => b[1] - a[1])
      ),
      mrr: fmt(mrrCents),
      arr: fmt(arrCents),
      totalCollected: fmt(totalCollected),
      totalRefunded: fmt(totalRefunded),
      netCollected: fmt(totalCollected - totalRefunded),
      paidCharges: paidCharges.length,
      failedCharges: failedCharges.length,
      refundedCharges: refundedCharges.length,
      disputedCharges: disputedCharges.length,
      openInvoices: openInvoices.length,
      uncollectibleInvoices: uncollectible.length,
    },
    priceCatalog: priceSummary.sort((a, b) => (a.interval > b.interval ? 1 : -1)),
    activePriceCatalog: activePrices,
    revenueByPrice: Object.values(revenueByPrice).sort((a, b) => b.totalPaid - a.totalPaid),
    chargeAmountDistribution: [...chargeAmounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, count]) => {
        const [amount, currency] = k.split("-");
        return { amount: fmt(Number(amount), currency), count };
      }),
    anomalies: anomalies.sort((a, b) => {
      const sev = { high: 0, medium: 1, low: 2 };
      return (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3);
    }),
    anomalyCounts: {
      high: anomalies.filter((a) => a.severity === "high").length,
      medium: anomalies.filter((a) => a.severity === "medium").length,
      low: anomalies.filter((a) => a.severity === "low").length,
      total: anomalies.length,
    },
    activeSubscriptions: subRows.filter((s) => ["active", "trialing"].includes(s.status)),
    problemSubscriptions: subRows.filter((s) => ["past_due", "unpaid", "incomplete", "canceled"].includes(s.status)),
  };

  const outPath = "stripe-audit-report.json";
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    outPath,
    summary: report.summary,
    anomalyCounts: report.anomalyCounts,
    topAnomalies: report.anomalies.slice(0, 30),
    priceCatalog: report.activePriceCatalog,
    revenueByPrice: report.revenueByPrice.slice(0, 20),
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

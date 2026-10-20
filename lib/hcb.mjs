export const HCB_ORG = 'org_mqupky';
export function normalizeHcb(org, transactions, page, pageSize) {
  if (org?.id !== HCB_ORG || org.transparent !== true || !Array.isArray(transactions)) throw new Error('Invalid HCB response');
  const integer = value => {if (!Number.isSafeInteger(value)) throw new Error('Invalid HCB amount'); return value;};
  return {
    organization: {id: org.id, name: String(org.name), url: 'https://hcb.hackclub.com/' + encodeURIComponent(org.slug),
      balanceCents: integer(org.balances.balance_cents), incomingCents: integer(org.balances.incoming_balance_cents), raisedCents: integer(org.balances.total_raised)},
    currency: 'USD', page, hasMore: transactions.length === pageSize, updatedAt: new Date().toISOString(),
    transactions: transactions.map(row => ({id: String(row.id), name: String(row.memo || 'HCB transaction'), amountCents: integer(row.amount_cents),
      type: row.amount_cents >= 0 ? 'Income' : 'Expense', date: String(row.date).slice(0, 10), status: row.pending ? 'Pending' : 'Settled', category: String(row.type || '').replaceAll('_', ' ')}))
  };
}

/**
 * A chart of accounts to start from.
 *
 * Most teams have their own and will upload it. The ones that do not should not
 * be blocked at the door - this is a conventional small-company chart with the
 * accounts the close actually needs: a cash account to reconcile against, AP and
 * accrued liabilities so an accrual can balance, and enough expense lines to
 * code an invoice to something meaningful.
 */
export const STARTER_CHART = [
  { code: "1010", name: "Cash - Operating",           type: "asset",     normal: "debit"  },
  { code: "1200", name: "Accounts Receivable",        type: "asset",     normal: "debit"  },
  { code: "1400", name: "Prepaid Expenses",           type: "asset",     normal: "debit"  },
  { code: "2010", name: "Accounts Payable",           type: "liability", normal: "credit" },
  { code: "2100", name: "Accrued Liabilities",        type: "liability", normal: "credit" },
  { code: "4010", name: "Revenue",                    type: "revenue",   normal: "credit" },
  { code: "5010", name: "Cost of Goods Sold",         type: "expense",   normal: "debit"  },
  { code: "6010", name: "Salaries & Wages",           type: "expense",   normal: "debit"  },
  { code: "6020", name: "Payroll Taxes & Benefits",   type: "expense",   normal: "debit"  },
  { code: "6410", name: "Bank & Processing Fees",     type: "expense",   normal: "debit"  },
  { code: "6510", name: "Rent & Facilities",          type: "expense",   normal: "debit"  },
  { code: "6610", name: "Legal & Professional",       type: "expense",   normal: "debit"  },
  { code: "6710", name: "Marketing & Advertising",    type: "expense",   normal: "debit"  },
  { code: "6820", name: "Cloud Infrastructure",       type: "expense",   normal: "debit"  },
  { code: "6830", name: "Software & Subscriptions",   type: "expense",   normal: "debit"  },
  { code: "6910", name: "Travel & Entertainment",     type: "expense",   normal: "debit"  },
  { code: "7010", name: "FX Gain / (Loss)",           type: "expense",   normal: "debit"  },
] as const;

export const STARTER_DEPARTMENTS = [
  { code: "GA",  name: "General & Administrative" },
  { code: "ENG", name: "Engineering" },
  { code: "GTM", name: "Go To Market" },
  { code: "OPS", name: "Operations" },
] as const;

/** `2100` must exist or an accrual cannot balance. */
export const ACCRUED_LIABILITIES = "2100";

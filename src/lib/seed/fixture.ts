/**
 * Northwind Robotics - the fixture entity.
 *
 * Every messy detail below exists because a real controller has complained about
 * it. The point is not volume; it is that the mess is *learnable*: the same
 * patterns recur across periods, so an agent that actually learns gets cheaper
 * and quieter each month, and one that only pattern-matches on the fly does not.
 */

export const ENTITY = {
  name: "Northwind Robotics, Inc.",
  baseCurrency: "USD",
  /** $5,000. Above this a human reviews, whatever the model thinks. */
  materialityCents: 500_000,
  autoTickmarkThreshold: 0.9,
} as const;

export const GL_ACCOUNTS = [
  { code: "1010", name: "Cash - Operating",            type: "asset",     normal: "debit"  },
  { code: "1020", name: "Cash - Payroll",              type: "asset",     normal: "debit"  },
  { code: "1200", name: "Accounts Receivable",         type: "asset",     normal: "debit"  },
  { code: "1400", name: "Prepaid Expenses",            type: "asset",     normal: "debit"  },
  { code: "1500", name: "Inventory",                   type: "asset",     normal: "debit"  },
  { code: "2010", name: "Accounts Payable",            type: "liability", normal: "credit" },
  { code: "2100", name: "Accrued Liabilities",         type: "liability", normal: "credit" },
  { code: "4010", name: "Revenue - Product",           type: "revenue",   normal: "credit" },
  { code: "4020", name: "Revenue - Subscription",      type: "revenue",   normal: "credit" },
  { code: "5010", name: "COGS - Components",           type: "expense",   normal: "debit"  },
  { code: "5020", name: "COGS - Fulfillment",          type: "expense",   normal: "debit"  },
  { code: "6010", name: "Salaries & Wages",            type: "expense",   normal: "debit"  },
  { code: "6020", name: "Payroll Taxes & Benefits",    type: "expense",   normal: "debit"  },
  { code: "6410", name: "Bank & Processing Fees",      type: "expense",   normal: "debit"  },
  { code: "6510", name: "Rent & Facilities",           type: "expense",   normal: "debit"  },
  { code: "6610", name: "Legal & Professional",        type: "expense",   normal: "debit"  },
  { code: "6710", name: "Marketing & Advertising",     type: "expense",   normal: "debit"  },
  { code: "6820", name: "Cloud Infrastructure",        type: "expense",   normal: "debit"  },
  { code: "6830", name: "Software & Subscriptions",    type: "expense",   normal: "debit"  },
  { code: "6910", name: "Travel & Entertainment",      type: "expense",   normal: "debit"  },
  { code: "7010", name: "FX Gain / (Loss)",            type: "expense",   normal: "debit"  },
] as const;

export const DEPARTMENTS = [
  { code: "ENG",  name: "Engineering" },
  { code: "DATA", name: "Data Platform" },
  { code: "PROD", name: "Product & Design" },
  { code: "GTM",  name: "Go To Market" },
  { code: "OPS",  name: "Operations & Supply Chain" },
  { code: "GA",   name: "General & Administrative" },
] as const;

export type DeptSplit = Record<string, number>;

export interface VendorSpec {
  name: string;
  /** How the bank actually renders it. Never the legal name. */
  bankAliases: string[];
  /** Ground truth the agent must learn. Never shown to it. */
  glCode: string;
  /**
   * Ground truth department allocation. A single department is the easy case;
   * a *split* is the one that separates real learning from vibes.
   */
  deptSplit: DeptSplit;
  recurring: boolean;
  cadence?: "monthly" | "quarterly" | "annual";
  /** Typical invoice in cents, before jitter. */
  baseCents: number;
  jitter: number;
  currency?: "USD" | "EUR" | "GBP";
  terms: number;
  /** Non-obvious behaviour the reconciler has to cope with. */
  quirk?: "net_settlement" | "fx" | "installments" | "annual_prepaid" | "no_invoice";
  descriptions: string[];
}

export const VENDORS: VendorSpec[] = [
  {
    name: "Amazon Web Services",
    bankAliases: ["AMAZON WEB SERVICES AWS EMEA SARL LUXEMBOURG", "AWS EMEA SARL", "AMZN WEB SVCS"],
    glCode: "6820",
    // the hard one: a three-way split that is stable month over month
    deptSplit: { ENG: 0.6, DATA: 0.25, PROD: 0.15 },
    recurring: true, cadence: "monthly", baseCents: 4_820_000, jitter: 0.18, terms: 30,
    descriptions: ["AWS usage - consolidated billing", "AWS monthly usage"],
  },
  {
    name: "Datadog",
    bankAliases: ["DATADOG INC 866-329-4466", "DATADOG, INC."],
    glCode: "6820",
    deptSplit: { ENG: 0.7, DATA: 0.3 },
    recurring: true, cadence: "monthly", baseCents: 1_240_000, jitter: 0.09, terms: 30,
    descriptions: ["Datadog Pro - infrastructure monitoring"],
  },
  {
    name: "Vercel",
    bankAliases: ["VERCEL INC", "VERCEL INC. SAN FRANCISCO CA"],
    glCode: "6820",
    deptSplit: { ENG: 0.8, PROD: 0.2 },
    recurring: true, cadence: "monthly", baseCents: 386_000, jitter: 0.12, terms: 30,
    descriptions: ["Vercel Enterprise - hosting"],
  },
  {
    name: "Figma",
    bankAliases: ["FIGMA INC HTTPSFIGMA.C", "FIGMA, INC."],
    glCode: "6830",
    deptSplit: { PROD: 0.85, ENG: 0.15 },
    recurring: true, cadence: "monthly", baseCents: 132_000, jitter: 0.05, terms: 30,
    descriptions: ["Figma Organization - 88 seats"],
  },
  {
    name: "Linear",
    bankAliases: ["LINEAR ORBIT INC", "LINEAR.APP"],
    glCode: "6830",
    deptSplit: { ENG: 0.55, PROD: 0.3, DATA: 0.15 },
    recurring: true, cadence: "monthly", baseCents: 96_000, jitter: 0.04, terms: 30,
    descriptions: ["Linear Business - 120 seats"],
  },
  {
    name: "Slack Technologies",
    bankAliases: ["SLACK T SALESFORCE", "SLACK TECHNOLOGIES LLC"],
    glCode: "6830",
    deptSplit: { GA: 0.35, ENG: 0.25, GTM: 0.25, PROD: 0.15 },
    recurring: true, cadence: "monthly", baseCents: 214_000, jitter: 0.06, terms: 30,
    descriptions: ["Slack Business+ - company wide"],
  },
  {
    name: "GitHub",
    bankAliases: ["GITHUB INC HTTPSGITHUB.C", "MSFT * GITHUB"],
    glCode: "6830",
    deptSplit: { ENG: 0.9, DATA: 0.1 },
    recurring: true, cadence: "monthly", baseCents: 178_000, jitter: 0.05, terms: 30,
    descriptions: ["GitHub Enterprise Cloud"],
  },
  {
    name: "WeWork",
    bankAliases: ["WEWORK 555 MARKET ST", "WEWORK COMPANIES LLC"],
    glCode: "6510",
    deptSplit: { GA: 1.0 },
    recurring: true, cadence: "monthly", baseCents: 3_950_000, jitter: 0.0, terms: 1,
    descriptions: ["Office license fee - 555 Market St, 4th floor"],
  },
  {
    name: "Stripe",
    bankAliases: ["STRIPE TRANSFER ST-", "STRIPE PAYOUT"],
    glCode: "6410",
    deptSplit: { GTM: 1.0 },
    // deposits arrive net of fees, so the bank never equals the invoice
    recurring: true, cadence: "monthly", baseCents: 0, jitter: 0, terms: 0,
    quirk: "net_settlement",
    descriptions: ["Stripe payout - net of processing fees"],
  },
  {
    name: "Deel",
    bankAliases: ["DEEL INC EUR CONTRACTOR", "DEEL, INC. SEPA"],
    glCode: "6010",
    deptSplit: { ENG: 0.65, DATA: 0.35 },
    // billed in EUR, settled in USD; the delta is FX, not an error
    recurring: true, cadence: "monthly", baseCents: 2_140_000, jitter: 0.15,
    currency: "EUR", terms: 15, quirk: "fx",
    descriptions: ["EOR contractors - EMEA engineering pod"],
  },
  {
    name: "Mouser Electronics",
    bankAliases: ["MOUSER ELECTRONICS 800-346", "MOUSER ELECTRONI"],
    glCode: "5010",
    deptSplit: { OPS: 1.0 },
    recurring: false, baseCents: 1_870_000, jitter: 0.45, terms: 45,
    descriptions: ["Connectors and passives - build lot", "Sensor modules - EVT build"],
  },
  {
    name: "Digi-Key Electronics",
    bankAliases: ["DIGI-KEY CORP THIEF RIVER", "DIGIKEY ELECTRONICS"],
    glCode: "5010",
    deptSplit: { OPS: 1.0 },
    recurring: false, baseCents: 940_000, jitter: 0.5, terms: 45,
    descriptions: ["Board components - DVT run", "Cable assemblies"],
  },
  {
    name: "Flexport",
    bankAliases: ["FLEXPORT INC SAN FRANCIS", "FLEXPORT, INC."],
    glCode: "5020",
    deptSplit: { OPS: 1.0 },
    // large freight invoices settle in two tranches -> many:1 match
    recurring: false, baseCents: 6_400_000, jitter: 0.3, terms: 30,
    quirk: "installments",
    descriptions: ["Ocean freight SHA-OAK + customs", "Airfreight expedite - EVT units"],
  },
  {
    name: "Cooley LLP",
    bankAliases: ["COOLEY LLP OPERATING", "COOLEY LLP"],
    glCode: "6610",
    deptSplit: { GA: 1.0 },
    recurring: false, baseCents: 2_800_000, jitter: 0.6, terms: 30,
    descriptions: ["Corporate matters - Series B follow-on", "IP prosecution - utility filings"],
  },
  {
    name: "Deloitte",
    bankAliases: ["DELOITTE LLP AP", "DELOITTE TAX LLP"],
    glCode: "6610",
    deptSplit: { GA: 1.0 },
    recurring: true, cadence: "quarterly", baseCents: 4_500_000, jitter: 0.1, terms: 45,
    descriptions: ["Quarterly review procedures"],
  },
  {
    name: "Salesforce",
    bankAliases: ["SALESFORCE INC 415-901-70", "SALESFORCE.COM"],
    glCode: "1400",
    deptSplit: { GTM: 1.0 },
    // an annual prepaid over materiality: never auto-posts, however confident
    recurring: true, cadence: "annual", baseCents: 24_000_000, jitter: 0.0, terms: 30,
    quirk: "annual_prepaid",
    descriptions: ["Sales Cloud + Service Cloud - annual, Feb-Jan"],
  },
  {
    name: "Gusto",
    bankAliases: ["GUSTO PAYROLL 8AM-5PM", "GUSTO TAX COLLECTION"],
    glCode: "6010",
    deptSplit: { ENG: 0.45, GTM: 0.2, PROD: 0.15, GA: 0.1, DATA: 0.1 },
    recurring: true, cadence: "monthly", baseCents: 41_200_000, jitter: 0.04, terms: 0,
    quirk: "no_invoice",
    descriptions: ["Semi-monthly payroll run"],
  },
  {
    name: "United Airlines",
    bankAliases: ["UNITED 016 CHICAGO IL", "UNITED AIRLINES"],
    glCode: "6910",
    deptSplit: { GTM: 0.6, OPS: 0.4 },
    recurring: false, baseCents: 184_000, jitter: 0.7, terms: 0,
    descriptions: ["Customer visit - Austin", "Supplier audit travel - Shenzhen"],
  },
  {
    name: "Google Ads",
    bankAliases: ["GOOGLE ADS4829174 CC@GOOGL", "GOOGLE *ADS"],
    glCode: "6710",
    deptSplit: { GTM: 1.0 },
    recurring: true, cadence: "monthly", baseCents: 1_620_000, jitter: 0.35, terms: 30,
    descriptions: ["Search + demand gen spend"],
  },
  {
    name: "Iron Mountain",
    bankAliases: ["IRON MOUNTAIN 800-899-4766", "IRON MTN"],
    glCode: "6510",
    deptSplit: { GA: 1.0 },
    recurring: true, cadence: "monthly", baseCents: 48_000, jitter: 0.03, terms: 30,
    descriptions: ["Records storage and shredding"],
  },
];

/** Bank noise with no invoice behind it - real statements are full of this. */
export const BANK_NOISE = [
  { desc: "MONTHLY MAINTENANCE FEE",            cents: -3_500,   gl: "6410", dept: "GA" },
  { desc: "WIRE TRANSFER FEE INTL",             cents: -4_500,   gl: "6410", dept: "GA" },
  { desc: "ANALYSIS SERVICE CHARGE",            cents: -12_800,  gl: "6410", dept: "GA" },
  { desc: "INTEREST EARNED - SWEEP",            cents: 214_000,  gl: "4020", dept: "GA" },
  { desc: "RETURNED ITEM CHARGEBACK",           cents: -87_400,  gl: "6410", dept: "GTM" },
  { desc: "FX CONVERSION SPREAD",               cents: -21_900,  gl: "7010", dept: "GA" },
];

export const PERIODS = ["2026-01", "2026-02", "2026-03", "2026-04"] as const;

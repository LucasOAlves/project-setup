import type { JobEmploymentType } from "@studio/shared";

// Deterministic normalization of what job sources report (spec A02, JOB-006). Pure functions
// only: the same posting text always normalizes the same way, and anything the text does not
// clearly say comes back as null/empty instead of a guess dressed up as data. Eligibility
// (JOB-007) interprets the region tokens; this module only extracts them.

export type SalaryPeriod = "HOUR" | "DAY" | "WEEK" | "FORTNIGHT" | "MONTH" | "YEAR";

export type NormalizedSalary = {
  min: number;
  max: number;
  currency: string;
  period: SalaryPeriod;
  usdMonthlyMin: number;
  usdMonthlyMax: number;
  // True when a non-USD amount was converted with the static rates below.
  approximate: boolean;
};

export type SalaryInput = {
  min?: number | null;
  max?: number | null;
  currency?: string | null;
  period?: string | null;
  text?: string | null;
};

// Approximate USD value of one unit, good enough to compare against a USD 6,000/month
// target. Not live rates: a converted salary is always flagged `approximate`. Update these
// when they drift far enough to change a shortlist.
const USD_PER_UNIT: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.73,
  AUD: 0.66,
  BRL: 0.18,
};

// Months-equivalent multiplier: hourly assumes 160 working hours, daily 21 working days.
const MONTHLY_FACTOR: Record<SalaryPeriod, number> = {
  HOUR: 160,
  DAY: 21,
  WEEK: 52 / 12,
  FORTNIGHT: 26 / 12,
  MONTH: 1,
  YEAR: 1 / 12,
};

const STRUCTURED_PERIODS: Record<string, SalaryPeriod> = {
  hourly: "HOUR",
  hour: "HOUR",
  daily: "DAY",
  day: "DAY",
  weekly: "WEEK",
  week: "WEEK",
  fortnightly: "FORTNIGHT",
  monthly: "MONTH",
  month: "MONTH",
  annual: "YEAR",
  annually: "YEAR",
  yearly: "YEAR",
  year: "YEAR",
};

export function normalizeSalary(input: SalaryInput): NormalizedSalary | null {
  const structured = fromStructured(input);
  const parsed = structured ?? (input.text ? parseSalaryText(input.text) : null);
  if (!parsed) return null;

  const rate = USD_PER_UNIT[parsed.currency];
  if (rate === undefined) return null;

  const factor = MONTHLY_FACTOR[parsed.period];
  return {
    ...parsed,
    usdMonthlyMin: Math.round(parsed.min * factor * rate),
    usdMonthlyMax: Math.round(parsed.max * factor * rate),
    approximate: parsed.currency !== "USD",
  };
}

type ParsedSalary = { min: number; max: number; currency: string; period: SalaryPeriod };

function fromStructured(input: SalaryInput): ParsedSalary | null {
  const min = positive(input.min);
  const max = positive(input.max);
  const currency = input.currency?.trim().toUpperCase() ?? "";
  if ((min === null && max === null) || !currency) return null;

  const low = min ?? max!;
  const high = max ?? min!;
  const period = STRUCTURED_PERIODS[input.period?.trim().toLowerCase() ?? ""] ?? guessPeriod(high);
  return { min: Math.min(low, high), max: Math.max(low, high), currency, period };
}

function positive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

// Order matters: the prefixed dollar signs must be tested before the bare "$".
const CURRENCY_PATTERNS: Array<[RegExp, string]> = [
  [/R\$|\bBRL\b/i, "BRL"],
  [/CA\$|C\$|\bCAD\b/i, "CAD"],
  [/A\$|AU\$|\bAUD\b/i, "AUD"],
  [/€|\bEUR\b/i, "EUR"],
  [/£|\bGBP\b/i, "GBP"],
  [/US\$|\$|\bUSD\b/i, "USD"],
];

const PERIOD_PATTERNS: Array<[RegExp, SalaryPeriod]> = [
  [/\/\s*(h|hr|hour)\b|\bper\s+hour\b|\bhourly\b|\ban hour\b/i, "HOUR"],
  [/\/\s*day\b|\bper\s+day\b|\bdaily\b/i, "DAY"],
  [/\/\s*(wk|week)\b|\bper\s+week\b|\bweekly\b/i, "WEEK"],
  [/\/\s*(mo|month|mês|mes)\b|\bper\s+month\b|\bmonthly\b|\bpor\s+m[eê]s\b|\bmensal\b/i, "MONTH"],
  [/\/\s*(yr|year|ano)\b|\bper\s+(year|annum)\b|\bannual(ly)?\b|\byearly\b|\bp\.?a\.?\b|\bpor\s+ano\b/i, "YEAR"],
];

const AMOUNT_PATTERN = /(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*([kK])?\b/g;

function parseSalaryText(text: string): ParsedSalary | null {
  const currency = CURRENCY_PATTERNS.find(([pattern]) => pattern.test(text))?.[1];
  if (!currency) return null;

  const amounts: number[] = [];
  for (const match of text.matchAll(AMOUNT_PATTERN)) {
    const raw = match[1] ?? "";
    const grouped = /^\d{1,3}(?:[.,]\d{3})+$/.test(raw);
    const value = grouped ? Number(raw.replace(/[.,]/g, "")) : Number(raw.replace(",", "."));
    const amount = match[2] ? value * 1000 : value;
    if (Number.isFinite(amount) && amount > 0) amounts.push(amount);
  }
  if (amounts.length === 0) return null;

  const low = amounts[0]!;
  const high = amounts[1] ?? low;
  const min = Math.min(low, high);
  const max = Math.max(low, high);
  const period = PERIOD_PATTERNS.find(([pattern]) => pattern.test(text))?.[1] ?? guessPeriod(max);
  return { min, max, currency, period };
}

// No period written: at or above 20,000 it is almost certainly annual, at or below 300 an
// hourly rate, and anything between reads as monthly.
function guessPeriod(amount: number): SalaryPeriod {
  if (amount >= 20_000) return "YEAR";
  if (amount <= 300) return "HOUR";
  return "MONTH";
}

export type Region =
  | "AMERICAS"
  | "APAC"
  | "BRAZIL"
  | "CANADA"
  | "EMEA"
  | "EUROPE"
  | "LATAM"
  | "UK"
  | "USA"
  | "WORLDWIDE";

// Upper-case-only patterns (US, EU, UK) are matched case-sensitively so prose like "join us"
// is not read as a US restriction.
const REGION_PATTERNS: Array<[RegExp, Region]> = [
  [/\b(worldwide|anywhere|global(ly)?|international)\b/i, "WORLDWIDE"],
  [/\b(latam|latin america|south america|central america|mexico|argentina|colombia|chile|peru|uruguay)\b/i, "LATAM"],
  [/\bamericas\b/i, "AMERICAS"],
  [/\b(brazil|brasil)\b/i, "BRAZIL"],
  [/\bU\.?S\.?(A\.?)?(?![A-Za-z])/, "USA"],
  [/\bunited states\b/i, "USA"],
  [/\bcanada\b/i, "CANADA"],
  [/\b(europe|european union)\b/i, "EUROPE"],
  [/\bEU\b/, "EUROPE"],
  [/\b(united kingdom|great britain)\b/i, "UK"],
  [/\bUK\b/, "UK"],
  [/\bemea\b/i, "EMEA"],
  [/\b(apac|asia|asia-pacific)\b/i, "APAC"],
];

export function extractRegions(location: string): Region[] {
  const found = new Set<Region>();
  for (const [pattern, region] of REGION_PATTERNS) {
    if (pattern.test(location)) found.add(region);
  }
  return [...found].sort();
}

const EMPLOYMENT_TYPES: Record<string, JobEmploymentType> = {
  fulltime: "FULL_TIME",
  permanent: "FULL_TIME",
  parttime: "PART_TIME",
  contract: "CONTRACT",
  contractor: "CONTRACT",
  freelance: "CONTRACT",
  freelancer: "CONTRACT",
  temporary: "CONTRACT",
  intern: "INTERNSHIP",
  internship: "INTERNSHIP",
  other: "OTHER",
};

export function normalizeEmploymentType(value: string | null | undefined): JobEmploymentType | null {
  const key = value?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  return EMPLOYMENT_TYPES[key] ?? null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function postingAgeDays(postedAt: Date | null, now: Date): number | null {
  if (!postedAt) return null;
  return Math.max(0, Math.floor((now.getTime() - postedAt.getTime()) / DAY_MS));
}

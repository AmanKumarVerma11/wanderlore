// Gemini's terms allow only its paid tier for apps offered to users in the EEA,
// Switzerland or the UK, and this app runs on the free tier, so /api/plan declines
// requests from there. Codes are ISO 3166-1 alpha-2, as Vercel sends them in the
// x-vercel-ip-country header.

const RESTRICTED = new Set([
  // EU member states
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  // EU regions with their own codes
  "AX", "GF", "GP", "MQ", "MF", "RE", "YT",
  // the rest of the EEA, plus Switzerland and the UK
  "IS", "LI", "NO", "CH", "GB",
]);

export const REGION_MESSAGE =
  "Trip planning isn't available in the EEA, Switzerland or the UK yet: the free AI tier this app runs on doesn't cover those regions.";

/** True when the visitor's country is one the free Gemini tier can't serve. */
export function isRestrictedCountry(code: string | null): boolean {
  return code !== null && RESTRICTED.has(code.trim().toUpperCase());
}

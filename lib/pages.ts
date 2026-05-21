/**
 * Managed Facebook Pages — mapped to Publer account IDs.
 * Add new pages here and set the corresponding PUBLER_*_ACCOUNT_ID env var.
 */

export const PAGES = {
  tx2pay: {
    label: "TX2Pay",
    accountId: () => process.env.PUBLER_FACEBOOK_ACCOUNT_ID!,
  },
  endorsements: {
    label: "eEndorsements.com",
    accountId: () => process.env.PUBLER_ENDORSEMENTS_ACCOUNT_ID!,
  },
} as const;

export type PageKey = keyof typeof PAGES;
export const PAGE_KEYS = Object.keys(PAGES) as PageKey[];

/** Resolve a page key to its Publer account ID. Defaults to tx2pay. */
export function getAccountId(pageKey: string | null | undefined): string {
  const key = (pageKey ?? "tx2pay") as PageKey;
  return PAGES[key]?.accountId() ?? PAGES.tx2pay.accountId();
}

/** Human-readable label for a page key. */
export function getPageLabel(pageKey: string | null | undefined): string {
  const key = (pageKey ?? "tx2pay") as PageKey;
  return PAGES[key]?.label ?? "TX2Pay";
}

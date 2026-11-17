const tabs = ["prices", "costs", "rules", "products", "credits", "history", "operations"] as const;
export type BillingTab = typeof tabs[number];

const sections: Record<string, BillingTab> = {
    wallet: "products", recharge: "products", products: "products", prices: "prices",
    costs: "costs", rules: "rules", credits: "credits", history: "history", operations: "operations",
};

export function legacyBillingSection(section?: string | null): BillingTab | undefined {
    if (section && Object.hasOwn(sections, section)) return sections[section];
}

export function resolveLegacyBillingTab(tab?: string | null, section?: string | null): BillingTab | undefined {
    return tab && tabs.includes(tab as BillingTab) ? tab as BillingTab : legacyBillingSection(section);
}

/** Clerk's widgets wear the same paper and ink as the rest of the product. */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#161513",
    colorBackground: "#fbfaf8",
    colorInputBackground: "#ffffff",
    colorText: "#161513",
    colorTextSecondary: "#706d66",
    colorInputText: "#161513",
    colorNeutral: "#161513",
    colorDanger: "#b23a0f",
    borderRadius: "8px",
    fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
    fontSize: "14px",
  },
  elements: {
    card: { border: "1px solid rgb(22 21 19 / 0.17)", boxShadow: "0 1px 0 rgb(22 21 19 / 0.04), 0 12px 32px -18px rgb(40 32 20 / 0.22)" },
    headerTitle: { letterSpacing: "-0.03em", fontWeight: 500 },
    footer: { background: "transparent" },
  },
};

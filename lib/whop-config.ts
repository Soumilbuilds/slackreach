export const WHOP_API_KEY = process.env.WHOP_API_KEY ?? "";
export const WHOP_COMPANY_ID = process.env.WHOP_COMPANY_ID ?? "";
export const WHOP_WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET ?? "";
export const WHOP_ENVIRONMENT =
  process.env.WHOP_ENVIRONMENT === "sandbox" ? "sandbox" : "production";
export const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";

export const WHOP_PRODUCT_ID = "prod_dykz42RsTpcMC";
export const WHOP_PLAN_ID_STARTER = "plan_TIrQGsxQD2IWT";
export const WHOP_PLAN_ID_STARTER_NO_TRIAL = "plan_3LBCzIdy2JTt5";
export const WHOP_PLAN_ID_GROWTH = "plan_KYchMiFoVLzEb";
export const WHOP_PLAN_ID_UNLIMITED = "plan_0mbCPVFKhrg89";

export const WHOP_STARTER_TRIAL_DAYS = 7;

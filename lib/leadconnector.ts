const LEADCONNECTOR_TRIAL_STARTED_WEBHOOK_URL =
  "https://services.leadconnectorhq.com/hooks/AhJ390JaEZDtO4nvBryb/webhook-trigger/05906caa-e1fc-4202-b44e-68259429b089";
const LEADCONNECTOR_PLAN_PAID_WEBHOOK_URL =
  "https://services.leadconnectorhq.com/hooks/AhJ390JaEZDtO4nvBryb/webhook-trigger/b6173e69-dc0e-4401-948e-e6926d40cd0e";

const sendLeadConnectorWebhook = async (
  url: string,
  payload: Record<string, string>
) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `LeadConnector webhook failed with ${response.status}${errorText ? `: ${errorText}` : ""}`
    );
  }
};

export const sendLeadConnectorTrialStartedWebhook = async (payload: {
  name: string;
  email: string;
}) =>
  sendLeadConnectorWebhook(LEADCONNECTOR_TRIAL_STARTED_WEBHOOK_URL, payload);

export const sendLeadConnectorPlanPaidWebhook = async (payload: {
  email: string;
  plan: "starter" | "growth" | "unlimited";
}) => sendLeadConnectorWebhook(LEADCONNECTOR_PLAN_PAID_WEBHOOK_URL, payload);

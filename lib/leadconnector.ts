const LEADCONNECTOR_TRIAL_STARTED_WEBHOOK_URL =
  "https://services.leadconnectorhq.com/hooks/AhJ390JaEZDtO4nvBryb/webhook-trigger/05906caa-e1fc-4202-b44e-68259429b089";

export const sendLeadConnectorTrialStartedWebhook = async (payload: {
  name: string;
  email: string;
}) => {
  const response = await fetch(LEADCONNECTOR_TRIAL_STARTED_WEBHOOK_URL, {
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

/**
 * Envoi du code reset via Brevo.
 * Si BREVO_API_KEY manque → fallback console (dev).
 */
export async function sendPasswordResetCode({ to, code }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || "armandokenn44@gmail.com";
  const senderName = process.env.BREVO_SENDER_NAME || "SecureDrive";

  // Fallback dev si pas de clé
  if (!apiKey) {
    console.log("========================================");
    console.log("  SECUREDRIVE — PASSWORD RESET CODE (console)");
    console.log("  To  :", to);
    console.log("  Code:", code);
    console.log("========================================");
    return { ok: true, mode: "console" };
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
      subject: "SecureDrive — Password reset code",
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #2563eb;">SecureDrive</h2>
          <p>Your password reset code is:</p>
          <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
          <p>This code is valid for <b>15 minutes</b>.</p>
          <p style="color: #64748b; font-size: 13px;">If you did not request this, ignore this email.</p>
        </div>
      `,
      textContent: `SecureDrive password reset code: ${code} (valid 15 minutes)`,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error("Brevo error:", res.status, errBody);
    // Fallback console pour ne pas bloquer le flow
    console.log("========================================");
    console.log("  FALLBACK CODE (Brevo failed):", code, "→", to);
    console.log("========================================");
    throw new Error("Could not send email via Brevo");
  }

  console.log("Brevo: reset code sent to", to);
  return { ok: true, mode: "brevo" };
}
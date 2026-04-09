import { Router, type IRouter } from "express";
import nodemailer from "nodemailer";

interface ReminderPayload {
  collaboratorEmail?: string;
  collaboratorName?: string;
  pendingCoursesCount?: number;
  completedResourcesCount?: number;
  totalResourcesCount?: number;
}

const router: IRouter = Router();

interface ParsedSender {
  name: string;
  email: string;
}

const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const parseSender = (value: string | undefined): ParsedSender | null => {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const angleMatch = trimmed.match(/^(.*)<([^>]+)>$/);
  if (angleMatch) {
    const name = angleMatch[1].trim().replace(/^"|"$/g, "") || "Capital Humano";
    const email = angleMatch[2].trim().toLowerCase();
    if (!email.includes("@")) return null;
    return { name, email };
  }

  if (!trimmed.includes("@")) return null;
  return { name: "Capital Humano", email: trimmed.toLowerCase() };
};

router.post("/collaborators/progress/reminders", async (req, res) => {
  const payload = (req.body || {}) as ReminderPayload;
  const collaboratorEmail = payload.collaboratorEmail?.trim().toLowerCase();
  const collaboratorName = payload.collaboratorName?.trim();
  const pendingCoursesCount = Math.max(Number(payload.pendingCoursesCount || 0), 0);
  const completedResourcesCount = Math.max(Number(payload.completedResourcesCount || 0), 0);
  const totalResourcesCount = Math.max(Number(payload.totalResourcesCount || 0), 1);

  if (!collaboratorEmail) {
    res.status(400).json({ message: "collaboratorEmail is required" });
    return;
  }

  if (pendingCoursesCount <= 0) {
    res.status(400).json({ message: "No pending courses to remind" });
    return;
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.REMINDER_FROM_EMAIL;
  const brevoApiKey = process.env.BREVO_API_KEY;
  const googleAppsScriptWebhookUrl = process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL;
  const googleAppsScriptWebhookToken = process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_TOKEN;
  const smtpUser = process.env.SMTP_USER;
  const smtpAppPassword = process.env.SMTP_APP_PASSWORD;
  const parsedSender = parseSender(fromEmail);

  const recipientLabel = collaboratorName || collaboratorEmail;
  const completionPercentage = Math.min(
    100,
    Math.max(0, Math.round((completedResourcesCount / Math.max(totalResourcesCount, 1)) * 100)),
  );
  const progressWidth = `${completionPercentage}%`;
  const portalUrl = process.env.REMINDER_PORTAL_URL || "https://ptltr.github.io/portal-uix/";
  const portalResumeUrl = (() => {
    try {
      const url = new URL(portalUrl);
      url.searchParams.set("resume", "1");
      url.searchParams.set("email", collaboratorEmail);
      url.searchParams.set("name", recipientLabel);
      return url.toString();
    } catch {
      return "https://ptltr.github.io/portal-uix/";
    }
  })();
  const subject = "Recordatorio de seguimiento - Cursos pendientes";
  const text = [
    `Hola ${recipientLabel},`,
    "",
    `Te compartimos un recordatorio: aun tienes ${pendingCoursesCount} curso(s) pendiente(s) por completar.`,
    `Tu avance actual es ${completedResourcesCount}/${totalResourcesCount}.`,
    "",
    "En caso de que tus pendientes incluyan talleres, acércate a Capital Humano para coordinarlos.",
    "",
    "Gracias,",
    "Capital Humano",
  ].join("\n");

  const html = `
    <html>
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </head>
      <body style="margin:0;padding:0;background-color:#0d0220 !important;">
    <div style="background-color:#0d0220 !important;padding:24px 12px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#0d0220" style="max-width:620px;margin:0 auto;border-collapse:collapse;background-color:#0d0220 !important;">
        <tr>
          <td style="padding:0;">
            <div style="background-color:#7b3fd9;border-radius:16px 16px 0 0;padding:18px 24px;color:#ffffff;border-bottom:4px solid #4ade80;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                <tr>
                  <td style="vertical-align:middle;width:48px;">
                    <table role="presentation" width="44" height="44" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="border-collapse:collapse;background-color:#ffffff;border-radius:12px;border:2px solid #2f0f66;">
                      <tr>
                        <td align="center" valign="middle" style="font-size:14px;font-weight:800;color:#6a38bf;letter-spacing:.01em;">
                          Ui<span style="color:#4ade80;">X</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.95;color:#f3edff;">Asistente UiX</p>
                    <h1 style="margin:6px 0 0 0;font-size:22px;line-height:1.25;">Recordatorio de avance</h1>
                  </td>
                </tr>
              </table>
            </div>
            <div style="background-color:#ffffff !important;border:1px solid #e9dcff;border-top:none;border-radius:0 0 16px 16px;padding:24px;color:#0f172a !important;">
              <p style="margin:0 0 12px 0;font-size:16px;color:#0f172a;">Hola ${escapeHtml(recipientLabel)},</p>
              <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155;">
                Te compartimos un recordatorio de tu plan de desarrollo en UiX. Aun tienes
                <strong>${pendingCoursesCount} curso(s) pendiente(s)</strong> por completar.
              </p>

              <div style="background-color:#f9f6ff;border:1px solid #e8defa;border-radius:12px;padding:14px 16px;margin:0 0 16px 0;">
                <p style="margin:0 0 8px 0;font-size:13px;color:#475569;">Progreso actual</p>
                <p style="margin:0 0 10px 0;font-size:18px;font-weight:700;color:#0f172a;">${completedResourcesCount}/${totalResourcesCount} recursos (${completionPercentage}%)</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#e4dff0" style="border-collapse:collapse;background-color:#e4dff0;border-radius:999px;overflow:hidden;">
                  <tr>
                    <td style="padding:0;">
                      <div style="height:10px;line-height:10px;font-size:0;background-color:#7b3fd9;width:${progressWidth};">&nbsp;</div>
                    </td>
                  </tr>
                </table>
              </div>

              <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#334155;">
                En caso de que tus pendientes incluyan talleres, acércate a Capital Humano para coordinarlos.
              </p>

              <a href="${portalResumeUrl}" style="display:inline-block;background:#7b3fd9;color:#ffffff;text-decoration:none;font-weight:600;padding:11px 18px;border-radius:10px;font-size:14px;border:1px solid #5f2fb2;">
                Continuar en Asistente UiX
              </a>

              <p style="margin:18px 0 0 0;font-size:12px;line-height:1.6;color:#64748b;">
                Este correo fue enviado por Capital Humano para dar seguimiento a tu ruta de aprendizaje.
              </p>
            </div>
          </td>
        </tr>
      </table>
    </div>
      </body>
    </html>
  `;

  // Free path without provider billing: Google Apps Script webhook.
  if (googleAppsScriptWebhookUrl) {
    const response = await fetch(googleAppsScriptWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(googleAppsScriptWebhookToken ? { Authorization: `Bearer ${googleAppsScriptWebhookToken}` } : {}),
      },
      body: JSON.stringify({
        collaboratorEmail,
        collaboratorName: recipientLabel,
        pendingCoursesCount,
        completedResourcesCount,
        totalResourcesCount,
        subject,
        text,
        html,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      res.status(502).json({ message: `Failed to send reminder email via Google Apps Script: ${errorBody}` });
      return;
    }

    let id = "";
    try {
      const result = (await response.json()) as { id?: string; messageId?: string };
      id = result.id || result.messageId || "";
    } catch {
      // Ignore non-JSON responses from webhook.
    }

    res.status(200).json({ sent: true, id });
    return;
  }

  // Preferred no-domain path: Brevo API with verified sender email.
  if (brevoApiKey) {
    if (!parsedSender) {
      res.status(501).json({
        message:
          "BREVO_API_KEY is set, but REMINDER_FROM_EMAIL is invalid. Use format: Name <email@domain.com>.",
      });
      return;
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: parsedSender.name,
          email: parsedSender.email,
        },
        to: [
          {
            email: collaboratorEmail,
            name: recipientLabel,
          },
        ],
        subject,
        textContent: text,
        htmlContent: html,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      res.status(502).json({ message: `Failed to send reminder email via Brevo: ${errorBody}` });
      return;
    }

    const result = (await response.json()) as { messageId?: string };
    res.status(200).json({ sent: true, id: result.messageId || "" });
    return;
  }

  // Preferred path for no-domain setups: Gmail SMTP with App Password.
  if (smtpUser && smtpAppPassword) {
    const smtpFromEmail = fromEmail || `Capital Humano <${smtpUser}>`;

    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: smtpUser,
          pass: smtpAppPassword,
        },
      });

      const info = await transporter.sendMail({
        from: smtpFromEmail,
        to: collaboratorEmail,
        subject,
        text,
        html,
      });

      res.status(200).json({ sent: true, id: info.messageId || "" });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown SMTP error";
      res.status(502).json({ message: `Failed to send reminder email via SMTP: ${message}` });
      return;
    }
  }

  if (!resendApiKey || !fromEmail) {
    res.status(501).json({
      message:
        "Reminder email provider is not configured. Set GOOGLE_APPS_SCRIPT_WEBHOOK_URL (free), BREVO_API_KEY and REMINDER_FROM_EMAIL, SMTP_USER and SMTP_APP_PASSWORD, or RESEND_API_KEY and REMINDER_FROM_EMAIL.",
    });
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [collaboratorEmail],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    res.status(502).json({ message: `Failed to send reminder email: ${errorBody}` });
    return;
  }

  const result = (await response.json()) as { id?: string };
  res.status(200).json({ sent: true, id: result.id || "" });
});

export default router;

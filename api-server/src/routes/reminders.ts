import { Router, type IRouter } from "express";

interface ReminderPayload {
  collaboratorEmail?: string;
  collaboratorName?: string;
  pendingCoursesCount?: number;
  completedResourcesCount?: number;
  totalResourcesCount?: number;
}

const router: IRouter = Router();

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

  if (!resendApiKey || !fromEmail) {
    res.status(501).json({
      message: "Reminder email provider is not configured. Set RESEND_API_KEY and REMINDER_FROM_EMAIL.",
    });
    return;
  }

  const recipientLabel = collaboratorName || collaboratorEmail;
  const subject = "Recordatorio de seguimiento - Cursos pendientes";
  const text = [
    `Hola ${recipientLabel},`,
    "",
    `Recuerda que aun tienes ${pendingCoursesCount} curso(s) pendiente(s) por completar.`,
    `Tu avance actual es ${completedResourcesCount}/${totalResourcesCount}.`,
    "",
    "En caso de que tus pendientes incluyan talleres, acércate a Capital Humano para coordinarlos.",
    "",
    "Gracias,",
    "Capital Humano",
  ].join("\n");

  const html = `
    <p>Hola ${recipientLabel},</p>
    <p>Recuerda que aun tienes <strong>${pendingCoursesCount} curso(s)</strong> pendiente(s) por completar.</p>
    <p>Tu avance actual es <strong>${completedResourcesCount}/${totalResourcesCount}</strong>.</p>
    <p>En caso de que tus pendientes incluyan talleres, acércate a Capital Humano para coordinarlos.</p>
    <p>Gracias,<br/>Capital Humano</p>
  `;

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

function doGet(e) {
  return handleRequest_(e, "GET");
}

function doPost(e) {
  return handleRequest_(e, "POST");
}

function handleRequest_(e, method) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : "";
    if (!action) {
      return json_({ ok: false, message: "Missing action" }, 400);
    }

    if (action === "health") {
      return json_({ status: "ok" });
    }

    var payloadText = (e && e.parameter && e.parameter.payload) ? e.parameter.payload : "{}";
    var payload = JSON.parse(payloadText || "{}");

    if (action === "upsertChatSession") {
      return upsertChatSession_(payload);
    }
    if (action === "syncCollaboratorAssessment") {
      return syncCollaboratorAssessment_(payload);
    }
    if (action === "uploadDeliverable") {
      return uploadDeliverable_(payload);
    }
    if (action === "sendProgressReminder") {
      return sendProgressReminder_(payload);
    }

    if (action === "getChatSession") {
      return getChatSession_(String(e.parameter.email || ""));
    }
    if (action === "getCollaboratorProgress") {
      return getCollaboratorProgress_(String(e.parameter.email || ""));
    }
    if (action === "listCollaboratorsProgress") {
      return listCollaboratorsProgress_();
    }

    return json_({ ok: false, message: "Unsupported action" }, 400);
  } catch (error) {
    return json_({ ok: false, message: String(error) }, 500);
  }
}

function normalizeEmail_(value) {
  return String(value || "").trim().toLowerCase();
}

function getSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function json_(data, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function upsertChatSession_(payload) {
  var email = normalizeEmail_(payload.email);
  if (!email) return json_({ ok: false, message: "email is required" }, 400);

  var snapshot = payload.snapshot || {};
  snapshot.employeeEmail = email;
  snapshot.updatedAt = Date.now();

  var sheet = getSheet_("chat_sessions", ["email", "snapshot_json", "updated_at"]);
  var values = sheet.getDataRange().getValues();
  var rowIndex = -1;
  var existingSnapshot = null;

  for (var i = 1; i < values.length; i++) {
    if (normalizeEmail_(values[i][0]) === email) {
      rowIndex = i + 1;
      try { existingSnapshot = JSON.parse(values[i][1] || "{}"); } catch (e) { existingSnapshot = null; }
      break;
    }
  }

  // If the incoming snapshot signals it was shrunk for URL (preserveMessages=true)
  // and the stored session already has real messages, keep them instead of overwriting with [].
  if (snapshot.preserveMessages && existingSnapshot) {
    var existingMessages = Array.isArray(existingSnapshot.messages) ? existingSnapshot.messages : [];
    if (existingMessages.length > 0) {
      snapshot.messages = existingMessages;
    }
  }
  delete snapshot.preserveMessages;

  var rowData = [email, JSON.stringify(snapshot), new Date()];
  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  return json_({ saved: true, updatedAt: snapshot.updatedAt });
}

function getChatSession_(emailRaw) {
  var email = normalizeEmail_(emailRaw);
  if (!email) return json_({ ok: false, message: "email is required" }, 400);

  var sheet = getSheet_("chat_sessions", ["email", "snapshot_json", "updated_at"]);
  var values = sheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i++) {
    if (normalizeEmail_(values[i][0]) === email) {
      try {
        return json_(JSON.parse(values[i][1] || "{}"));
      } catch (error) {
        return json_({ ok: false, message: "Corrupted session data" }, 500);
      }
    }
  }

  return json_({ ok: false, message: "Session not found" }, 404);
}

function defaultProgress_(email) {
  return {
    collaboratorEmail: email,
    collaboratorName: "",
    trainerName: "",
    profile: "",
    latestAssessmentId: "",
    assignedResources: [],
    completedResourcesCount: 0,
    totalResourcesCount: 5,
    completionPercentage: 0,
    status: "at-risk",
    deliverables: [],
    updatedAt: new Date().toISOString()
  };
}

function progressStatus_(percentage) {
  if (percentage >= 100) return "completed";
  if (percentage > 0) return "on-track";
  return "at-risk";
}

function uniqueCompletedResourcesCount_(deliverables) {
  var items = Array.isArray(deliverables) ? deliverables : [];
  var seen = {};

  for (var i = 0; i < items.length; i++) {
    var completed = Array.isArray(items[i].completedResources) ? items[i].completedResources : [];
    for (var j = 0; j < completed.length; j++) {
      var key = String(completed[j] || "").trim().toLowerCase();
      if (key) seen[key] = true;
    }
  }

  return Object.keys(seen).length;
}

function upsertProgressRow_(progress) {
  var sheet = getSheet_("collaborator_progress", ["email", "progress_json", "updated_at"]);
  var values = sheet.getDataRange().getValues();
  var email = normalizeEmail_(progress.collaboratorEmail);
  var rowIndex = -1;

  for (var i = 1; i < values.length; i++) {
    if (normalizeEmail_(values[i][0]) === email) {
      rowIndex = i + 1;
      break;
    }
  }

  var rowData = [email, JSON.stringify(progress), new Date()];
  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
}

function getProgressByEmail_(email) {
  var sheet = getSheet_("collaborator_progress", ["email", "progress_json", "updated_at"]);
  var values = sheet.getDataRange().getValues();
  var normalized = normalizeEmail_(email);

  for (var i = 1; i < values.length; i++) {
    if (normalizeEmail_(values[i][0]) === normalized) {
      try {
        return JSON.parse(values[i][1] || "{}");
      } catch (error) {
        return defaultProgress_(normalized);
      }
    }
  }

  return defaultProgress_(normalized);
}

function syncCollaboratorAssessment_(payload) {
  var email = normalizeEmail_(payload.collaboratorEmail);
  if (!email) return json_({ ok: false, message: "collaboratorEmail is required" }, 400);

  var existing = getProgressByEmail_(email);
  var existingDeliverables = existing.deliverables || [];
  var resources = payload.assignedResources || existing.assignedResources || [];
  var total = Math.max(resources.length || existing.totalResourcesCount || 1, 1);
  var completedFromDeliverables = uniqueCompletedResourcesCount_(existingDeliverables);
  var completed = Math.min(Math.max(existing.completedResourcesCount || 0, completedFromDeliverables), total);
  var percentage = Math.min(100, Math.round((completed / total) * 100));

  var updated = {
    collaboratorEmail: email,
    collaboratorName: payload.collaboratorName || existing.collaboratorName || "",
    trainerName: payload.trainerName || existing.trainerName || "",
    profile: payload.profile || existing.profile || "",
    latestAssessmentId: payload.assessmentId || existing.latestAssessmentId || "",
    assignedResources: resources,
    completedResourcesCount: completed,
    totalResourcesCount: total,
    completionPercentage: percentage,
    status: progressStatus_(percentage),
    deliverables: existingDeliverables,
    updatedAt: new Date().toISOString()
  };

  upsertProgressRow_(updated);
  return json_(updated);
}

function uploadDeliverable_(payload) {
  var email = normalizeEmail_(payload.collaboratorEmail);
  if (!email) return json_({ ok: false, message: "collaboratorEmail is required" }, 400);

  var existing = getProgressByEmail_(email);
  var deliverables = existing.deliverables || [];
  var record = {
    id: "deliv-" + Date.now(),
    collaboratorEmail: email,
    collaboratorName: payload.collaboratorName || existing.collaboratorName || "",
    trainerName: payload.trainerName || existing.trainerName || "",
    assessmentId: payload.assessmentId || existing.latestAssessmentId || "",
    title: payload.title || "",
    summary: payload.summary || "",
    deliverableType: payload.deliverableType || "custom",
    templateResponses: payload.templateResponses || [],
    evidenceUrls: payload.evidenceUrls || [],
    completedResources: payload.completedResources || [],
    submittedAt: new Date().toISOString()
  };

  var nextDeliverables = deliverables.concat([record]);
  var completed = uniqueCompletedResourcesCount_(nextDeliverables);
  var total = Math.max(existing.totalResourcesCount || 1, 1);
  var percentage = Math.min(100, Math.round((completed / total) * 100));

  var updated = {
    collaboratorEmail: email,
    collaboratorName: payload.collaboratorName || existing.collaboratorName || "",
    trainerName: payload.trainerName || existing.trainerName || "",
    profile: existing.profile || "",
    latestAssessmentId: payload.assessmentId || existing.latestAssessmentId || "",
    assignedResources: existing.assignedResources || [],
    completedResourcesCount: completed,
    totalResourcesCount: total,
    completionPercentage: percentage,
    status: progressStatus_(percentage),
    deliverables: nextDeliverables,
    updatedAt: new Date().toISOString()
  };

  upsertProgressRow_(updated);
  return json_(record);
}

function getCollaboratorProgress_(emailRaw) {
  var email = normalizeEmail_(emailRaw);
  if (!email) return json_({ ok: false, message: "email is required" }, 400);
  return json_(getProgressByEmail_(email));
}

function listCollaboratorsProgress_() {
  var sheet = getSheet_("collaborator_progress", ["email", "progress_json", "updated_at"]);
  var values = sheet.getDataRange().getValues();
  var list = [];

  for (var i = 1; i < values.length; i++) {
    try {
      list.push(JSON.parse(values[i][1] || "{}"));
    } catch (error) {
      // Ignore corrupted rows.
    }
  }

  list.sort(function(a, b) {
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });

  return json_(list);
}

function sendProgressReminder_(payload) {
  var email = normalizeEmail_(payload.collaboratorEmail);
  if (!email) return json_({ ok: false, message: "collaboratorEmail is required" }, 400);

  var name = String(payload.collaboratorName || email);
  var pending = Math.max(Number(payload.pendingCoursesCount || 0), 0);
  var completed = Math.max(Number(payload.completedResourcesCount || 0), 0);
  var total = Math.max(Number(payload.totalResourcesCount || 1), 1);

  if (pending <= 0) return json_({ ok: false, message: "No pending courses to remind" }, 400);

  var portalUrl = "https://ptltr.github.io/portal-uix/?resume=1&email=" + encodeURIComponent(email) + "&name=" + encodeURIComponent(name);
  var subject = "Recordatorio de seguimiento - Cursos pendientes";
  var body = "Hola " + name + ",\n\n" +
    "Te compartimos un recordatorio: aun tienes " + pending + " curso(s) pendiente(s) por completar.\n" +
    "Tu avance actual es " + completed + "/" + total + ".\n\n" +
    "Continua aqui: " + portalUrl + "\n\n" +
    "Gracias,\nCapital Humano";

  MailApp.sendEmail(email, subject, body);
  return json_({ sent: true, id: "gas-" + Date.now() });
}

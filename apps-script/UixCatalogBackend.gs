/*******************************
 * FUNCIÓN BASE PARA LEER HOJAS
 *******************************/
function readSheet(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return [];
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0];
  var rows = data.slice(1);

  return rows.map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) {
      obj[String(h).trim()] = row[i];
    });
    return obj;
  });
}

/*******************************
 * NORMALIZACIÓN
 *******************************/
function trimId(value) {
  return String(value || "").trim().toLowerCase();
}

function isActive(value) {
  if (value === true) return true;
  if (value === false) return false;
  var s = String(value || "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "sí" || s === "si";
}

/*******************************
 * ROLES
 *******************************/
function getRoles() {
  return readSheet("roles");
}

/*******************************
 * COMPETENCIAS POR ROL
 *******************************/
function getCompetencies(roleId) {
  var roles = readSheet("roles");
  var competencies = readSheet("competencias");

  var role = null;
  for (var i = 0; i < roles.length; i++) {
    if (trimId(roles[i].role_id) === trimId(roleId)) {
      role = roles[i];
      break;
    }
  }

  if (!role) return [];

  var base = role.base_competencies
    ? String(role.base_competencies).split(",").map(function (s) { return trimId(s); }).filter(Boolean)
    : [];

  // specific_competencies may contain IDs or a description — use only valid short tokens
  var specific = role.specific_competencies
    ? String(role.specific_competencies).split(",")
        .map(function (s) { return trimId(s); })
        .filter(function (s) { return s.length > 0 && s.length <= 40 && !/\s/.test(s); })
    : [];

  var ids = base.concat(specific);

  return competencies.filter(function (c) {
    return ids.indexOf(trimId(c.competency_id)) !== -1;
  });
}

/*******************************
 * PREGUNTAS POR COMPETENCIA
 *******************************/
function getQuestions(competencyId) {
  var questions = readSheet("preguntas");

  return questions.filter(function (q) {
    return trimId(q.competency_id) === trimId(competencyId);
  });
}

/*******************************
 * RECURSOS POR COMPETENCIA Y NIVEL
 *******************************/
function getResources(competencyId, developmentLevel) {
  // No devolver recursos si es fortaleza o nivel vacío
  if (!developmentLevel || trimId(developmentLevel) === "fortaleza") {
    return [];
  }

  var resources = readSheet("desarrollo");
  var targetLevel = trimId(developmentLevel);

  return resources.filter(function (r) {
    var linkField = r.resource_link || r.link || r.url || "";
    return (
      trimId(r.competency_id) === trimId(competencyId) &&
      trimId(r.development_level) === targetLevel &&
      isActive(r.active) &&
      String(linkField).trim() !== ""
    );
  });
}

/*******************************
 * TODOS LOS RECURSOS DE UNA COMPETENCIA (sin filtro de nivel)
 *******************************/
function getAllResources(competencyId) {
  var resources = readSheet("desarrollo");
  return resources.filter(function (r) {
    var linkField = r.resource_link || r.link || r.url || "";
    return (
      trimId(r.competency_id) === trimId(competencyId) &&
      isActive(r.active) &&
      String(linkField).trim() !== ""
    );
  });
}

/*******************************
 * PERFIL POR ROL
 *******************************/
function getRole(roleId) {
  var roles = readSheet("roles");
  for (var i = 0; i < roles.length; i++) {
    if (trimId(roles[i].role_id) === trimId(roleId)) {
      return roles[i];
    }
  }
  return null;
}

/*******************************
 * RESPUESTA JSON
 *******************************/
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/*******************************
 * ENDPOINT PRINCIPAL (API)
 *******************************/
function doGet(e) {
  try {
    var action = e && e.parameter && e.parameter.action
      ? String(e.parameter.action)
      : "";

    if (action === "getRoles") {
      return jsonResponse(getRoles());
    }

    if (action === "getRole") {
      return jsonResponse(getRole(String(e.parameter.role_id || "")));
    }

    if (action === "getCompetencies") {
      return jsonResponse(
        getCompetencies(String(e.parameter.role_id || ""))
      );
    }

    if (action === "getQuestions") {
      return jsonResponse(
        getQuestions(String(e.parameter.competency_id || ""))
      );
    }

    if (action === "getResources") {
      return jsonResponse(
        getResources(
          String(e.parameter.competency_id || ""),
          String(e.parameter.development_level || "")
        )
      );
    }

    if (action === "getAllResources") {
      return jsonResponse(
        getAllResources(String(e.parameter.competency_id || ""))
      );
    }

    // Debug: returns raw rows from desarrollo sheet to see actual field values
    if (action === "debugResources") {
      var rows = readSheet("desarrollo");
      return jsonResponse(rows.slice(0, 5));
    }

    if (action === "health") {
      return jsonResponse({ status: "ok", version: "catalog-v2" });
    }

    return jsonResponse({ error: "acción no válida" });
  } catch (err) {
    return jsonResponse({ error: String(err) });
  }
}

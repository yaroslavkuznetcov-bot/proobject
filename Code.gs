function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : "";

    if (action === "getData") {
      return jsonResponse(getData());
    }

    return jsonResponse({ status: "OK", message: "ProОбъект API v0.3.0" });
  } catch (error) {
    return jsonResponse({
      status: "ERROR",
      message: error && error.message ? error.message : String(error),
      source: "doGet"
    });
  }
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : {};

    const action = body.action;
    const data = body.data || {};

    if (action === "authenticate") return jsonResponse(authenticate(data));
    if (action === "getUsers") return jsonResponse(getUsers());
    if (action === "addUser") return jsonResponse(addUser(data));
    if (action === "updateUser") return jsonResponse(updateUser(data));
    if (action === "deleteUser") return jsonResponse(deleteUser(data));
    if (action === "saveData") return jsonResponse({ status: saveData(data) });
    if (action === "updateJournalEntry") return jsonResponse({ status: updateJournalEntry(data) });
    if (action === "deleteJournalEntry") return jsonResponse({ status: deleteJournalEntry(data) });
    if (action === "addObject") return jsonResponse({ status: addObject(data) });
    if (action === "deleteObject") return jsonResponse({ status: deleteObject(data) });
    if (action === "addSite") return jsonResponse({ status: addSite(data) });
    if (action === "deleteSite") return jsonResponse({ status: deleteSite(data) });

    return jsonResponse({ status: "ERROR", message: "Unknown action" });
  } catch (error) {
    return jsonResponse({
      status: "ERROR",
      message: error && error.message ? error.message : String(error)
    });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheetOrCreate_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  const existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  let changed = false;

  for (let i = 0; i < headers.length; i++) {
    if (!existingHeaders[i]) {
      sheet.getRange(1, i + 1).setValue(headers[i]);
      changed = true;
    }
  }

  if (changed) SpreadsheetApp.flush();
  return sheet;
}


function normalizeRole_(role) {
  const value = String(role || "").trim().toLowerCase();

  if (value === "customer" || value === "заказчик") return "customer";
  if (value === "contractor" || value === "подрядчик") return "contractor";
  if (value === "curator" || value === "куратор") return "curator";

  return "curator";
}

function roleName_(role) {
  if (role === "customer") return "Заказчик";
  if (role === "contractor") return "Подрядчик";
  return "Куратор";
}

function safeIsoDate_(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return String(value || "");
  return date.toISOString();
}

function normalizeId_(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function authenticate(data) {
  const login = String(data.login || "").trim();
  const password = String(data.password || "");

  if (!login || !password) {
    return { status: "ERROR", message: "Введите логин и пароль" };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = getSheetOrCreate_(ss, "USERS", ["login", "password", "role"]);
  const rows = usersSheet.getDataRange().getValues().slice(1);

  for (let i = 0; i < rows.length; i++) {
    const rowLogin = String(rows[i][0] || "").trim();
    const rowPassword = String(rows[i][1] || "");

    if (rowLogin.toLowerCase() === login.toLowerCase() && rowPassword === password) {
      const role = normalizeRole_(rows[i][2]);
      return {
        status: "OK",
        user: {
          id: rowLogin,
          name: rowLogin,
          role: role,
          roleName: roleName_(role)
        }
      };
    }
  }

  return { status: "ERROR", message: "Неверный логин или пароль" };
}


function getUsers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = getSheetOrCreate_(ss, "USERS", ["login", "password", "role"]);
  const rows = usersSheet.getDataRange().getValues().slice(1);

  const users = rows
    .map(function(row, index) {
      const login = String(row[0] || "").trim();
      const role = normalizeRole_(row[2]);
      return {
        id: String(index + 2),
        login: login,
        role: role,
        roleName: roleName_(role)
      };
    })
    .filter(function(user) { return user.login !== ""; });

  return { status: "OK", users: users };
}

function addUser(data) {
  const login = String(data.login || "").trim();
  const password = String(data.password || "");
  const role = normalizeRole_(data.role);

  if (!login || !password) throw new Error("Введите логин и пароль");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = getSheetOrCreate_(ss, "USERS", ["login", "password", "role"]);
  const rows = usersSheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || "").trim().toLowerCase() === login.toLowerCase()) {
      throw new Error("Пользователь с таким логином уже существует");
    }
  }

  usersSheet.appendRow([login, password, role]);
  return { status: "OK" };
}

function updateUser(data) {
  const id = Number(data.id);
  const login = String(data.login || "").trim();
  const password = String(data.password || "");
  const role = normalizeRole_(data.role);

  if (!id || id < 2) throw new Error("Не передан ID пользователя");
  if (!login) throw new Error("Введите логин");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = getSheetOrCreate_(ss, "USERS", ["login", "password", "role"]);

  if (id > usersSheet.getLastRow()) throw new Error("Пользователь не найден");

  usersSheet.getRange(id, 1).setValue(login);
  if (password) usersSheet.getRange(id, 2).setValue(password);
  usersSheet.getRange(id, 3).setValue(role);

  return { status: "OK" };
}

function deleteUser(data) {
  const id = Number(data.id);
  if (!id || id < 2) throw new Error("Не передан ID пользователя");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = getSheetOrCreate_(ss, "USERS", ["login", "password", "role"]);

  if (id > usersSheet.getLastRow()) throw new Error("Пользователь не найден");
  usersSheet.deleteRow(id);
  return { status: "OK" };
}

function getData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const objectsSheet = getSheetOrCreate_(ss, "Объекты", ["ID", "Название"]);
  const sitesSheet = getSheetOrCreate_(ss, "Участки", ["ID", "Название", "ObjectID"]);
  const journalSheet = getSheetOrCreate_(ss, "Журнал", ["Дата", "Объект", "Участок", "Работы", "Фото"]);

  const objectsValues = objectsSheet.getDataRange().getValues();
  const sitesValues = sitesSheet.getDataRange().getValues();
  const journalValues = journalSheet.getDataRange().getValues();

  const objects = objectsValues.slice(1)
    .filter(function(row) { return normalizeId_(row[0]) !== "" && normalizeId_(row[1]) !== ""; })
    .map(function(row) {
      return { id: normalizeId_(row[0]), name: normalizeId_(row[1]) };
    });

  const sites = sitesValues.slice(1)
    .filter(function(row) { return normalizeId_(row[0]) !== "" && normalizeId_(row[1]) !== ""; })
    .map(function(row) {
      return { id: normalizeId_(row[0]), name: normalizeId_(row[1]), objectId: normalizeId_(row[2]) };
    });

  const journal = journalValues.slice(1).map(function(row, index) {
    const rowNumber = index + 2;
    const objectName = normalizeId_(row[1]);
    const matchedObject = objects.find(function(item) { return item.name === objectName; });

    return {
      id: String(rowNumber),
      date: safeIsoDate_(row[0]),
      objectId: matchedObject ? matchedObject.id : "",
      object: objectName,
      site: normalizeId_(row[2]),
      work: String(row[3] || ""),
      photoUrl: String(row[4] || "")
    };
  }).filter(function(item) {
    return item.object || item.site || item.work || item.photoUrl;
  }).reverse();

  const usersResult = getUsers();

  return {
    status: "OK",
    objects: objects,
    sites: sites,
    journal: journal,
    users: usersResult.users || []
  };
}

function createPhoto_(data) {
  if (!data.photo) return { url: "", fileId: "" };

  const mimeType = data.fileMimeType || MimeType.JPEG;
  const blob = Utilities.newBlob(
    Utilities.base64Decode(data.photo),
    mimeType,
    data.fileName || "photo.jpg"
  );

  const file = DriveApp.getRootFolder().createFile(blob);
  return { url: file.getUrl(), fileId: file.getId() };
}

function saveData(data) {
  if (!data.object || !data.objectId || !data.site || !data.work) {
    throw new Error("Не заполнены обязательные поля");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const journal = getSheetOrCreate_(ss, "Журнал", ["Дата", "Объект", "Участок", "Работы", "Фото"]);
  const photo = createPhoto_(data);

  journal.appendRow([
    new Date(),
    data.object,
    data.site,
    data.work,
    photo.url
  ]);

  sendNotification_(data.object, data.site, data.work, photo.url);
  return "OK";
}

function updateJournalEntry(data) {
  if (!data.id || !data.work) throw new Error("Не передан ID записи или текст работ");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const journal = getSheetOrCreate_(ss, "Журнал", ["Дата", "Объект", "Участок", "Работы", "Фото"]);
  const row = Number(data.id);

  if (row < 2 || row > journal.getLastRow()) throw new Error("Запись не найдена");

  let photoUrl = String(journal.getRange(row, 5).getValue() || "");

  if (data.photo) {
    const photo = createPhoto_(data);
    photoUrl = photo.url;
  }

  journal.getRange(row, 2, 1, 4).setValues([[
    data.object || journal.getRange(row, 2).getValue(),
    data.site || journal.getRange(row, 3).getValue(),
    data.work,
    photoUrl
  ]]);

  return "OK";
}

function deleteJournalEntry(data) {
  if (!data.id) throw new Error("Не передан ID записи");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const journal = getSheetOrCreate_(ss, "Журнал", ["Дата", "Объект", "Участок", "Работы", "Фото"]);
  const row = Number(data.id);

  if (row < 2 || row > journal.getLastRow()) throw new Error("Запись не найдена");

  journal.deleteRow(row);
  return "OK";
}

function addObject(data) {
  if (!data.name) throw new Error("Введите название объекта");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetOrCreate_(ss, "Объекты", ["ID", "Название"]);
  const id = "obj_" + new Date().getTime();
  sheet.appendRow([id, data.name]);
  return "OK";
}

function deleteObject(data) {
  if (!data.id) throw new Error("Не передан ID объекта");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetOrCreate_(ss, "Объекты", ["ID", "Название"]);
  const values = sheet.getDataRange().getValues();

  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]) === String(data.id)) {
      sheet.deleteRow(i + 1);
    }
  }

  return "OK";
}

function addSite(data) {
  if (!data.name || !data.objectId) throw new Error("Введите участок и выберите объект");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetOrCreate_(ss, "Участки", ["ID", "Название", "ObjectID"]);
  const id = "site_" + new Date().getTime();
  sheet.appendRow([id, data.name, data.objectId]);
  return "OK";
}

function deleteSite(data) {
  if (!data.id) throw new Error("Не передан ID участка");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheetOrCreate_(ss, "Участки", ["ID", "Название", "ObjectID"]);
  const values = sheet.getDataRange().getValues();

  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]) === String(data.id)) {
      sheet.deleteRow(i + 1);
    }
  }

  return "OK";
}

function sendNotification_(objectName, siteName, workText, photoUrl) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mainSheet = ss.getSheetByName("Главная");
  if (!mainSheet) return;

  const emailsData = mainSheet.getDataRange().getValues();
  const emails = [];

  for (let i = 1; i < emailsData.length; i++) {
    if (emailsData[i][1]) emails.push(emailsData[i][1]);
  }

  if (emails.length === 0) return;

  const body =
    "Объект: " + objectName + "\n\n" +
    "Участок: " + siteName + "\n\n" +
    "Работы:\n" + workText + "\n\n" +
    "Фото:\n" + (photoUrl || "Нет фото");

  MailApp.sendEmail(emails.join(","), "Новая запись в журнале работ", body);
}

function checkJournalToday() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const journal = ss.getSheetByName("Журнал");
  const mainSheet = ss.getSheetByName("Главная");
  if (!journal || !mainSheet) return;

  const data = journal.getDataRange().getValues();
  const today = new Date();
  let hasToday = false;

  for (let i = 1; i < data.length; i++) {
    const rowDate = new Date(data[i][0]);
    if (
      rowDate.getDate() === today.getDate() &&
      rowDate.getMonth() === today.getMonth() &&
      rowDate.getFullYear() === today.getFullYear()
    ) {
      hasToday = true;
      break;
    }
  }

  if (hasToday) return;

  const emailsData = mainSheet.getDataRange().getValues();
  const emails = [];
  for (let i = 1; i < emailsData.length; i++) {
    if (emailsData[i][1]) emails.push(emailsData[i][1]);
  }

  if (emails.length > 0) {
    MailApp.sendEmail(
      emails.join(","),
      "Журнал работ не заполнен",
      "Сегодня до 18:00 не было внесено ни одной записи."
    );
  }
}

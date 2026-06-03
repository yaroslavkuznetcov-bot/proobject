const VERSION = "ProОбъект API v0.4.1";

function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : "";
    if (action === "getData") return jsonResponse(getData({ login: e.parameter.login || "" }));
    return jsonResponse({ status: "OK", message: VERSION });
  } catch (error) {
    return jsonResponse(errorResponse_(error, "doGet"));
  }
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const action = body.action;
    const data = body.data || {};

    if (action === "authenticate") return jsonResponse(authenticate(data));
    if (action === "getData") return jsonResponse(getData(data));
    if (action === "getUsers") return jsonResponse(getUsers(data));
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

    return jsonResponse({ status: "ERROR", message: "Unknown action: " + action });
  } catch (error) {
    return jsonResponse(errorResponse_(error, "doPost"));
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function errorResponse_(error, source) {
  return { status: "ERROR", message: error && error.message ? error.message : String(error), source: source || "unknown" };
}

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function getSheetOrCreate_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0 && headers && headers.length) sheet.appendRow(headers);
  return sheet;
}

function normalize_(value) { return String(value === null || value === undefined ? "" : value).trim(); }
function splitList_(value) { return normalize_(value).split(/[;,]/).map(function(v) { return normalize_(v); }).filter(Boolean); }

function normalizeRole_(role) {
  const value = normalize_(role).toLowerCase();
  if (value === "administrator" || value === "admin" || value === "администратор") return "administrator";
  if (value === "customer" || value === "заказчик") return "customer";
  if (value === "contractor" || value === "подрядчик") return "contractor";
  if (value === "curator" || value === "куратор") return "curator";
  return "customer";
}

function roleName_(role) {
  if (role === "administrator") return "Администратор";
  if (role === "customer") return "Заказчик";
  if (role === "contractor") return "Подрядчик";
  return "Куратор";
}

function userFullAccess_(user) {
  return user && (user.role === "administrator" || user.objects.indexOf("*") >= 0);
}

function getUsersSheet_() {
  const sh = getSheetOrCreate_(ss_(), "USERS", ["login", "password", "role", "objects", "email"]);
  const headers = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 5)).getValues()[0];
  const required = ["login", "password", "role", "objects", "email"];
  for (let i = 0; i < required.length; i++) if (!headers[i]) sh.getRange(1, i + 1).setValue(required[i]);
  return sh;
}

function readAllUsers_() {
  const sh = getUsersSheet_();
  const rows = sh.getDataRange().getValues().slice(1);
  return rows.map(function(row, index) {
    const role = normalizeRole_(row[2]);
    const objects = splitList_(row[3]);
    return {
      id: String(index + 2),
      login: normalize_(row[0]),
      password: String(row[1] || ""),
      role: role,
      roleName: roleName_(role),
      objects: objects,
      email: normalize_(row[4]),
      fullAccess: role === "administrator" || objects.indexOf("*") >= 0
    };
  }).filter(function(u) { return u.login; });
}

function getUserByLogin_(login) {
  const target = normalize_(login).toLowerCase();
  const users = readAllUsers_();
  for (let i = 0; i < users.length; i++) if (users[i].login.toLowerCase() === target) return users[i];
  return null;
}

function authenticate(data) {
  const login = normalize_(data.login);
  const password = String(data.password || "");
  if (!login || !password) return { status: "ERROR", message: "Введите логин и пароль" };
  const user = getUserByLogin_(login);
  if (!user || user.password !== password) return { status: "ERROR", message: "Неверный логин или пароль" };
  return { status: "OK", user: publicUser_(user) };
}

function publicUser_(user) {
  return { id: user.login, name: user.login, role: user.role, roleName: user.roleName, objects: user.objects, email: user.email, fullAccess: userFullAccess_(user) };
}

function canAccessObject_(user, objectId) {
  if (!user) return false;
  if (userFullAccess_(user)) return true;
  return user.objects.indexOf(String(objectId)) >= 0;
}

function assertObjectAccess_(user, objectId) {
  if (!canAccessObject_(user, objectId)) throw new Error("Нет доступа к объекту " + objectId);
}

function assertUserManager_(actor) {
  if (!actor || (actor.role !== "administrator" && actor.role !== "curator")) throw new Error("Недостаточно прав для управления пользователями");
}

function normalizeObjectListForActor_(actor, objects) {
  const list = Array.isArray(objects) ? objects.map(normalize_).filter(Boolean) : splitList_(objects);
  if (actor.role === "administrator") return list.indexOf("*") >= 0 ? ["*"] : list;
  const allowed = actor.objects;
  return list.filter(function(id) { return allowed.indexOf(id) >= 0; });
}

function getUsers(data) {
  const actor = getUserByLogin_(data.login || data.currentLogin || "");
  if (!actor) return { status: "OK", users: [] };
  const users = readAllUsers_();
  const visible = userFullAccess_(actor) ? users : users.filter(function(u) {
    return u.objects.some(function(id) { return actor.objects.indexOf(id) >= 0; });
  });
  return { status: "OK", users: visible.map(function(u) { return { id: u.id, login: u.login, role: u.role, roleName: u.roleName, objects: u.objects, email: u.email }; }) };
}

function addUser(data) {
  const actor = getUserByLogin_(data.currentLogin || "");
  assertUserManager_(actor);
  const login = normalize_(data.login);
  const password = String(data.password || "");
  const role = normalizeRole_(data.role);
  const objects = normalizeObjectListForActor_(actor, data.objects || []);
  const email = normalize_(data.email);
  if (!login || !password) throw new Error("Введите логин и пароль");
  if (!userFullAccess_(actor) && role === "administrator") throw new Error("Куратор не может создавать администратора");
  if (!userFullAccess_(actor) && objects.length === 0) throw new Error("Выберите хотя бы один доступный объект");
  const users = readAllUsers_();
  if (users.some(function(u) { return u.login.toLowerCase() === login.toLowerCase(); })) throw new Error("Пользователь с таким логином уже существует");
  getUsersSheet_().appendRow([login, password, role, objects.join(","), email]);
  return { status: "OK" };
}

function updateUser(data) {
  const actor = getUserByLogin_(data.currentLogin || "");
  assertUserManager_(actor);
  const id = Number(data.id);
  const login = normalize_(data.login);
  const password = String(data.password || "");
  const role = normalizeRole_(data.role);
  const objects = normalizeObjectListForActor_(actor, data.objects || []);
  const email = normalize_(data.email);
  if (!id || id < 2) throw new Error("Не передан ID пользователя");
  if (!login) throw new Error("Введите логин");
  if (!userFullAccess_(actor) && role === "administrator") throw new Error("Куратор не может назначать администратора");
  if (!userFullAccess_(actor) && objects.length === 0) throw new Error("Выберите хотя бы один доступный объект");
  const sh = getUsersSheet_();
  if (id > sh.getLastRow()) throw new Error("Пользователь не найден");
  sh.getRange(id, 1).setValue(login);
  if (password) sh.getRange(id, 2).setValue(password);
  sh.getRange(id, 3).setValue(role);
  sh.getRange(id, 4).setValue(objects.join(","));
  sh.getRange(id, 5).setValue(email);
  return { status: "OK" };
}

function deleteUser(data) {
  const actor = getUserByLogin_(data.currentLogin || "");
  assertUserManager_(actor);
  const id = Number(data.id);
  if (!id || id < 2) throw new Error("Не передан ID пользователя");
  const sh = getUsersSheet_();
  if (id > sh.getLastRow()) throw new Error("Пользователь не найден");
  sh.deleteRow(id);
  return { status: "OK" };
}

function readObjects_() {
  const sh = getSheetOrCreate_(ss_(), "Objects", ["field"]);
  const values = sh.getDataRange().getValues();
  if (values.length === 0 || values[0].length < 2) return [];
  const ids = values[0].slice(1).map(normalize_);
  const objects = [];
  ids.forEach(function(id, idx) {
    if (!id) return;
    const details = {};
    for (let r = 1; r < values.length; r++) {
      const key = normalize_(values[r][0]);
      if (key) details[key] = normalize_(values[r][idx + 1]);
    }
    const fullName = details.name_obj || details.name || details["Название"] || details["Название объекта"] || id;
    const shortName = details.short_name || details.shortName || details.name_short || details["Краткое название"] || fullName;
    objects.push({ id: id, name: shortName, fullName: fullName, details: details });
  });
  return objects;
}

function readAreas_() {
  const sh = getSheetOrCreate_(ss_(), "Areas", ["field"]);
  const values = sh.getDataRange().getValues();
  if (values.length === 0 || values[0].length < 2) return [];
  const objectIds = values[0].slice(1).map(normalize_);
  const areas = [];
  objectIds.forEach(function(objectId, idx) {
    if (!objectId) return;
    // Row 1 contains object IDs, row 2 contains object names, row 3+ contains area names.
    for (let r = 2; r < values.length; r++) {
      const name = normalize_(values[r][idx + 1]);
      if (name) areas.push({ id: objectId + "__ar" + (r - 1), name: name, objectId: objectId });
    }
  });
  return areas;
}

function getLogSheet_() {
  return getSheetOrCreate_(ss_(), "Log", ["date", "login", "id_obj", "name_obj", "id_ar", "name_ar", "operation", "photo"]);
}

function safeIsoDate_(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return String(value || "");
  return date.toISOString();
}

function readLog_(objectsById) {
  const sh = getLogSheet_();
  const values = sh.getDataRange().getValues();
  return values.slice(1).map(function(row, index) {
    const objectId = normalize_(row[2]);
    return {
      id: String(index + 2),
      date: safeIsoDate_(row[0]),
      login: normalize_(row[1]),
      objectId: objectId,
      object: normalize_(row[3]) || (objectsById[objectId] ? objectsById[objectId].name : objectId),
      siteId: normalize_(row[4]),
      site: normalize_(row[5]),
      work: String(row[6] || ""),
      photoUrl: String(row[7] || "")
    };
  }).filter(function(item) { return item.objectId || item.work; }).reverse();
}

function getData(data) {
  const actor = getUserByLogin_(data.login || "");
  if (!actor) return { status: "OK", objects: [], sites: [], journal: [], users: [] };
  const allObjects = readObjects_();
  const allowedObjects = userFullAccess_(actor) ? allObjects : allObjects.filter(function(o) { return canAccessObject_(actor, o.id); });
  const allowedIds = allowedObjects.map(function(o) { return o.id; });
  const objectsById = {};
  allObjects.forEach(function(o) { objectsById[o.id] = o; });
  const sites = readAreas_().filter(function(s) { return allowedIds.indexOf(s.objectId) >= 0; });
  const journal = readLog_(objectsById).filter(function(entry) { return allowedIds.indexOf(entry.objectId) >= 0; });
  return { status: "OK", objects: allowedObjects, sites: sites, journal: journal, users: getUsers({ login: actor.login }).users || [] };
}

function createPhoto_(data) {
  if (!data.photo) return { url: "", fileId: "" };
  const blob = Utilities.newBlob(Utilities.base64Decode(data.photo), data.fileMimeType || MimeType.JPEG, data.fileName || "photo.jpg");
  const file = DriveApp.getRootFolder().createFile(blob);
  return { url: file.getUrl(), fileId: file.getId() };
}

function saveData(data) {
  const actor = getUserByLogin_(data.login || "");
  if (!actor) throw new Error("Пользователь не найден");
  if (actor.role !== "administrator" && actor.role !== "curator" && actor.role !== "contractor") throw new Error("Нет прав на создание записи");
  if (!data.objectId || !data.site || !data.work) throw new Error("Не заполнены обязательные поля");
  assertObjectAccess_(actor, data.objectId);
  const objectsById = {};
  readObjects_().forEach(function(o) { objectsById[o.id] = o; });
  const objectName = normalize_(data.object) || (objectsById[data.objectId] ? objectsById[data.objectId].name : data.objectId);
  const photo = createPhoto_(data);
  getLogSheet_().appendRow([new Date(), actor.login, data.objectId, objectName, data.siteId || "", data.site, data.work, photo.url]);
  sendNewEntryNotification_(data.objectId, objectName, data.site, data.work, photo.url, actor.login);
  return "OK";
}

function updateJournalEntry(data) {
  const actor = getUserByLogin_(data.login || "");
  if (!actor) throw new Error("Пользователь не найден");
  if (actor.role !== "administrator" && actor.role !== "curator") throw new Error("Нет прав на редактирование записи");
  const row = Number(data.id);
  const sh = getLogSheet_();
  if (row < 2 || row > sh.getLastRow()) throw new Error("Запись не найдена");
  const existingObjectId = normalize_(sh.getRange(row, 3).getValue());
  assertObjectAccess_(actor, existingObjectId);
  let photoUrl = String(sh.getRange(row, 8).getValue() || "");
  if (data.photo) photoUrl = createPhoto_(data).url;
  sh.getRange(row, 6, 1, 3).setValues([[data.site || sh.getRange(row, 6).getValue(), data.work, photoUrl]]);
  return "OK";
}

function deleteJournalEntry(data) {
  const actor = getUserByLogin_(data.login || "");
  if (!actor) throw new Error("Пользователь не найден");
  if (actor.role !== "administrator" && actor.role !== "curator") throw new Error("Нет прав на удаление записи");
  const row = Number(data.id);
  const sh = getLogSheet_();
  if (row < 2 || row > sh.getLastRow()) throw new Error("Запись не найдена");
  const objectId = normalize_(sh.getRange(row, 3).getValue());
  assertObjectAccess_(actor, objectId);
  sh.deleteRow(row);
  return "OK";
}

function findObjectColumn_(objectId, sheetName) {
  const sh = ss_().getSheetByName(sheetName);
  if (!sh) return -1;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(normalize_);
  return headers.indexOf(objectId) + 1;
}

function addObject(data) {
  const actor = getUserByLogin_(data.login || "");
  if (!actor || actor.role !== "administrator") throw new Error("Только администратор может добавлять объекты");
  const name = normalize_(data.name);
  if (!name) throw new Error("Введите название объекта");
  const id = "id" + new Date().getTime();
  const sh = getSheetOrCreate_(ss_(), "Objects", ["field"]);
  const col = sh.getLastColumn() + 1;
  sh.getRange(1, col).setValue(id);
  if (sh.getLastRow() < 2) sh.getRange(2, 1).setValue("name_obj");
  sh.getRange(2, col).setValue(name);
  const areas = getSheetOrCreate_(ss_(), "Areas", ["field"]);
  areas.getRange(1, areas.getLastColumn() + 1).setValue(id);
  return "OK";
}

function deleteObject(data) {
  const actor = getUserByLogin_(data.login || "");
  if (!actor || actor.role !== "administrator") throw new Error("Только администратор может удалять объекты");
  const objectId = normalize_(data.id);
  const colObj = findObjectColumn_(objectId, "Objects");
  if (colObj > 1) ss_().getSheetByName("Objects").deleteColumn(colObj);
  const colArea = findObjectColumn_(objectId, "Areas");
  if (colArea > 1) ss_().getSheetByName("Areas").deleteColumn(colArea);
  return "OK";
}

function addSite(data) {
  const actor = getUserByLogin_(data.login || "");
  if (!actor || (actor.role !== "administrator" && actor.role !== "curator")) throw new Error("Недостаточно прав");
  assertObjectAccess_(actor, data.objectId);
  const name = normalize_(data.name);
  if (!name) throw new Error("Введите участок");
  const sh = getSheetOrCreate_(ss_(), "Areas", ["field"]);
  let col = findObjectColumn_(data.objectId, "Areas");
  if (col < 2) { col = sh.getLastColumn() + 1; sh.getRange(1, col).setValue(data.objectId); }
  const values = sh.getRange(1, col, sh.getMaxRows(), 1).getValues();
  let row = 2;
  while (values[row - 1] && normalize_(values[row - 1][0])) row++;
  sh.getRange(row, col).setValue(name);
  return "OK";
}

function deleteSite(data) {
  const actor = getUserByLogin_(data.login || "");
  if (!actor || (actor.role !== "administrator" && actor.role !== "curator")) throw new Error("Недостаточно прав");
  const parts = String(data.id || "").split("__ar");
  if (parts.length !== 2) throw new Error("Некорректный ID участка");
  const objectId = parts[0];
  const row = Number(parts[1]) + 1;
  assertObjectAccess_(actor, objectId);
  const col = findObjectColumn_(objectId, "Areas");
  if (col > 1 && row > 1) ss_().getSheetByName("Areas").getRange(row, col).clearContent();
  return "OK";
}

function recipientsForObject_(objectId) {
  const emails = {};
  readAllUsers_().forEach(function(user) {
    if (user.email && canAccessObject_(user, objectId)) emails[user.email] = true;
  });
  return Object.keys(emails);
}

function sendSystemEmail_(to, subject, body) {
  if (!to || to.length === 0) return;
  MailApp.sendEmail({ to: to.join(","), subject: subject, body: body, name: "ProObject" });
}

function sendNewEntryNotification_(objectId, objectName, siteName, workText, photoUrl, login) {
  const recipients = recipientsForObject_(objectId);
  const body = "Объект: " + objectName + "\n\n" +
    "Участок: " + siteName + "\n\n" +
    "Пользователь: " + login + "\n\n" +
    "Работы:\n" + workText + "\n\n" +
    "Фото:\n" + (photoUrl || "Нет фото");
  sendSystemEmail_(recipients, "Новая запись в журнале — ProObject", body);
}

function checkJournalToday() {
  const objects = readObjects_();
  const log = readLog_({});
  const today = new Date();
  objects.forEach(function(object) {
    const hasToday = log.some(function(entry) {
      if (entry.objectId !== object.id) return false;
      const d = new Date(entry.date);
      return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    });
    if (!hasToday) {
      sendSystemEmail_(recipientsForObject_(object.id), "Журнал работ не заполнен — ProObject", "По объекту «" + object.name + "» сегодня отсутствуют записи в журнале работ.");
    }
  });
}

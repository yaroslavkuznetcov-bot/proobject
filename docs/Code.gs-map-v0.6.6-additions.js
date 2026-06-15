// ProObject v0.6.6 — карта объекта.
// 1) Добавьте эти action-case в doPost(e) рядом с остальными action:
// if (action === "getMapData") return jsonResponse(getMapData(data));
// if (action === "saveMapImage") return jsonResponse(saveMapImage(data));
// if (action === "saveMapItem") return jsonResponse(saveMapItem(data));
// if (action === "updateMapItem") return jsonResponse(updateMapItem(data));
// if (action === "deleteMapItem") return jsonResponse(deleteMapItem(data));
// if (action === "clearMapItems") return jsonResponse(clearMapItems(data));
//
// 2) Ниже добавьте функции целиком в конец Code.gs.

function getMapsSheet_() {
  return getSheetOrCreate_(ss_(), "maps", ["object_id", "image", "updated_at", "updated_by"]);
}

function getMapItemsSheet_() {
  return getSheetOrCreate_(ss_(), "mapitems", ["id", "object_id", "area_id", "geometry", "type"]);
}

function findMapRowByObject_(objectId) {
  const sh = getMapsSheet_();
  const values = sh.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (normalize_(values[r][0]) === normalize_(objectId)) return r + 1;
  }
  return -1;
}

function mapPublicUrl_(fileId) {
  return "https://drive.google.com/uc?export=view&id=" + fileId;
}

function assertMapEditor_(user) {
  if (!user || (user.role !== "administrator" && user.role !== "curator")) {
    throw new Error("Недостаточно прав для редактирования карты");
  }
}

function parseGeometry_(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value || "{}") : (value || {});
    const points = Array.isArray(parsed.points) ? parsed.points.map(function(point) {
      return { x: Number(point.x) || 0, y: Number(point.y) || 0 };
    }) : [];
    return { points: points };
  } catch (error) {
    return { points: [] };
  }
}

function getMapData(data) {
  const actor = getUserByLogin_(data.login || "");
  if (!actor) throw new Error("Пользователь не найден");
  const objectId = normalize_(data.objectId);
  if (!objectId) throw new Error("Не выбран объект");
  assertObjectAccess_(actor, objectId);

  const mapsSheet = getMapsSheet_();
  const mapRow = findMapRowByObject_(objectId);
  let map = null;
  if (mapRow > 1) {
    const row = mapsSheet.getRange(mapRow, 1, 1, 4).getValues()[0];
    map = {
      objectId: normalize_(row[0]),
      image: normalize_(row[1]),
      updatedAt: safeIsoDate_(row[2]),
      updatedBy: normalize_(row[3])
    };
  }

  const itemsSheet = getMapItemsSheet_();
  const values = itemsSheet.getDataRange().getValues();
  const items = values.slice(1).filter(function(row) {
    return normalize_(row[1]) === objectId;
  }).map(function(row) {
    return {
      id: normalize_(row[0]),
      objectId: normalize_(row[1]),
      areaId: normalize_(row[2]),
      points: parseGeometry_(row[3]).points,
      type: normalize_(row[4]) || "polygon"
    };
  });

  return { status: "OK", map: map, items: items };
}

function saveMapImage(data) {
  const actor = getUserByLogin_(data.login || "");
  assertMapEditor_(actor);
  const objectId = normalize_(data.objectId);
  if (!objectId) throw new Error("Не выбран объект");
  assertObjectAccess_(actor, objectId);
  if (!data.image) throw new Error("Не передан файл генплана");

  const blob = Utilities.newBlob(
    Utilities.base64Decode(data.image),
    data.fileMimeType || MimeType.PNG,
    data.fileName || "genplan.png"
  );
  const file = DriveApp.getRootFolder().createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (error) {}
  const imageUrl = mapPublicUrl_(file.getId());

  const sh = getMapsSheet_();
  const row = findMapRowByObject_(objectId);
  const values = [objectId, imageUrl, new Date(), actor.login];
  if (row > 1) sh.getRange(row, 1, 1, 4).setValues([values]);
  else sh.appendRow(values);

  return { status: "OK", image: imageUrl };
}

function saveMapItem(data) {
  const actor = getUserByLogin_(data.login || "");
  assertMapEditor_(actor);
  const objectId = normalize_(data.objectId);
  const areaId = normalize_(data.areaId);
  const type = normalize_(data.type) || "polygon";
  if (!objectId || !areaId) throw new Error("Не выбран объект или участок");
  assertObjectAccess_(actor, objectId);
  const geometry = parseGeometry_(data.geometry);
  if (!geometry.points.length) throw new Error("Не передана геометрия");

  const id = "mapitem_" + new Date().getTime();
  getMapItemsSheet_().appendRow([id, objectId, areaId, JSON.stringify(geometry), type]);
  return { status: "OK", item: { id: id, objectId: objectId, areaId: areaId, points: geometry.points, type: type } };
}

function updateMapItem(data) {
  const actor = getUserByLogin_(data.login || "");
  assertMapEditor_(actor);
  const objectId = normalize_(data.objectId);
  const id = normalize_(data.id);
  const areaId = normalize_(data.areaId);
  const type = normalize_(data.type) || "polygon";
  if (!objectId || !id || !areaId) throw new Error("Не переданы данные элемента карты");
  assertObjectAccess_(actor, objectId);

  const sh = getMapItemsSheet_();
  const values = sh.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (normalize_(values[r][0]) === id && normalize_(values[r][1]) === objectId) {
      const geometry = parseGeometry_(data.geometry);
      sh.getRange(r + 1, 3, 1, 3).setValues([[areaId, JSON.stringify(geometry), type]]);
      return { status: "OK" };
    }
  }
  throw new Error("Элемент карты не найден");
}

function deleteMapItem(data) {
  const actor = getUserByLogin_(data.login || "");
  assertMapEditor_(actor);
  const objectId = normalize_(data.objectId);
  const id = normalize_(data.id);
  if (!objectId || !id) throw new Error("Не передан элемент карты");
  assertObjectAccess_(actor, objectId);

  const sh = getMapItemsSheet_();
  const values = sh.getDataRange().getValues();
  for (let r = values.length - 1; r >= 1; r--) {
    if (normalize_(values[r][0]) === id && normalize_(values[r][1]) === objectId) {
      sh.deleteRow(r + 1);
      return { status: "OK" };
    }
  }
  throw new Error("Элемент карты не найден");
}

function clearMapItems(data) {
  const actor = getUserByLogin_(data.login || "");
  assertMapEditor_(actor);
  const objectId = normalize_(data.objectId);
  if (!objectId) throw new Error("Не выбран объект");
  assertObjectAccess_(actor, objectId);

  const sh = getMapItemsSheet_();
  const values = sh.getDataRange().getValues();
  for (let r = values.length - 1; r >= 1; r--) {
    if (normalize_(values[r][1]) === objectId) sh.deleteRow(r + 1);
  }
  return { status: "OK" };
}

"use client";

import { ChangeEvent, MouseEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { AppUser, JournalBootstrapData, JournalEntry, ObjectItem, SiteItem } from "@/lib/types";

const MAX_MAP_IMAGE_MB = 12;

type Point = { x: number; y: number };
type DrawMode = "polygon" | "line" | "point";

type SavedMap = {
  objectId: string;
  image: string;
  updatedAt?: string;
  updatedBy?: string;
};

type MapItem = {
  id: string;
  objectId: string;
  areaId: string;
  type: DrawMode;
  points: Point[];
};

type MapObjectModuleProps = {
  user: AppUser;
  bootstrap: JournalBootstrapData;
  objectId: string;
  setObjectId: (value: string) => void;
  selectedObject: ObjectItem | null;
  filteredSites: SiteItem[];
  journal: JournalEntry[];
  manageable: boolean;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.split(",")[1];
      if (!base64) reject(new Error("Не удалось прочитать файл"));
      else resolve(base64);
    };
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

function pointsToString(points: Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function centerOf(points: Point[]) {
  if (points.length === 0) return { x: 0, y: 0 };
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function labelPointFor(item: MapItem) {
  if (item.type === "point") {
    const point = item.points[0] || { x: 0, y: 0 };
    return { x: point.x + 12, y: Math.max(24, point.y - 24), anchor: "start" as const };
  }

  if (item.type === "line") {
    const center = centerOf(item.points);
    return { x: center.x + 28, y: center.y - 18, anchor: "start" as const };
  }

  const minX = Math.min(...item.points.map((point) => point.x));
  const minY = Math.min(...item.points.map((point) => point.y));
  return { x: minX + 14, y: Math.max(24, minY + 14), anchor: "start" as const };
}

function labelSizeFor(text: string, imageWidth: number) {
  const fontSize = Math.max(18, imageWidth * .018);
  return {
    fontSize,
    width: Math.min(imageWidth * .42, Math.max(120, text.length * fontSize * .58 + 28)),
    height: fontSize + 18
  };
}

function clampLabelPoint(point: Point & { anchor: "start" }, labelSize: { width: number; height: number }, imageSize: { width: number; height: number }) {
  const padding = 12;
  return {
    ...point,
    x: Math.min(imageSize.width - labelSize.width - padding, Math.max(padding, point.x)),
    y: Math.min(imageSize.height - labelSize.height - padding, Math.max(padding, point.y))
  };
}

function clampPoint(point: Point, width: number, height: number) {
  return {
    x: Math.min(width, Math.max(0, Number(point.x.toFixed(2)))),
    y: Math.min(height, Math.max(0, Number(point.y.toFixed(2))))
  };
}

function formatDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default function MapObjectModule({
  user,
  bootstrap,
  objectId,
  setObjectId,
  selectedObject,
  filteredSites,
  journal,
  manageable
}: MapObjectModuleProps) {
  const [imageUrl, setImageUrl] = useState("");
  const [imageSize, setImageSize] = useState({ width: 1200, height: 800 });
  const [mode, setMode] = useState<DrawMode>("polygon");
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [items, setItems] = useState<MapItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [editAreaId, setEditAreaId] = useState("");
  const [editingOpen, setEditingOpen] = useState(false);
  const [isEditingGeometry, setIsEditingGeometry] = useState(false);
  const [dragPoint, setDragPoint] = useState<{ itemId: string; pointIndex: number } | null>(null);
  const [historyItem, setHistoryItem] = useState<MapItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mapMessage, setMapMessage] = useState("");
  const [mapZoom, setMapZoom] = useState(1);
  const mapRef = useRef<HTMLDivElement | null>(null);

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId]);
  const canFinish = draftPoints.length >= (mode === "polygon" ? 3 : mode === "line" ? 2 : 1) && Boolean(areaId) && manageable;

  function areaNameById(id: string) {
    return filteredSites.find((site) => site.id === id)?.name || id || "Без участка";
  }

  function journalForItem(item: MapItem) {
    const areaName = areaNameById(item.areaId);
    return journal.filter((entry) => entry.objectId === item.objectId && (entry.siteId === item.areaId || entry.site === areaName));
  }

  async function loadMapData(currentObjectId: string) {
    if (!currentObjectId) return;
    setIsLoading(true);
    setMapMessage("Загружаем карту…");
    try {
      const response = await fetch(`/api/map?login=${encodeURIComponent(user.id)}&objectId=${encodeURIComponent(currentObjectId)}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || json.status === "ERROR") throw new Error(json.message || "Не удалось загрузить карту");
      const map = json.map as SavedMap | null;
      const nextItems = (json.items || []) as MapItem[];
      setImageUrl(map?.image || "");
      setItems(nextItems);
      setSelectedId("");
      setDraftPoints([]);
      setAreaId("");
      setEditAreaId("");
      setHistoryItem(null);
      setMapMessage("");
    } catch (error) {
      setMapMessage(error instanceof Error ? error.message : "Не удалось загрузить карту");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (objectId) loadMapData(objectId);
  }, [objectId]);

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !objectId || !manageable) return;
    if (file.size > MAX_MAP_IMAGE_MB * 1024 * 1024) {
      setMapMessage(`Генплан не должен быть больше ${MAX_MAP_IMAGE_MB} МБ`);
      return;
    }

    setIsLoading(true);
    setMapMessage("Загружаем генплан…");
    try {
      const image = await fileToBase64(file);
      const response = await fetch("/api/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveMapImage",
          login: user.id,
          objectId,
          image,
          fileName: file.name,
          fileMimeType: file.type
        })
      });
      const json = await response.json();
      if (!response.ok || json.status === "ERROR") throw new Error(json.message || "Не удалось сохранить генплан");
      setImageUrl(json.image || "");
      setDraftPoints([]);
      setSelectedId("");
      setMapMessage("Генплан сохранён");
    } catch (error) {
      setMapMessage(error instanceof Error ? error.message : "Не удалось сохранить генплан");
    } finally {
      setIsLoading(false);
      event.target.value = "";
    }
  }

  function pointFromEvent(
  event:
    | React.MouseEvent<HTMLDivElement>
    | React.PointerEvent<SVGCircleElement>
    | React.PointerEvent<SVGSVGElement>
    ) 
  {
    if (!mapRef.current) return null;
    const rect = mapRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * imageSize.width;
    const y = ((event.clientY - rect.top) / rect.height) * imageSize.height;
    if (x < 0 || y < 0 || x > imageSize.width || y > imageSize.height) return null;
    return clampPoint({ x, y }, imageSize.width, imageSize.height);
  }

  function handleMapClick(event: MouseEvent<HTMLDivElement>) {
    if (!imageUrl || isEditingGeometry || !manageable) return;
    const point = pointFromEvent(event);
    if (!point) return;
    if (mode === "point") {
      setDraftPoints([point]);
      return;
    }
    setDraftPoints((current) => [...current, point]);
  }

  async function finishCreate() {
    if (!canFinish || !objectId) return;
    setIsLoading(true);
    setMapMessage("Сохраняем элемент карты…");
    try {
      const response = await fetch("/api/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveMapItem",
          login: user.id,
          objectId,
          areaId,
          type: mode,
          geometry: { points: draftPoints }
        })
      });
      const json = await response.json();
      if (!response.ok || json.status === "ERROR") throw new Error(json.message || "Не удалось сохранить элемент");
      const nextItem = json.item as MapItem;
      setItems((current) => [...current, nextItem]);
      setSelectedId(nextItem.id);
      setDraftPoints([]);
      setMapMessage("Элемент карты сохранён");
    } catch (error) {
      setMapMessage(error instanceof Error ? error.message : "Не удалось сохранить элемент");
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteSelected() {
    if (!selectedId || !objectId || !manageable) return;
    if (!confirm("Удалить выбранный элемент карты?")) return;
    setIsLoading(true);
    try {
      const response = await fetch("/api/map", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: user.id, objectId, id: selectedId })
      });
      const json = await response.json();
      if (!response.ok || json.status === "ERROR") throw new Error(json.message || "Не удалось удалить элемент");
      setItems((current) => current.filter((item) => item.id !== selectedId));
      setSelectedId("");
      setIsEditingGeometry(false);
      setEditAreaId("");
    } catch (error) {
      setMapMessage(error instanceof Error ? error.message : "Не удалось удалить элемент");
    } finally {
      setIsLoading(false);
    }
  }

  async function clearAllItems() {
    if (items.length === 0 || !objectId || !manageable) return;
    if (!confirm("Удалить все элементы карты выбранного объекта?")) return;
    setIsLoading(true);
    try {
      const response = await fetch("/api/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clearMapItems", login: user.id, objectId })
      });
      const json = await response.json();
      if (!response.ok || json.status === "ERROR") throw new Error(json.message || "Не удалось очистить карту");
      setItems([]);
      setSelectedId("");
      setDraftPoints([]);
      setHistoryItem(null);
      setIsEditingGeometry(false);
      setEditAreaId("");
    } catch (error) {
      setMapMessage(error instanceof Error ? error.message : "Не удалось очистить карту");
    } finally {
      setIsLoading(false);
    }
  }

  function startEditSelected() {
    if (!selectedItem || !manageable) return;
    setEditAreaId(selectedItem.areaId);
    setIsEditingGeometry(true);
    setEditingOpen(true);
  }

  async function saveEditSelected() {
    if (!selectedItem || !editAreaId || !manageable) return;
    setIsLoading(true);
    try {
      const updatedItem = { ...selectedItem, areaId: editAreaId };
      const response = await fetch("/api/map", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: user.id,
          objectId,
          id: selectedItem.id,
          areaId: editAreaId,
          type: selectedItem.type,
          geometry: { points: updatedItem.points }
        })
      });
      const json = await response.json();
      if (!response.ok || json.status === "ERROR") throw new Error(json.message || "Не удалось обновить элемент");
      setItems((current) => current.map((item) => item.id === selectedItem.id ? updatedItem : item));
      setIsEditingGeometry(false);
    } catch (error) {
      setMapMessage(error instanceof Error ? error.message : "Не удалось обновить элемент");
    } finally {
      setIsLoading(false);
    }
  }

  function clearDraft() {
    setDraftPoints([]);
  }

  function handlePointMove(event: PointerEvent<SVGSVGElement>) {
    if (!dragPoint || !manageable) return;
    const point = pointFromEvent(event);
    if (!point) return;
    setItems((current) => current.map((item) => {
      if (item.id !== dragPoint.itemId) return item;
      return {
        ...item,
        points: item.points.map((existingPoint, index) => index === dragPoint.pointIndex ? point : existingPoint)
      };
    }));
  }

  const objectOptions = bootstrap.objects;

  return (
    <div className="mapLabPage embedded">
      <header className="mapLabHeader compact embedded">
        <div>
          <h1>Карта объекта <span>v0.6.12</span></h1>
          <p>Интерактивный генплан выбранного объекта: ручная разметка участков, линий и точек с сохранением в Google Sheets.</p>
        </div>
        <div className="mapLabHeaderActions">
          <label className="mapUploadButton">
            {imageUrl ? "Изменить генплан" : "Загрузить генплан"}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImage} disabled={!manageable || !objectId || isLoading} />
          </label>
          <button type="button" onClick={() => objectId && loadMapData(objectId)} disabled={!objectId || isLoading}>Обновить</button>
          <div className="mapZoomGroup compact" aria-label="Масштаб карты">
            <button type="button" onClick={() => setMapZoom((value) => Math.max(.35, Number((value - .15).toFixed(2))))}>−</button>
            <span>{Math.round(mapZoom * 100)}%</span>
            <button type="button" onClick={() => setMapZoom((value) => Math.min(3, Number((value + .15).toFixed(2))))}>+</button>
          </div>
        </div>
      </header>

      {mapMessage ? <div className="message idle">{mapMessage}</div> : null}

      <section className="mapObjectSelector formCard">
        <div className="fieldGroup">
          <label htmlFor="mapObject">Объект</label>
          <select id="mapObject" className="field" value={objectId} onChange={(event) => setObjectId(event.target.value)}>
            <option value="">Выберите объект</option>
            {objectOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
        <p>{selectedObject ? `Карта и элементы будут сохранены только для объекта «${selectedObject.name}».` : "Выберите объект для открытия карты."}</p>
      </section>

      <section className="mapLabGrid rightOnly">
        <div className="mapCanvasCard">
          <div className="mapViewport">
            <div
              className={`mapStage natural ${imageUrl ? "withImage" : "noImage"}`}
              ref={mapRef}
              style={{ width: imageSize.width * mapZoom, height: imageSize.height * mapZoom }}
              onClick={handleMapClick}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Генеральный план"
                  onLoad={(event) => {
                    const img = event.currentTarget;
                    setImageSize({ width: img.naturalWidth || 1200, height: img.naturalHeight || 800 });
                  }}
                />
              ) : (
                <div className="mapEmptyState">
                  <b>Генплан не загружен</b>
                  <span>Загрузите PNG, JPG или WEBP. Изображение сохраняется в лист maps для выбранного объекта.</span>
                </div>
              )}

              {imageUrl ? (
                <svg
                  className="mapSvg"
                  viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
                  preserveAspectRatio="none"
                  onPointerMove={handlePointMove}
                  onPointerUp={() => setDragPoint(null)}
                  onPointerLeave={() => setDragPoint(null)}
                >
                  <defs>
                    <pattern id="mapDraftHatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <rect width="14" height="14" fill="rgba(55,55,55,.18)" />
                      <line x1="0" y1="0" x2="0" y2="14" stroke="#3a3a3a" strokeWidth="3" />
                    </pattern>
                  </defs>
                  {items.map((item) => {
                    const rawLabelPoint = labelPointFor(item);
                    const labelText = areaNameById(item.areaId);
                    const labelSize = labelSizeFor(labelText, imageSize.width);
                    const labelPoint = clampLabelPoint(rawLabelPoint, labelSize, imageSize);
                    const isSelected = selectedId === item.id;
                    return (
                      <g key={item.id} className={isSelected ? "mapShape selected" : "mapShape"} onClick={(event) => { event.stopPropagation(); setSelectedId(item.id); }}>
                        {item.type === "polygon" ? <polygon className="mapFinalPolygon" points={pointsToString(item.points)} /> : null}
                        {item.type === "line" ? <polyline className="mapFinalLine" points={pointsToString(item.points)} /> : null}
                        {item.type === "point" ? <circle className="mapFinalPoint" cx={item.points[0]?.x || 0} cy={item.points[0]?.y || 0} r={Math.max(7, imageSize.width * .006)} /> : null}
                        {item.type !== "polygon" ? item.points.map((point, index) => (
                          <circle key={`${item.id}-static-${index}`} className="mapFinalVertex" cx={point.x} cy={point.y} r={Math.max(5, imageSize.width * .004)} />
                        )) : null}
                        <g className="mapShapeLabel" transform={`translate(${labelPoint.x} ${labelPoint.y})`}>
                          <rect width={labelSize.width} height={labelSize.height} rx={Math.max(8, labelSize.fontSize * .35)} />
                          <text x={14} y={labelSize.height / 2} style={{ fontSize: labelSize.fontSize }}>{labelText}</text>
                        </g>
                        {isSelected && isEditingGeometry && manageable ? item.points.map((point, index) => (
                          <circle
                            key={`${item.id}-${index}`}
                            className="mapHandle"
                            cx={point.x}
                            cy={point.y}
                            r={Math.max(6, imageSize.width * .004)}
                            onPointerDown={(event) => { event.stopPropagation(); setDragPoint({ itemId: item.id, pointIndex: index }); }}
                          />
                        )) : null}
                      </g>
                    );
                  })}

                  {draftPoints.length > 0 ? (
                    <g className="mapDraft">
                      {mode === "polygon" && draftPoints.length >= 3 ? <polygon className="mapDraftFill" points={pointsToString(draftPoints)} /> : null}
                      {mode === "polygon" || mode === "line" ? <polyline points={pointsToString(draftPoints)} /> : null}
                      {draftPoints.map((point, index) => <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r={Math.max(5, imageSize.width * .004)} />)}
                    </g>
                  ) : null}
                </svg>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="mapSideStack">
          {manageable ? (
            <details className="mapPanel" open={editingOpen} onToggle={(event) => setEditingOpen(event.currentTarget.open)}>
              <summary>Редактирование объектов</summary>

              <section className="mapPanelSection">
                <h2>Создание объектов</h2>
                <div className="mapFieldGrid single">
                  <label>
                    Наименование участка
                    <select value={areaId} onChange={(event) => setAreaId(event.target.value)} disabled={!objectId}>
                      <option value="">Выберите участок</option>
                      {filteredSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                    </select>
                  </label>
                </div>
                <div className="mapModeGroup full" aria-label="Инструменты карты">
                  {(["polygon", "line", "point"] as DrawMode[]).map((tool) => (
                    <button key={tool} type="button" className={mode === tool ? "active" : ""} onClick={() => { setMode(tool); setDraftPoints([]); }}>
                      {tool === "polygon" ? "Полигон" : tool === "line" ? "Линия" : "Точка"}
                    </button>
                  ))}
                </div>
                <div className="mapButtonRow">
                  <button type="button" className="mapPrimary" onClick={finishCreate} disabled={!canFinish || isLoading}>Завершить создание объекта</button>
                  <button type="button" onClick={clearDraft} disabled={draftPoints.length === 0}>Очистить точки</button>
                </div>
                <div className="mapHint">
                  {mode === "polygon" ? "Полигон: минимум 3 точки и выбранный участок." : mode === "line" ? "Линия: минимум 2 точки и выбранный участок." : "Точка: один клик по плану и выбранный участок."}
                </div>
              </section>

              <section className="mapPanelSection">
                <h2>Редактирование объектов</h2>
                <button type="button" className="mapWideButton" onClick={startEditSelected} disabled={!selectedItem}>Изменить объект</button>
                <button type="button" className="mapWideButton danger" onClick={clearAllItems} disabled={items.length === 0 || isLoading}>Очистить всё</button>
                {selectedItem ? (
                  <div className="mapFieldGrid single">
                    <label>
                      Наименование участка
                      <select value={editAreaId || selectedItem.areaId} onChange={(event) => setEditAreaId(event.target.value)} disabled={!isEditingGeometry}>
                        {filteredSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                      </select>
                    </label>
                    <div className="mapButtonRow">
                      <button type="button" className="mapPrimary" onClick={saveEditSelected} disabled={!isEditingGeometry || isLoading}>Сохранить изменения</button>
                      <button type="button" onClick={deleteSelected} disabled={isLoading}>Удалить</button>
                    </div>
                    <div className="mapHint">При редактировании перетаскивайте контрольные точки выбранного элемента.</div>
                  </div>
                ) : <div className="mapEmptyList">Выберите элемент на плане или в списке.</div>}
              </section>
            </details>
          ) : null}

          <section className="mapPanel viewPanel">
            <h2>Просмотр</h2>
            <div className="mapItemsTitle"><span>{items.length}</span></div>
            {items.length === 0 ? <div className="mapEmptyList">Пока нет созданных участков</div> : null}
            <div className="mapItemsList">
              {items.map((item) => (
                <div key={item.id} className={selectedId === item.id ? "mapItemRow active" : "mapItemRow"}>
                  <button type="button" className="mapItemSelect" onClick={() => setSelectedId(item.id)}>
                    <b>{areaNameById(item.areaId).slice(0, 2).toUpperCase()}</b>
                    <span>{areaNameById(item.areaId)}</span>
                  </button>
                  <button type="button" className="mapItemWorks" onClick={() => { setSelectedId(item.id); setHistoryItem(item); }}>Выполненные работы</button>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>

      {historyItem ? (
        <div className="mapHistoryOverlay" role="dialog" aria-modal="true">
          <div className="mapHistoryModal">
            <button className="mapModalClose" type="button" onClick={() => setHistoryItem(null)}>×</button>
            <p>История записей по участку</p>
            <h2>{areaNameById(historyItem.areaId)}</h2>
            <div className="mapHistoryList">
              {journalForItem(historyItem).length === 0 ? (
                <article>
                  <span>Записей нет</span>
                  <b>{selectedObject?.name || "Объект"}</b>
                  <p>В журнале пока нет записей по выбранному участку.</p>
                </article>
              ) : journalForItem(historyItem).map((entry) => (
                <article key={entry.id}>
                  <span>{formatDate(entry.date)}</span>
                  <p>{entry.work}</p>
                  {entry.photoUrl ? <a className="photoLink" href={entry.photoUrl} target="_blank" rel="noreferrer">Фото</a> : null}
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

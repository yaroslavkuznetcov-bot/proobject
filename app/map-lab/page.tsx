"use client";

import { ChangeEvent, MouseEvent, PointerEvent, useMemo, useRef, useState } from "react";

type Point = { x: number; y: number };
type DrawMode = "polygon" | "line" | "point";
type WorkObjectId = "obj_kotel" | "obj_school";

type MapItem = {
  id: string;
  type: DrawMode;
  areaName: string;
  points: Point[];
};

const objectAreas: Record<WorkObjectId, string[]> = {
  obj_kotel: ["Здание котельной", "Павильон УТ", "КТП", "Наружные сети", "Благоустройство"],
  obj_school: ["Корпус 1", "Корпус 2", "Спортзал", "Благоустройство", "Наружные сети"]
};

const objectLabels: Record<WorkObjectId, string> = {
  obj_kotel: "Котельная РЭБ",
  obj_school: "Школа-сад"
};

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

function labelTextFor(item: MapItem) {
  return item.areaName;
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

export default function MapLabPage() {
  const [objectId, setObjectId] = useState<WorkObjectId>("obj_kotel");
  const [imageUrl, setImageUrl] = useState("");
  const [imageSize, setImageSize] = useState({ width: 1200, height: 800 });
  const [mode, setMode] = useState<DrawMode>("polygon");
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [items, setItems] = useState<MapItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [scale, setScale] = useState(1);
  const [areaName, setAreaName] = useState("");
  const [editAreaName, setEditAreaName] = useState("");
  const [editingOpen, setEditingOpen] = useState(false);
  const [isEditingGeometry, setIsEditingGeometry] = useState(false);
  const [dragPoint, setDragPoint] = useState<{ itemId: string; pointIndex: number } | null>(null);
  const [historyItem, setHistoryItem] = useState<MapItem | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);

  const areaOptions = objectAreas[objectId];
  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId]);
  const canFinish = draftPoints.length >= (mode === "polygon" ? 3 : mode === "line" ? 2 : 1) && Boolean(areaName);

  function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    setDraftPoints([]);
    setSelectedId("");
  }

  function pointFromEvent(event: MouseEvent<HTMLDivElement> | PointerEvent<SVGCircleElement>): Point | null {
    if (!mapRef.current) return null;
    const rect = mapRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * imageSize.width;
    const y = ((event.clientY - rect.top) / rect.height) * imageSize.height;
    if (x < 0 || y < 0 || x > imageSize.width || y > imageSize.height) return null;
    return clampPoint({ x, y }, imageSize.width, imageSize.height);
  }

  function handleMapClick(event: MouseEvent<HTMLDivElement>) {
    if (!imageUrl || isEditingGeometry) return;
    const point = pointFromEvent(event);
    if (!point) return;

    if (mode === "point") {
      setDraftPoints([point]);
      return;
    }

    setDraftPoints((current) => [...current, point]);
  }

  function finishCreate() {
    if (!canFinish) return;

    const nextItem: MapItem = {
      id: `map_${Date.now()}`,
      type: mode,
      areaName,
      points: draftPoints
    };

    setItems((current) => [...current, nextItem]);
    setSelectedId(nextItem.id);
    setDraftPoints([]);
  }

  function deleteSelected() {
    if (!selectedId) return;
    setItems((current) => current.filter((item) => item.id !== selectedId));
    setSelectedId("");
    setIsEditingGeometry(false);
    setEditAreaName("");
  }

  function clearAllItems() {
    if (items.length === 0) return;
    if (!confirm("Удалить все созданные элементы карты?")) return;
    setItems([]);
    setSelectedId("");
    setHistoryItem(null);
    setDraftPoints([]);
    setIsEditingGeometry(false);
    setEditAreaName("");
  }

  function startEditSelected() {
    if (!selectedItem) return;
    setEditAreaName(selectedItem.areaName);
    setIsEditingGeometry(true);
    setEditingOpen(true);
  }

  function saveEditSelected() {
    if (!selectedItem || !editAreaName) return;
    setItems((current) => current.map((item) => item.id === selectedItem.id ? { ...item, areaName: editAreaName } : item));
    setIsEditingGeometry(false);
  }

  function clearDraft() {
    setDraftPoints([]);
  }

  function handlePointMove(event: PointerEvent<SVGCircleElement>) {
    if (!dragPoint) return;
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

  function exportJson() {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "proobject-map-items.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mapLabPage">
      <header className="mapLabHeader compact">
        <div>
          <a className="mapBackLink" href="/app">← Вернуться в ProObject</a>
          <h1>Карта объекта <span>Beta</span></h1>
          <p>Ручная разметка генплана: полигоны, линии и точки. Пока это отдельная песочница без сохранения в Google Sheets.</p>
        </div>
        <div className="mapLabHeaderActions">
          <label className="mapUploadButton">
            {imageUrl ? "Изменить генплан" : "Загрузить генплан"}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImage} />
          </label>
          <button type="button" onClick={exportJson} disabled={items.length === 0}>Экспорт JSON</button>
        </div>
      </header>

      <section className="mapLabGrid rightOnly">
        <div className="mapCanvasCard">
          <div className="mapViewport">
            <div
              className={`mapStage natural ${imageUrl ? "withImage" : "noImage"}`}
              ref={mapRef}
              style={{ width: imageSize.width * scale, height: imageSize.height * scale }}
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
                  <span>Поддерживаются PNG, JPG и WEBP. Вертикальный формат больше не сжимается под поле — область будет прокручиваться.</span>
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
                    const labelText = labelTextFor(item);
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
                        {isSelected && isEditingGeometry ? item.points.map((point, index) => (
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
          <details className="mapPanel" open={editingOpen} onToggle={(event) => setEditingOpen(event.currentTarget.open)}>
            <summary>Редактирование объектов</summary>

            <section className="mapPanelSection">
              <h2>Создание объектов</h2>
              <div className="mapFieldGrid single">
                <label>
                  Объект
                  <select value={objectId} onChange={(event) => { setObjectId(event.target.value as WorkObjectId); setAreaName(""); setEditAreaName(""); }}>
                    {Object.entries(objectLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
                <label>
                  Наименование участка
                  <select value={areaName} onChange={(event) => setAreaName(event.target.value)}>
                    <option value="">Выберите участок</option>
                    {areaOptions.map((area) => <option key={area} value={area}>{area}</option>)}
                  </select>
                </label>
              </div>
              <div className="mapModeGroup full" aria-label="Инструменты карты">
                {(["polygon", "line", "point"] as DrawMode[]).map((tool) => (
                  <button
                    key={tool}
                    type="button"
                    className={mode === tool ? "active" : ""}
                    onClick={() => { setMode(tool); setDraftPoints([]); }}
                  >
                    {tool === "polygon" ? "Полигон" : tool === "line" ? "Линия" : "Точка"}
                  </button>
                ))}
              </div>
              <div className="mapButtonRow">
                <button type="button" className="mapPrimary" onClick={finishCreate} disabled={!canFinish}>Завершить создание объекта</button>
                <button type="button" onClick={clearDraft} disabled={draftPoints.length === 0}>Очистить точки</button>
              </div>
              <div className="mapHint">
                {mode === "polygon" ? "Полигон: минимум 3 точки и выбранный участок." : mode === "line" ? "Линия: минимум 2 точки и выбранный участок." : "Точка: один клик по плану и выбранный участок."}
              </div>
            </section>

            <section className="mapPanelSection">
              <h2>Редактирование объектов</h2>
              <button type="button" className="mapWideButton" onClick={startEditSelected} disabled={!selectedItem}>Изменить объект</button>
              <button type="button" className="mapWideButton danger" onClick={clearAllItems} disabled={items.length === 0}>Очистить всё</button>
              {selectedItem ? (
                <div className="mapFieldGrid single">
                  <label>
                    Наименование участка
                    <select value={editAreaName || selectedItem.areaName} onChange={(event) => setEditAreaName(event.target.value)} disabled={!isEditingGeometry}>
                      {areaOptions.map((area) => <option key={area} value={area}>{area}</option>)}
                    </select>
                  </label>
                  <div className="mapButtonRow">
                    <button type="button" className="mapPrimary" onClick={saveEditSelected} disabled={!isEditingGeometry}>Сохранить изменения</button>
                    <button type="button" onClick={deleteSelected}>Удалить</button>
                  </div>
                  <div className="mapHint">При редактировании перетаскивайте контрольные точки выбранного элемента.</div>
                </div>
              ) : <div className="mapEmptyList">Выберите элемент на плане или в списке.</div>}
            </section>
          </details>

          <section className="mapPanel viewPanel">
            <h2>Просмотр</h2>
            <div className="mapItemsTitle"><span>{items.length}</span></div>
            {items.length === 0 ? <div className="mapEmptyList">Пока нет созданных участков</div> : null}
            <div className="mapItemsList">
              {items.map((item) => (
                <div key={item.id} className={selectedId === item.id ? "mapItemRow active" : "mapItemRow"}>
                  <button type="button" className="mapItemSelect" onClick={() => setSelectedId(item.id)}>
                    <b>{item.areaName.slice(0, 2).toUpperCase()}</b>
                    <span>{item.areaName}</span>
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
            <h2>{historyItem.areaName}</h2>
            <div className="mapHistoryList">
              <article>
                <span>Сегодня</span>
                <b>Демо-режим</b>
                <p>После подключения к журналу здесь будут отображаться записи, фото и документы по выбранному участку.</p>
              </article>
              <article>
                <span>Связь</span>
                <b>{objectLabels[objectId]}</b>
                <p>Карта будет фильтровать журнал по объекту и участку.</p>
              </article>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

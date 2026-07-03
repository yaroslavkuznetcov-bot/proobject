"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type { AppUser, JournalBootstrapData, JournalEntry, JournalPayload, ManagedUser, UserRole } from "@/lib/types";
import MapObjectModule from "./MapObjectModule";

const CUSTOM_SITE_VALUE = "__custom__";
const MAX_PHOTO_SIZE_MB = 8;
const ALL_OBJECTS_VALUE = "__all_objects__";
const APP_VERSION = "v0.6.12";

type SubmitState = "idle" | "loading" | "success" | "error";
type Theme = "light" | "dark";
type WorkModule = "journal" | "map";

const roleLabel: Record<UserRole, string> = {
  customer: "Заказчик",
  contractor: "Подрядчик",
  curator: "Куратор",
  administrator: "Администратор"
};

const objectCardSections = [
  {
    title: "Объект",
    fields: [
      ["name_obj", "Полное название объекта"]
    ]
  },
  {
    title: "Информация о Заказчике",
    fields: [
      ["name_customer", "Заказчик"],
      ["OGRN_customer", "ОГРН Заказчика"],
      ["INN_customer", "ИНН Заказчика"],
      ["adress_customer", "Адрес Заказчика"]
    ]
  },
  {
    title: "Информация о Подрядчике",
    fields: [
      ["name_contractor", "Подрядчик"],
      ["OGRN_contractor", "ОГРН Подрядчика"],
      ["INN_contractor", "ИНН Подрядчика"],
      ["adress_contractor", "Адрес Подрядчика"]
    ]
  },
  {
    title: "Информация о Проектировщике",
    fields: [
      ["name_projector", "Проектировщик"],
      ["OGRN_projector", "ОГРН Проектировщика"],
      ["INN_projector", "ИНН Проектировщика"],
      ["adress_projector", "Адрес Проектировщика"],
      ["SRO_projector", "СРО Проектировщика"]
    ]
  }
] as const;

function detailValue(details: Record<string, string> | undefined, key: string) {
  return details?.[key]?.trim() || "";
}

function canWrite(role?: UserRole) {
  return role === "contractor" || role === "curator" || role === "administrator";
}

function canManage(role?: UserRole) {
  return role === "curator" || role === "administrator";
}

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

function imageToDataUrl(image: HTMLImageElement, maxSide = 1600, quality = 0.82): string {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Не удалось подготовить фото");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

function compressImageFile(file: File): Promise<{ data: string; fileName: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Можно прикрепить только изображения"));
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const dataUrl = imageToDataUrl(image);
        const base64 = dataUrl.split(",")[1];
        if (!base64) throw new Error("Не удалось сжать фото");
        const cleanName = file.name.replace(/\.[^.]+$/, "") || "photo";
        resolve({ data: base64, fileName: `${cleanName}.jpg`, mimeType: "image/jpeg" });
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось прочитать фото"));
    };
    image.src = url;
  });
}

function splitPhotoUrls(value: string | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return [];

  const driveUrls = raw.match(/https:\/\/drive\.google\.com\/file\/d\/[A-Za-z0-9_-]+\/view\?usp=[A-Za-z0-9_-]+/g);
  if (driveUrls && driveUrls.length > 0) {
    return Array.from(new Set(driveUrls.map((item) => item.trim()).filter(Boolean)));
  }

  return raw
    .split(/\r?\n|\|+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getGoogleDriveFileId(url: string) {
  return String(url || "").match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1] || "";
}

function driveImagePreviewUrl(url: string) {
  const fileId = getGoogleDriveFileId(url);
  return fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000` : url;
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

function formatDateForExport(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function escapeHtml(value: string | number | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeFilePart(value: string) {
  return value
    .trim()
    .replace(/[\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "journal";
}

function downloadHtmlExcel(fileName: string, rows: string[][]) {
  const htmlRows = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body><table border="1">${htmlRows}</table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".xls") ? fileName : `${fileName}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function HomePage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [theme, setTheme] = useState<Theme>("dark");

  const [bootstrap, setBootstrap] = useState<JournalBootstrapData>({ objects: [], sites: [], journal: [] });
  const [objectId, setObjectId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [customSite, setCustomSite] = useState("");
  const [work, setWork] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [newObject, setNewObject] = useState("");
  const [newSite, setNewSite] = useState("");
  const [newUserLogin, setNewUserLogin] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("contractor");
  const [newUserObjects, setNewUserObjects] = useState<string[]>([]);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [downloadObjectId, setDownloadObjectId] = useState(ALL_OBJECTS_VALUE);
  const [activeModule, setActiveModule] = useState<WorkModule>("journal");
  const [photoViewer, setPhotoViewer] = useState<{ urls: string[]; index: number } | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const saved = localStorage.getItem("proobject_user");
    if (saved) setUser(JSON.parse(saved));
  }, []);

  useEffect(() => {
    if (photos.length === 0) {
      setPreviewUrls([]);
      return;
    }
    const urls = photos.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [photos]);

  async function loadData() {
    setState("loading");
    setMessage("Загружаем данные…");
    try {
      const response = await fetch(`/api/data?login=${encodeURIComponent(user?.id || "")}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message || "Не удалось загрузить данные");
      setBootstrap(json);
      setObjectId((current) => current || "");
      setState("idle");
      setMessage("");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить данные");
    }
  }

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const selectedObject = useMemo(
    () => bootstrap.objects.find((item) => item.id === objectId),
    [bootstrap.objects, objectId]
  );

  const filteredSites = useMemo(
    () => bootstrap.sites.filter((item) => item.objectId === objectId),
    [bootstrap.sites, objectId]
  );

  useEffect(() => {
    setSiteId("");
    setCustomSite("");
  }, [objectId, filteredSites.length, user?.role]);

  const selectedSite = useMemo(
    () => filteredSites.find((item) => item.id === siteId),
    [filteredSites, siteId]
  );

  const visibleJournal = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!objectId) return [];
    return bootstrap.journal.filter((entry) => {
      const objectMatch = entry.objectId === objectId || entry.object === selectedObject?.name;
      const siteMatch = siteId && siteId !== CUSTOM_SITE_VALUE ? entry.site === selectedSite?.name : true;
      const textMatch = !text || `${entry.object} ${entry.site} ${entry.work}`.toLowerCase().includes(text);
      return objectMatch && siteMatch && textMatch;
    });
  }, [bootstrap.journal, objectId, query, selectedObject?.name, selectedSite?.name, siteId]);

  function exportJournal(objectIds: string[], fileLabel: string) {
    const allowed = new Set(objectIds);
    const rows = bootstrap.journal
      .filter((entry) => allowed.has(entry.objectId))
      .slice()
      .reverse();

    if (rows.length === 0) {
      setState("error");
      setMessage("По выбранному объекту нет записей для выгрузки");
      return;
    }

    const tableRows = [
      ["Дата", "Пользователь", "ID объекта", "Объект", "ID участка", "Участок", "Работы", "Фото"],
      ...rows.map((entry) => [
        formatDateForExport(entry.date),
        entry.login || "",
        entry.objectId || "",
        entry.object || "",
        entry.siteId || "",
        entry.site || "",
        entry.work || "",
        entry.photoUrl || ""
      ])
    ];

    const stamp = new Intl.DateTimeFormat("ru-RU", { year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date())
      .replace(/\./g, "-");
    downloadHtmlExcel(`ProObject_${safeFilePart(fileLabel)}_${stamp}.xls`, tableRows);
    setState("success");
    setMessage("Журнал подготовлен к скачиванию");
  }

  function handleDownloadClick() {
    if (user?.role === "administrator") {
      setDownloadObjectId(objectId || ALL_OBJECTS_VALUE);
      setShowDownloadOptions((current) => !current);
      return;
    }

    if (!selectedObject) {
      setState("error");
      setMessage("Выберите объект для скачивания журнала");
      return;
    }

    exportJournal([selectedObject.id], selectedObject.name);
  }

  function handleAdminDownload() {
    if (downloadObjectId === ALL_OBJECTS_VALUE) {
      exportJournal(bootstrap.objects.map((item) => item.id), "Все_объекты");
      setShowDownloadOptions(false);
      return;
    }

    const object = bootstrap.objects.find((item) => item.id === downloadObjectId);
    if (!object) {
      setState("error");
      setMessage("Выберите объект для скачивания журнала");
      return;
    }

    exportJournal([object.id], object.name);
    setShowDownloadOptions(false);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthMessage("Проверяем доступ…");
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password })
    });
    const json = await response.json();
    if (!response.ok) {
      setAuthMessage(json.message || "Ошибка входа");
      return;
    }
    localStorage.setItem("proobject_user", JSON.stringify(json.user));
    setUser(json.user);
    setAuthMessage("");
  }

  function logout() {
    localStorage.removeItem("proobject_user");
    setUser(null);
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return setPhotos([]);
    const wrongFile = files.find((file) => !file.type.startsWith("image/"));
    if (wrongFile) {
      setState("error");
      setMessage("Можно прикрепить только изображения");
      event.target.value = "";
      return;
    }
    setState("idle");
    setMessage(`Выбрано фото: ${files.length}. При сохранении сайт автоматически сожмет их.`);
    setPhotos(files);
  }

  async function saveJournal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !canWrite(user.role)) return;
    if (!selectedObject) return setMessage("Выберите объект");
    const siteName = siteId === CUSTOM_SITE_VALUE ? customSite.trim() : selectedSite?.name || "";
    if (!siteName) return setMessage("Выберите или введите участок");
    if (!work.trim()) return setMessage("Введите выполненные работы");

    setState("loading");
    setMessage(editing ? "Обновляем запись…" : "Сохраняем запись…");

    try {
      const payload: JournalPayload = {
        id: editing?.id,
        login: user.id,
        object: selectedObject.name,
        objectId: selectedObject.id,
        site: siteName,
        siteId: selectedSite?.id,
        work: work.trim()
      };
      if (photos.length > 0) {
        setMessage(`Оптимизируем фото: 0 из ${photos.length}`);
        const optimizedPhotos = [];
        for (let index = 0; index < photos.length; index++) {
          setMessage(`Оптимизируем фото: ${index + 1} из ${photos.length}`);
          optimizedPhotos.push(await compressImageFile(photos[index]));
        }
        payload.photos = optimizedPhotos;
      }
      const response = await fetch("/api/journal", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await response.json();
      if (!response.ok || json.status === "ERROR") throw new Error(json.message || "Не удалось сохранить запись");
      setWork("");
      setPhotos([]);
      setEditing(null);
      setState("success");
      setMessage(editing ? "Запись обновлена" : "Запись сохранена");
      await loadData();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить запись");
    }
  }

  function startEdit(entry: JournalEntry) {
    setEditing(entry);
    const object = bootstrap.objects.find((item) => item.name === entry.object || item.id === entry.objectId);
    if (object) setObjectId(object.id);
    setWork(entry.work);
    setCustomSite(entry.site);
    setSiteId(CUSTOM_SITE_VALUE);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteEntry(id: string) {
    if (!confirm("Удалить запись из журнала?")) return;
    const response = await fetch("/api/journal", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, login: user?.id })
    });
    const json = await response.json();
    if (!response.ok || json.status === "ERROR") setMessage(json.message || "Не удалось удалить запись");
    else await loadData();
  }

  async function createObject() {
    if (!newObject.trim()) return;
    await fetch("/api/objects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newObject.trim(), login: user?.id }) });
    setNewObject("");
    await loadData();
  }

  async function deleteObject(id: string) {
    if (!confirm("Удалить объект? Участки и старые записи останутся в таблице.")) return;
    await fetch("/api/objects", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, login: user?.id }) });
    await loadData();
  }

  async function createSite() {
    if (!newSite.trim() || !objectId) return;
    await fetch("/api/sites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newSite.trim(), objectId, login: user?.id }) });
    setNewSite("");
    await loadData();
  }

  async function deleteSite(id: string) {
    if (!confirm("Удалить участок из справочника?")) return;
    await fetch("/api/sites", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, login: user?.id }) });
    await loadData();
  }

  function resetUserForm() {
    setNewUserLogin("");
    setNewUserPassword("");
    setNewUserRole("contractor");
    setNewUserObjects([]);
    setNewUserEmail("");
    setEditingUser(null);
  }

  function startUserEdit(item: ManagedUser) {
    setEditingUser(item);
    setNewUserLogin(item.login);
    setNewUserPassword("");
    setNewUserRole(item.role);
    setNewUserObjects(item.objects || []);
    setNewUserEmail(item.email || "");
  }

  async function saveUser() {
    if (!newUserLogin.trim()) return setMessage("Введите логин пользователя");
    if (!editingUser && !newUserPassword) return setMessage("Введите пароль пользователя");

    const response = await fetch("/api/users", {
      method: editingUser ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentLogin: user?.id,
        id: editingUser?.id,
        login: newUserLogin.trim(),
        password: newUserPassword,
        role: newUserRole,
        objects: newUserRole === "administrator" ? ["*"] : newUserObjects,
        email: newUserEmail.trim()
      })
    });
    const json = await response.json();
    if (!response.ok || json.status === "ERROR") {
      setState("error");
      setMessage(json.message || "Не удалось сохранить пользователя");
      return;
    }

    resetUserForm();
    setState("success");
    setMessage(editingUser ? "Пользователь обновлен" : "Пользователь создан");
    await loadData();
  }

  async function deleteUser(id: string, login: string) {
    if (login === user?.id) return setMessage("Нельзя удалить текущего пользователя");
    if (!confirm(`Удалить пользователя ${login}?`)) return;

    const response = await fetch("/api/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, login: user?.id })
    });
    const json = await response.json();
    if (!response.ok || json.status === "ERROR") setMessage(json.message || "Не удалось удалить пользователя");
    else await loadData();
  }

  function openPhotoViewer(urls: string[], index = 0) {
    if (urls.length === 0) return;
    setPhotoViewer({ urls, index: Math.max(0, Math.min(index, urls.length - 1)) });
  }

  function shiftPhotoViewer(delta: number) {
    setPhotoViewer((current) => {
      if (!current) return current;
      const nextIndex = (current.index + delta + current.urls.length) % current.urls.length;
      return { ...current, index: nextIndex };
    });
  }

  if (!user) {
    return (
      <main className="page authPage">
        <section className="loginCard">
          <div className="brandLine"><h1>ProОбъект</h1><span className="versionBadge">{APP_VERSION}</span></div>
          <p className="heroSubtitle">система автоматизированного сбора информации</p>
          <form className="form" onSubmit={handleLogin}>
            <div className="fieldGroup">
              <label htmlFor="login">Логин</label>
              <input
                id="login"
                className="field"
                type="text"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                placeholder="Введите логин"
                autoComplete="username"
              />
            </div>
            <div className="fieldGroup">
              <label htmlFor="password">Пароль</label>
              <input id="password" className="field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <button className="primaryButton" type="submit">Войти</button>
          </form>
          {authMessage ? <div className="message error">{authMessage}</div> : null}
          <p className="hint">Введите логин и пароль из листа USERS вашей Google-таблицы.</p>
        </section>
      </main>
    );
  }

  const isBusy = state === "loading";
  const writable = canWrite(user.role);
  const manageable = canManage(user.role);

  return (
    <main className="page">
      <div className="shell">
        <section className="heroCard">
          <div>
            <div className="brandLine"><h1>ProОбъект</h1><span className="versionBadge">{APP_VERSION}</span></div>
            <p className="heroSubtitle">система автоматизированного сбора информации</p>
            <p className="heroText">Вы вошли как <b>{roleLabel[user.role]}</b></p>
          </div>
          <div className="topActions">
            <button className="ghostButton" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "dark" ? "Светлая тема" : "Темная тема"}</button>
            <button className="ghostButton" onClick={logout}>Выйти</button>
          </div>
        </section>

        {message ? <div className={`message ${state}`}>{message}</div> : null}

        <section className="moduleSwitch" aria-label="Разделы ProObject">
          <button type="button" className={activeModule === "journal" ? "active" : ""} onClick={() => setActiveModule("journal")}>Журнал работ</button>
          <button type="button" className={activeModule === "map" ? "active" : ""} onClick={() => setActiveModule("map")}>Карта объекта</button>
        </section>

        {activeModule === "map" ? (
          <MapObjectModule
            user={user}
            bootstrap={bootstrap}
            objectId={objectId}
            setObjectId={setObjectId}
            selectedObject={selectedObject || null}
            filteredSites={filteredSites}
            journal={bootstrap.journal}
            manageable={manageable}
          />
        ) : (
        <section className="grid">
          <div className="mainStack">
            <div className="formCard">
              <div className="cardTitle">
                <div>
                  <h2>Общий журнал работ</h2>
                  <p>{writable ? "Заполните запись или просмотрите историю." : "Доступен просмотр истории и фото."}</p>
                </div>
                <div className="journalHeaderActions">
                  <div className={`statusPill ${state === "success" ? "ready" : ""}`}>{editing ? "Редактирование" : state === "success" ? "Готово" : "Запись"}</div>
                  <button className="downloadButton" type="button" onClick={handleDownloadClick}>Скачать</button>
                </div>
              </div>

              {showDownloadOptions && user.role === "administrator" ? (
                <div className="downloadPanel">
                  <div className="fieldGroup">
                    <label htmlFor="downloadObject">Журнал для скачивания</label>
                    <select id="downloadObject" className="field" value={downloadObjectId} onChange={(event) => setDownloadObjectId(event.target.value)}>
                      <option value={ALL_OBJECTS_VALUE}>Все объекты</option>
                      {bootstrap.objects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </div>
                  <button className="primaryButton" type="button" onClick={handleAdminDownload}>Скачать Excel</button>
                </div>
              ) : null}

              <form className="form" onSubmit={saveJournal}>
                <div className="twoCols">
                  <div className="fieldGroup">
                    <label htmlFor="object">Объект</label>
                    <select id="object" className="field" value={objectId} onChange={(event) => setObjectId(event.target.value)} disabled={isBusy || bootstrap.objects.length === 0}>
                      <option value="">Выберите объект</option>
                      {bootstrap.objects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </div>
                  <div className="fieldGroup">
                    <label htmlFor="site">Участок</label>
                    <select id="site" className="field" value={siteId} onChange={(event) => setSiteId(event.target.value)} disabled={isBusy || !objectId}>
                      <option value="">Все участки</option>
                      {filteredSites.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      {manageable ? <option value={CUSTOM_SITE_VALUE}>+ Свой участок</option> : null}
                    </select>
                  </div>
                </div>

                {siteId === CUSTOM_SITE_VALUE && manageable ? (
                  <div className="fieldGroup">
                    <label htmlFor="customSite">Название участка</label>
                    <input id="customSite" className="field" value={customSite} onChange={(event) => setCustomSite(event.target.value)} placeholder="Например: Секция 1, этаж 3" />
                  </div>
                ) : null}

                {writable ? (
                  <>
                    <div className="fieldGroup">
                      <label htmlFor="work">Выполненные работы</label>
                      <textarea id="work" className="field textarea" value={work} onChange={(event) => setWork(event.target.value)} placeholder="Опишите выполненные работы, объемы, замечания" />
                    </div>
                    <div className="uploadBox">
                      <input id="photo" type="file" accept="image/*" multiple onChange={handlePhotoChange} />
                      <label htmlFor="photo">{photos.length > 0 ? `Выбрано фото: ${photos.length}` : "Выбрать фото или сделать снимок"}</label>
                      {previewUrls.length > 0 ? (
                        <div className="previewGrid">
                          {previewUrls.slice(0, 6).map((url, index) => <img className="preview" src={url} alt={`Предпросмотр фото ${index + 1}`} key={url} />)}
                          {previewUrls.length > 6 ? <div className="previewMore">+{previewUrls.length - 6}</div> : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="buttonRow">
                      <button className="primaryButton" disabled={isBusy} type="submit">{editing ? "Сохранить изменения" : "Сохранить запись"}</button>
                      {editing ? <button className="ghostButton" type="button" onClick={() => { setEditing(null); setWork(""); setPhotos([]); }}>Отменить</button> : null}
                    </div>
                  </>
                ) : null}
              </form>
            </div>

            <div className="formCard">
              <div className="cardTitle">
                <div>
                  <h2>История записей</h2>
                  <p>Фильтр по выбранному объекту, участку и поиску.</p>
                </div>
                <button className="ghostButton" onClick={loadData}>Обновить</button>
              </div>
              <input className="field" placeholder="Поиск по журналу" value={query} onChange={(event) => setQuery(event.target.value)} />
              <div className="journalList">
                {visibleJournal.length === 0 ? <div className="empty">Записей пока нет</div> : null}
                {visibleJournal.map((entry) => {
                  const hideObjectInCustomerView = user.role === "customer" && Boolean(objectId);
                  return (
                    <article className="journalItem" key={entry.id}>
                      <div className="journalHead">
                        <div className="journalMeta">
                          {hideObjectInCustomerView ? null : <strong>{entry.object}</strong>}
                          <span>{entry.site} · {formatDate(entry.date)}</span>
                        </div>
                        <div className="journalActions">
                          {(() => {
                            const photoUrls = splitPhotoUrls(entry.photoUrl);
                            if (photoUrls.length === 0) return <span className="noPhoto">Без фото</span>;
                            return (
                              <button className="photoLink" type="button" style={{ border: 0 }} onClick={() => openPhotoViewer(photoUrls, 0)}>
                                {photoUrls.length === 1 ? "Фото" : `Фото: ${photoUrls.length}`}
                              </button>
                            );
                          })()}
                          {manageable ? <div className="miniActions"><button onClick={() => startEdit(entry)}>Править</button><button onClick={() => deleteEntry(entry.id)}>Удалить</button></div> : null}
                        </div>
                      </div>
                      <p>{entry.work}</p>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>

          <aside className="sideStack">
            {selectedObject?.details ? (
              <details className="sideCard objectDetailsPanel">
                <summary className="objectSummary">Карточка объекта</summary>
                <div className="objectInfo">
                  {objectCardSections.map((section) => {
                    const visibleFields = section.fields
                      .map(([key, label]) => ({ key, label, value: detailValue(selectedObject.details, key) }))
                      .filter((field) => field.value);

                    if (visibleFields.length === 0) return null;

                    return (
                      <section className="objectInfoSection" key={section.title}>
                        <h4>{section.title}</h4>
                        {visibleFields.map((field) => (
                          <div key={field.key}><span>{field.label}</span><b>{field.value}</b></div>
                        ))}
                      </section>
                    );
                  })}
                </div>
              </details>
            ) : null}

            {manageable ? (
              <details className="sideCard collapsibleSideCard">
                <summary>Права роли</summary>
                <div className="sideCardBody">
                  <h3>Роль: {roleLabel[user.role]}</h3>
                  <ul className="checkList">
                    <li>Заказчик: просмотр истории и фото</li>
                    <li>Подрядчик: добавление записей и фото</li>
                    <li>Куратор: управление назначенными объектами</li>
                    <li>Администратор: полный доступ ко всем объектам</li>
                  </ul>
                </div>
              </details>
            ) : null}

            {manageable ? (
              <details className="sideCard collapsibleSideCard">
                <summary>Пользователи</summary>
                <div className="sideCardBody">
                <h3>Пользователи</h3>
                <div className="fieldGroup compact">
                  <label>{editingUser ? "Редактируемый пользователь" : "Новый пользователь"}</label>
                  <input className="field" value={newUserLogin} onChange={(event) => setNewUserLogin(event.target.value)} placeholder="Логин" />
                  <input className="field" type="password" value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} placeholder={editingUser ? "Новый пароль, если нужно изменить" : "Пароль"} />
                  <select className="field" value={newUserRole} onChange={(event) => setNewUserRole(event.target.value as UserRole)}>
                    <option value="customer">Заказчик</option>
                    <option value="contractor">Подрядчик</option>
                    <option value="curator">Куратор</option>
                    <option value="administrator">Администратор</option>
                  </select>
                  <input className="field" value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} placeholder="Email для уведомлений" />
                  {newUserRole !== "administrator" ? (
                    <div className="accessBox">
                      <label>Доступные объекты</label>
                      {bootstrap.objects.map((obj) => (
                        <label key={obj.id} className="checkRow">
                          <input
                            type="checkbox"
                            checked={newUserObjects.includes(obj.id)}
                            onChange={(event) => setNewUserObjects((current) => event.target.checked ? [...current, obj.id] : current.filter((id) => id !== obj.id))}
                          />
                          <span>{obj.name}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                  <div className="buttonRow tight">
                    <button className="primaryButton" type="button" onClick={saveUser}>{editingUser ? "Сохранить" : "Добавить"}</button>
                    {editingUser ? <button className="ghostButton" type="button" onClick={resetUserForm}>Отменить</button> : null}
                  </div>
                </div>
                <div className="userList">
                  {(bootstrap.users || []).map((item) => (
                    <div key={item.id} className="userRow">
                      <div>
                        <b>{item.login}</b>
                        <span>{item.roleName}{item.email ? ` · ${item.email}` : ""}</span><span>{item.objects?.includes("*") ? "Все объекты" : (item.objects || []).join(", ")}</span>
                      </div>
                      <div className="miniActions">
                        <button type="button" onClick={() => startUserEdit(item)}>Править</button>
                        <button type="button" onClick={() => deleteUser(item.id, item.login)} disabled={item.login === user.id}>Удалить</button>
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              </details>
            ) : null}

            {manageable ? (
              <details className="sideCard collapsibleSideCard">
                <summary>Управление справочниками</summary>
                <div className="sideCardBody">
                <h3>Управление справочниками</h3>
                <div className="fieldGroup compact">
                  <label>Новый объект</label>
                  <input className="field" value={newObject} onChange={(event) => setNewObject(event.target.value)} placeholder="Название объекта" />
                  <button className="primaryButton" onClick={createObject}>Добавить объект</button>
                </div>
                <div className="objectList">
                  {bootstrap.objects.map((item) => <div key={item.id}><span>{item.name}</span><button onClick={() => deleteObject(item.id)}>×</button></div>)}
                </div>
                <div className="fieldGroup compact">
                  <label>Новый участок для выбранного объекта</label>
                  <input className="field" value={newSite} onChange={(event) => setNewSite(event.target.value)} placeholder="Название участка" />
                  <button className="primaryButton" onClick={createSite}>Добавить участок</button>
                </div>
                <div className="objectList">
                  {filteredSites.map((item) => <div key={item.id}><span>{item.name}</span><button onClick={() => deleteSite(item.id)}>×</button></div>)}
                </div>
                </div>
              </details>
            ) : null}
          </aside>
        </section>
        )}
      </div>
      {photoViewer ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.86)", display: "grid", placeItems: "center", padding: 16 }}
          onClick={() => setPhotoViewer(null)}
        >
          <div
            style={{ width: "min(960px, 100%)", maxHeight: "92vh", border: "1px solid rgba(255,255,255,.18)", borderRadius: 24, background: "#050505", padding: 14, boxShadow: "0 24px 80px rgba(0,0,0,.55)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <b style={{ color: "#fff" }}>Фото {photoViewer.index + 1} из {photoViewer.urls.length}</b>
              <div className="miniActions">
                <a href={photoViewer.urls[photoViewer.index]} target="_blank" rel="noreferrer">Открыть</a>
                <button type="button" onClick={() => setPhotoViewer(null)}>Закрыть</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: photoViewer.urls.length > 1 ? "44px 1fr 44px" : "1fr", gap: 10, alignItems: "center" }}>
              {photoViewer.urls.length > 1 ? <button className="ghostButton" type="button" onClick={() => shiftPhotoViewer(-1)}>‹</button> : null}
              <img
                src={driveImagePreviewUrl(photoViewer.urls[photoViewer.index])}
                alt={`Фото ${photoViewer.index + 1}`}
                style={{ width: "100%", maxHeight: "72vh", objectFit: "contain", borderRadius: 18, background: "#000" }}
              />
              {photoViewer.urls.length > 1 ? <button className="ghostButton" type="button" onClick={() => shiftPhotoViewer(1)}>›</button> : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

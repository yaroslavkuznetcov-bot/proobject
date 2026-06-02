"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type { AppUser, JournalBootstrapData, JournalEntry, JournalPayload, ManagedUser, UserRole } from "@/lib/types";

const CUSTOM_SITE_VALUE = "__custom__";
const MAX_PHOTO_SIZE_MB = 8;

type SubmitState = "idle" | "loading" | "success" | "error";
type Theme = "light" | "dark";

const roleLabel: Record<UserRole, string> = {
  customer: "Заказчик",
  contractor: "Подрядчик",
  curator: "Куратор"
};

function canWrite(role?: UserRole) {
  return role === "contractor" || role === "curator";
}

function canManage(role?: UserRole) {
  return role === "curator";
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

export default function HomePage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [theme, setTheme] = useState<Theme>("light");

  const [bootstrap, setBootstrap] = useState<JournalBootstrapData>({ objects: [], sites: [], journal: [] });
  const [objectId, setObjectId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [customSite, setCustomSite] = useState("");
  const [work, setWork] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [newObject, setNewObject] = useState("");
  const [newSite, setNewSite] = useState("");
  const [newUserLogin, setNewUserLogin] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("contractor");
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const saved = localStorage.getItem("proobject_user");
    if (saved) setUser(JSON.parse(saved));
  }, []);

  useEffect(() => {
    if (!photo) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function loadData() {
    setState("loading");
    setMessage("Загружаем данные…");
    try {
      const response = await fetch("/api/data", { cache: "no-store" });
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
    const file = event.target.files?.[0] || null;
    if (!file) return setPhoto(null);
    if (!file.type.startsWith("image/")) {
      setState("error");
      setMessage("Можно прикрепить только изображение");
      return;
    }
    if (file.size > MAX_PHOTO_SIZE_MB * 1024 * 1024) {
      setState("error");
      setMessage(`Фото должно быть не больше ${MAX_PHOTO_SIZE_MB} МБ`);
      return;
    }
    setPhoto(file);
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
        object: selectedObject.name,
        objectId: selectedObject.id,
        site: siteName,
        work: work.trim()
      };
      if (photo) {
        payload.photo = await fileToBase64(photo);
        payload.fileName = photo.name;
        payload.fileMimeType = photo.type;
      }
      const response = await fetch("/api/journal", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await response.json();
      if (!response.ok || json.status === "ERROR") throw new Error(json.message || "Не удалось сохранить запись");
      setWork("");
      setPhoto(null);
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
      body: JSON.stringify({ id })
    });
    const json = await response.json();
    if (!response.ok || json.status === "ERROR") setMessage(json.message || "Не удалось удалить запись");
    else await loadData();
  }

  async function createObject() {
    if (!newObject.trim()) return;
    await fetch("/api/objects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newObject.trim() }) });
    setNewObject("");
    await loadData();
  }

  async function deleteObject(id: string) {
    if (!confirm("Удалить объект? Участки и старые записи останутся в таблице.")) return;
    await fetch("/api/objects", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await loadData();
  }

  async function createSite() {
    if (!newSite.trim() || !objectId) return;
    await fetch("/api/sites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newSite.trim(), objectId }) });
    setNewSite("");
    await loadData();
  }

  async function deleteSite(id: string) {
    if (!confirm("Удалить участок из справочника?")) return;
    await fetch("/api/sites", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await loadData();
  }

  function resetUserForm() {
    setNewUserLogin("");
    setNewUserPassword("");
    setNewUserRole("contractor");
    setEditingUser(null);
  }

  function startUserEdit(item: ManagedUser) {
    setEditingUser(item);
    setNewUserLogin(item.login);
    setNewUserPassword("");
    setNewUserRole(item.role);
  }

  async function saveUser() {
    if (!newUserLogin.trim()) return setMessage("Введите логин пользователя");
    if (!editingUser && !newUserPassword) return setMessage("Введите пароль пользователя");

    const response = await fetch("/api/users", {
      method: editingUser ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingUser?.id,
        login: newUserLogin.trim(),
        password: newUserPassword,
        role: newUserRole
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
      body: JSON.stringify({ id })
    });
    const json = await response.json();
    if (!response.ok || json.status === "ERROR") setMessage(json.message || "Не удалось удалить пользователя");
    else await loadData();
  }

  if (!user) {
    return (
      <main className="page authPage">
        <section className="loginCard">
          <div className="brandLine"><h1>ProОбъект</h1><span className="versionBadge">v0.3.1</span></div>
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
            <div className="brandLine"><h1>ProОбъект</h1><span className="versionBadge">v0.3.1</span></div>
            <p className="heroSubtitle">система автоматизированного сбора информации</p>
            <p className="heroText">Вы вошли как <b>{roleLabel[user.role]}</b></p>
          </div>
          <div className="topActions">
            <button className="ghostButton" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? "Темная тема" : "Светлая тема"}</button>
            <button className="ghostButton" onClick={logout}>Выйти</button>
          </div>
        </section>

        {message ? <div className={`message ${state}`}>{message}</div> : null}

        <section className="grid">
          <div className="mainStack">
            <div className="formCard">
              <div className="cardTitle">
                <div>
                  <h2>Общий журнал работ</h2>
                  <p>{writable ? "Заполните запись или просмотрите историю." : "Доступен просмотр истории и фото."}</p>
                </div>
                <div className={`statusPill ${state === "success" ? "ready" : ""}`}>{editing ? "Редактирование" : state === "success" ? "Готово" : "Запись"}</div>
              </div>

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
                      <input id="photo" type="file" accept="image/*" onChange={handlePhotoChange} />
                      <label htmlFor="photo">{photo ? photo.name : "Выбрать фото или сделать снимок"}</label>
                      {previewUrl ? <img className="preview" src={previewUrl} alt="Предпросмотр фото" /> : null}
                    </div>
                    <div className="buttonRow">
                      <button className="primaryButton" disabled={isBusy} type="submit">{editing ? "Сохранить изменения" : "Сохранить запись"}</button>
                      {editing ? <button className="ghostButton" type="button" onClick={() => { setEditing(null); setWork(""); setPhoto(null); }}>Отменить</button> : null}
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
                          {entry.photoUrl ? <a className="photoLink" href={entry.photoUrl} target="_blank" rel="noreferrer">Фото</a> : <span className="noPhoto">Без фото</span>}
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
            {manageable ? (
              <div className="sideCard">
                <h3>Роль: {roleLabel[user.role]}</h3>
                <ul className="checkList">
                  <li>Заказчик: просмотр истории и фото</li>
                  <li>Подрядчик: добавление записей и фото</li>
                  <li>Куратор: полное управление</li>
                </ul>
              </div>
            ) : null}

            {manageable ? (
              <div className="sideCard">
                <h3>Пользователи</h3>
                <div className="fieldGroup compact">
                  <label>{editingUser ? "Редактируемый пользователь" : "Новый пользователь"}</label>
                  <input className="field" value={newUserLogin} onChange={(event) => setNewUserLogin(event.target.value)} placeholder="Логин" />
                  <input className="field" type="password" value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} placeholder={editingUser ? "Новый пароль, если нужно изменить" : "Пароль"} />
                  <select className="field" value={newUserRole} onChange={(event) => setNewUserRole(event.target.value as UserRole)}>
                    <option value="customer">Заказчик</option>
                    <option value="contractor">Подрядчик</option>
                    <option value="curator">Куратор</option>
                  </select>
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
                        <span>{item.roleName}</span>
                      </div>
                      <div className="miniActions">
                        <button type="button" onClick={() => startUserEdit(item)}>Править</button>
                        <button type="button" onClick={() => deleteUser(item.id, item.login)} disabled={item.login === user.id}>Удалить</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {manageable ? (
              <div className="sideCard">
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
            ) : null}
          </aside>
        </section>
      </div>
    </main>
  );
}

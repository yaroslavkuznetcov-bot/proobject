import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function proxy(action: string, data: unknown = {}) {
  const apiUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
  if (!apiUrl) return NextResponse.json({ message: "Не задана переменная APPS_SCRIPT_WEB_APP_URL" }, { status: 500 });

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, data }),
    cache: "no-store"
  });

  const text = await response.text();
  try { return NextResponse.json(JSON.parse(text), { status: response.status }); }
  catch { return NextResponse.json({ status: text || "OK" }, { status: response.status }); }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return proxy("getUsers", { login: searchParams.get("login") || "" });
}

export async function POST(request: Request) {
  const data = (await request.json()) as { currentLogin?: string; login?: string; password?: string; role?: string; objects?: string[]; email?: string };
  if (!data.login?.trim() || !data.password) return NextResponse.json({ message: "Введите логин и пароль" }, { status: 400 });
  return proxy("addUser", data);
}

export async function PATCH(request: Request) {
  const data = (await request.json()) as { currentLogin?: string; id?: string; login?: string; password?: string; role?: string; objects?: string[]; email?: string };
  if (!data.id || !data.login?.trim()) return NextResponse.json({ message: "Не передан ID пользователя или логин" }, { status: 400 });
  return proxy("updateUser", data);
}

export async function DELETE(request: Request) {
  const data = (await request.json()) as { currentLogin?: string; id?: string };
  if (!data.id) return NextResponse.json({ message: "Не передан ID пользователя" }, { status: 400 });
  return proxy("deleteUser", data);
}

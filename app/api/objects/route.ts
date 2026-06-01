import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function proxy(action: string, data: unknown) {
  const apiUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
  if (!apiUrl) return NextResponse.json({ message: "Не задана переменная APPS_SCRIPT_WEB_APP_URL" }, { status: 500 });

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, data })
  });
  const text = await response.text();
  try { return NextResponse.json(JSON.parse(text), { status: response.status }); }
  catch { return NextResponse.json({ status: text || "OK" }, { status: response.status }); }
}

export async function POST(request: Request) {
  const data = (await request.json()) as { name?: string };
  if (!data.name?.trim()) return NextResponse.json({ message: "Введите название объекта" }, { status: 400 });
  return proxy("addObject", data);
}

export async function DELETE(request: Request) {
  const data = (await request.json()) as { id?: string };
  if (!data.id) return NextResponse.json({ message: "Не передан ID объекта" }, { status: 400 });
  return proxy("deleteObject", data);
}

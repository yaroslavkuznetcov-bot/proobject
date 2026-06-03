import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const apiUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
  if (!apiUrl) return NextResponse.json({ message: "Не задана переменная APPS_SCRIPT_WEB_APP_URL" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const login = searchParams.get("login") || "";

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "getData", data: { login } }),
    cache: "no-store"
  });

  const text = await response.text();
  try { return NextResponse.json(JSON.parse(text), { status: response.status }); }
  catch { return NextResponse.json({ message: "Apps Script вернул не JSON", details: text }, { status: 502 }); }
}

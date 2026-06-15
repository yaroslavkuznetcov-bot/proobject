import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function proxy(action: string, data: unknown = {}) {
  const apiUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
  if (!apiUrl) return NextResponse.json({ status: "ERROR", message: "Не задана переменная APPS_SCRIPT_WEB_APP_URL" }, { status: 500 });

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, data }),
    cache: "no-store"
  });

  const text = await response.text();
  try { return NextResponse.json(JSON.parse(text), { status: response.status }); }
  catch { return NextResponse.json({ status: "ERROR", message: "Apps Script вернул не JSON", details: text }, { status: 502 }); }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return proxy("getMapData", {
    login: searchParams.get("login") || "",
    objectId: searchParams.get("objectId") || ""
  });
}

export async function POST(request: Request) {
  const data = await request.json();
  const action = typeof data.action === "string" ? data.action : "saveMapItem";
  return proxy(action, data);
}

export async function PATCH(request: Request) {
  const data = await request.json();
  return proxy("updateMapItem", data);
}

export async function DELETE(request: Request) {
  const data = await request.json();
  return proxy("deleteMapItem", data);
}

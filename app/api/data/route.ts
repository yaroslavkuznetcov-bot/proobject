import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const apiUrl = process.env.APPS_SCRIPT_WEB_APP_URL;

  if (!apiUrl) {
    return NextResponse.json(
      { message: "Не задана переменная APPS_SCRIPT_WEB_APP_URL" },
      { status: 500 }
    );
  }

  const response = await fetch(`${apiUrl}?action=getData`, {
    method: "GET",
    cache: "no-store"
  });

  const text = await response.text();

  if (!response.ok) {
    return NextResponse.json(
      { message: "Apps Script вернул ошибку", details: text },
      { status: response.status }
    );
  }

  try {
    return NextResponse.json(JSON.parse(text));
  } catch {
    return NextResponse.json(
      { message: "Apps Script вернул не JSON", details: text },
      { status: 502 }
    );
  }
}

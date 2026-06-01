import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getAppsScriptUrl() {
  const url = process.env.APPS_SCRIPT_WEB_APP_URL;
  if (!url) {
    throw new Error("Не задана переменная APPS_SCRIPT_WEB_APP_URL");
  }
  return url;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { login?: string; password?: string };

    const response = await fetch(getAppsScriptUrl(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "authenticate",
        data: {
          login: String(body.login || "").trim(),
          password: String(body.password || "")
        }
      }),
      cache: "no-store"
    });

    const result = await response.json();

    if (result.status !== "OK" || !result.user) {
      return NextResponse.json(
        { message: result.message || "Неверный логин или пароль" },
        { status: 401 }
      );
    }

    return NextResponse.json({ user: result.user });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Ошибка авторизации" },
      { status: 500 }
    );
  }
}

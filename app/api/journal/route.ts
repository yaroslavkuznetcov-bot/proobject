import { NextResponse } from "next/server";
import type { JournalPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

async function proxyToAppsScript(action: string, data: unknown) {
  const apiUrl = process.env.APPS_SCRIPT_WEB_APP_URL;

  if (!apiUrl) {
    return NextResponse.json(
      { message: "Не задана переменная APPS_SCRIPT_WEB_APP_URL" },
      { status: 500 }
    );
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, data })
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
    return NextResponse.json({ status: text || "OK" });
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as JournalPayload & { action?: string };

  if (payload.action === "appendJournalPhotos") {
    if (!payload.id || !payload.login) {
      return NextResponse.json({ message: "Не передан ID записи или пользователь" }, { status: 400 });
    }
    return proxyToAppsScript("appendJournalPhotos", payload);
  }

  if (!payload.object || !payload.objectId || !payload.site || !payload.work?.trim()) {
    return NextResponse.json(
      { message: "Заполните объект, участок и выполненные работы" },
      { status: 400 }
    );
  }

  return proxyToAppsScript("saveData", payload);
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as JournalPayload;

  if (!payload.id || !payload.work?.trim()) {
    return NextResponse.json(
      { message: "Не передан ID записи или текст работ" },
      { status: 400 }
    );
  }

  return proxyToAppsScript("updateJournalEntry", payload);
}

export async function DELETE(request: Request) {
  const payload = (await request.json()) as { id?: string };

  if (!payload.id) {
    return NextResponse.json({ message: "Не передан ID записи" }, { status: 400 });
  }

  return proxyToAppsScript("deleteJournalEntry", payload);
}

import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
const AIRTABLE_TABLE_ID = process.env.AIRTABLE_TABLE_ID!;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!;

function extractTimeFromDate(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

async function getReservationByUserId(userId: string) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?filterByFormula=({userId_}='${userId}')&maxRecords=1`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    }
  });

  if (!res.ok) {
    throw new Error(`Airtable API error: ${res.statusText}`);
  }

  const data = await res.json();
  if (!data.records || data.records.length === 0) {
    return null;
  }
  return data.records[0];
}

async function sendLineMessage(userId: string, message: string) {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: "text", text: message }],
    }),
  });
  return res;
}

async function handleSendMessage(userId: string, date: string) {
  if (!userId || !date) {
    return NextResponse.json({ error: "缺少 userId 或 date" }, { status: 400 });
  }

  const reservation = await getReservationByUserId(userId);
  if (!reservation) {
    return NextResponse.json({ error: "找不到預約資料" }, { status: 404 });
  }

  const time = extractTimeFromDate(date);
  const message = `嗨嗨~🔉預約提醒通知\n我們明天 ${time} 見唷🌝🌝`;

  const lineRes = await sendLineMessage(userId, message);

  if (!lineRes.ok) {
    const errText = await lineRes.text();
    return NextResponse.json({ error: "LINE 發送失敗", detail: errText }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest) {
  try {
    const { userId, date } = await req.json();
    return await handleSendMessage(userId, date);
  } catch (err: any) {
    return NextResponse.json({ error: "伺服器錯誤", detail: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") ?? "";
    const date = url.searchParams.get("date") ?? "";
    return await handleSendMessage(userId, date);
  } catch (err: any) {
    return NextResponse.json({ error: "伺服器錯誤", detail: err.message }, { status: 500 });
  }
}

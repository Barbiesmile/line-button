import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs"; // 避免 edge 超時

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
const AIRTABLE_TABLE_ID = process.env.AIRTABLE_TABLE_ID!;

const LINE_TOKENS: Record<string, string> = {
  "ltf8289j": process.env.LINE_CHANNEL_ACCESS_TOKEN_A!, // 預設主帳號
  "980hrcnx": process.env.LINE_CHANNEL_ACCESS_TOKEN_B!,
};

function extractTimeFromDate(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

async function fetchWithTimeout(resource: string, options: RequestInit = {}, timeout = 10000) {
  return Promise.race([
    fetch(resource, options),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeout)),
  ]);
}

async function getReservationByUserId(userId: string) {
  const formula = encodeURIComponent(`{userId_}='${userId}'`);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?filterByFormula=${formula}&maxRecords=1`;

  const res = await fetchWithTimeout(url, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    },
  });

  if (!res.ok) throw new Error(`Airtable API error: ${res.status}`);
  const data = await res.json();
  if (!data.records || data.records.length === 0) return null;
  return data.records[0];
}

async function sendLineMessage(userId: string, message: string, accessToken: string) {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
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

  // 取出 lineAccount 欄位（可能是 lookup 欄位回傳陣列）
  const lineAccountRaw = reservation.fields.lineAccount;
  const lineAccount = Array.isArray(lineAccountRaw) ? lineAccountRaw[0] : lineAccountRaw;

  const accessToken = LINE_TOKENS[lineAccount] || LINE_TOKENS["ltf8289j"]; // 預設主帳號

  const time = extractTimeFromDate(date);
  const message = `預約提醒通知🔉\n👋嗨嗨~我們明天 ${time} 見唷😊😊`;

  const lineRes = await sendLineMessage(userId, message, accessToken);
  if (!lineRes.ok) {
    const errText = await lineRes.text();
    return NextResponse.json({ error: "LINE 發送失敗", detail: errText }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// Airtable 觸發按鈕
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

// POST 測試
export async function POST(req: NextRequest) {
  try {
    const { userId, date } = await req.json();
    return await handleSendMessage(userId, date);
  } catch (err: any) {
    return NextResponse.json({ error: "伺服器錯誤", detail: err.message }, { status: 500 });
  }
}

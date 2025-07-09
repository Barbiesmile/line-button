import { NextRequest, NextResponse } from "next/server";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
const AIRTABLE_TABLE_ID = process.env.AIRTABLE_TABLE_ID!;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!;

// 你之前寫的 fetchWithTimeout 和其他函數...

async function getReservationByUserId(userId: string) {
  const formula = encodeURIComponent(`{userId_}='${userId}'`);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?filterByFormula=${formula}&maxRecords=1`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  });

  if (!res.ok) throw new Error(`Airtable API error: ${res.status}`);

  const data = await res.json();
  if (!data.records || data.records.length === 0) return null;
  return data.records[0];
}

// 其餘函數和 POST/GET handler 照舊

export const runtime = "nodejs"; // 或直接移除 runtime 宣告

async function fetchWithTimeout(resource, options = {}, timeout = 10000) {
  return Promise.race([
    fetch(resource, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeout)),
  ]);
}

async function getReservationByUserId(userId) {
  const formula = encodeURIComponent(`{userId_}='${userId}'`);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?filterByFormula=${formula}&maxRecords=1`;

  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  });

  if (!res.ok) {
    throw new Error(`Airtable API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  if (!data.records || data.records.length === 0) {
    return null;
  }
  return data.records[0];
}

async function sendLineMessage(userId, message) {
  const res = await fetchWithTimeout("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to: userId, messages: [{ type: "text", text: message }] }),
  });

  return res;
}

export async function POST(req) {
  try {
    const { userId, date } = await req.json();
    if (!userId || !date) return NextResponse.json({ error: "缺少 userId 或 date" }, { status: 400 });

    const reservation = await getReservationByUserId(userId);
    if (!reservation) return NextResponse.json({ error: "找不到預約資料" }, { status: 404 });

    const time = new Date(date).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
    const message = `嗨嗨~🔉預約提醒通知\n我們明天 ${time} 見唷🌝🌝`;

    const lineRes = await sendLineMessage(userId, message);
    if (!lineRes.ok) {
      const errText = await lineRes.text();
      return NextResponse.json({ error: "LINE 發送失敗", detail: errText }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "伺服器錯誤", detail: error.message }, { status: 500 });
  }
}

import { sendGmailMessage } from "./google.js";

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function formatDate(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

export async function sendInviteEmail({ event, friendName, friendEmail }) {
  const dateStr  = formatDate(event.date);
  const timeStr  = `${formatTime(event.startTime)}${event.endTime ? ` – ${formatTime(event.endTime)}` : ""}`;
  const locLine  = event.location ? `<br><strong>Where:</strong> ${event.location}` : "";
  const firstLine = event.message.split(/\n/)[0].replace(/^hey[\s\w,!]*/i, "").trim();
  const subject  = firstLine.length > 8 ? firstLine : `Hanging out ${new Date(event.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}?`;

  const messageHtml = event.message
    .split(/\n/)
    .map(l => `<p style="font-size:16px;line-height:1.6;margin:0 0 10px">${l}</p>`)
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; color: #111827;">
  ${messageHtml}
  <div style="background: #f9fafb; border-radius: 12px; padding: 16px; margin: 20px 0; border: 1px solid #e5e7eb;">
    <div style="color: #6b7280; font-size: 14px;">
      <strong>When:</strong> ${dateStr}, ${timeStr}${locLine}
    </div>
  </div>
  <p style="font-size: 12px; color: #9ca3af; margin-top: 30px;">Just reply to this email — whatever's easiest.</p>
</body>
</html>`;

  await sendGmailMessage({ to: friendEmail, subject, html });
}

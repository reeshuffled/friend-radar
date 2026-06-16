import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

export async function sendIMessage(handle, text) {
  const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  const serviceType = handle.includes("@") ? "iMessage" : "SMS";
  const script = `tell application "Messages"
  set s to first service whose service type = ${serviceType}
  set b to buddy "${handle}" of s
  send "${escaped}" to b
end tell`;
  await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
}

export async function syncAppleContacts() {
  const script = `
tell application "Contacts"
  set output to ""
  repeat with p in people
    set cid to id of p
    set n to name of p
    set ph to ""
    set em to ""
    if (count of phones of p) > 0 then set ph to value of first phone of p
    if (count of emails of p) > 0 then set em to value of first email of p
    set output to output & cid & "|" & n & "|" & ph & "|" & em & "\\n"
  end repeat
  return output
end tell`;
  const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [appleContactId, name, phone, email] = line.split("|");
      return { appleContactId, name, phone: phone ?? "", email: email ?? "" };
    });
}

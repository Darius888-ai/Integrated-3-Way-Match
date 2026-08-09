import { MatchResult } from "../types";

/**
 * Helper to convert a Blob into a base64 encoded string.
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64 = base64String.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Builds a multipart/mixed MIME message and sends it via Gmail API.
 */
export async function sendPaymentsExcelEmail({
  accessToken,
  recipient,
  subject,
  htmlBody,
  excelBlob,
  filename
}: {
  accessToken: string;
  recipient: string;
  subject: string;
  htmlBody: string;
  excelBlob: Blob;
  filename: string;
}): Promise<any> {
  const base64Excel = await blobToBase64(excelBlob);
  const boundary = `boon_huat_ap_boundary_${Date.now()}`;

  const mimeParts = [
    `To: ${recipient}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    htmlBody,
    ``,
    `--${boundary}`,
    `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="${filename}"`,
    `Content-Disposition: attachment; filename="${filename}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    base64Excel,
    ``,
    `--${boundary}--`
  ];

  const rawMime = mimeParts.join("\r\n");

  // Base64URL-encode the Unicode MIME message
  const utf8Bytes = new TextEncoder().encode(rawMime);
  let binary = "";
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  
  const base64UrlSafe = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      raw: base64UrlSafe
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || 
      `Gmail API returned error status: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

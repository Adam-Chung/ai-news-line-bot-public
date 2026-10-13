/** 將常用 HTML entity 解碼一次，並把 `&amp;` 留到最後以避免重複解碼。 */
function decodeHtmlEntitiesOnce(value: string): string {
  return value
    .replace(/&quot;/giu, "\"")
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&amp;/giu, "&");
}

interface ParsedHtmlTag {
  name: string;
  closing: boolean;
  selfClosing: boolean;
}

/** 找出 tag 的結尾，並忽略引號內的 `>`，避免提早截斷 attribute。 */
function findTagEnd(value: string, start: number): number {
  let quote = "";
  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index]!;
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") return index;
  }
  return -1;
}

/** 判斷字元是否可出現在一般 HTML tag name。 */
function isTagNameCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return (code >= 48 && code <= 57)
    || (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
    || character === "-"
    || character === ":";
}

/** 從已知 tag 邊界解析名稱與開關狀態，不解讀 attribute 內容。 */
function parseTag(value: string, start: number, end: number): ParsedHtmlTag | null {
  let cursor = start + 1;
  while (cursor < end && /\s/u.test(value[cursor]!)) cursor += 1;
  const closing = value[cursor] === "/";
  if (closing) cursor += 1;
  while (cursor < end && /\s/u.test(value[cursor]!)) cursor += 1;
  const nameStart = cursor;
  while (cursor < end && isTagNameCharacter(value[cursor]!)) cursor += 1;
  if (cursor === nameStart) return null;
  return {
    name: value.slice(nameStart, cursor).toLocaleLowerCase("en-US"),
    closing,
    selfClosing: value.slice(start, end).trimEnd().endsWith("/")
  };
}

/** 尋找指定 raw-text element 的 closing tag，找不到時回傳輸入結尾。 */
function findRawTextElementEnd(value: string, start: number, tagName: string): number {
  let cursor = start;
  while (cursor < value.length) {
    const tagStart = value.indexOf("<", cursor);
    if (tagStart < 0) return value.length;
    const tagEnd = findTagEnd(value, tagStart);
    if (tagEnd < 0) return value.length;
    const tag = parseTag(value, tagStart, tagEnd);
    if (tag?.closing && tag.name === tagName) return tagEnd + 1;
    cursor = tagEnd + 1;
  }
  return value.length;
}

/** 以 bounded scanner 移除 markup，避免使用無法完整解析一般 HTML 的 filtering regex。 */
function removeHtmlMarkup(value: string): string {
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    const tagStart = value.indexOf("<", cursor);
    if (tagStart < 0) {
      chunks.push(value.slice(cursor));
      break;
    }
    chunks.push(value.slice(cursor, tagStart));
    const tagEnd = findTagEnd(value, tagStart);
    if (tagEnd < 0) {
      chunks.push(value.slice(tagStart));
      break;
    }
    const tag = parseTag(value, tagStart, tagEnd);
    if (tag && !tag.closing && !tag.selfClosing && (tag.name === "script" || tag.name === "style")) {
      cursor = findRawTextElementEnd(value, tagEnd + 1, tag.name);
    } else {
      cursor = tagEnd + 1;
    }
    chunks.push(" ");
  }
  return chunks.join("");
}

/** 將 HTML 轉成供摘要、日期辨識及純文字傳送使用的單行文字。 */
export function plainTextFromHtml(value: string, maxLength?: number): string {
  const normalized = decodeHtmlEntitiesOnce(removeHtmlMarkup(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, " "))
    .replace(/\s+/gu, " ")
    .trim();
  return maxLength === undefined ? normalized : normalized.slice(0, maxLength);
}

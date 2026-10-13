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

/** 將 HTML 轉成供摘要、日期辨識及純文字傳送使用的單行文字。 */
export function plainTextFromHtml(value: string, maxLength?: number): string {
  const normalized = decodeHtmlEntitiesOnce(value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/giu, " ")
    .replace(/<[^>]*>/gu, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, " "))
    .replace(/\s+/gu, " ")
    .trim();
  return maxLength === undefined ? normalized : normalized.slice(0, maxLength);
}

/** Arabic-script letters and digits → ASCII for URL slugs. */
const ARABIC_TO_LATIN: Record<string, string> = {
  ا: "a",
  أ: "a",
  إ: "i",
  آ: "aa",
  ٱ: "a",
  ء: "",
  ب: "b",
  ت: "t",
  ث: "th",
  ج: "j",
  ح: "h",
  خ: "kh",
  د: "d",
  ذ: "dh",
  ر: "r",
  ز: "z",
  س: "s",
  ش: "sh",
  ص: "s",
  ض: "d",
  ط: "t",
  ظ: "z",
  ع: "a",
  غ: "gh",
  ف: "f",
  ق: "q",
  ك: "k",
  ل: "l",
  م: "m",
  ن: "n",
  ه: "h",
  و: "w",
  ي: "y",
  ى: "a",
  ة: "a",
  ئ: "y",
  ؤ: "w",
  پ: "p",
  چ: "ch",
  ژ: "zh",
  گ: "g",
  ک: "k",
  ی: "y",
  ۀ: "h",
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
};

const COMBINING_AND_TATWEEL =
  /[\u0300-\u036f\u0640\u064b-\u065f\u0670\u06d6-\u06ed]/g;

function transliterateArabicScript(value: string): string {
  let result = "";
  for (const char of value) {
    const mapped = ARABIC_TO_LATIN[char];
    result += mapped !== undefined ? mapped : char;
  }
  return result;
}

/**
 * Build a URL-safe ASCII slug. Arabic (and Persian) letters are transliterated
 * so titles entered in Arabic still produce a usable slug instead of hyphens.
 */
export function slugify(value: string): string {
  const transliterated = transliterateArabicScript(
    value.normalize("NFKC").normalize("NFKD").replace(COMBINING_AND_TATWEEL, ""),
  );

  return transliterated
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const USABLE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True when the slug is URL-safe (no leading/trailing/doubled hyphens). */
export function isUsableSlug(slug: string | undefined): slug is string {
  return Boolean(slug && USABLE_SLUG.test(slug));
}

function hasLatinLetter(value: string): boolean {
  return /[a-z]/i.test(value);
}

/**
 * Prefer a value that already contains Latin letters (typical English title).
 * Otherwise transliterate the first non-empty value, including Arabic.
 */
export function slugifyPreferringLatin(...values: string[]): string {
  const latinSource = values.find((value) => hasLatinLetter(value));
  if (latinSource) {
    return slugify(latinSource);
  }

  for (const value of values) {
    const slug = slugify(value);
    if (slug) {
      return slug;
    }
  }

  return "";
}

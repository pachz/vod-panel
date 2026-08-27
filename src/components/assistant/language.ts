import type { Language } from "@/hooks/use-language";
import type { CourseSearchResult } from "./types";

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF]/;

export function containsArabic(text: string): boolean {
  return ARABIC_SCRIPT_RE.test(text);
}

export function resolveAssistantContentLanguage(
  text: string,
  uiLanguage: Language,
  courses: CourseSearchResult[] = [],
): Language {
  if (containsArabic(text)) {
    return "ar";
  }

  if (!text.trim()) {
    if (courses.some((course) => course.language === "ar" || containsArabic(course.titleAr ?? ""))) {
      return "ar";
    }
  }

  return uiLanguage;
}

import type { Doc } from "../_generated/dataModel";

const ENGLISH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "about",
  "any",
  "are",
  "can",
  "course",
  "courses",
  "find",
  "for",
  "help",
  "how",
  "i",
  "in",
  "is",
  "me",
  "my",
  "of",
  "on",
  "or",
  "please",
  "show",
  "some",
  "the",
  "to",
  "what",
  "with",
  "you",
  "your",
]);

const ARABIC_STOP_WORDS = new Set([
  "في",
  "من",
  "على",
  "عن",
  "هل",
  "مع",
  "هذا",
  "هذه",
  "الي",
  "الى",
  "إلى",
  "ان",
  "أن",
  "ما",
  "لا",
  "دورة",
  "دورات",
  "لي",
  "أريد",
  "اريد",
  "مساعدة",
]);

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function extractSignificantTerms(query: string): Array<string> {
  const normalized = normalizeForMatch(query);
  if (!normalized) {
    return [];
  }

  const stopWords = containsArabic(query) ? ARABIC_STOP_WORDS : ENGLISH_STOP_WORDS;

  return normalized
    .split(" ")
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .filter((term) => !stopWords.has(term))
    .filter((term) => (containsArabic(term) ? term.length >= 2 : term.length >= 3));
}

function buildCourseHaystack(
  course: Doc<"courses">,
  category: Doc<"categories"> | null,
): string {
  const parts = [
    course.name,
    course.name_ar,
    course.short_description,
    course.short_description_ar,
    course.description,
    course.description_ar,
    category?.name,
    category?.name_ar,
  ];

  return parts
    .filter((part): part is string => Boolean(part && part.trim().length > 0))
    .map(normalizeForMatch)
    .join(" ");
}

export function isCourseRelevantToQuery(
  course: Doc<"courses">,
  category: Doc<"categories"> | null,
  query: string,
): boolean {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return false;
  }

  const haystack = buildCourseHaystack(course, category);
  if (haystack.length === 0) {
    return false;
  }

  const normalizedQuery = normalizeForMatch(trimmedQuery);
  const terms = extractSignificantTerms(trimmedQuery);

  if (normalizedQuery.length >= 4 && haystack.includes(normalizedQuery)) {
    return true;
  }

  if (terms.length === 0) {
    return normalizedQuery.length >= 3 && haystack.includes(normalizedQuery);
  }

  const matchedTerms = terms.filter((term) => haystack.includes(term));
  if (matchedTerms.length === 0) {
    return false;
  }

  if (terms.length === 1) {
    return true;
  }

  if (terms.length === 2) {
    return matchedTerms.length === 2;
  }

  const requiredMatches = Math.max(2, Math.ceil(terms.length * 0.6));
  return matchedTerms.length >= requiredMatches;
}

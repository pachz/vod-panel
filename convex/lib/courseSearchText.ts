type CourseSearchInput = {
  name: string;
  name_ar: string;
  short_description?: string;
  short_description_ar?: string;
  description?: string;
  description_ar?: string;
  instructor?: string;
  categoryNameEn?: string;
  categoryNameAr?: string;
};

const joinParts = (parts: Array<string | undefined>) =>
  parts.filter((part) => part && part.trim().length > 0).join(" ").trim();

export function buildCourseSearchFields(input: CourseSearchInput) {
  const nameSearch = joinParts([input.name, input.name_ar]);
  const searchTextEn = joinParts([
    input.name,
    input.short_description,
    input.description,
    input.categoryNameEn,
    input.instructor,
  ]);
  const searchTextAr = joinParts([
    input.name_ar,
    input.short_description_ar,
    input.description_ar,
    input.categoryNameAr,
    input.instructor,
  ]);

  return {
    name_search: nameSearch || undefined,
    search_text_en: searchTextEn || undefined,
    search_text_ar: searchTextAr || undefined,
  };
}

import { useSearchParams } from "react-router-dom";
import { useCallback, useMemo } from "react";

export type Language = "en" | "ar";

const DEFAULT_LANGUAGE: Language = "en";

const translations = {
  en: {
    // CourseCards
    "allCourses": "All Courses",
    "discoverCourses": "Discover our comprehensive collection of courses designed to help you grow, learn, and achieve your goals.",
    "allCategories": "All categories",
    "searchCourse": "Search Course",
    "loadingCourses": "Loading courses…",
    "noCoursesMatch": "No courses match your filters.",
    "noCoursesAvailable": "No courses available yet.",
    "viewCourse": "View Course",
    "lessons": "lessons",
    "lesson": "lesson",
    "noImage": "No image",
    "uncategorized": "Uncategorized",
    "noDescription": "No description available.",
    
    // CoursePreview
    "backToCourseList": "Back to course list",
    "courseProgress": "Course progress",
    "lessonOf": "Lesson",
    "of": "of",
    "complete": "complete",
    "lessonsCompleted": "lessons completed",
    "previousLesson": "Previous Lesson",
    "nextLesson": "Next Lesson",
    "markComplete": "Mark Complete",
    "completed": "Completed",
    "overview": "Overview",
    "learningObjectives": "Learning Objectives",
    "lessonOverview": "Lesson Overview",
    "courseLessons": "Course lessons",
    "lessonPlaylist": "Lesson playlist",
    "done": "done",
    "publishLessons": "Publish lessons to make this course playable.",
    "aboutThisCourse": "About this course",
    "addShortDescription": "Add a short description to highlight the course story.",
    "duration": "Duration",
    "noVideoAvailable": "No video available",
    "addVideoUrl": "Add a video URL to this lesson to embed it here.",
    "invalidCourseId": "Invalid course identifier.",
    "loadingCourse": "Loading course experience…",
    "checkingSubscription": "Checking subscription status…",
    "courseNotFound": "Course not found",
    "courseUnavailable": "The selected course is unavailable or has been removed.",
    "backToCourseListButton": "Back to course list",
    "premiumCourse": "Premium Course",
    "unlockFullProgram": "Unlock the full program to access every lesson.",
    "membershipRequired": "Membership required",
    "unlock": "Unlock",
    "yourInvestment": "Your investment",
    "per": "per",
    "plan": "Plan",
    "subscribeUnlock": "Subscribe & Unlock",
    "backToCourses": "Back to courses",
    "unlimitedStreaming": "Unlimited HD streaming of every lesson",
    "progressTracking": "Guided progress tracking and completion badges",
    "bonusResources": "Bonus resources and worksheets per lesson",
    "subscriptionStatus": "Your subscription is currently marked as",
    "activateSubscription": "Activate it to view every lesson for this course.",
    "activeSubscriptionDescription": "An active subscription lets you stream each lesson, track your progress, and download exclusive resources.",
    "subscriptionPricing": "Subscription pricing will appear here once configured. You can still manage your plan on the payments page.",
    "publishLessonsToStart": "Publish lessons to get started.",
    "month": "month",
    "year": "year",
    "week": "week",
    "day": "day",
    "min": "min",
    "hr": "hr",
    "hours": "hours",
    "hour": "hour",
    "minutes": "minutes",
    "minute": "minute",
  },
  ar: {
    // CourseCards
    "allCourses": "جميع الدورات",
    "discoverCourses": "اكتشف مجموعتنا الشاملة من الدورات المصممة لمساعدتك على النمو والتعلم وتحقيق أهدافك.",
    "allCategories": "جميع الفئات",
    "searchCourse": "البحث عن دورة",
    "loadingCourses": "جاري تحميل الدورات…",
    "noCoursesMatch": "لا توجد دورات تطابق المرشحات الخاصة بك.",
    "noCoursesAvailable": "لا توجد دورات متاحة بعد.",
    "viewCourse": "عرض الدورة",
    "lessons": "دروس",
    "lesson": "درس",
    "noImage": "لا توجد صورة",
    "uncategorized": "غير مصنف",
    "noDescription": "لا يوجد وصف متاح.",
    
    // CoursePreview
    "backToCourseList": "العودة إلى قائمة الدورات",
    "courseProgress": "تقدم الدورة",
    "lessonOf": "الدرس",
    "of": "من",
    "complete": "مكتمل",
    "lessonsCompleted": "دروس مكتملة",
    "previousLesson": "الدرس السابق",
    "nextLesson": "الدرس التالي",
    "markComplete": "تحديد كمكتمل",
    "completed": "مكتمل",
    "overview": "نظرة عامة",
    "learningObjectives": "أهداف التعلم",
    "lessonOverview": "نظرة عامة على الدرس",
    "courseLessons": "دروس الدورة",
    "lessonPlaylist": "قائمة تشغيل الدروس",
    "done": "منجز",
    "publishLessons": "انشر الدروس لجعل هذه الدورة قابلة للتشغيل.",
    "aboutThisCourse": "حول هذه الدورة",
    "addShortDescription": "أضف وصفًا قصيرًا لتسليط الضوء على قصة الدورة.",
    "duration": "المدة",
    "noVideoAvailable": "لا يوجد فيديو متاح",
    "addVideoUrl": "أضف رابط فيديو لهذا الدرس لتضمينه هنا.",
    "invalidCourseId": "معرف الدورة غير صالح.",
    "loadingCourse": "جاري تحميل تجربة الدورة…",
    "checkingSubscription": "جاري التحقق من حالة الاشتراك…",
    "courseNotFound": "الدورة غير موجودة",
    "courseUnavailable": "الدورة المحددة غير متاحة أو تم إزالتها.",
    "backToCourseListButton": "العودة إلى قائمة الدورات",
    "premiumCourse": "دورة مميزة",
    "unlockFullProgram": "افتح البرنامج الكامل للوصول إلى كل درس.",
    "membershipRequired": "عضوية مطلوبة",
    "unlock": "فتح",
    "yourInvestment": "استثمارك",
    "per": "لكل",
    "plan": "الخطة",
    "subscribeUnlock": "اشترك وافتح",
    "backToCourses": "العودة إلى الدورات",
    "unlimitedStreaming": "بث عالي الجودة غير محدود لكل درس",
    "progressTracking": "تتبع التقدم الموجه وشارات الإنجاز",
    "bonusResources": "موارد ومخططات إضافية لكل درس",
    "subscriptionStatus": "اشتراكك محدد حاليًا كـ",
    "activateSubscription": "قم بتنشيطه لعرض كل درس لهذه الدورة.",
    "activeSubscriptionDescription": "الاشتراك النشط يتيح لك بث كل درس وتتبع تقدمك وتنزيل الموارد الحصرية.",
    "subscriptionPricing": "سيظهر تسعير الاشتراك هنا بمجرد التكوين. لا يزال بإمكانك إدارة خطتك في صفحة المدفوعات.",
    "publishLessonsToStart": "انشر الدروس للبدء.",
    "month": "شهر",
    "year": "سنة",
    "week": "أسبوع",
    "day": "يوم",
    "min": "دقيقة",
    "hr": "ساعة",
    "hours": "ساعات",
    "hour": "ساعة",
    "minutes": "دقائق",
    "minute": "دقيقة",
  },
} as const;

export function useLanguage() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const language = useMemo<Language>(() => {
    const lang = searchParams.get("lang");
    return lang === "ar" ? "ar" : DEFAULT_LANGUAGE;
  }, [searchParams]);

  const setLanguage = useCallback(
    (lang: Language) => {
      const newParams = new URLSearchParams(searchParams);
      if (lang === DEFAULT_LANGUAGE) {
        newParams.delete("lang");
      } else {
        newParams.set("lang", lang);
      }
      setSearchParams(newParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const t = useCallback(
    (key: keyof typeof translations.en): string => {
      return translations[language][key] || translations.en[key];
    },
    [language]
  );

  const translateInterval = useCallback(
    (interval: string): string => {
      const normalizedInterval = interval.toLowerCase();
      const key = normalizedInterval as keyof typeof translations.en;
      if (key in translations.en) {
        return translations[language][key];
      }
      return interval; // Fallback to original if not found
    },
    [language]
  );

  return {
    language,
    setLanguage,
    t,
    translateInterval,
    isRTL: language === "ar",
  };
}


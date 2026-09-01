import { v } from "convex/values";

export const MAX_WELCOME_MESSAGE_LENGTH = 1_000;
export const MAX_STARTER_SUGGESTION_LENGTH = 200;
export const MAX_STARTER_SUGGESTIONS = 7;

export type StarterSuggestion = {
  textEn: string;
  textAr: string;
};

export const starterSuggestionValidator = v.object({
  textEn: v.string(),
  textAr: v.string(),
});

export const ASSISTANT_GREETING_DEFAULTS = {
  welcomeMessageEn:
    "Welcome. Ask me about courses, your subscription, or where to begin.",
  welcomeMessageAr: "مرحبًا. اسأليني عن الدورات أو اشتراكك أو من أين تبدئين.",
  starterSuggestions: [
    {
      textEn: "Help me find a course about self-love.",
      textAr: "ساعديني في العثور على دورة عن حب الذات.",
    },
    {
      textEn: "Which femininity course is suitable for a beginner?",
      textAr: "ما الدورة المناسبة للمبتدئات في الأنوثة؟",
    },
    {
      textEn: "What is my current subscription?",
      textAr: "ما حالة اشتراكي الحالي؟",
    },
  ] satisfies StarterSuggestion[],
} as const;

export const PUBLIC_ASSISTANT_GREETING_DEFAULTS = {
  welcomeMessageEn: "Welcome. Ask me about courses, plans, or how to get started.",
  welcomeMessageAr: "مرحبًا. اسأليني عن الدورات أو الباقات أو من أين تبدئين.",
  starterSuggestions: [
    {
      textEn: "Help me find a course about self-love.",
      textAr: "ساعديني في العثور على دورة عن حب الذات.",
    },
    {
      textEn: "Which femininity course is suitable for a beginner?",
      textAr: "ما الدورة المناسبة للمبتدئات في الأنوثة؟",
    },
    {
      textEn: "What subscription plans are available?",
      textAr: "ما باقات الاشتراك المتوفرة؟",
    },
  ] satisfies StarterSuggestion[],
} as const;

type GreetingDefaults = {
  welcomeMessageEn: string;
  welcomeMessageAr: string;
  starterSuggestions: ReadonlyArray<StarterSuggestion>;
};

export const assistantGreetingSettingsValidator = v.object({
  welcomeMessageEn: v.string(),
  welcomeMessageAr: v.string(),
  starterSuggestions: v.array(starterSuggestionValidator),
  defaultWelcomeMessageEn: v.string(),
  defaultWelcomeMessageAr: v.string(),
  defaultStarterSuggestions: v.array(starterSuggestionValidator),
  maxStarterSuggestions: v.number(),
});

export const assistantGreetingPublicValidator = v.object({
  welcomeMessageEn: v.string(),
  welcomeMessageAr: v.string(),
  starterSuggestions: v.array(starterSuggestionValidator),
});

type GreetingSettingsSource = {
  welcomeMessageEn?: string;
  welcomeMessageAr?: string;
  starterSuggestions?: StarterSuggestion[];
} | null;

export function resolveAssistantGreeting(
  settings: GreetingSettingsSource,
  defaults: GreetingDefaults = ASSISTANT_GREETING_DEFAULTS,
): {
  welcomeMessageEn: string;
  welcomeMessageAr: string;
  starterSuggestions: StarterSuggestion[];
} {
  const welcomeMessageEn = settings?.welcomeMessageEn?.trim();
  const welcomeMessageAr = settings?.welcomeMessageAr?.trim();

  let starterSuggestions: StarterSuggestion[];
  if (settings?.starterSuggestions === undefined) {
    starterSuggestions = defaults.starterSuggestions.map((item) => ({
      textEn: item.textEn,
      textAr: item.textAr,
    }));
  } else {
    starterSuggestions = settings.starterSuggestions
      .map((item) => ({
        textEn: item.textEn.trim(),
        textAr: item.textAr.trim(),
      }))
      .filter((item) => item.textEn.length > 0 && item.textAr.length > 0)
      .slice(0, MAX_STARTER_SUGGESTIONS);
  }

  return {
    welcomeMessageEn: welcomeMessageEn || defaults.welcomeMessageEn,
    welcomeMessageAr: welcomeMessageAr || defaults.welcomeMessageAr,
    starterSuggestions,
  };
}

export function buildGreetingSettingsResponse(
  settings: GreetingSettingsSource,
  defaults: GreetingDefaults = ASSISTANT_GREETING_DEFAULTS,
) {
  const resolved = resolveAssistantGreeting(settings, defaults);
  return {
    welcomeMessageEn: resolved.welcomeMessageEn,
    welcomeMessageAr: resolved.welcomeMessageAr,
    starterSuggestions: resolved.starterSuggestions,
    defaultWelcomeMessageEn: defaults.welcomeMessageEn,
    defaultWelcomeMessageAr: defaults.welcomeMessageAr,
    defaultStarterSuggestions: defaults.starterSuggestions.map((item) => ({
      textEn: item.textEn,
      textAr: item.textAr,
    })),
    maxStarterSuggestions: MAX_STARTER_SUGGESTIONS,
  };
}

export function normalizeStarterSuggestions(
  suggestions: StarterSuggestion[],
): StarterSuggestion[] {
  if (suggestions.length > MAX_STARTER_SUGGESTIONS) {
    throw new Error(
      `Too many starter suggestions (${suggestions.length}). Please keep ${MAX_STARTER_SUGGESTIONS} or fewer.`,
    );
  }

  const normalized: StarterSuggestion[] = [];
  for (const [index, item] of suggestions.entries()) {
    const textEn = item.textEn.trim();
    const textAr = item.textAr.trim();
    if (textEn.length === 0 && textAr.length === 0) {
      continue;
    }
    if (textEn.length === 0 || textAr.length === 0) {
      throw new Error(
        `Starter suggestion ${index + 1} needs both English and Arabic text.`,
      );
    }
    if (textEn.length > MAX_STARTER_SUGGESTION_LENGTH) {
      throw new Error(
        `English starter suggestion ${index + 1} is too long (${textEn.length.toLocaleString()} characters). Please shorten it to ${MAX_STARTER_SUGGESTION_LENGTH.toLocaleString()} characters or fewer.`,
      );
    }
    if (textAr.length > MAX_STARTER_SUGGESTION_LENGTH) {
      throw new Error(
        `Arabic starter suggestion ${index + 1} is too long (${textAr.length.toLocaleString()} characters). Please shorten it to ${MAX_STARTER_SUGGESTION_LENGTH.toLocaleString()} characters or fewer.`,
      );
    }
    normalized.push({ textEn, textAr });
  }

  return normalized;
}

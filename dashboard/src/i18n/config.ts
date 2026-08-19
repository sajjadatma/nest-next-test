import ar from "@/i18n/messages/ar.json";
import de from "@/i18n/messages/de.json";
import en from "@/i18n/messages/en.json";
import extractedEn from "@/i18n/messages/extracted.en.json";
import es from "@/i18n/messages/es.json";
import fa from "@/i18n/messages/fa.json";
import fr from "@/i18n/messages/fr.json";
import tr from "@/i18n/messages/tr.json";

export const locales = ["en", "fa", "ar", "de", "es", "fr", "tr"] as const;
export type Locale = (typeof locales)[number];
export type Direction = "ltr" | "rtl";

export const localeMetadata: Record<Locale, { label: string; nativeLabel: string; direction: Direction }> = {
  en: { label: "English", nativeLabel: "English", direction: "ltr" },
  fa: { label: "Persian", nativeLabel: "فارسی", direction: "rtl" },
  ar: { label: "Arabic", nativeLabel: "العربية", direction: "rtl" },
  de: { label: "German", nativeLabel: "Deutsch", direction: "ltr" },
  es: { label: "Spanish", nativeLabel: "Español", direction: "ltr" },
  fr: { label: "French", nativeLabel: "Français", direction: "ltr" },
  tr: { label: "Turkish", nativeLabel: "Türkçe", direction: "ltr" },
};

// The extractor is the complete source-of-truth inventory. Hand-maintained files
// override it with reviewed translations.
const translations: Record<Locale, Record<string, string>> = { en: { ...extractedEn, ...en }, fa, ar, de, es, fr, tr };

export function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && locales.includes(value as Locale));
}

export function message(locale: Locale, key: string, values?: Record<string, string | number>) {
  const sourceKey = Object.values(translations).reduce<string | undefined>((found, dictionary) => {
    if (found) return found;
    return Object.entries(dictionary).find(([, translated]) => translated === key)?.[0];
  }, undefined) ?? key;
  const template = translations[locale][sourceKey] ?? translations.en[sourceKey] ?? sourceKey;
  return values ? template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`)) : template;
}

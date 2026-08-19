"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Direction, isLocale, Locale, localeMetadata, locales, message } from "@/i18n/config";

const STORAGE_KEY = "nest-locale";
export const LOCALE_COOKIE = "nest-locale";
const TRANSLATABLE_ATTRIBUTES = ["aria-label", "placeholder", "title", "alt"];

type TranslationContextValue = {
  locale: Locale;
  direction: Direction;
  locales: readonly Locale[];
  setLocale: (locale: Locale) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const standaloneTranslation: TranslationContextValue = {
  locale: "en",
  direction: "ltr",
  locales,
  setLocale: () => undefined,
  t: (key, values) => message("en", key, values),
};
const TranslationContext = createContext<TranslationContextValue>(standaloneTranslation);

function translateNode(node: Node, locale: Locale) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    const leading = text.match(/^\s*/)?.[0] ?? "";
    const trailing = text.match(/\s*$/)?.[0] ?? "";
    const translated = message(locale, text.trim());
    if (text.trim() && translated !== text.trim()) node.textContent = `${leading}${translated}${trailing}`;
    return;
  }
  if (!(node instanceof Element) || node.closest("script, style, code, pre, [data-i18n-skip]")) return;
  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    const value = node.getAttribute(attribute);
    if (value) node.setAttribute(attribute, message(locale, value));
  }
  for (const child of Array.from(node.childNodes)) translateNode(child, locale);
}

function applyDocumentLocale(locale: Locale) {
  const { direction } = localeMetadata[locale];
  document.documentElement.lang = locale;
  document.documentElement.dir = direction;
  document.documentElement.dataset.locale = locale;
  translateNode(document.body, locale);
}

export function LanguageProvider({ children, initialLocale = "en" }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const browserLocale = navigator.language.split("-")[0];
    const nextLocale = isLocale(saved) ? saved : isLocale(browserLocale) ? browserLocale : "en";
    if (nextLocale === locale) return;
    const timer = window.setTimeout(() => setLocaleState(nextLocale), 0);
  // This runs only after hydration to adopt a first-time visitor's browser language.
  // Subsequent visits receive the persisted locale from the server-rendered cookie.
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyDocumentLocale(locale);
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of Array.from(record.addedNodes)) translateNode(node, locale);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    window.localStorage.setItem(STORAGE_KEY, nextLocale);
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    setLocaleState(nextLocale);
  }, []);
  const value = useMemo(() => ({ locale, direction: localeMetadata[locale].direction, locales, setLocale, t: (key: string, values?: Record<string, string | number>) => message(locale, key, values) }), [locale, setLocale]);
  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}

export function useTranslation() {
  return useContext(TranslationContext);
}

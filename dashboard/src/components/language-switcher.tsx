"use client";

import { localeMetadata } from "@/i18n/config";
import { useTranslation } from "@/i18n/language-provider";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, locales, setLocale, t } = useTranslation();
  return <label className={compact ? "language-switcher compact" : "language-switcher"}>
    <span className="sr-only">{t("Language")}</span>
    <select value={locale} onChange={(event) => setLocale(event.target.value as typeof locale)} aria-label={t("Language")}>
      {locales.map((value) => <option key={value} value={value}>{localeMetadata[value].nativeLabel}</option>)}
    </select>
  </label>;
}

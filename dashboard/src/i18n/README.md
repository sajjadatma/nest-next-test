# Localization

`en.json` is the canonical English dictionary and `fa.json` contains the Persian translations. The other locale files are intentionally small starter dictionaries and fall back to English until translated.

Run `npm run i18n:extract` after changing JSX copy. It scans visible JSX text plus user-facing `aria-label`, `placeholder`, `title`, and `alt` values and writes the complete English source inventory to `messages/extracted.en.json`. Add translated values for entries you want to override to the target locale file.

For new client UI, use `const { t } = useTranslation()` and `t("English source text")`. The provider also translates existing static DOM copy, so the legacy dashboard and shop are covered while they are incrementally moved to explicit `t()` calls.

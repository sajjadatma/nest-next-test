/* eslint-disable @next/next/no-page-custom-font -- The App Router root layout applies this runtime Google Font to every locale. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PorscheDesignSystemProvider } from "@porsche-design-system/components-react/ssr";
import { getComponentChunkLinks, getFontLinks, getIconLinks, getMetaTagsAndIconLinks } from "@porsche-design-system/components-react/partials";
import { LanguageProvider, LOCALE_COOKIE } from "@/i18n/language-provider";
import { isLocale, localeMetadata } from "@/i18n/config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "NEST | Thoughtful everyday goods",
  description: "A small collection of considered everyday goods.",
  openGraph: {
    title: "NEST | Small objects, well chosen.",
    description: "Thoughtful everyday goods made to stay in the rotation.",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "NEST everyday goods collection" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const savedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(savedLocale) ? savedLocale : "en";
  const direction = localeMetadata[locale].direction;
  return (
    <html lang={locale} dir={direction} data-locale={locale}>
      <head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100..900&display=swap" />{getFontLinks({ format: "jsx" })}{getIconLinks({ format: "jsx" })}{getComponentChunkLinks({ format: "jsx" })}{getMetaTagsAndIconLinks({ appTitle: "NEST", format: "jsx" })}</head>
      <body><LanguageProvider initialLocale={locale}><PorscheDesignSystemProvider>{children}</PorscheDesignSystemProvider></LanguageProvider></body>
    </html>
  );
}

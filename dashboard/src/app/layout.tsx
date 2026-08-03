import type { Metadata } from "next";
import { PorscheDesignSystemProvider } from "@porsche-design-system/components-react/ssr";
import { getComponentChunkLinks, getFontLinks, getIconLinks, getMetaTagsAndIconLinks } from "@porsche-design-system/components-react/partials";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>{getFontLinks({ format: "jsx" })}{getIconLinks({ format: "jsx" })}{getComponentChunkLinks({ format: "jsx" })}{getMetaTagsAndIconLinks({ appTitle: "NEST", format: "jsx" })}</head>
      <body><PorscheDesignSystemProvider>{children}</PorscheDesignSystemProvider></body>
    </html>
  );
}

import type { Metadata } from "next";
import { PorscheDesignSystemProvider } from "@porsche-design-system/components-react/ssr";
import { getComponentChunkLinks, getFontLinks, getIconLinks, getMetaTagsAndIconLinks } from "@porsche-design-system/components-react/partials";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEST | Thoughtful everyday goods",
  description: "A small collection of considered everyday goods.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>{getFontLinks({ format: "jsx" })}{getIconLinks({ format: "jsx" })}{getComponentChunkLinks({ format: "jsx" })}{getMetaTagsAndIconLinks({ appTitle: "Drive", format: "jsx" })}</head>
      <body><PorscheDesignSystemProvider>{children}</PorscheDesignSystemProvider></body>
    </html>
  );
}

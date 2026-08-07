import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Agentic Chat",
  description: "Bring your own key. Agentic chat with charts, flows, and data tools.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script mutates <html> before React hydrates, so the client tree
    // legitimately differs from the server's. Warning about it here would be
    // noise about the one thing we did on purpose.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Before first paint — see THEME_INIT_SCRIPT for why this can't be a
            component. The content is a build-time constant, never user input. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

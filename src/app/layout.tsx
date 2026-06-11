import { ToastProvider } from "@/lib/hooks/useToast";
import { I18nProvider } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/messages";
import type { Metadata } from "next";
import { JetBrains_Mono, Manrope, Noto_Kufi_Arabic, Sora } from "next/font/google";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });
const notoKufi = Noto_Kufi_Arabic({ subsets: ["arabic"], variable: "--font-noto-kufi" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });
const fontVariables = `${manrope.variable} ${sora.variable} ${notoKufi.variable} ${jetbrainsMono.variable}`;

export const metadata: Metadata = {
  title: "Country Intelligence — UAE Government",
  description: "AI-powered executive intelligence platform for UAE leadership.",
  robots: { index: false, follow: false },
};

// Applies the persisted theme before first paint (dark is the default brand).
const THEME_INIT = `try{if(localStorage.getItem("theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const saved = (await cookies()).get("locale")?.value;
  const locale: Locale = saved === "en" ? "en" : "ar";
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={fontVariables}
      suppressHydrationWarning
    >
      <head>
        {/* Browsers blank the nonce attribute in the live DOM (CSP hiding), which
            React would report as a hydration mismatch — suppress on this element. */}
        <script
          suppressHydrationWarning
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: THEME_INIT }}
        />
      </head>
      <body className="font-sans antialiased bg-ink-50 text-ink-800" suppressHydrationWarning>
        <a href="#main-content" className="skip-link">
          {locale === "ar" ? "تخطي إلى المحتوى الرئيسي" : "Skip to main content"}
        </a>
        <I18nProvider initialLocale={locale}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

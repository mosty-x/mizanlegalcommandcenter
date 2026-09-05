import type { Metadata } from "next";
import { LegalShell } from "@/components/legal-shell";
import { OnboardingGate } from "@/components/onboarding-gate";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "ميزان | Legal Command Suite",
  description: "خمس أدوات ذكاء اصطناعي قانونية موثقة بالمصادر وتحت قيادة المحامي.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">
        <OnboardingGate>
          <LegalShell userName="فريق المكتب">{children}</LegalShell>
        </OnboardingGate>
        <Toaster richColors position="bottom-left" />
      </body>
    </html>
  );
}

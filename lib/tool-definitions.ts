import {
  BriefcaseBusiness,
  Building2,
  FileCheck2,
  Gavel,
  Scale,
  type LucideIcon,
} from "lucide-react";

export type ToolDefinition = {
  slug: "enforceability" | "disputes" | "deal-room" | "regulatory" | "client-command";
  number: string;
  shortName: string;
  title: string;
  description: string;
  actionLabel: string;
  inputHint: string;
  accent: string;
  icon: LucideIcon;
  steps: string[];
};

export const TOOLS: ToolDefinition[] = [
  {
    slug: "enforceability",
    number: "01",
    shortName: "النفاذ القانوني",
    title: "Enforceability Engine",
    description: "راجع العقد بندًا بندًا وحدد مواضع الخطر والصياغات التي تحتاج تكييفًا محليًا.",
    actionLabel: "ابدأ مراجعة العقد",
    inputHint: "مثال: راجع العقد طبقًا للقانون المصري وركّز على التحكيم والجزاءات والإنهاء.",
    accent: "red",
    icon: FileCheck2,
    steps: ["قراءة المستندات", "تفكيك البنود", "اختبار النفاذ", "صياغة البدائل", "مراجعة بشرية"],
  },
  {
    slug: "disputes",
    number: "02",
    shortName: "النزاعات والتحكيم",
    title: "Disputes Intelligence",
    description: "حوّل ملف النزاع إلى خط زمني ومصفوفة ادعاءات وأدلة وتناقضات قابلة للمراجعة.",
    actionLabel: "حلّل ملف النزاع",
    inputHint: "مثال: ابنِ chronology وحدد كل ادعاء وما يؤيده أو يناقضه من المستندات.",
    accent: "cyan",
    icon: Gavel,
    steps: ["استخراج الوقائع", "بناء الخط الزمني", "ربط الادعاءات", "كشف التعارض", "حزمة المراجعة"],
  },
  {
    slug: "deal-room",
    number: "03",
    shortName: "غرفة الصفقة",
    title: "Deal Room",
    description: "نفّذ فحصًا أوليًا للمستندات واستخرج المخاطر والشروط السابقة للغلق والالتزامات.",
    actionLabel: "ابدأ فحص الصفقة",
    inputHint: "مثال: استخرج red flags وconditions precedent والتزامات ما بعد الإغلاق.",
    accent: "violet",
    icon: BriefcaseBusiness,
    steps: ["تصنيف الملفات", "فحص النواقص", "تحليل المخاطر", "تتبع الشروط", "تقرير الصفقة"],
  },
  {
    slug: "regulatory",
    number: "04",
    shortName: "المسار التنظيمي",
    title: "Regulatory Navigator",
    description: "رتّب الإجراءات والمتطلبات والجهات والمستندات في خريطة تنفيذ واضحة ومصدرية.",
    actionLabel: "ابنِ خريطة الإجراءات",
    inputHint: "مثال: جهّز مسار تأسيس وترخيص النشاط وحدد الجهات والتبعيات والمستندات الناقصة.",
    accent: "amber",
    icon: Building2,
    steps: ["تحديد النشاط", "تعيين الجهات", "ترتيب الإجراءات", "تدقيق المتطلبات", "خطة التنفيذ"],
  },
  {
    slug: "client-command",
    number: "05",
    shortName: "قيادة ملف العميل",
    title: "Client Command Center",
    description: "استخرج حالة الملف والمطلوب والمواعيد والمخاطر في موجز مفهوم للعميل والفريق.",
    actionLabel: "أنشئ موجز الملف",
    inputHint: "مثال: أنشئ status brief يوضح المنجز والمتعطل والمطلوب من العميل والقرارات المنتظرة.",
    accent: "green",
    icon: Scale,
    steps: ["جمع الحالة", "تحديد المطلوب", "حساب الأولويات", "كشف التعطيل", "الموجز التنفيذي"],
  },
];

export function getTool(slug: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}


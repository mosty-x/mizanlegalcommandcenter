import { noStoreJson, safeErrorCode } from "@/lib/security";

const MESSAGES: Record<string, string> = {
  SSH_HOST_DENIED: "السيرفر مش مسموح. مسؤول الاستضافة يضيف العنوان والمنفذ في ALLOWED_SSH_HOSTS بصيغة host:port.",
  SSH_KEY_INVALID: "مفتاح SSH الخاص أو كلمة سر المفتاح غير صالحين.",
  SSH_BUSY: "السيرفر مشغول بتشغيل حالي. استنى لما يخلص وبعدين جرّب.",
  SSH_TIMEOUT: "انتهت مهلة السيرفر. اتأكد من سجل التشغيل عنده قبل إعادة الطلب؛ المهمة ممكن تكون بدأت.",
  SSH_FINGERPRINT_MISMATCH: "بصمة السيرفر مختلفة عن البصمة المحفوظة. الاتصال اتوقف قبل إرسال المستندات.",
  SSH_CONNECTION_FAILED: "الاتصال فشل. راجع عنوان السيرفر والمنفذ والمستخدم والمفتاح وصلاحية الدخول.",
  SSH_CONNECTION_CLOSED: "اتصال السيرفر اتقفل قبل اكتمال الرد. راجع التشغيل البعيد قبل إعادة المحاولة.",
  SSH_EXEC_FAILED: "برنامج استقبال ميزان على السيرفر مش مثبت أو التشغيل فشل. راجع دليل SSH المرفق.",
  SSH_PROTOCOL_INVALID: "السيرفر مش بيرجع بروتوكول ميزان المطلوب أو الخدمة مش جاهزة.",
  PAYLOAD_TOO_LARGE: "حجم الطلب أكبر من الحد المسموح.",
  PROVIDER_URL_INVALID: "رابط مزود الذكاء الاصطناعي غير صالح.",
  PROVIDER_HOST_DENIED: "النطاق ده مش موجود في قائمة مزودي الذكاء المسموحين.",
  PROVIDER_NOT_FOUND: "مزود الذكاء الاصطناعي غير موجود أو لا تملك صلاحية استخدامه.",
  PROVIDER_RESPONSE_INVALID: "المزود رجّع نتيجة غير مكتملة أو غير قابلة للتحقق.",
  PROVIDER_RESPONSE_TOO_LARGE: "استجابة المزود أكبر من الحد الآمن.",
  PROVIDER_TIMEOUT: "المزود اتأخر عن المهلة المحددة. جرّب تاني.",
  MASTER_KEY_UNAVAILABLE: "خزنة الاعتمادات غير مهيأة بعد.",
  MASTER_KEY_INVALID: "إعداد مفتاح تشفير الخزنة غير صالح.",
  STORAGE_UNAVAILABLE: "مساحة تخزين المستندات غير متاحة حاليًا.",
  DOCUMENT_NOT_FOUND: "مستند غير موجود أو لا تملك صلاحية الوصول إليه.",
  DOCUMENT_TYPE_DENIED: "نوع الملف غير مسموح.",
  DOCUMENT_SIGNATURE_INVALID: "محتوى الملف لا يطابق نوعه المعلن.",
  DOCUMENT_TEXT_EMPTY: "لم يتم العثور على نص قابل للتحليل داخل المستند.",
  DOCUMENT_LIMIT_REACHED: "الحد الأقصى 8 مستندات في كل تشغيل.",
  WORKFLOW_NOT_FOUND: "التشغيل غير موجود أو لا تملك صلاحية الوصول إليه.",
  WORKFLOW_OUTPUT_UNAVAILABLE: "نتيجة التشغيل غير متاحة حاليًا.",
  TOOL_NOT_FOUND: "الأداة المطلوبة غير موجودة.",
  RATE_LIMITED: "وصلت للحد المؤقت للتشغيل. انتظر قليلًا ثم جرّب.",
  ORIGIN_DENIED: "الطلب اترفض لأن مصدره غير موثوق.",
  CONFIG_POLICY_DENIED: "إعدادات المكتب الحالية لا تسمح بالتشغيل ده.",
  UNEXPECTED_ERROR: "حصل خطأ غير متوقع من غير كشف أي بيانات حساسة.",
};

export function apiError(error: unknown, fallbackStatus = 500): Response {
  const code = safeErrorCode(error);
  const status =
    code === "RATE_LIMITED"
      ? 429
      : code.includes("NOT_FOUND")
        ? 404
        : code.includes("INVALID") || code.includes("DENIED") || code === "PAYLOAD_TOO_LARGE"
          ? 400
          : fallbackStatus;
  return noStoreJson({ error: MESSAGES[code], code }, { status });
}

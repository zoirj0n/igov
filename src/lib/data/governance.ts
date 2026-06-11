export interface Governance {
  iso3: string;
  systemEn: string;
  systemAr: string;
  leaderEn: string;
  leaderAr: string;
  capitalEn: string;
  capitalAr: string;
  fiscalYear: string;
  priorities: { en: string; ar: string }[];
  initiatives: { titleEn: string; titleAr: string; descEn: string; descAr: string }[];
}

export const GOVERNANCE: Record<string, Governance> = {
  ARE: {
    iso3: "ARE",
    systemEn: "Federal constitutional monarchy · Federal Supreme Council of 7 Emirates",
    systemAr: "اتحاد ملكي دستوري · المجلس الأعلى للاتحاد لسبع إمارات",
    leaderEn: "President: H.H. Mohammed bin Zayed Al Nahyan",
    leaderAr: "الرئيس: الشيخ محمد بن زايد آل نهيان",
    capitalEn: "Abu Dhabi",
    capitalAr: "أبوظبي",
    fiscalYear: "Jan–Dec",
    priorities: [
      {
        en: "We the UAE 2031 — double GDP, sustainable economy",
        ar: "نحن الإمارات 2031 — مضاعفة الناتج المحلي",
      },
      { en: "Net Zero by 2050 — first MENA pledge", ar: "الحياد المناخي 2050" },
      { en: "Digital sovereignty + sovereign AI", ar: "السيادة الرقمية والذكاء الاصطناعي" },
      { en: "Energy transition · hydrogen export economy", ar: "تحول الطاقة وتصدير الهيدروجين" },
      { en: "Bilateral CEPA expansion programme", ar: "توسيع اتفاقيات الشراكة الاقتصادية الشاملة" },
    ],
    initiatives: [
      {
        titleEn: "UAE National Hydrogen Strategy 2031",
        titleAr: "استراتيجية الإمارات الوطنية للهيدروجين 2031",
        descEn:
          "Position UAE among top-10 hydrogen producers; 1.4 Mtpa low-carbon hydrogen by 2031.",
        descAr: "وضع الإمارات ضمن أكبر 10 منتجين للهيدروجين؛ 1.4 مليون طن سنوياً بحلول 2031.",
      },
      {
        titleEn: "Operation 300bn",
        titleAr: "مشروع 300 مليار",
        descEn: "Industrial strategy targeting AED 300B industrial GDP by 2031.",
        descAr: "استراتيجية صناعية تستهدف 300 مليار درهم بحلول 2031.",
      },
      {
        titleEn: "National AI Strategy 2031",
        titleAr: "استراتيجية الذكاء الاصطناعي 2031",
        descEn: "Sovereign compute + skills pipeline + sectoral AI deployment.",
        descAr: "بنية حوسبة سيادية + كوادر + نشر قطاعي.",
      },
      {
        titleEn: "UAE Centennial 2071",
        titleAr: "مئوية الإمارات 2071",
        descEn: "Long-horizon plan: best country worldwide by national centenary.",
        descAr: "خطة طويلة المدى: أفضل دولة في العالم بحلول مئوية الإمارات.",
      },
    ],
  },
  SAU: {
    iso3: "SAU",
    systemEn: "Absolute monarchy · Council of Ministers under the King",
    systemAr: "ملكية مطلقة · مجلس الوزراء برئاسة الملك",
    leaderEn: "King: Salman bin Abdulaziz · Crown Prince: Mohammed bin Salman",
    leaderAr: "الملك: سلمان بن عبدالعزيز · ولي العهد: محمد بن سلمان",
    capitalEn: "Riyadh",
    capitalAr: "الرياض",
    fiscalYear: "Jan–Dec",
    priorities: [
      { en: "Vision 2030 — economic diversification", ar: "رؤية 2030 — التنويع الاقتصادي" },
      {
        en: "Giga-projects (NEOM, Red Sea, Qiddiya)",
        ar: "المشاريع العملاقة (نيوم، البحر الأحمر)",
      },
      { en: "PIF anchor for sovereign capital deployment", ar: "صندوق الاستثمارات العامة" },
    ],
    initiatives: [
      {
        titleEn: "NEOM",
        titleAr: "نيوم",
        descEn: "Linear city + industrial mega-project across NW Saudi Arabia.",
        descAr: "مدينة خطية ومشروع صناعي عملاق شمال غرب المملكة.",
      },
    ],
  },
  DEU: {
    iso3: "DEU",
    systemEn: "Federal parliamentary republic · 16 Länder",
    systemAr: "جمهورية برلمانية اتحادية · 16 ولاية",
    leaderEn: "Chancellor leads government; President is ceremonial",
    leaderAr: "المستشار يقود الحكومة؛ الرئيس بدور رمزي",
    capitalEn: "Berlin",
    capitalAr: "برلين",
    fiscalYear: "Jan–Dec",
    priorities: [
      { en: "Energiewende — renewables 80% by 2030", ar: "تحول الطاقة" },
      { en: "Hydrogen import strategy via H2Global", ar: "استيراد الهيدروجين عبر H2Global" },
      { en: "Critical raw materials act compliance", ar: "قانون المواد الخام الحرجة" },
    ],
    initiatives: [
      {
        titleEn: "H2Global Foundation",
        titleAr: "مؤسسة H2Global",
        descEn: "Double-sided auction for green hydrogen derivatives imports.",
        descAr: "مزاد ثنائي لاستيراد مشتقات الهيدروجين الأخضر.",
      },
    ],
  },
  JPN: {
    iso3: "JPN",
    systemEn: "Constitutional monarchy · Parliamentary system (Diet)",
    systemAr: "ملكية دستورية · نظام برلماني",
    leaderEn: "Prime Minister leads cabinet; Emperor is ceremonial",
    leaderAr: "رئيس الوزراء يقود الحكومة؛ الإمبراطور بدور رمزي",
    capitalEn: "Tokyo",
    capitalAr: "طوكيو",
    fiscalYear: "Apr–Mar",
    priorities: [
      { en: "GX (Green Transformation) — ¥150T over 10y", ar: "التحول الأخضر — 150 تريليون ين" },
      { en: "Society 5.0 — cyber-physical smart cities", ar: "مجتمع 5.0" },
      { en: "Critical-tech supply chain resilience", ar: "مرونة سلاسل التوريد التقنية" },
    ],
    initiatives: [
      {
        titleEn: "Hydrogen Society Basic Strategy",
        titleAr: "استراتيجية المجتمع الهيدروجيني",
        descEn: "12 Mtpa hydrogen demand by 2040; offtake corridors with Australia + UAE.",
        descAr: "طلب 12 مليون طن من الهيدروجين بحلول 2040.",
      },
    ],
  },
};

export function governanceFor(iso3: string): Governance | undefined {
  return GOVERNANCE[iso3];
}

/**
 * Comprehensive ISO 3166-1 country reference — so the advisor can brief on ANY
 * country via live data (World Bank / IMF / EIA / UN Comtrade / web), not only
 * the seeded twelve. Each entry is [iso3, iso2, English name]. The seed catalog
 * (`countries.ts`) still provides curated Arabic names/regions/flags for its
 * twelve; everything else resolves here and gets a derived flag.
 */
type Row = [iso3: string, iso2: string, name: string];

// prettier-ignore
const ROWS: Row[] = [
  ["AFG", "AF", "Afghanistan"],
  ["ALB", "AL", "Albania"],
  ["DZA", "DZ", "Algeria"],
  ["AND", "AD", "Andorra"],
  ["AGO", "AO", "Angola"],
  ["ATG", "AG", "Antigua and Barbuda"],
  ["ARG", "AR", "Argentina"],
  ["ARM", "AM", "Armenia"],
  ["AUS", "AU", "Australia"],
  ["AUT", "AT", "Austria"],
  ["AZE", "AZ", "Azerbaijan"],
  ["BHS", "BS", "Bahamas"],
  ["BHR", "BH", "Bahrain"],
  ["BGD", "BD", "Bangladesh"],
  ["BRB", "BB", "Barbados"],
  ["BLR", "BY", "Belarus"],
  ["BEL", "BE", "Belgium"],
  ["BLZ", "BZ", "Belize"],
  ["BEN", "BJ", "Benin"],
  ["BTN", "BT", "Bhutan"],
  ["BOL", "BO", "Bolivia"],
  ["BIH", "BA", "Bosnia and Herzegovina"],
  ["BWA", "BW", "Botswana"],
  ["BRA", "BR", "Brazil"],
  ["BRN", "BN", "Brunei"],
  ["BGR", "BG", "Bulgaria"],
  ["BFA", "BF", "Burkina Faso"],
  ["BDI", "BI", "Burundi"],
  ["CPV", "CV", "Cabo Verde"],
  ["KHM", "KH", "Cambodia"],
  ["CMR", "CM", "Cameroon"],
  ["CAN", "CA", "Canada"],
  ["CAF", "CF", "Central African Republic"],
  ["TCD", "TD", "Chad"],
  ["CHL", "CL", "Chile"],
  ["CHN", "CN", "China"],
  ["COL", "CO", "Colombia"],
  ["COM", "KM", "Comoros"],
  ["COG", "CG", "Republic of the Congo"],
  ["COD", "CD", "Democratic Republic of the Congo"],
  ["CRI", "CR", "Costa Rica"],
  ["CIV", "CI", "Côte d'Ivoire"],
  ["HRV", "HR", "Croatia"],
  ["CUB", "CU", "Cuba"],
  ["CYP", "CY", "Cyprus"],
  ["CZE", "CZ", "Czechia"],
  ["DNK", "DK", "Denmark"],
  ["DJI", "DJ", "Djibouti"],
  ["DMA", "DM", "Dominica"],
  ["DOM", "DO", "Dominican Republic"],
  ["ECU", "EC", "Ecuador"],
  ["EGY", "EG", "Egypt"],
  ["SLV", "SV", "El Salvador"],
  ["GNQ", "GQ", "Equatorial Guinea"],
  ["ERI", "ER", "Eritrea"],
  ["EST", "EE", "Estonia"],
  ["SWZ", "SZ", "Eswatini"],
  ["ETH", "ET", "Ethiopia"],
  ["FJI", "FJ", "Fiji"],
  ["FIN", "FI", "Finland"],
  ["FRA", "FR", "France"],
  ["GAB", "GA", "Gabon"],
  ["GMB", "GM", "Gambia"],
  ["GEO", "GE", "Georgia"],
  ["DEU", "DE", "Germany"],
  ["GHA", "GH", "Ghana"],
  ["GRC", "GR", "Greece"],
  ["GRD", "GD", "Grenada"],
  ["GTM", "GT", "Guatemala"],
  ["GIN", "GN", "Guinea"],
  ["GNB", "GW", "Guinea-Bissau"],
  ["GUY", "GY", "Guyana"],
  ["HTI", "HT", "Haiti"],
  ["HND", "HN", "Honduras"],
  ["HKG", "HK", "Hong Kong"],
  ["HUN", "HU", "Hungary"],
  ["ISL", "IS", "Iceland"],
  ["IND", "IN", "India"],
  ["IDN", "ID", "Indonesia"],
  ["IRN", "IR", "Iran"],
  ["IRQ", "IQ", "Iraq"],
  ["IRL", "IE", "Ireland"],
  ["ISR", "IL", "Israel"],
  ["ITA", "IT", "Italy"],
  ["JAM", "JM", "Jamaica"],
  ["JPN", "JP", "Japan"],
  ["JOR", "JO", "Jordan"],
  ["KAZ", "KZ", "Kazakhstan"],
  ["KEN", "KE", "Kenya"],
  ["KIR", "KI", "Kiribati"],
  ["KWT", "KW", "Kuwait"],
  ["KGZ", "KG", "Kyrgyzstan"],
  ["LAO", "LA", "Laos"],
  ["LVA", "LV", "Latvia"],
  ["LBN", "LB", "Lebanon"],
  ["LSO", "LS", "Lesotho"],
  ["LBR", "LR", "Liberia"],
  ["LBY", "LY", "Libya"],
  ["LIE", "LI", "Liechtenstein"],
  ["LTU", "LT", "Lithuania"],
  ["LUX", "LU", "Luxembourg"],
  ["MAC", "MO", "Macao"],
  ["MDG", "MG", "Madagascar"],
  ["MWI", "MW", "Malawi"],
  ["MYS", "MY", "Malaysia"],
  ["MDV", "MV", "Maldives"],
  ["MLI", "ML", "Mali"],
  ["MLT", "MT", "Malta"],
  ["MHL", "MH", "Marshall Islands"],
  ["MRT", "MR", "Mauritania"],
  ["MUS", "MU", "Mauritius"],
  ["MEX", "MX", "Mexico"],
  ["FSM", "FM", "Micronesia"],
  ["MDA", "MD", "Moldova"],
  ["MCO", "MC", "Monaco"],
  ["MNG", "MN", "Mongolia"],
  ["MNE", "ME", "Montenegro"],
  ["MAR", "MA", "Morocco"],
  ["MOZ", "MZ", "Mozambique"],
  ["MMR", "MM", "Myanmar"],
  ["NAM", "NA", "Namibia"],
  ["NRU", "NR", "Nauru"],
  ["NPL", "NP", "Nepal"],
  ["NLD", "NL", "Netherlands"],
  ["NZL", "NZ", "New Zealand"],
  ["NIC", "NI", "Nicaragua"],
  ["NER", "NE", "Niger"],
  ["NGA", "NG", "Nigeria"],
  ["PRK", "KP", "North Korea"],
  ["MKD", "MK", "North Macedonia"],
  ["NOR", "NO", "Norway"],
  ["OMN", "OM", "Oman"],
  ["PAK", "PK", "Pakistan"],
  ["PLW", "PW", "Palau"],
  ["PSE", "PS", "Palestine"],
  ["PAN", "PA", "Panama"],
  ["PNG", "PG", "Papua New Guinea"],
  ["PRY", "PY", "Paraguay"],
  ["PER", "PE", "Peru"],
  ["PHL", "PH", "Philippines"],
  ["POL", "PL", "Poland"],
  ["PRT", "PT", "Portugal"],
  ["QAT", "QA", "Qatar"],
  ["ROU", "RO", "Romania"],
  ["RUS", "RU", "Russia"],
  ["RWA", "RW", "Rwanda"],
  ["KNA", "KN", "Saint Kitts and Nevis"],
  ["LCA", "LC", "Saint Lucia"],
  ["VCT", "VC", "Saint Vincent and the Grenadines"],
  ["WSM", "WS", "Samoa"],
  ["SMR", "SM", "San Marino"],
  ["STP", "ST", "São Tomé and Príncipe"],
  ["SAU", "SA", "Saudi Arabia"],
  ["SEN", "SN", "Senegal"],
  ["SRB", "RS", "Serbia"],
  ["SYC", "SC", "Seychelles"],
  ["SLE", "SL", "Sierra Leone"],
  ["SGP", "SG", "Singapore"],
  ["SVK", "SK", "Slovakia"],
  ["SVN", "SI", "Slovenia"],
  ["SLB", "SB", "Solomon Islands"],
  ["SOM", "SO", "Somalia"],
  ["ZAF", "ZA", "South Africa"],
  ["KOR", "KR", "South Korea"],
  ["SSD", "SS", "South Sudan"],
  ["ESP", "ES", "Spain"],
  ["LKA", "LK", "Sri Lanka"],
  ["SDN", "SD", "Sudan"],
  ["SUR", "SR", "Suriname"],
  ["SWE", "SE", "Sweden"],
  ["CHE", "CH", "Switzerland"],
  ["SYR", "SY", "Syria"],
  ["TWN", "TW", "Taiwan"],
  ["TJK", "TJ", "Tajikistan"],
  ["TZA", "TZ", "Tanzania"],
  ["THA", "TH", "Thailand"],
  ["TLS", "TL", "Timor-Leste"],
  ["TGO", "TG", "Togo"],
  ["TON", "TO", "Tonga"],
  ["TTO", "TT", "Trinidad and Tobago"],
  ["TUN", "TN", "Tunisia"],
  ["TUR", "TR", "Turkey"],
  ["TKM", "TM", "Turkmenistan"],
  ["TUV", "TV", "Tuvalu"],
  ["UGA", "UG", "Uganda"],
  ["UKR", "UA", "Ukraine"],
  ["ARE", "AE", "United Arab Emirates"],
  ["GBR", "GB", "United Kingdom"],
  ["USA", "US", "United States"],
  ["URY", "UY", "Uruguay"],
  ["UZB", "UZ", "Uzbekistan"],
  ["VUT", "VU", "Vanuatu"],
  ["VEN", "VE", "Venezuela"],
  ["VNM", "VN", "Vietnam"],
  ["YEM", "YE", "Yemen"],
  ["ZMB", "ZM", "Zambia"],
  ["ZWE", "ZW", "Zimbabwe"],
];

export interface IsoCountry {
  iso3: string;
  iso2: string;
  name: string;
}

export const ISO_COUNTRIES: IsoCountry[] = ROWS.map(([iso3, iso2, name]) => ({ iso3, iso2, name }));

const BY_ISO3 = new Map(ISO_COUNTRIES.map((c) => [c.iso3, c]));

/** Common short forms / alternative spellings → ISO3. */
const ALIASES: Record<string, string> = {
  uae: "ARE",
  emirates: "ARE",
  "u.a.e": "ARE",
  usa: "USA",
  "u.s.a": "USA",
  "u.s": "USA",
  us: "USA",
  america: "USA",
  uk: "GBR",
  "u.k": "GBR",
  britain: "GBR",
  "great britain": "GBR",
  england: "GBR",
  korea: "KOR",
  "republic of korea": "KOR",
  "south korea": "KOR",
  "north korea": "PRK",
  dprk: "PRK",
  russia: "RUS",
  "russian federation": "RUS",
  iran: "IRN",
  syria: "SYR",
  laos: "LAO",
  vietnam: "VNM",
  "viet nam": "VNM",
  "czech republic": "CZE",
  czechia: "CZE",
  turkey: "TUR",
  türkiye: "TUR",
  turkiye: "TUR",
  egypt: "EGY",
  "ivory coast": "CIV",
  "cote d'ivoire": "CIV",
  "the gambia": "GMB",
  drc: "COD",
  "dr congo": "COD",
  congo: "COG",
  "cape verde": "CPV",
  swaziland: "SWZ",
  burma: "MMR",
  holland: "NLD",
  "the netherlands": "NLD",
  palestine: "PSE",
  saudi: "SAU",
  ksa: "SAU",
};

export function isValidIso3(iso?: string): boolean {
  return !!iso && BY_ISO3.has(iso.toUpperCase());
}

export function iso3Name(iso3: string): string | undefined {
  return BY_ISO3.get(iso3.toUpperCase())?.name;
}

export function iso2For(iso3: string): string | undefined {
  return BY_ISO3.get(iso3.toUpperCase())?.iso2;
}

/** Flag emoji from ISO2 via regional-indicator code points. */
export function flagForIso3(iso3: string): string {
  const iso2 = iso2For(iso3);
  if (!iso2) return "🏳️";
  return String.fromCodePoint(
    ...[...iso2.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

/**
 * Resolve a country from free text: explicit ISO3 token, then alias, then the
 * longest matching country name (so "South Korea" beats "Korea"). Returns ISO3.
 */
export function resolveCountryFromText(text: string): string | undefined {
  // Explicit ISO3 token (case-sensitive so "are"/"can" don't match ARE/CAN).
  const isoTok = text.match(/\b[A-Z]{3}\b/g)?.find((t) => BY_ISO3.has(t));
  if (isoTok) return isoTok;

  const lc = ` ${text.toLowerCase()} `;
  // Aliases (word-boundary).
  for (const [alias, iso3] of Object.entries(ALIASES)) {
    if (new RegExp(`(^|[^a-z])${escapeRe(alias)}([^a-z]|$)`).test(lc)) return iso3;
  }
  // Country names, longest first.
  const byName = [...ISO_COUNTRIES]
    .sort((a, b) => b.name.length - a.name.length)
    .find(
      (c) => lc.includes(` ${c.name.toLowerCase()} `) || lc.includes(`${c.name.toLowerCase()}'s`),
    );
  return byName?.iso3;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

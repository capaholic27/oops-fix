// Country → ISO2 code + Fotmob national-team id mapping.
// Lets us render national-team logos/flags instantly without DB roundtrips
// (used by World Cup, Euros, Copa America, AFCON, Nations League, etc).

export type CountryInfo = { iso2: string; fotmobId: number };

// Fotmob national-team team IDs (verified from Fotmob URLs).
// Add more as needed — anything missing falls back to TeamLogo's resolver.
export const COUNTRIES: Record<string, CountryInfo> = {
  // UEFA
  "England":        { iso2: "gb-eng", fotmobId: 6557 },
  "Scotland":       { iso2: "gb-sct", fotmobId: 6556 },
  "Wales":          { iso2: "gb-wls", fotmobId: 6571 },
  "Northern Ireland":{ iso2: "gb-nir", fotmobId: 6593 },
  "Ireland":        { iso2: "ie",     fotmobId: 6573 },
  "France":         { iso2: "fr",     fotmobId: 6561 },
  "Germany":        { iso2: "de",     fotmobId: 6560 },
  "Spain":          { iso2: "es",     fotmobId: 6720 },
  "Italy":          { iso2: "it",     fotmobId: 6722 },
  "Portugal":       { iso2: "pt",     fotmobId: 6727 },
  "Netherlands":    { iso2: "nl",     fotmobId: 6726 },
  "Belgium":        { iso2: "be",     fotmobId: 6562 },
  "Croatia":        { iso2: "hr",     fotmobId: 6716 },
  "Denmark":        { iso2: "dk",     fotmobId: 6717 },
  "Sweden":         { iso2: "se",     fotmobId: 6611 },
  "Norway":         { iso2: "no",     fotmobId: 6594 },
  "Switzerland":    { iso2: "ch",     fotmobId: 6735 },
  "Poland":         { iso2: "pl",     fotmobId: 6595 },
  "Austria":        { iso2: "at",     fotmobId: 6597 },
  "Czech Republic": { iso2: "cz",     fotmobId: 6629 },
  "Czechia":        { iso2: "cz",     fotmobId: 6629 },
  "Turkey":         { iso2: "tr",     fotmobId: 6606 },
  "Türkiye":        { iso2: "tr",     fotmobId: 6606 },
  "Ukraine":        { iso2: "ua",     fotmobId: 6707 },
  "Serbia":         { iso2: "rs",     fotmobId: 6601 },
  "Russia":         { iso2: "ru",     fotmobId: 6598 },
  "Hungary":        { iso2: "hu",     fotmobId: 6741 },
  "Romania":        { iso2: "ro",     fotmobId: 6599 },
  "Greece":         { iso2: "gr",     fotmobId: 6612 },
  "Slovakia":       { iso2: "sk",     fotmobId: 6603 },
  "Slovenia":       { iso2: "si",     fotmobId: 6602 },
  "Albania":        { iso2: "al",     fotmobId: 6620 },
  "Iceland":        { iso2: "is",     fotmobId: 6740 },
  "Finland":        { iso2: "fi",     fotmobId: 6712 },
  "Bulgaria":       { iso2: "bg",     fotmobId: 6625 },
  "Bosnia & Herzegovina":{ iso2: "ba",fotmobId: 6622 },
  "Bosnia and Herzegovina":{ iso2: "ba",fotmobId: 6622 },
  "Georgia":        { iso2: "ge",     fotmobId: 6624 },
  "North Macedonia":{ iso2: "mk",     fotmobId: 6592 },

  // CONMEBOL
  "Brazil":         { iso2: "br",     fotmobId: 6716 },
  "Argentina":      { iso2: "ar",     fotmobId: 6705 },
  "Uruguay":        { iso2: "uy",     fotmobId: 6710 },
  "Colombia":       { iso2: "co",     fotmobId: 6584 },
  "Chile":          { iso2: "cl",     fotmobId: 6583 },
  "Peru":           { iso2: "pe",     fotmobId: 6588 },
  "Ecuador":        { iso2: "ec",     fotmobId: 6586 },
  "Paraguay":       { iso2: "py",     fotmobId: 6587 },
  "Venezuela":      { iso2: "ve",     fotmobId: 6590 },
  "Bolivia":        { iso2: "bo",     fotmobId: 6582 },

  // CONCACAF
  "USA":            { iso2: "us",     fotmobId: 6589 },
  "United States":  { iso2: "us",     fotmobId: 6589 },
  "Mexico":         { iso2: "mx",     fotmobId: 6708 },
  "Canada":         { iso2: "ca",     fotmobId: 6581 },
  "Costa Rica":     { iso2: "cr",     fotmobId: 6585 },
  "Jamaica":        { iso2: "jm",     fotmobId: 6743 },
  "Honduras":       { iso2: "hn",     fotmobId: 6742 },
  "Panama":         { iso2: "pa",     fotmobId: 6744 },

  // CAF
  "Morocco":        { iso2: "ma",     fotmobId: 6664 },
  "Senegal":        { iso2: "sn",     fotmobId: 6661 },
  "Tunisia":        { iso2: "tn",     fotmobId: 6669 },
  "Algeria":        { iso2: "dz",     fotmobId: 6647 },
  "Egypt":          { iso2: "eg",     fotmobId: 6651 },
  "Cameroon":       { iso2: "cm",     fotmobId: 6648 },
  "Nigeria":        { iso2: "ng",     fotmobId: 6665 },
  "Ghana":          { iso2: "gh",     fotmobId: 6655 },
  "Ivory Coast":    { iso2: "ci",     fotmobId: 6650 },
  "Côte d'Ivoire":  { iso2: "ci",     fotmobId: 6650 },
  "South Africa":   { iso2: "za",     fotmobId: 6667 },
  "Mali":           { iso2: "ml",     fotmobId: 6660 },
  "Burkina Faso":   { iso2: "bf",     fotmobId: 6646 },
  "Congo DR":       { iso2: "cd",     fotmobId: 6649 },
  "DR Congo":       { iso2: "cd",     fotmobId: 6649 },

  // AFC
  "Japan":          { iso2: "jp",     fotmobId: 6739 },
  "South Korea":    { iso2: "kr",     fotmobId: 6736 },
  "Korea Republic": { iso2: "kr",     fotmobId: 6736 },
  "Australia":      { iso2: "au",     fotmobId: 6713 },
  "Iran":           { iso2: "ir",     fotmobId: 6738 },
  "Saudi Arabia":   { iso2: "sa",     fotmobId: 6732 },
  "Qatar":          { iso2: "qa",     fotmobId: 6731 },
  "Iraq":           { iso2: "iq",     fotmobId: 6737 },
  "China PR":       { iso2: "cn",     fotmobId: 6734 },
  "China":          { iso2: "cn",     fotmobId: 6734 },

  // OFC
  "New Zealand":    { iso2: "nz",     fotmobId: 6745 },
};

export function getCountryInfo(name: string): CountryInfo | null {
  if (!name) return null;
  return COUNTRIES[name] ?? COUNTRIES[name.trim()] ?? null;
}

export function isCountry(name: string): boolean {
  return !!getCountryInfo(name);
}

/** Flagcdn URL — fast deterministic CDN, supports gb-eng/gb-sct/gb-wls. */
export function flagUrl(iso2: string, size: 40 | 80 | 160 | 320 = 80): string {
  return `https://flagcdn.com/w${size}/${iso2.toLowerCase()}.png`;
}

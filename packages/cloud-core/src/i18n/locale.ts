/**
 * Internationalization (i18n) Engine for CareerOps Cloud
 * Supported Locales: en-US, en-GB, fr-FR, de-DE, hi-IN
 */

export type SupportedLocale = 'en-US' | 'en-GB' | 'fr-FR' | 'de-DE' | 'hi-IN';

export const SUPPORTED_LOCALES: SupportedLocale[] = ['en-US', 'en-GB', 'fr-FR', 'de-DE', 'hi-IN'];

const TRANSLATIONS: Record<SupportedLocale, Record<string, string>> = {
  'en-US': {
    sprint_mode: 'Sprint Mode',
    truthfulness_gate: 'Truthfulness Verification Gate',
    forecast_disclaimer: 'Forecasts are statistical ranges and do not guarantee employment outcomes.',
    auto_pause_active: 'Channel Auto-Paused due to safety threshold breach.',
    assist_queue_ready: 'Assist Queue: One-click actions prepared for your review.',
  },
  'en-GB': {
    sprint_mode: 'Sprint Mode',
    truthfulness_gate: 'Truthfulness Verification Gate',
    forecast_disclaimer: 'Forecasts are statistical ranges and do not guarantee employment outcomes.',
    auto_pause_active: 'Channel Auto-Paused due to safety threshold breach.',
    assist_queue_ready: 'Assist Queue: One-click actions prepared for your review.',
  },
  'fr-FR': {
    sprint_mode: 'Mode Sprint',
    truthfulness_gate: 'Portail de Vérification de Vérité',
    forecast_disclaimer: 'Les prévisions sont des plages statistiques et ne garantissent aucun résultat professionnel.',
    auto_pause_active: 'Canal mis en pause automatique suite à un dépassement du seuil de sécurité.',
    assist_queue_ready: "File d'attente assistée: actions prêtes en un clic.",
  },
  'de-DE': {
    sprint_mode: 'Sprint-Modus',
    truthfulness_gate: 'Wahrheitsprüfungs-Gate',
    forecast_disclaimer: 'Prognosen sind statistische Bereiche und stellen keine Ergebnisgarantie dar.',
    auto_pause_active: 'Kanal aufgrund von Sicherheitsgrenzen automatisch pausiert.',
    assist_queue_ready: 'Assist-Warteschlange: Ein-Klick-Aktionen vorbereitet.',
  },
  'hi-IN': {
    sprint_mode: 'स्प्रिंट मोड',
    truthfulness_gate: 'सत्यता सत्यापन गेट',
    forecast_disclaimer: 'पूर्वानुमान सांख्यिकीय अनुमान हैं और किसी परिणाम की गारंटी नहीं देते।',
    auto_pause_active: 'सुरक्षा सीमा उल्लंघन के कारण चैनल स्वतः रोका गया।',
    assist_queue_ready: 'सहायता कतार: एक क्लिक में कार्रवाई तैयार।',
  },
};

export class I18nEngine {
  public static getTranslation(key: string, locale: SupportedLocale = 'en-US'): string {
    const loc = TRANSLATIONS[locale] || TRANSLATIONS['en-US'];
    return loc[key] || TRANSLATIONS['en-US'][key] || key;
  }

  public static formatCurrency(amount: number, currency: string, locale: SupportedLocale = 'en-US'): string {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  }

  public static formatDate(isoDate: string, locale: SupportedLocale = 'en-US'): string {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(isoDate));
  }
}


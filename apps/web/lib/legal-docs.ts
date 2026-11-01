// 🚀 
import { LEGAL } from './legal'

export interface LegalSection {
  heading: string
  body: string[]
}

export type LegalDocKey = 'privacy' | 'terms' | 'refunds' | 'cookies' | 'legal-notice'

const fr: Record<LegalDocKey, { title: string; updated: string; sections: LegalSection[] }> = {
  privacy: {
    title: 'Politique de confidentialité',
    updated: 'Dernière mise à jour : 01/11/2026',
    sections: [
      {
        heading: 'Données collectées',
        body: [
          'Compte : adresse e-mail, mot de passe (stocké haché, jamais en clair), nom d\u2019affichage et image de profil si vous en ajoutez.',
          'Contenus : fichiers que vous importez (PDF, images), pages extraites, textes détectés par OCR, traductions, glossaires et exports générés.',
          'Usage : solde de crédits, historique daté des consommations et des achats, journaux techniques nécessaires à la sécurité.',
          'Nous ne demandons ni adresse postale, ni numéro de téléphone pour utiliser Taurge (minimisation des données).',
        ],
      },
      {
        heading: 'Utilisation et partage',
        body: [
          'Vos contenus servent uniquement à fournir le service : OCR et nettoyage exécutés localement sur nos serveurs, traduction contextuelle locale (Ollama) en priorité.',
          'Si une clé DeepL est configurée par l\u2019exploitant, les textes à traduire peuvent être transmis à DeepL (api-free.deepl.com) comme sous-traitant de traduction. Aucun contenu n\u2019est transmis à OpenAI.',
          'Paiements : FedaPay (Afrique francophone) et Paddle (international) traitent les paiements ; nous ne recevons ni ne stockons vos numéros de carte.',
          'Mesure d\u2019audience : Vercel Analytics, uniquement après votre consentement via la bannière cookies.',
          'Aucune vente de données personnelles, aucun entraînement de modèle sur vos contenus.',
        ],
      },
      {
        heading: 'Conservation et stockage',
        body: [
          `Données hébergées par : ${LEGAL.hostName} (${LEGAL.hostAddress}).`,
          'Vos projets et fichiers sont conservés tant que votre compte existe. L\u2019historique de facturation peut être conservé le temps exigé par les obligations comptables.',
        ],
      },
      {
        heading: 'Vos droits (RGPD)',
        body: [
          'Accès, rectification, export et effacement : le bouton « Supprimer mon compte et mes données » (Paramètres → Sécurité) supprime définitivement votre compte, vos projets, fichiers, glossaires, historique et transactions.',
          `Pour toute autre demande : ${LEGAL.privacyEmail}. Réponse sous un mois. Vous pouvez saisir la CNIL (cnil.fr) en cas de litige.`,
          'Base légale : exécution du contrat (compte, projets, crédits), consentement (newsletter, mesure d\u2019audience), obligation légale (facturation).',
        ],
      },
    ],
  },
  terms: {
    title: 'Conditions générales d\u2019utilisation',
    updated: 'Dernière mise à jour : 01/11/2026',
    sections: [
      {
        heading: 'Service',
        body: [
          'Taurge est un outil d\u2019aide à la localisation d\u2019œuvres illustrées (manga, manhwa, manhua, webtoon, bande dessinée) : import, OCR, traduction assistée, nettoyage et export.',
          'Les résultats de l\u2019IA sont des propositions à relire : aucune qualité « 100 % parfaite » n\u2019est promise ni garantie.',
        ],
      },
      {
        heading: 'Droits d\u2019auteur — responsabilité de l\u2019utilisateur',
        body: [
          'Vous êtes seul responsable des contenus que vous importez et traitez. Vous garantissez disposer des droits ou autorisations nécessaires (licence, domaine public, autorisation des ayants droit) pour reproduire, traduire et diffuser ces œuvres.',
          'Taurge n\u2019acquiert aucun droit sur vos contenus et ne peut être tenu responsable d\u2019une utilisation contrefaisante réalisée par un utilisateur. Tout signalement d\u2019atteinte aux droits peut entraîner la suppression du compte concerné.',
        ],
      },
      {
        heading: 'Compte et crédits',
        body: [
          'Inscription réservée aux personnes d\u2019au moins 15 ans ou disposant de l\u2019accord d\u2019un parent ou tuteur légal.',
          '1 crédit est consommé par action IA réussie (lecture OCR, traduction ou nettoyage d\u2019une page). Un traitement échoué n\u2019est pas débité.',
          'Les prix affichés sont toutes taxes comprises (TVA incluse). Les crédits n\u2019ont pas de valeur monétaire et ne sont pas transférables.',
        ],
      },
      {
        heading: 'Disponibilité et résiliation',
        body: [
          'Le service est fourni « en l\u2019état » ; des interruptions pour maintenance ou incident sont possibles sans constituer un manquement.',
          'Vous pouvez supprimer votre compte à tout moment depuis les Paramètres. Nous pouvons suspendre un compte en cas d\u2019usage frauduleux ou illicite.',
        ],
      },
    ],
  },
  refunds: {
    title: 'Politique de remboursement',
    updated: 'Dernière mise à jour : 01/11/2026',
    sections: [
      {
        heading: 'Crédits consommés',
        body: [
          'Les crédits déjà consommés par des traitements réussis ne sont pas remboursables : le service correspondant a été fourni.',
        ],
      },
      {
        heading: 'Crédits non consommés',
        body: [
          'Les crédits achetés et non consommés sont remboursables sur demande dans les 14 jours suivant l\u2019achat, via le moyen de paiement d\u2019origine.',
          `Demande : ${LEGAL.contactEmail}, en précisant l\u2019e-mail du compte et la date d\u2019achat. Traitement sous 14 jours ouvrés après validation.`,
          'Au-delà de 14 jours, ou après suppression du compte, les crédits restants sont perdus sans remboursement.',
        ],
      },
      {
        heading: 'Erreurs de facturation',
        body: [
          'Tout débit erroné ou double est intégralement remboursé dès constatation ou signalement vérifié.',
        ],
      },
    ],
  },
  cookies: {
    title: 'Politique des cookies',
    updated: 'Dernière mise à jour : 01/11/2026',
    sections: [
      {
        heading: 'Cookies strictement nécessaires (sans consentement)',
        body: [
          'Session et sécurité : jeton d\u2019authentification stocké dans le navigateur (localStorage), indispensable pour rester connecté.',
          'Préférences : langue d\u2019interface (cookie NEXT_LOCALE, 1 an) et thème clair/sombre (localStorage).',
          'Consentement : votre choix cookies (localStorage, 12 mois) pour ne pas réafficher la bannière.',
        ],
      },
      {
        heading: 'Mesure d\u2019audience (avec consentement uniquement)',
        body: [
          'Vercel Analytics : statistiques de fréquentation anonymisées, chargé uniquement si vous cliquez sur « Accepter » dans la bannière.',
          'Aucun cookie publicitaire, aucun traceur tiers de publicité, aucune revente de données de navigation.',
          'Vous pouvez changer d\u2019avis à tout moment en effaçant les données du site dans votre navigateur ; la bannière réapparaîtra.',
        ],
      },
    ],
  },
  'legal-notice': {
    title: 'Mentions légales',
    updated: 'Dernière mise à jour : 01/11/2026',
    sections: [
      {
        heading: 'Éditeur du site',
        body: [
          LEGAL.companyName,
          LEGAL.legalStatus,
          LEGAL.address,
          `Contact : ${LEGAL.contactEmail}`,
        ],
      },
      {
        heading: 'Hébergement',
        body: [`${LEGAL.hostName} — ${LEGAL.hostAddress}`],
      },
      {
        heading: 'Propriété intellectuelle du service',
        body: [
          'L\u2019interface, le logo et les textes de Taurge appartiennent à l\u2019éditeur. Les contenus importés par les utilisateurs restent leur propriété ou celle de leurs ayants droit.',
          'Polices : familles système et polices libres (Inter, JetBrains Mono — licences OFL) ; icônes Lucide (licence ISC). Aucune image de démonstration ne provient d\u2019une œuvre commerciale.',
        ],
      },
    ],
  },
}

const en: Record<LegalDocKey, { title: string; updated: string; sections: LegalSection[] }> = {
  privacy: {
    title: 'Privacy Policy',
    updated: 'Last updated: 2026-11-01',
    sections: [
      {
        heading: 'Data we collect',
        body: [
          'Account: email address, password (stored hashed, never in plain text), display name and profile image if you add one.',
          'Content: files you upload (PDF, images), extracted pages, OCR text, translations, glossaries and generated exports.',
          'Usage: credit balance, dated usage and purchase history, technical logs needed for security.',
          'We do not ask for a postal address or phone number to use Taurge (data minimisation).',
        ],
      },
      {
        heading: 'Use and sharing',
        body: [
          'Your content is only used to provide the service: OCR and cleaning run locally on our servers, contextual translation runs locally (Ollama) first.',
          'If the operator configures a DeepL key, texts to translate may be sent to DeepL (api-free.deepl.com) as a translation processor. No content is sent to OpenAI.',
          'Payments: FedaPay (francophone Africa) and Paddle (international) process payments; we never receive or store your card numbers.',
          'Audience measurement: Vercel Analytics, only after your consent in the cookie banner.',
          'No sale of personal data, no model training on your content.',
        ],
      },
      {
        heading: 'Retention and storage',
        body: [
          `Data hosted by: ${LEGAL.hostName} (${LEGAL.hostAddress}).`,
          'Your projects and files are kept while your account exists. Billing history may be kept for the period required by accounting rules.',
        ],
      },
      {
        heading: 'Your rights (GDPR)',
        body: [
          'Access, rectification, export and erasure: the “Delete my account and data” button (Settings → Security) permanently deletes your account, projects, files, glossaries, history and transactions.',
          `For any other request: ${LEGAL.privacyEmail}. Reply within one month. You may contact your local data protection authority in case of dispute.`,
          'Legal bases: contract performance (account, projects, credits), consent (newsletter, audience measurement), legal obligation (billing).',
        ],
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    updated: 'Last updated: 2026-11-01',
    sections: [
      {
        heading: 'Service',
        body: [
          'Taurge is a localization aid for illustrated works (manga, manhwa, manhua, webtoon, comics): upload, OCR, assisted translation, cleaning and export.',
          'AI output is a draft to proofread: no “100% perfect” quality is promised or guaranteed.',
        ],
      },
      {
        heading: 'Copyright — user responsibility',
        body: [
          'You are solely responsible for the content you upload and process. You guarantee you hold the rights or permissions needed (licence, public domain, rightsholder authorisation) to reproduce, translate and distribute those works.',
          'Taurge acquires no rights over your content and cannot be held liable for infringing use by a user. A copyright report may lead to removal of the account concerned.',
        ],
      },
      {
        heading: 'Account and credits',
        body: [
          'Registration is limited to people aged 15 or over, or with permission from a parent or legal guardian.',
          '1 credit is charged per successful AI action (OCR reading, translation or cleaning of one page). A failed job is never charged.',
          'Displayed prices include all taxes (VAT included). Credits have no monetary value and are not transferable.',
        ],
      },
      {
        heading: 'Availability and termination',
        body: [
          'The service is provided “as is”; maintenance or incident interruptions may occur without constituting a breach.',
          'You may delete your account at any time in Settings. We may suspend an account for fraudulent or unlawful use.',
        ],
      },
    ],
  },
  refunds: {
    title: 'Refund Policy',
    updated: 'Last updated: 2026-11-01',
    sections: [
      {
        heading: 'Used credits',
        body: ['Credits already spent on successful jobs are not refundable: the corresponding service was provided.'],
      },
      {
        heading: 'Unused credits',
        body: [
          'Purchased, unused credits are refundable on request within 14 days of purchase, to the original payment method.',
          `Request: ${LEGAL.contactEmail}, stating the account email and purchase date. Processed within 14 business days after validation.`,
          'After 14 days, or after account deletion, remaining credits are lost without refund.',
        ],
      },
      {
        heading: 'Billing errors',
        body: ['Any erroneous or duplicate charge is fully refunded once found or verified after a report.'],
      },
    ],
  },
  cookies: {
    title: 'Cookie Policy',
    updated: 'Last updated: 2026-11-01',
    sections: [
      {
        heading: 'Strictly necessary (no consent required)',
        body: [
          'Session and security: authentication token stored in the browser (localStorage), required to stay signed in.',
          'Preferences: interface language (NEXT_LOCALE cookie, 1 year) and light/dark theme (localStorage).',
          'Consent: your cookie choice (localStorage, 12 months) so the banner is not shown again.',
        ],
      },
      {
        heading: 'Audience measurement (consent only)',
        body: [
          'Vercel Analytics: anonymised traffic statistics, loaded only if you click “Accept” in the banner.',
          'No advertising cookies, no third-party ad trackers, no sale of browsing data.',
          'You can change your mind at any time by clearing site data in your browser; the banner will reappear.',
        ],
      },
    ],
  },
  'legal-notice': {
    title: 'Legal Notice',
    updated: 'Last updated: 2026-11-01',
    sections: [
      {
        heading: 'Publisher',
        body: [LEGAL.companyName, LEGAL.legalStatus, LEGAL.address, `Contact: ${LEGAL.contactEmail}`],
      },
      { heading: 'Hosting', body: [`${LEGAL.hostName} — ${LEGAL.hostAddress}`] },
      {
        heading: 'Service intellectual property',
        body: [
          'The Taurge interface, logo and texts belong to the publisher. Content uploaded by users remains theirs or their rightsholders\u2019.',
          'Fonts: system families and open fonts (Inter, JetBrains Mono — OFL licences); Lucide icons (ISC licence). No demo image comes from a commercial work.',
        ],
      },
    ],
  },
}

export function getLegalDoc(locale: string, key: LegalDocKey) {
  return (locale === 'en' ? en : fr)[key]
}

// 🚀 FEATURE BUILT FOR META GLOBAL AI DEVELOPER HACKATHON 2026.
import { LEGAL } from './legal'

export interface LegalSection {
  heading: string
  body: string[]
}

export type LegalDocKey = 'privacy' | 'terms' | 'refunds' | 'cookies' | 'legal-notice'

const fr: Record<LegalDocKey, { title: string; updated: string; sections: LegalSection[] }> = {
  privacy: {
    title: 'Politique de confidentialité (RGPD)',
    updated: 'Dernière mise à jour : 15/11/2026',
    sections: [
      {
        heading: 'Données collectées & Principe de minimisation',
        body: [
          'Compte : adresse e-mail, mot de passe stocké sous forme hachée sécurisée (jamais en clair), nom d’affichage et image de profil si vous choisissez d’en renseigner une.',
          'Contenus importés : fichiers et images d’œuvres séquentielles (mangas, manhwas, manhuas, webtoons, bandes dessinées aux formats JPG, PNG, WEBP, PDF), pages extraites, coordonnées et masques de bulles, textes transcrits, propositions de traduction, glossaires terminologiques et mémoires de traduction personnalisées.',
          'Usage et comptabilité IA : solde de crédits (crédits mensuels d’abonnement, crédits achetés permanents, crédits en cours de réservation), historique traçable et horodaté des consommations par moteur, et journaux techniques nécessaires à la sécurité et à la prévention des abus.',
          'Principe de minimisation : nous ne demandons aucune coordonnée postale, aucun numéro de téléphone ni aucune donnée sensible non indispensable pour utiliser Taurge.',
        ],
      },
      {
        heading: 'Finalité exclusive & Non-réutilisation formelle pour l’entraînement IA',
        body: [
          'Vos contenus (images, planches, textes originaux et traductions) servent exclusivement et strictement à la fourniture du service que vous sollicitez : reconnaissance optique de caractères (OCR), traduction contextuelle de dialogue et nettoyage graphique de bulles (inpainting).',
          'ENGAGEMENT FORMEL : Taurge s’engage expressément à ne jamais revendre, louer ou céder vos données personnelles et vos contenus à des tiers. Vos planches, illustrations et traductions ne sont JAMAIS utilisées pour entraîner, ré-entraîner ou enrichir des modèles d’intelligence artificielle publics ou tiers sans votre consentement préalable, explicite et écrit.',
          'Exécution locale privilégiée : les opérations d’OCR (MangaOCR, PaddleOCR, Tesseract) et de nettoyage (OpenCV, LaMa ONNX) ainsi que la traduction standard (Ollama) s’exécutent sur notre infrastructure sécurisée.',
          'Sous-traitance de traduction : si vous choisissez expressément le moteur DeepL API Premium pour affiner une traduction, seuls les fragments de texte brut des bulles concernées sont transmis de manière chiffrée à DeepL en tant que sous-traitant technique de traduction. Aucun fichier complet ni aucune planche graphique n’y est transmise.',
        ],
      },
      {
        heading: 'Sous-traitants techniques et prestataires de paiement certifiés',
        body: [
          'Paiements sécurisés : FedaPay (Afrique francophone / Mobile Money) et Paddle (international / Cartes bancaires) traitent les transactions financières conformément aux standards bancaires PCI-DSS. Taurge ne reçoit, ne traite et ne stocke à aucun moment vos numéros complets de carte bancaire.',
          'Hébergement et infrastructure : les serveurs d’application et de stockage sont hébergés chez des prestataires certifiés assurant le chiffrement des données au repos et en transit (HTTPS / TLS 1.3).',
          'Mesure d’audience anonymisée : Vercel Analytics recueille des statistiques anonymisées d’utilisation, uniquement si vous y avez consenti via la bannière de cookies.',
        ],
      },
      {
        heading: 'Conservation des données et Sécurité',
        body: [
          `Données hébergées par : ${LEGAL.hostName} (${LEGAL.hostAddress}).`,
          'Vos projets, chapitres, planches et glossaires sont conservés tant que votre compte utilisateur demeure actif.',
          'Les pièces comptables et historiques de transactions d’achat de crédits sont conservés pendant les délais légaux impératifs imposés par le droit fiscal et comptable.',
        ],
      },
      {
        heading: 'Vos droits (RGPD) & Droit à l’effacement immédiat (Droit à l’oubli)',
        body: [
          'Conformément au Règlement Général sur la Protection des Données (RGPD) et aux législations applicables, vous bénéficiez d’un droit d’accès, de rectification, de portabilité, de limitation et d’opposition sur vos données personnelles.',
          'Droit à l’effacement direct : à tout moment, vous pouvez cliquer sur « Supprimer mon compte et mes données » dans vos paramètres (Paramètres → Sécurité). Cette action supprime immédiatement, totalement et irréversiblement l’ensemble de vos projets, planches, traductions, glossaires et identifiants de nos bases de données.',
          `Pour toute question ou exercice de vos droits, vous pouvez contacter directement notre responsable de la protection des données : ${LEGAL.privacyEmail}. Une réponse vous est apportée sous un délai maximum de 30 jours.`,
          'Bases légales de traitement : exécution contractuelle (gestion du compte, calculs de crédits, fourniture des outils), respect des obligations légales (comptabilité) et consentement exprès (cookies de mesure d’audience optionnels).',
        ],
      },
    ],
  },
  terms: {
    title: 'Conditions Générales de Vente et d’Utilisation (CGV / CGU)',
    updated: 'Dernière mise à jour : 15/11/2026',
    sections: [
      {
        heading: '1. Objet du Service & Périmètre',
        body: [
          'Taurge est une plateforme SaaS professionnelle d’assistance à la localisation et au lettrage d’œuvres graphiques séquentielles (mangas, manhwas, manhuas, webtoons, comics et bandes dessinées) : import de planches, reconnaissance optique de texte (OCR), traduction assistée par intelligence artificielle, nettoyage de bulles (inpainting) et studio d’exportation typographique.',
          'Les résultats générés par les moteurs d’IA sont des aides au travail créatif destinées à être relues, corrigées et validées par l’utilisateur. Taurge ne garantit pas une précision automatisée à 100 % exempte de révision humaine.',
        ],
      },
      {
        heading: '2. Propriété intellectuelle et responsabilité légale de l’utilisateur',
        body: [
          'L’utilisateur conserve l’entière et exclusive propriété intellectuelle de ses œuvres, scans, traductions, lettrages et créations dérivées. Taurge n’acquiert aucun droit de propriété sur vos contenus.',
          'L’utilisateur garantit être titulaire des droits nécessaires ou disposer de l’autorisation expresse des ayants droit (licence légale, mandat d’édition, domaine public) pour importer, reproduire, traduire et traiter les œuvres soumises au service. Taurge décline toute responsabilité en cas de contrefaçon ou d’utilisation illicite réalisée par un tiers sur la plateforme. Tout contenu signalé en infraction pourra faire l’objet d’un retrait immédiat.',
        ],
      },
      {
        heading: '3. Système de Crédits IA & Barème Officiel',
        body: [
          'Les crédits IA constituent l’unité interne de mesure et de facturation des ressources de calcul consommées par les moteurs de la plateforme.',
          'Barème officiel en vigueur :',
          '• Reconnaissance de texte (OCR standard) : 1 crédit par page analysée avec succès (MangaOCR, PaddleOCR ou Tesseract).',
          '• Traduction IA Standard (Ollama Local) : 1 crédit par tranche entamée de 1 000 caractères source (espaces compris, arrondi au millier supérieur).',
          '• Traduction IA Premium (DeepL API) : 4 crédits par tranche entamée de 1 000 caractères source (espaces compris, arrondi au millier supérieur).',
          '• Nettoyage Standard (OpenCV) : 1 crédit par page nettoyée.',
          '• Nettoyage Neuronal (LaMa ONNX) : 2 crédits par page (jusqu’à 5 zones complexes).',
          'Système anti-double débit et réservation atomique : avant chaque traitement payant, une prévisualisation transparente affiche le coût estimé. Les crédits requis sont temporairement réservés. Si l’opération échoue techniquement ou si un moteur de repli intervient, aucun double débit n’est appliqué et les crédits réservés sont immédiatement et intégralement restitués au solde de l’utilisateur.',
        ],
      },
      {
        heading: '4. Fonctionnement du Renouvellement et Validité des Crédits',
        body: [
          'Le système gère deux catégories étanches de crédits afin de garantir une totale transparence comptable :',
          '1. Crédits mensuels d’abonnement (Free, Creator, Team, Studio) : alloués au premier jour de chaque cycle mensuel de facturation (ou date d’anniversaire). Ces crédits sont consommés en priorité absolue lors de vos traitements IA. Ils se renouvellent chaque mois et ne sont pas reportables d’un mois sur l’autre en cas de non-utilisation.',
          '2. Crédits achetés en packs rechargeables : acquis de manière définitive, ils N’EXPIRENT JAMAIS. Ils demeurent valables et utilisables sans limitation de durée tant que votre compte est ouvert. Ils sont automatiquement débités en relais dès que votre quota mensuel d’abonnement est épuisé.',
        ],
      },
      {
        heading: '5. Que se passe-t-il en cas d’épuisement des crédits ? (Garantie de continuité)',
        body: [
          'L’épuisement de votre solde de crédits N’ENTRAÎNE AUCUNE SUPPRESSION NI AUCUN BLOCAGE DE VOS PROJETS. Vos œuvres, chapitres, scans, bulles, textes traduits et glossaires restent intégralement accessibles et préservés.',
          'Vous conservez un accès permanent et illimité en consultation, en édition manuelle de vos bulles de texte et en exportation de vos planches finalisées.',
          'Seul le déclenchement de nouveaux traitements automatiques nécessitant la puissance des moteurs IA (nouvelle analyse OCR, nouvelle traduction automatique, nouvel inpainting) est temporairement suspendu.',
          'Le traitement IA redevient immédiatement disponible dès la recharge de votre compte par l’acquisition d’un pack de crédits, le changement de formule ou le renouvellement de votre forfait mensuel à sa date d’échéance.',
        ],
      },
      {
        heading: '6. Tarifs, Facturation et Droit de Rétractation (14 jours)',
        body: [
          'Les prix des abonnements et des packs sont indiqués en Euros (€) toutes taxes comprises (TTC). Ils sont modifiables à tout moment pour les périodes futures, sous réserve d’une information préalable.',
          'Droit de rétractation : conformément aux règles relatives aux prestations de services et contenus numériques, vous disposez d’un délai légal de quatorze (14) jours à compter de la transaction pour exercer votre droit de rétractation sur les packs de crédits achetés, à la condition expresse qu’ils n’aient pas été consommés.',
          'Les crédits consommés lors d’opérations IA exécutées avec succès ne sont pas remboursables, le service correspondant ayant été intégralement fourni.',
        ],
      },
      {
        heading: '7. Disponibilité, Suspension et Résiliation',
        body: [
          'Taurge met en œuvre tous les moyens raisonnables pour assurer la disponibilité continue du service 24h/24 et 7j/7, sous réserve d’éventuelles interventions de maintenance ou de contraintes techniques d’hébergement.',
          'Vous pouvez résilier votre abonnement ou fermer définitivement votre compte à tout moment depuis vos paramètres utilisateur, sans frais ni pénalité.',
          'Taurge se réserve le droit de suspendre ou fermer sans préavis l’accès d’un utilisateur en cas de manquement grave aux présentes conditions (atteinte aux droits d’auteur, tentative de rétro-ingénierie, fraude au paiement ou contournement des quotas).',
        ],
      },
    ],
  },
  refunds: {
    title: 'Politique de remboursement',
    updated: 'Dernière mise à jour : 15/11/2026',
    sections: [
      {
        heading: 'Crédits consommés',
        body: [
          'Les crédits déjà consommés lors de traitements IA exécutés avec succès (OCR validé, traduction générée, nettoyage appliqué) ne sont pas remboursables, la prestation technique ayant été pleinement délivrée.',
        ],
      },
      {
        heading: 'Crédits non consommés & Droit de rétractation',
        body: [
          'Les packs de crédits achetés et non encore consommés sont éligibles à un remboursement intégral sur simple demande formulée dans les quatorze (14) jours suivant la date d’achat.',
          `Pour solliciter un remboursement : contactez ${LEGAL.contactEmail} en indiquant l’adresse e-mail de votre compte Taurge et la référence de paiement. Le remboursement est émis sous 14 jours ouvrés via le moyen de paiement d’origine (carte bancaire Paddle ou Mobile Money FedaPay).`,
          'Au-delà du délai légal de 14 jours, les crédits achetés demeurent acquis sans date d’expiration sur votre compte, mais ne sont plus remboursables.',
        ],
      },
      {
        heading: 'Garantie anti-incident et débits erronés',
        body: [
          'Grâce au protocole de réservation en deux temps de Taurge, tout échec technique lors d’une opération IA entraîne automatiquement et immédiatement la libération des crédits réservés, sans aucun débit effectif.',
          'En cas d’incident technique exceptionnel ou de double débit avéré, nous procédons à la restitution immédiate en crédits ou au remboursement monétaire direct sur simple vérification des journaux de transaction.',
        ],
      },
    ],
  },
  cookies: {
    title: 'Politique des cookies',
    updated: 'Dernière mise à jour : 15/11/2026',
    sections: [
      {
        heading: 'Cookies strictement nécessaires (sans consentement)',
        body: [
          'Session et sécurité : jeton d’authentification sécurisé stocké dans le navigateur (localStorage), indispensable pour maintenir votre session ouverte.',
          'Préférences : langue d’interface (cookie NEXT_LOCALE, durée de conservation 1 an) et thème d’affichage clair ou sombre (localStorage).',
          'Consentement : mémorisation de votre choix de cookies (localStorage, durée 12 mois) afin de ne pas réafficher la bannière.',
        ],
      },
      {
        heading: 'Mesure d’audience (soumise à votre accord)',
        body: [
          'Vercel Analytics : recueil de statistiques de fréquentation anonymisées et agrégées, activé uniquement après un clic sur « Accepter » dans notre bandeau de consentement.',
          'Aucun cookie publicitaire, aucun traceur de reciblage tiers et aucune vente de vos habitudes de navigation ne sont pratiqués sur Taurge.',
          'Vous pouvez retirer ou modifier votre consentement à tout moment en réinitialisant les cookies du site dans votre navigateur.',
        ],
      },
    ],
  },
  'legal-notice': {
    title: 'Mentions légales',
    updated: 'Dernière mise à jour : 15/11/2026',
    sections: [
      {
        heading: 'Éditeur de la plateforme',
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
        heading: 'Propriété intellectuelle et licences logicielles',
        body: [
          'L’interface logicielle, la dénomination, la charte graphique et le logo Taurge sont la propriété exclusive de l’éditeur. Les contenus importés et traités par les utilisateurs demeurent leur propriété intégrale.',
          'Typographies et icônes : familles de polices libres de droit (Inter, JetBrains Mono sous licence SIL Open Font License) et icônes Lucide (sous licence ISC). Aucune œuvre commerciale protégée n’est incluse dans les exemples d’illustration par défaut.',
        ],
      },
    ],
  },
}

const en: Record<LegalDocKey, { title: string; updated: string; sections: LegalSection[] }> = {
  privacy: {
    title: 'Privacy Policy (GDPR)',
    updated: 'Last updated: 2026-11-15',
    sections: [
      {
        heading: 'Collected Data & Data Minimization',
        body: [
          'Account: email address, password stored in secure hashed format (never in plain text), display name and optional profile avatar.',
          'User Content: uploaded sequential graphic files and images (manga, manhwa, manhua, webtoons, comic books in JPG, PNG, WEBP, PDF formats), extracted pages, bubble coordinates and masks, transcribed texts, AI translation suggestions, custom glossaries and translation memories.',
          'AI usage and accounting: credit balance (monthly subscription credits, permanent purchased pack credits, reserved locks), detailed dated history of AI engine operations, and technical security logs.',
          'Data minimization: we do not ask for a postal address, phone number or sensitive unnecessary information to use Taurge.',
        ],
      },
      {
        heading: 'Exclusive Purpose & Formal Non-Reuse for AI Training',
        body: [
          'Your content (images, comic pages, original texts, translations) is used exclusively and strictly to provide the service requested: Optical Character Recognition (OCR), contextual dialogue translation, and comic bubble inpainting.',
          'FORMAL COMMITMENT: Taurge explicitly commits to never selling, renting, or transferring your personal data and content to third parties. Your scans, artwork, and translations are NEVER used to train, fine-tune, or enrich public or third-party artificial intelligence models without your prior, explicit, written consent.',
          'Local processing: OCR operations (MangaOCR, PaddleOCR, Tesseract) and graphic cleaning (OpenCV, LaMa ONNX) as well as standard translation (Ollama) run on our secure infrastructure.',
          'Translation subcontracting: if you explicitly select DeepL API Premium to refine translations, only the raw text strings of selected bubbles are transmitted encrypted to DeepL as an external technical processor. No full files or page artwork are ever transmitted.',
        ],
      },
      {
        heading: 'Technical Subprocessors and Certified Payment Gateways',
        body: [
          'Secure Payments: FedaPay (francophone Africa / Mobile Money) and Paddle (international / Credit Cards) process all financial transactions under strict PCI-DSS banking standards. Taurge never receives, accesses, or stores your complete payment card details.',
          'Hosting & Storage: application servers and storage are hosted by certified providers ensuring data encryption both at rest and in transit (HTTPS / TLS 1.3).',
          'Audience Analytics: Vercel Analytics collects aggregated anonymous metrics only after explicit consent via our cookie banner.',
        ],
      },
      {
        heading: 'Data Retention and Security',
        body: [
          `Data hosted by: ${LEGAL.hostNameEn} (${LEGAL.hostAddress}).`,
          'Your projects, chapters, pages, and glossaries are retained as long as your user account remains active.',
          'Accounting records and credit purchase transaction logs are retained for statutory periods required by tax and financial laws.',
        ],
      },
      {
        heading: 'Your Rights (GDPR) & Immediate Right to Erasure',
        body: [
          'Under the General Data Protection Regulation (GDPR) and applicable data protection legislation, you have the right to access, rectify, port, limit, and erase your personal data.',
          'Self-service account deletion: you can click “Delete my account and data” in your settings at any time (Settings → Security). This permanently, totally, and irreversibly deletes all your projects, pages, translations, glossaries, and credentials from our databases and storage.',
          `To exercise your rights or contact our data protection team: ${LEGAL.privacyEmail}. We reply within a maximum of 30 days.`,
          'Legal grounds: contract performance (account management, credit allocation, tool delivery), legal compliance (accounting), and consent (optional analytics cookies).',
        ],
      },
    ],
  },
  terms: {
    title: 'Terms of Service and Sale (TOS / GCS)',
    updated: 'Last updated: 2026-11-15',
    sections: [
      {
        heading: '1. Service Scope and Purpose',
        body: [
          'Taurge is a professional SaaS platform designed to assist in the localization and lettering of sequential graphic art (manga, manhwa, manhua, webtoons, and comic books): image upload, Optical Character Recognition (OCR), AI-assisted translation, bubble cleaning/inpainting, and typographic export studio.',
          'AI-generated outputs are creative drafting aids that require human review and proofreading. Taurge does not guarantee 100% automated accuracy without human verification.',
        ],
      },
      {
        heading: '2. Intellectual Property and User Legal Responsibility',
        body: [
          'Users retain full, exclusive copyright and intellectual property rights over their original works, scans, translations, letterings, and derivative creations. Taurge claims zero ownership over your content.',
          'Users warrant they hold all necessary rights, licenses, or authorisations (publishing license, public domain, copyright holder agreement) to upload, reproduce, translate, and edit works submitted to the service. Taurge disclaims liability for any infringing or unlawful activity carried out by users. Any content reported for infringement may be removed immediately.',
        ],
      },
      {
        heading: '3. AI Credit System & Official Tariff',
        body: [
          'AI credits are the internal accounting unit measuring computational resources consumed by the platform’s engines.',
          'Official Tariff in force:',
          '• Standard OCR: 1 credit per successfully analysed page (MangaOCR, PaddleOCR, or Tesseract).',
          '• Standard Translation (Local Ollama): 1 credit per started slice of 1,000 source characters (including spaces, rounded up).',
          '• Premium Translation (DeepL API): 4 credits per started slice of 1,000 source characters (including spaces, rounded up).',
          '• Standard Bubble Cleaning (OpenCV): 1 credit per page cleaned.',
          '• Neural Inpainting (LaMa ONNX): 2 credits per page (up to 5 complex bubble areas).',
          'Atomic reservation & anti-double charge guarantee: before any paid job begins, an upfront cost preview is shown. The required credits are temporarily held in reservation. If a job fails technically or triggers an automatic fallback, no duplicate charge occurs and held credits are instantly released back to your available balance.',
        ],
      },
      {
        heading: '4. Renewal Mechanics and Credit Validity (Subscription vs Packs)',
        body: [
          'Taurge manages two separate, transparent credit balances:',
          '1. Monthly Subscription Credits (Free, Creator, Team, Studio): allocated on the first day of each billing cycle. These credits are consumed first for all AI operations. They renew each month and do not roll over to subsequent months if unused.',
          '2. Purchased Credit Packs: permanently owned, THEY NEVER EXPIRE. They remain valid with zero expiration date for as long as your account exists. They automatically take over whenever your monthly allowance is depleted.',
        ],
      },
      {
        heading: '5. What Happens When You Run Out of Credits? (Project Safety Guarantee)',
        body: [
          'Exhausting your credit balance NEVER DELETES OR LOCKS YOUR PROJECTS. All your series, chapters, uploaded pages, detected bubbles, translated scripts, and custom glossaries remain intact and accessible.',
          'You retain full, unlimited access to view, manually edit speech bubbles, and download/export your completed pages.',
          'Only the execution of new heavy automated AI jobs (new OCR detection, automated translation, neural inpainting) is temporarily paused.',
          'AI capabilities resume immediately upon topping up via a credit pack, upgrading your tier, or reaching your next monthly renewal date.',
        ],
      },
      {
        heading: '6. Pricing, Billing and 14-Day Right of Withdrawal',
        body: [
          'Subscription and pack prices are quoted in Euros (€) inclusive of all applicable taxes (VAT). Prices may be adjusted for future billing periods with advance notice.',
          'Right of withdrawal: in accordance with digital service regulations, you have a statutory 14-day right of withdrawal on purchased credit packs, provided no credits from that pack have been consumed.',
          'Credits already spent on successfully executed AI operations are non-refundable as the technical service was fully rendered.',
        ],
      },
      {
        heading: '7. Availability, Suspension and Termination',
        body: [
          'Taurge employs reasonable measures to maintain 24/7 service availability, subject to scheduled maintenance or hosting provider constraints.',
          'You may cancel your subscription or delete your account at any time in user settings without penalty or cancellation fees.',
          'Taurge reserves the right to suspend or terminate accounts in cases of severe breach (copyright infringement, reverse-engineering attempts, payment fraud, or quota circumvention).',
        ],
      },
    ],
  },
  refunds: {
    title: 'Refund Policy',
    updated: 'Last updated: 2026-11-15',
    sections: [
      {
        heading: 'Used Credits',
        body: [
          'Credits consumed on successfully completed AI jobs (completed OCR, generated translations, applied bubble cleaning) are non-refundable as the computing service was delivered.',
        ],
      },
      {
        heading: 'Unused Credits & Statutory Withdrawal',
        body: [
          'Purchased, unused credit packs are eligible for a full refund upon request within fourteen (14) days of purchase.',
          `To request a refund: contact ${LEGAL.contactEmail} with your account email and transaction reference. Refunds are processed within 14 business days via the original payment method (Paddle or FedaPay).`,
          'After the 14-day statutory period, purchased credits remain permanently valid on your account but are non-refundable.',
        ],
      },
      {
        heading: 'Technical Incident & Duplicate Charge Guarantee',
        body: [
          'Thanks to Taurge’s two-phase atomic reservation protocol, technical job failures automatically release reserved credits back to your balance immediately without charge.',
          'In case of any proven technical irregularity or duplicate billing, we issue an immediate credit restitution or financial refund upon log verification.',
        ],
      },
    ],
  },
  cookies: {
    title: 'Cookie Policy',
    updated: 'Last updated: 2026-11-15',
    sections: [
      {
        heading: 'Strictly necessary cookies (no consent required)',
        body: [
          'Session and security: authentication token stored in the browser (localStorage), required to keep you signed in.',
          'Preferences: interface language (NEXT_LOCALE cookie, 1 year duration) and light/dark theme preference (localStorage).',
          'Consent record: your cookie choice (localStorage, 12 months) so the banner does not reappear.',
        ],
      },
      {
        heading: 'Audience measurement (consent required)',
        body: [
          'Vercel Analytics: aggregated anonymous traffic statistics, enabled only after you click “Accept” in the banner.',
          'No advertising cookies, no third-party trackers, and no sale of browsing habits are practiced on Taurge.',
          'You can change or revoke your cookie choices at any time by clearing your browser site data.',
        ],
      },
    ],
  },
  'legal-notice': {
    title: 'Legal Notice',
    updated: 'Last updated: 2026-11-15',
    sections: [
      {
        heading: 'Platform Publisher',
        body: [
          LEGAL.companyName,
          LEGAL.legalStatusEn,
          LEGAL.addressEn,
          `Contact: ${LEGAL.contactEmail}`,
        ],
      },
      { heading: 'Hosting Provider', body: [`${LEGAL.hostNameEn} — ${LEGAL.hostAddress}`] },
      {
        heading: 'Service Intellectual Property',
        body: [
          'The Taurge interface, branding, code, and logo belong exclusively to the publisher. Content uploaded and processed by users remains their exclusive property.',
          'Fonts and icons: open-source typography (Inter, JetBrains Mono — SIL Open Font License) and Lucide icons (ISC license). No copyrighted commercial work is used in default examples.',
        ],
      },
    ],
  },
}

export function getLegalDoc(locale: string, key: LegalDocKey) {
  return (locale === 'en' ? en : fr)[key]
}

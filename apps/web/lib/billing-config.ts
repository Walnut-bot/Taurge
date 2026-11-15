/**
 * Configuration de l'affichage commercial et des paiements Taurge
 *
 * Mode Bêta-Testeur :
 * - `SHOW_PUBLIC_PRICES = false` :
 *     Masque l'affichage public des prix en euros (0 €, 8,99 €, 24,99 €, 79 €+ et packs payants)
 *     dans l'interface web pour permettre aux testeurs d'essayer l'application librement
 *     sans confusion financière, avec les crédits alloués pour les tests.
 * - `SHOW_PUBLIC_PRICES = true` :
 *     Réactive instantanément l'affichage commercial public des tarifs et les boutons de paiement
 *     directs (FedaPay / Paddle) pour la mise en commercialisation.
 */
export const SHOW_PUBLIC_PRICES = false

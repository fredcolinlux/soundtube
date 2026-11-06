// Mentions légales / privacy / terms — modèles FR+EN. Les champs perso viennent d’Admin (publisher), jamais du dépôt.
const PH = {
  name: { fr: '[Nom de l’éditeur à renseigner dans Admin › Sécurité › Avancé]', en: '[Publisher name — set in Admin › Security › Advanced]' },
  address: { fr: '[Adresse à renseigner dans Admin]', en: '[Address — set in Admin]' },
  email: { fr: '[contact@example.com]', en: '[contact@example.com]' },
  host: { fr: '[Hébergeur à renseigner dans Admin]', en: '[Hosting provider — set in Admin]' },
};

function pub(security, lang) {
  const p = security?.publisher || {};
  const L = lang === 'en' ? 'en' : 'fr';
  return {
    name: p.name || PH.name[L],
    address: p.address || PH.address[L],
    email: p.email || PH.email[L],
    host: p.host || PH.host[L],
    domain: security?.publicDomain || '—',
  };
}

export function buildLegalNotice(security, lang = 'fr') {
  const p = pub(security, lang);
  const add = (security?.legal || {})[lang] || '';
  if (lang === 'en') {
    return [
      'Legal notice',
      '',
      `Publisher / editor: ${p.name}`,
      `Address: ${p.address}`,
      `Contact: ${p.email}`,
      `Public site: ${p.domain}`,
      `Hosting: ${p.host}`,
      '',
      'Intellectual property: all rights reserved. The soundtube software is distributed under its open-source licence (see the project repository). Tracks, videos, thumbnails and texts generated through this instance remain under the responsibility of the instance operator.',
      '',
      'AI / algorithmic generation: music, titles, descriptions and visuals may be produced by deterministic algorithms and/or optional local AI models (e.g. an art director). No personal training data is sent to third-party cloud AI by default. Generated content is instrumental and synthetic; the operator is responsible for its publication.',
      '',
      add ? 'Additional notice:\n' + add : '',
    ].filter(Boolean).join('\n');
  }
  return [
    'Mentions légales',
    '',
    `Éditeur / responsable de la publication : ${p.name}`,
    `Adresse : ${p.address}`,
    `Contact : ${p.email}`,
    `Site public : ${p.domain}`,
    `Hébergeur : ${p.host}`,
    '',
    'Propriété intellectuelle : tous droits réservés. Le logiciel soundtube est distribué sous sa licence open source (voir le dépôt du projet). Les morceaux, vidéos, miniatures et textes générés via cette instance restent sous la responsabilité de l’exploitant de l’instance.',
    '',
    'Génération algorithmique / IA : la musique, les titres, descriptions et visuels peuvent être produits par des algorithmes déterministes et/ou des modèles d’IA locaux optionnels (ex. directeur artistique). Aucune donnée personnelle n’est envoyée par défaut à une IA cloud tierce. Le contenu généré est instrumental et synthétique ; l’exploitant est responsable de sa publication.',
    '',
    add ? 'Complément :\n' + add : '',
  ].filter(Boolean).join('\n');
}

export function buildPrivacy(security, lang = 'fr') {
  const p = pub(security, lang);
  const add = (security?.privacy || {})[lang] || '';
  if (lang === 'en') {
    return [
      'Privacy policy (GDPR)',
      '',
      `Data controller: ${p.name} — ${p.email}`,
      '',
      'Data collected:',
      '• Account data: username, password hash (scrypt), optional TOTP secret / passkeys, role, quotas.',
      '• Technical logs: authentication audit (IP, action, timestamp), render history.',
      '• Strictly necessary cookies only: session cookie (authentication) and UI language preference. No advertising, no third-party trackers → no cookie consent banner is required.',
      '',
      'Purpose: operate the music studio, secure access, fair quotas, optional YouTube publishing you configure.',
      'Legal basis: legitimate interest in running the service you installed; contract if you offer accounts to third parties.',
      'Retention: accounts until deletion by an admin; audit logs rotated/kept as configured on the server; session cookies expire with the session TTL (default 12 h).',
      'Recipients: data stays on your server. Optional YouTube API credentials you enter are encrypted at rest and used only to publish on your behalf.',
      'Rights: access, rectification, erasure, restriction, objection — contact the controller. You may lodge a complaint with your supervisory authority (e.g. CNIL in France).',
      'No automated decision-making with legal effects beyond optional generation settings you choose.',
      '',
      add ? 'Additional notice:\n' + add : '',
    ].filter(Boolean).join('\n');
  }
  return [
    'Politique de confidentialité (RGPD)',
    '',
    `Responsable du traitement : ${p.name} — ${p.email}`,
    '',
    'Données collectées :',
    '• Compte : nom d’utilisateur, empreinte du mot de passe (scrypt), secret TOTP / passkeys optionnels, rôle, quotas.',
    '• Journaux techniques : audit d’authentification (IP, action, horodatage), historique de rendu.',
    '• Cookies strictement nécessaires uniquement : cookie de session (authentification) et préférence de langue d’interface. Pas de publicité, pas de traceurs tiers → pas de bandeau cookies.',
    '',
    'Finalités : faire fonctionner le studio, sécuriser l’accès, appliquer les quotas, publier sur YouTube si tu le configures.',
    'Base légale : intérêt légitime à faire tourner le service que tu as installé ; contrat si tu ouvres des comptes à des tiers.',
    'Durées : comptes jusqu’à suppression par un admin ; journaux selon la rétention du serveur ; cookies de session selon le TTL (12 h par défaut).',
    'Destinataires : les données restent sur ton serveur. Les secrets YouTube saisis sont chiffrés au repos et utilisés seulement pour publier en ton nom.',
    'Droits : accès, rectification, effacement, limitation, opposition — contacte le responsable. Réclamation possible auprès de la CNIL (ou autorité locale).',
    'Pas de décision automatisée produisant des effets juridiques au-delà des réglages de génération que tu choisis.',
    '',
    add ? 'Complément :\n' + add : '',
  ].filter(Boolean).join('\n');
}

export function buildTerms(security, lang = 'fr') {
  const p = pub(security, lang);
  const add = (security?.terms || {})[lang] || '';
  if (lang === 'en') {
    return [
      'Terms of use',
      '',
      `Operator: ${p.name} (${p.email}).`,
      '',
      'The service generates instrumental music and related media on the operator’s infrastructure. You must have the rights to any media you import (animations, samples beyond the bundled CC0 set).',
      'Do not use the service for unlawful content, copyright infringement, or abusive automated access.',
      'Generated output is provided as-is; the operator does not guarantee fitness for monetization on third-party platforms (e.g. YouTube).',
      'Accounts may be suspended for abuse. The software is provided under its open-source licence without warranty.',
      '',
      add ? 'Additional terms:\n' + add : '',
    ].filter(Boolean).join('\n');
  }
  return [
    'Conditions d’utilisation',
    '',
    `Exploitant : ${p.name} (${p.email}).`,
    '',
    'Le service génère de la musique instrumentale et des médias associés sur l’infrastructure de l’exploitant. Tu dois détenir les droits sur tout média importé (animations, samples hors pack CC0 fourni).',
    'Interdit : contenus illicites, atteinte au droit d’auteur, accès automatisé abusif.',
    'Les sorties générées sont fournies en l’état ; l’exploitant ne garantit pas l’éligibilité à la monétisation sur des plateformes tierces (ex. YouTube).',
    'Les comptes peuvent être suspendus en cas d’abus. Le logiciel est fourni sous sa licence open source, sans garantie.',
    '',
    add ? 'Complément :\n' + add : '',
  ].filter(Boolean).join('\n');
}

export function legalBundle(security, lang = 'fr') {
  return {
    lang,
    domain: security?.publicDomain || null,
    publisher: pub(security, lang),
    notice: buildLegalNotice(security, lang),
    privacy: buildPrivacy(security, lang),
    terms: buildTerms(security, lang),
  };
}

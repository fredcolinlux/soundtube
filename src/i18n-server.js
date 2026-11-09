// Messages d'erreur API bilingues (cookie soundtube_ui_lang / Accept-Language).
const MSG = {
  notFound: { fr: 'Introuvable', en: 'Not found' },
  authRequired: { fr: 'Authentification requise', en: 'Authentication required' },
  rateLimited: { fr: 'Trop de tentatives. Réessaie plus tard.', en: 'Too many attempts. Try again later.' },
  registrationClosed: { fr: 'Inscriptions fermées', en: 'Registration is closed' },
  forbidden: { fr: 'Droits insuffisants', en: 'Insufficient permissions' },
  csrf: { fr: 'Jeton CSRF invalide', en: 'Invalid CSRF token' },
  badCreds: { fr: 'Identifiants incorrects', en: 'Invalid credentials' },
  locked: { fr: 'Compte temporairement verrouillé. Réessayez plus tard.', en: 'Account temporarily locked. Try again later.' },
  trackNotFound: { fr: 'Morceau introuvable', en: 'Track not found' },
  // v1.21.4 : morceaux de la démo + samples externes
  demoTracksInvalid: { fr: 'ids doit être une liste de morceaux', en: 'ids must be a list of tracks' },
  demoTracksMax: { fr: 'Au plus 10 morceaux dans la démo', en: 'At most 10 tracks in the demo' },
  demoTracksIneligible: { fr: 'Morceau non éligible à la démo (terminé, moins de 5 min, avec un audio)', en: 'Track not eligible for the demo (finished, under 5 min, with audio)' },
  demoListenOnly: { fr: 'Démo : écoute seule. Connecte-toi pour télécharger, publier ou modifier.', en: 'Demo: listen only. Sign in to download, publish or edit.' },
  extDirAbsolute: { fr: 'Dossier invalide : chemin absolu attendu (ex. /mnt/samples), sans « .. »', en: 'Invalid folder: absolute path expected (e.g. /mnt/samples), without “..”' },
  extDirOwn: { fr: 'Dossier refusé : il ne peut pas être dans les dossiers de soundtube', en: 'Folder refused: it cannot be inside soundtube’s own folders' },
  extDirSystem: { fr: 'Dossier refusé : dossier système', en: 'Folder refused: system folder' },
  extDirMissing: { fr: 'Dossier de samples introuvable ou illisible par le service soundtube', en: 'Samples folder missing or not readable by the soundtube service' },
  jobNotFound: { fr: 'Tâche introuvable', en: 'Job not found' },
  fileUnavailable: { fr: 'Fichier indisponible', en: 'File unavailable' },
  queueFull: { fr: "File d'attente pleine, réessayez plus tard.", en: 'Queue full, try again later.' },
  readOnly: { fr: 'Lecture seule', en: 'Read-only' },
  unknownRoute: { fr: 'Route inconnue', en: 'Unknown route' },
  internal: { fr: 'Erreur interne', en: 'Internal error' },
  notConnected: { fr: 'Non connecté', en: 'Not signed in' },
  invalidCode: { fr: 'Code invalide', en: 'Invalid code' },
  sessionInvalid: { fr: 'Session invalide', en: 'Invalid session' },
  alreadySetup: { fr: 'Déjà initialisé', en: 'Already initialized' },
  linkExpired: { fr: 'Lien expiré ou invalide', en: 'Link expired or invalid' },
  accessDenied: { fr: 'Accès refusé', en: 'Access denied' },
  emptyTitle: { fr: 'Titre vide', en: 'Empty title' },
  unknownStyle: { fr: 'Style inconnu', en: 'Unknown style' },
  animNotFound: { fr: 'Animation introuvable dans la bibliothèque', en: 'Animation not found in library' },
  fileMissing: { fr: 'Fichier manquant', en: 'Missing file' },
  shortPassword: { fr: 'Mot de passe trop court (min. 10)', en: 'Password too short (min. 10)' },
  badUsername: { fr: 'Nom d’utilisateur invalide (3–32, a-z 0-9 ._-).', en: 'Invalid username (3–32, a-z 0-9 ._-).' },
  userTaken: { fr: 'Nom déjà pris', en: 'Username taken' },
  userNotFound: { fr: 'Utilisateur introuvable', en: 'User not found' },
  lastAdmin: { fr: 'Impossible de supprimer le dernier admin', en: 'Cannot delete the last admin' },
  unknownRole: { fr: 'Rôle inconnu', en: 'Unknown role' },
  tokenNotFound: { fr: 'Jeton introuvable', en: 'Token not found' },
  no2fa: { fr: 'Pas de 2FA en cours', en: 'No 2FA in progress' },
  challengeExpired: { fr: 'Défi expiré', en: 'Challenge expired' },
  badPassword: { fr: 'Mot de passe actuel incorrect', en: 'Current password incorrect' },
  passkeyUnknown: { fr: 'Passkey inconnue', en: 'Unknown passkey' },
  demoRate: { fr: 'Limite de démos atteinte (3 / 10 min). Connecte-toi pour générer sans limite.', en: 'Demo limit reached (3 / 10 min). Sign in to generate without this cap.' },
  demoBusy: { fr: 'File démo saturée, réessaie dans un instant.', en: 'Demo queue busy, try again shortly.' },
  demoUseFull: { fr: 'Compte connecté : utilise Générer (studio) pour un morceau complet.', en: 'Signed in: use Generate (studio) for a full track.' },
  demoNoAudio: { fr: 'Démo : audio indisponible', en: 'Demo: audio unavailable' },
  demoPreviewOnly: { fr: 'Démo : écoute seule (pas de téléchargement, publication ni bibliothèque). Connecte-toi pour créer un morceau complet.', en: 'Demo: preview only (no download, publish, or library). Sign in to create a full track.' },
};

export function langOf(req) {
  const c = String(req?.headers?.cookie || '').match(/(?:^|;\s*)soundtube_ui_lang=(fr|en)(?:;|$)/);
  if (c) return c[1];
  const al = String(req?.headers?.['accept-language'] || '').toLowerCase();
  if (al.startsWith('en') || /(^|,)en\b/.test(al)) return 'en';
  return 'fr';
}

export function msg(req, key, vars) {
  const L = langOf(req);
  let s = MSG[key]?.[L] || MSG[key]?.fr || key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : '{' + k + '}'));
  return s;
}

export function httpError(req, status, key, vars) {
  const e = new Error(msg(req, key, vars)); e.status = status; e.key = key; return e;
}

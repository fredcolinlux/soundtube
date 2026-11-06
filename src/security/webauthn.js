// Passkeys WebAuthn (ES256 / P-256) — vérification minimale sans dépendance native.
import crypto from 'node:crypto';

function b64urlToBuf(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  return Buffer.from((s + pad).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function bufToB64url(b) { return Buffer.from(b).toString('base64url'); }

/** Décodage CBOR très simplifié (maps/arrays/bytes/text/ints positifs). */
function cborDecode(buf, offset = 0) {
  const b = buf[offset++];
  const major = b >> 5, add = b & 31;
  const readLen = () => {
    if (add < 24) return [add, offset];
    if (add === 24) return [buf[offset], offset + 1];
    if (add === 25) return [buf.readUInt16BE(offset), offset + 2];
    if (add === 26) return [buf.readUInt32BE(offset), offset + 4];
    throw new Error('cbor len');
  };
  if (major === 0) { const [v, o] = readLen(); return [v, o]; }
  if (major === 1) { const [v, o] = readLen(); return [-1 - v, o]; }
  if (major === 2) { const [n, o] = readLen(); return [buf.subarray(o, o + n), o + n]; }
  if (major === 3) { const [n, o] = readLen(); return [buf.subarray(o, o + n).toString('utf8'), o + n]; }
  if (major === 4) {
    const [n, o0] = readLen(); let o = o0; const a = [];
    for (let i = 0; i < n; i++) { const [v, no] = cborDecode(buf, o); a.push(v); o = no; }
    return [a, o];
  }
  if (major === 5) {
    const [n, o0] = readLen(); let o = o0; const m = new Map();
    for (let i = 0; i < n; i++) { const [k, o1] = cborDecode(buf, o); const [v, o2] = cborDecode(buf, o1); m.set(k, v); o = o2; }
    return [m, o];
  }
  throw new Error('cbor major ' + major);
}

function coseToKey(coseMap) {
  // kty=2 (EC2), alg=-7 (ES256), crv=1 (P-256), x=-2, y=-3
  const x = coseMap.get(-2), y = coseMap.get(-3);
  if (!x || !y) throw new Error('cose');
  return crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: bufToB64url(x), y: bufToB64url(y) }, format: 'jwk' });
}

export function createRegistrationOptions({ rpID, rpName, userId, userName, userDisplayName, exclude = [] }) {
  const challenge = crypto.randomBytes(32);
  return {
    challenge: bufToB64url(challenge),
    rp: { id: rpID, name: rpName || 'soundtube' },
    user: { id: bufToB64url(Buffer.from(String(userId))), name: userName, displayName: userDisplayName || userName },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    timeout: 60000,
    attestation: 'none',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    excludeCredentials: exclude.map((id) => ({ type: 'public-key', id })),
    _rawChallenge: challenge,
  };
}

export function verifyRegistration({ response, expectedChallenge, expectedOrigin, expectedRPID }) {
  const clientData = JSON.parse(b64urlToBuf(response.clientDataJSON).toString('utf8'));
  if (clientData.type !== 'webauthn.create') throw new Error('type');
  if (clientData.challenge !== expectedChallenge) throw new Error('challenge');
  if (expectedOrigin && clientData.origin !== expectedOrigin) throw new Error('origin');
  const att = b64urlToBuf(response.attestationObject);
  const [decoded] = cborDecode(att);
  const authData = decoded.get('authData');
  if (!authData || authData.length < 37) throw new Error('authData');
  const rpHash = authData.subarray(0, 32);
  const expectHash = crypto.createHash('sha256').update(expectedRPID).digest();
  if (!rpHash.equals(expectHash)) throw new Error('rpId');
  const flags = authData[32];
  if (!(flags & 0x40)) throw new Error('no attested cred');
  let o = 37;
  const aaguid = authData.subarray(o, o + 16); o += 16;
  const credLen = authData.readUInt16BE(o); o += 2;
  const credId = authData.subarray(o, o + credLen); o += credLen;
  const [cose] = cborDecode(authData, o);
  const publicKey = coseToKey(cose);
  const jwk = publicKey.export({ format: 'jwk' });
  return { credentialId: bufToB64url(credId), publicKeyJwk: jwk, aaguid: bufToB64url(aaguid), counter: authData.readUInt32BE(33) };
}

export function createAuthenticationOptions({ rpID, allow = [] }) {
  const challenge = crypto.randomBytes(32);
  return {
    challenge: bufToB64url(challenge),
    timeout: 60000,
    rpId: rpID,
    allowCredentials: allow.map((id) => ({ type: 'public-key', id })),
    userVerification: 'preferred',
    _rawChallenge: challenge,
  };
}

export function verifyAuthentication({ response, expectedChallenge, expectedOrigin, expectedRPID, credential }) {
  const clientDataJSON = b64urlToBuf(response.clientDataJSON);
  const clientData = JSON.parse(clientDataJSON.toString('utf8'));
  if (clientData.type !== 'webauthn.get') throw new Error('type');
  if (clientData.challenge !== expectedChallenge) throw new Error('challenge');
  if (expectedOrigin && clientData.origin !== expectedOrigin) throw new Error('origin');
  const authData = b64urlToBuf(response.authenticatorData);
  const rpHash = authData.subarray(0, 32);
  if (!rpHash.equals(crypto.createHash('sha256').update(expectedRPID).digest())) throw new Error('rpId');
  const counter = authData.readUInt32BE(33);
  if (credential.counter && counter > 0 && counter <= credential.counter) throw new Error('counter');
  const clientHash = crypto.createHash('sha256').update(clientDataJSON).digest();
  const signed = Buffer.concat([authData, clientHash]);
  const sig = b64urlToBuf(response.signature);
  const key = crypto.createPublicKey({ key: credential.publicKeyJwk, format: 'jwk' });
  // WebAuthn ES256 signatures are ASN.1 DER
  const ok = crypto.verify('SHA256', signed, key, sig);
  if (!ok) throw new Error('sig');
  return { counter };
}

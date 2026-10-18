// Estimation des glucides d'un repas (photo et/ou description) avec Claude.
// L'appel part directement du téléphone avec la clé API saisie dans les Réglages.

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.130.0/+esm';

let sdkPromise = null;
function loadSDK() {
  if (!sdkPromise) sdkPromise = import(SDK_URL).then((m) => m.default || m.Anthropic);
  return sdkPromise;
}

const SYSTEM_PROMPT = `Tu es diététicien(ne) spécialisé(e) dans l'insulinothérapie fonctionnelle et le comptage des glucides pour le diabète de type 1.
On te montre la photo et/ou la description d'un repas. Ta tâche :
1. Identifier chaque aliment visible (en français, noms courants en France).
2. Estimer le poids de chaque portion en grammes (poids cuit pour les féculents) en t'aidant des repères visuels : taille de l'assiette (souvent 26 cm), couverts, mains, emballages, verres.
3. Calculer les glucides de chaque aliment à partir de valeurs de référence (table CIQUAL) et donner le total.
4. Indiquer l'index glycémique (bas / moyen / élevé) de chaque aliment et ta confiance (faible / moyenne / élevée).
5. Ajouter des conseils courts et pratiques pour une personne diabétique de type 1 : graisses ou protéines qui ralentissent l'absorption, aliments à vérifier, sucres cachés (sauces, boissons).
Règles :
- Compte uniquement les glucides (pas les fibres en plus). Les aliments sans glucides (viande, poisson, fromage, huile) apparaissent avec 0 g.
- Sois réaliste : en cas de doute, donne ta meilleure estimation et signale-le avec une confiance faible, plutôt que d'exagérer.
- Si l'image ne montre pas de nourriture, renvoie une liste vide et explique-le dans le commentaire.
- Ne donne jamais de dose d'insuline : l'application la calcule avec les réglages fixés par l'équipe médicale.
- Réponds en français.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['aliments', 'total_glucides_g', 'commentaire', 'conseils', 'absorption'],
  properties: {
    aliments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nom', 'quantite_g', 'glucides_pour_100g', 'glucides_g', 'index_glycemique', 'confiance'],
        properties: {
          nom: { type: 'string' },
          quantite_g: { type: 'number' },
          glucides_pour_100g: { type: 'number' },
          glucides_g: { type: 'number' },
          index_glycemique: { type: 'string', enum: ['bas', 'moyen', 'élevé'] },
          confiance: { type: 'string', enum: ['faible', 'moyenne', 'élevée'] },
        },
      },
    },
    total_glucides_g: { type: 'number' },
    absorption: {
      type: 'string',
      enum: ['rapide', 'normale', 'lente'],
      description: "Vitesse d'absorption globale du repas (lente si riche en graisses/protéines)",
    },
    commentaire: { type: 'string' },
    conseils: { type: 'array', items: { type: 'string' } },
  },
};

export class AIError extends Error {
  constructor(message, kind) {
    super(message);
    this.kind = kind;
  }
}

/**
 * @param {{apiKey: string, model?: string, image?: {data: string, mediaType: string}, description?: string}} opts
 */
export async function analyzeMeal({ apiKey, model = 'claude-opus-5-5', image, description }) {
  if (!apiKey) throw new AIError("Ajoutez votre clé API Claude dans les Réglages pour utiliser l'analyse photo.", 'nokey');
  if (!navigator.onLine) throw new AIError("Pas de connexion internet. Vous pouvez saisir le repas manuellement.", 'offline');

  let Anthropic;
  try {
    Anthropic = await loadSDK();
  } catch {
    throw new AIError("Impossible de charger le module d'analyse. Vérifiez la connexion internet.", 'offline');
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });

  const content = [];
  if (image) {
    content.push({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } });
  }
  content.push({
    type: 'text',
    text: description
      ? `Précisions données par la personne : « ${description} ». Analyse ce repas.`
      : 'Analyse ce repas.',
  });

  let response;
  try {
    response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    });
  } catch (err) {
    const status = err?.status;
    if (status === 401) throw new AIError('Clé API refusée. Vérifiez-la dans les Réglages.', 'auth');
    if (status === 429) throw new AIError('Trop de demandes pour le moment. Réessayez dans une minute.', 'rate');
    if (status === 400) throw new AIError("La demande a été refusée (photo trop lourde ou réglage invalide). Réessayez avec une autre photo.", 'bad');
    if (status >= 500) throw new AIError('Le service est momentanément indisponible. Réessayez plus tard.', 'server');
    throw new AIError("Erreur de connexion pendant l'analyse. Vérifiez internet et réessayez.", 'network');
  }

  if (response.stop_reason === 'refusal') {
    throw new AIError("L'analyse n'a pas pu être faite pour cette photo. Saisissez le repas manuellement.", 'refusal');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new AIError("L'analyse a été interrompue. Réessayez.", 'truncated');
  }

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new AIError("Réponse illisible. Réessayez l'analyse.", 'parse');
  }

  result.aliments = (result.aliments || []).map((a) => ({
    ...a,
    quantite_g: Math.max(0, Math.round(a.quantite_g)),
    glucides_g: Math.max(0, Math.round(a.glucides_g * 10) / 10),
  }));
  result.total_glucides_g = Math.round(result.aliments.reduce((s, a) => s + a.glucides_g, 0));
  return result;
}

/** Réduit une photo (fichier) en JPEG pour l'analyse et en miniature pour le journal. */
export async function preparePhoto(file) {
  const bitmap = await loadBitmap(file);
  const big = drawScaled(bitmap, 1568, 0.85);
  const thumb = drawScaled(bitmap, 360, 0.75);
  if (bitmap.close) bitmap.close();
  return {
    data: big.split(',')[1],
    mediaType: 'image/jpeg',
    thumb,
  };
}

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* repli sur <img> ci-dessous */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function drawScaled(source, maxSide, quality) {
  const w = source.width;
  const h = source.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

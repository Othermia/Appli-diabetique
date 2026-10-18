// Table d'aliments courants : glucides pour 100 g (valeurs indicatives d'après
// la table CIQUAL de l'Anses) et une portion habituelle.
// [nom, catégorie, glucides g/100 g, portion (libellé), poids portion en g]

const RAW = [
  // Pains et viennoiseries
  ['Baguette', 'Pains', 56, '1/4 de baguette', 60],
  ['Pain de campagne', 'Pains', 50, '1 tranche', 40],
  ['Pain complet', 'Pains', 43, '1 tranche', 40],
  ['Pain de mie', 'Pains', 48, '1 tranche', 25],
  ['Pain aux céréales', 'Pains', 42, '1 tranche', 40],
  ['Biscottes', 'Pains', 72, '1 biscotte', 10],
  ['Croissant', 'Pains', 45, '1 croissant', 45],
  ['Pain au chocolat', 'Pains', 48, '1 pain au chocolat', 60],
  ['Brioche', 'Pains', 52, '1 tranche', 35],
  ['Crackers / galettes de riz', 'Pains', 80, '1 galette', 8],
  ['Pain burger', 'Pains', 49, '1 pain', 60],
  ['Wrap / tortilla', 'Pains', 50, '1 tortilla', 60],
  ['Pain pita', 'Pains', 55, '1 pain pita', 60],

  // Féculents (poids cuits)
  ['Pâtes cuites', 'Féculents', 28, '1 assiette', 200],
  ['Pâtes complètes cuites', 'Féculents', 25, '1 assiette', 200],
  ['Riz blanc cuit', 'Féculents', 29, '1 assiette', 180],
  ['Riz complet cuit', 'Féculents', 25, '1 assiette', 180],
  ['Semoule / couscous cuit', 'Féculents', 23, '1 assiette', 180],
  ['Quinoa cuit', 'Féculents', 19, '1 assiette', 180],
  ['Boulgour cuit', 'Féculents', 18, '1 assiette', 180],
  ['Pommes de terre vapeur', 'Féculents', 17, '2 moyennes', 200],
  ['Purée de pommes de terre', 'Féculents', 13, '1 assiette', 200],
  ['Frites', 'Féculents', 32, '1 portion moyenne', 120],
  ['Patate douce cuite', 'Féculents', 18, '1 portion', 150],
  ['Lentilles cuites', 'Féculents', 13, '1 assiette', 200],
  ['Pois chiches cuits', 'Féculents', 17, '1 portion', 150],
  ['Haricots rouges cuits', 'Féculents', 13, '1 portion', 150],
  ['Haricots blancs cuits', 'Féculents', 14, '1 portion', 150],
  ['Petits pois cuits', 'Féculents', 9, '1 portion', 150],
  ['Maïs doux', 'Féculents', 16, '1 portion', 100],
  ['Gnocchis', 'Féculents', 33, '1 assiette', 200],
  ['Polenta cuite', 'Féculents', 15, '1 portion', 180],
  ['Lasagnes', 'Plats', 13, '1 part', 300],
  ['Pizza', 'Plats', 27, '1 part (1/4)', 120],
  ['Quiche lorraine', 'Plats', 18, '1 part', 150],
  ['Crêpe nature', 'Plats', 26, '1 crêpe', 60],
  ['Galette de sarrasin', 'Plats', 22, '1 galette', 60],
  ['Hachis parmentier', 'Plats', 10, '1 part', 300],
  ['Paella', 'Plats', 17, '1 assiette', 300],
  ['Sandwich jambon-beurre', 'Plats', 37, '1 sandwich', 180],
  ['Hamburger', 'Plats', 25, '1 burger', 200],
  ['Sushi / maki', 'Plats', 30, '1 pièce', 25],
  ['Taboulé', 'Plats', 18, '1 portion', 150],
  ['Couscous complet (plat)', 'Plats', 13, '1 assiette', 400],
  ['Soupe de légumes', 'Plats', 4, '1 bol', 250],
  ['Soupe de légumes avec pomme de terre', 'Plats', 7, '1 bol', 250],

  // Céréales du matin
  ['Flocons d\'avoine', 'Petit-déjeuner', 58, '1 bol', 40],
  ['Muesli', 'Petit-déjeuner', 63, '1 bol', 45],
  ['Corn-flakes', 'Petit-déjeuner', 84, '1 bol', 30],
  ['Céréales chocolatées', 'Petit-déjeuner', 76, '1 bol', 35],
  ['Granola', 'Petit-déjeuner', 62, '1 bol', 45],
  ['Confiture', 'Petit-déjeuner', 60, '1 c. à café', 15],
  ['Miel', 'Petit-déjeuner', 80, '1 c. à café', 10],
  ['Pâte à tartiner chocolat', 'Petit-déjeuner', 57, '1 c. à café', 15],
  ['Sucre blanc', 'Petit-déjeuner', 100, '1 morceau', 5],

  // Légumes
  ['Salade verte', 'Légumes', 1.5, '1 bol', 50],
  ['Tomate', 'Légumes', 3, '1 tomate', 120],
  ['Carotte crue râpée', 'Légumes', 7, '1 portion', 100],
  ['Carottes cuites', 'Légumes', 6, '1 portion', 150],
  ['Haricots verts', 'Légumes', 4, '1 portion', 150],
  ['Courgette', 'Légumes', 2, '1 portion', 150],
  ['Brocoli', 'Légumes', 2, '1 portion', 150],
  ['Chou-fleur', 'Légumes', 2.5, '1 portion', 150],
  ['Épinards', 'Légumes', 1.5, '1 portion', 150],
  ['Ratatouille', 'Légumes', 5, '1 portion', 150],
  ['Poivron', 'Légumes', 5, '1/2 poivron', 80],
  ['Concombre', 'Légumes', 2, '1/2 concombre', 150],
  ['Champignons', 'Légumes', 1, '1 portion', 100],
  ['Betterave cuite', 'Légumes', 8, '1 portion', 100],
  ['Avocat', 'Légumes', 1, '1/2 avocat', 80],
  ['Oignon cuit', 'Légumes', 6, '1/2 oignon', 50],
  ['Potiron / courge', 'Légumes', 5, '1 portion', 150],
  ['Poireaux', 'Légumes', 4, '1 portion', 150],

  // Fruits
  ['Pomme', 'Fruits', 12, '1 pomme moyenne', 150],
  ['Poire', 'Fruits', 11, '1 poire', 150],
  ['Banane', 'Fruits', 20, '1 banane moyenne', 120],
  ['Orange', 'Fruits', 8, '1 orange', 150],
  ['Clémentine', 'Fruits', 9.5, '1 clémentine', 60],
  ['Kiwi', 'Fruits', 10, '1 kiwi', 80],
  ['Raisin', 'Fruits', 16, '1 grappe', 125],
  ['Fraises', 'Fruits', 6, '1 barquette', 125],
  ['Framboises', 'Fruits', 5, '1 portion', 100],
  ['Myrtilles', 'Fruits', 10, '1 portion', 100],
  ['Cerises', 'Fruits', 14, '1 portion', 100],
  ['Abricot', 'Fruits', 9, '1 abricot', 45],
  ['Pêche / nectarine', 'Fruits', 9, '1 pêche', 150],
  ['Prune', 'Fruits', 10, '1 prune', 40],
  ['Melon', 'Fruits', 7, '1/4 de melon', 200],
  ['Pastèque', 'Fruits', 7, '1 tranche', 250],
  ['Ananas', 'Fruits', 11, '1 tranche', 100],
  ['Mangue', 'Fruits', 13, '1/2 mangue', 150],
  ['Compote sans sucre ajouté', 'Fruits', 12, '1 pot', 100],
  ['Compote sucrée', 'Fruits', 19, '1 pot', 100],
  ['Fruits secs (abricots)', 'Fruits', 55, '3 abricots secs', 25],
  ['Dattes', 'Fruits', 64, '1 datte', 8],
  ['Raisins secs', 'Fruits', 66, '1 petite poignée', 20],

  // Produits laitiers
  ['Lait demi-écrémé', 'Laitages', 4.8, '1 verre', 200],
  ['Yaourt nature', 'Laitages', 5, '1 pot', 125],
  ['Yaourt aux fruits', 'Laitages', 14, '1 pot', 125],
  ['Yaourt grec', 'Laitages', 4, '1 pot', 150],
  ['Fromage blanc nature', 'Laitages', 4, '1 portion', 100],
  ['Petit-suisse nature', 'Laitages', 3.5, '1 petit-suisse', 60],
  ['Crème dessert', 'Laitages', 21, '1 pot', 125],
  ['Riz au lait', 'Laitages', 22, '1 pot', 125],
  ['Fromage (comté, emmental...)', 'Laitages', 0.5, '1 portion', 30],
  ['Camembert / brie', 'Laitages', 0.5, '1 portion', 30],
  ['Glace (boule)', 'Laitages', 25, '1 boule', 50],

  // Protéines (peu ou pas de glucides)
  ['Viande (bœuf, porc, poulet)', 'Viandes & poissons', 0, '1 portion', 120],
  ['Poisson', 'Viandes & poissons', 0, '1 portion', 130],
  ['Poisson pané', 'Viandes & poissons', 17, '1 pièce', 60],
  ['Jambon blanc', 'Viandes & poissons', 1, '1 tranche', 45],
  ['Œuf', 'Viandes & poissons', 0.5, '1 œuf', 55],
  ['Saucisse', 'Viandes & poissons', 1.5, '1 saucisse', 100],
  ['Nuggets de poulet', 'Viandes & poissons', 17, '6 nuggets', 100],
  ['Tofu', 'Viandes & poissons', 2, '1 portion', 100],

  // Desserts et sucreries
  ['Gâteau au chocolat', 'Desserts', 48, '1 part', 80],
  ['Tarte aux fruits', 'Desserts', 33, '1 part', 120],
  ['Éclair', 'Desserts', 30, '1 éclair', 90],
  ['Mousse au chocolat', 'Desserts', 22, '1 pot', 100],
  ['Crème brûlée', 'Desserts', 21, '1 ramequin', 100],
  ['Madeleine', 'Desserts', 55, '1 madeleine', 25],
  ['Biscuit sec / petit-beurre', 'Desserts', 74, '1 biscuit', 8],
  ['Cookie', 'Desserts', 63, '1 cookie', 25],
  ['Chocolat noir', 'Desserts', 33, '1 carré', 5],
  ['Chocolat au lait', 'Desserts', 56, '1 carré', 5],
  ['Bonbons', 'Desserts', 80, '1 bonbon', 6],
  ['Barre chocolatée', 'Desserts', 63, '1 barre', 45],
  ['Pâtisserie orientale', 'Desserts', 50, '1 pièce', 40],
  ['Tarte au citron', 'Desserts', 40, '1 part', 110],

  // Boissons (g pour 100 mL)
  ['Jus d\'orange', 'Boissons', 9, '1 verre', 200],
  ['Jus de pomme', 'Boissons', 10.5, '1 verre', 200],
  ['Soda sucré (cola...)', 'Boissons', 10.6, '1 canette', 330],
  ['Soda light / zéro', 'Boissons', 0, '1 canette', 330],
  ['Sirop dilué', 'Boissons', 8, '1 verre', 200],
  ['Bière', 'Boissons', 3.5, '1 demi', 250],
  ['Vin', 'Boissons', 0.5, '1 verre', 125],
  ['Café / thé sans sucre', 'Boissons', 0, '1 tasse', 150],
  ['Chocolat chaud', 'Boissons', 10, '1 bol', 250],
  ['Smoothie', 'Boissons', 12, '1 verre', 250],

  // Divers
  ['Chips', 'Divers', 50, '1 petit paquet', 30],
  ['Fruits à coque (amandes, noix)', 'Divers', 6, '1 poignée', 30],
  ['Ketchup', 'Divers', 24, '1 c. à soupe', 15],
  ['Pop-corn sucré', 'Divers', 70, '1 petit bol', 30],
  ['Houmous', 'Divers', 12, '2 c. à soupe', 40],
];

export const FOODS = RAW.map(([name, category, carbsPer100, portionLabel, portionGrams], i) => ({
  id: 'f' + i,
  name,
  category,
  carbsPer100,
  portionLabel,
  portionGrams,
}));

export const CATEGORIES = [...new Set(FOODS.map((f) => f.category))];

export function normalize(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe');
}

export function searchFoods(query, limit = 30) {
  const q = normalize(query.trim());
  if (!q) return FOODS.slice(0, limit);
  const words = q.split(/\s+/);
  return FOODS.filter((f) => {
    const n = normalize(f.name + ' ' + f.category);
    return words.every((w) => n.includes(w));
  }).slice(0, limit);
}

// Resucrage : environ 15 g de glucides rapides.
export const RESUCRAGE = [
  '3 morceaux de sucre n°4 (15 g)',
  '1 petit verre (150 mL) de jus de fruit ou de soda sucré',
  '1 c. à soupe de miel ou de confiture',
  '3 à 4 tablettes de glucose',
];

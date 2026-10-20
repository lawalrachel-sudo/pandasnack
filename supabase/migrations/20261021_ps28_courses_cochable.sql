-- PS-28 — Liste de courses cochable, préremplie, imprimable + versement des lignes de tickets.
-- Appliquée en prod puis fichier == prod. (ALTER TYPE ADD VALUE appliqué hors transaction d'abord.)

-- 1. Source « catalogue » : lignes ajoutées par « Préparer la liste ».
alter type public.courses_source add value if not exists 'catalogue';

-- 2. Catalogue : cadence d'achat, date du dernier achat, libellé terrain de quantité.
alter table public.courses_catalogue add column if not exists cadence text not null default 'ponctuel'
  check (cadence in ('hebdo','mensuel','bimestriel','ponctuel'));
alter table public.courses_catalogue add column if not exists dernier_achat date;
alter table public.courses_catalogue add column if not exists quantite_texte text;

-- 3. Liste : coche (null = pas encore dans le caddie) + lien catalogue.
alter table public.courses_items add column if not exists coche_at timestamptz;
alter table public.courses_items add column if not exists catalogue_id uuid references public.courses_catalogue(id);
create index if not exists courses_items_catalogue_idx on public.courses_items (catalogue_id);
-- Valeur de courses_catalogue.dernier_achat avant le cochage : décocher la restaure (« décocher = annule »).
alter table public.courses_items add column if not exists dernier_achat_avant date;
-- Lignes existantes rattachées à leur article catalogue (sinon « Préparer la liste » les doublerait).
update public.courses_items i set catalogue_id = c.id
from public.courses_catalogue c
where i.catalogue_id is null and lower(c.libelle) = lower(i.libelle);

-- 4. Lignes de tickets : rang de la ligne dans le CSV source → versement rejouable sans doublon.
alter table public.tickets_achats_lignes add column if not exists ligne_no int;
create unique index if not exists tickets_achats_lignes_ticket_ligne_uidx
  on public.tickets_achats_lignes (ticket_id, ligne_no) where ligne_no is not null;

-- 5. Données catalogue (~/dev/BRIEFS/PS-28_catalogue_data.csv, 105 lignes, correspondance lower(libelle)).
-- Les 24 articles absents restent 'ponctuel'.
update public.courses_catalogue c set
  cadence = v.cadence, dernier_achat = v.dernier_achat::date, quantite_texte = v.quantite_texte, updated_at = now()
from (values
  ('Laitue Martinique','hebdo','2026-10-16',null),
  ('Tomates rondes Martinique','hebdo','2026-10-02','≈ 6 moyennes'),
  ('Poulet rôti assaisonné','hebdo','2026-10-16',null),
  ('Eau Chanflor 5 L','hebdo','2026-10-16',null),
  ('Baguette 250 g','hebdo','2026-10-09',null),
  ('Sucre de canne','hebdo','2026-09-29',null),
  ('Oignon émincé 1 kg','hebdo','2026-10-16',null),
  ('Farine de blé T55 1 kg','hebdo','2026-10-16',null),
  ('Gouda en tranches','mensuel','2026-10-16',null),
  ('Chou blanc (salade aigre-douce)','mensuel','2026-10-09','1 chou'),
  ('Citron vert','mensuel','2026-10-16','≈ 10 citrons'),
  ('Eau 33 cl / 50 cl','mensuel','2026-10-09',null),
  ('Pâtes torti 1 kg','mensuel','2026-09-25',null),
  ('Banane dessert Martinique','mensuel','2026-09-25','≈ 5 bananes'),
  ('Œufs calibre M x24','hebdo','2026-10-09',null),
  ('Pommes de terre (vrac)','mensuel','2026-10-16',null),
  ('Sachet glaçons 5 kg','mensuel','2026-10-16',null),
  ('Aromates','mensuel','2026-10-09',null),
  ('Carottes','hebdo','2026-10-09','5 petites ou 3 grosses'),
  ('Tomates import','mensuel','2026-09-16','≈ 5 moyennes'),
  ('Sac cabas Carrefour','mensuel','2026-10-16',null),
  ('Gombo','mensuel','2026-10-16','une poignée (≈ 25)'),
  ('Gobelets shaker PET 16 oz x100','mensuel','2026-10-09',null),
  ('Légumes pour couscous','mensuel','2026-10-16',null),
  ('Pain de mie tradition','mensuel','2026-10-09',null),
  ('Sirop mojito 75 cl','mensuel','2026-06-04',null),
  ('Bobine essuie-tout','mensuel','2026-07-15',null),
  ('Café Ti Kafé BOP','mensuel','2026-10-09',null),
  ('Chips (sachets)','mensuel','2026-09-29',null),
  ('Sauce bolognaise / concentré de tomate','mensuel','2026-10-09',null),
  ('Pains au chocolat x20','mensuel','2026-08-10',null),
  ('Navet long','mensuel','2026-08-29','2 navets'),
  ('Raisin / mandarine (couleur timbale fruits)','mensuel','2026-10-16','1 grappe de raisin ou 6 mandarines'),
  ('Ail vrac BQP','mensuel','2026-07-08','2 têtes'),
  ('Café Ti Kafé BQP','mensuel','2026-07-08',null),
  ('Sirop de pêche','bimestriel','2026-06-25',null),
  ('Piment végétarien','bimestriel','2026-09-18','≈ 8 piments'),
  ('Gaufres emballées individuelles (packs goûter)','mensuel','2026-08-22',null),
  ('Eau Source des Alpes pack 6','bimestriel','2026-08-22',null),
  ('Couvercles dôme gobelet x100','bimestriel','2026-06-10',null),
  ('Mélange fruits rouges 500 g','bimestriel','2026-09-18',null),
  ('Oignon sec','bimestriel','2026-09-25','≈ 6 oignons'),
  ('Riz parfumé Shaolin','bimestriel','2026-08-16',null),
  ('Oignon rouge','bimestriel','2026-09-25','≈ 4 oignons'),
  ('Eau de source 8 L','bimestriel','2026-07-09',null),
  ('Perles saveur litchi 3,2 kg','bimestriel','2026-10-16',null),
  ('Bifteck haché','bimestriel','2026-10-02',null),
  ('Pain de seigle complet 500 g','bimestriel','2026-09-29',null),
  ('Knacks x10 (350 g)','bimestriel','2026-10-16',null),
  ('Ratatouille 1 kg','bimestriel','2026-08-16',null),
  ('Flocons muesli 750 g','bimestriel','2026-06-20',null),
  ('Giraumon filmé','bimestriel','2026-06-12',null),
  ('Arôme amande amère','bimestriel','2026-06-20',null),
  ('Pailles bubble tea kraft x50','bimestriel','2026-06-25',null),
  ('Pop-corn sucré','mensuel','2026-06-20',null),
  ('Film alimentaire / sacs congélation 1 L x40 (4,25 €)','bimestriel','2026-09-25',null),
  ('Mouchoirs blancs x150','bimestriel','2026-04-30',null),
  ('Beurre demi-sel Sovaco','bimestriel','2026-09-18',null),
  ('Coupe Paradis 200 ml','bimestriel','2026-05-20',null),
  ('Poivron rouge / vert','bimestriel','2026-10-16',null),
  ('Sardines au piment','bimestriel','2025-12-21',null),
  ('Huile de tournesol 1 L','bimestriel','2026-04-05',null),
  ('Concombre','bimestriel','2026-06-12','2 concombres'),
  ('Mouchoirs boîte x110','bimestriel','2026-07-15',null),
  ('Oignon en cubes surgelé 400 g','bimestriel','2026-10-09',null),
  ('Pâte à tarte feuilletée 280 g','bimestriel','2026-06-10',null),
  ('Queue de bœuf','bimestriel','2025-12-16',null),
  ('Gingembre','bimestriel','2026-07-13',null),
  ('Beurre doux 60 % MG 200 g','bimestriel','2026-01-21',null),
  ('Poireaux émincés','bimestriel','2026-09-25',null),
  ('Cocktail fruits rouges','bimestriel','2026-08-16',null),
  ('Essuie-tout maxi bobine Chlorex','bimestriel','2026-07-13',null),
  ('Fruits rouges Mont Pelé','bimestriel','2026-06-12',null),
  ('Levure chimique Vahiné','bimestriel','2026-08-29',null),
  ('Kub Or Maggi 128 g','bimestriel','2026-08-22',null),
  ('Polenta 500 g','bimestriel','2026-09-29',null),
  ('Pilons de poulet 2,5 kg','bimestriel','2026-08-04',null),
  ('Ail vrac','bimestriel','2026-10-09','2 têtes'),
  ('Eau Chanflor 1 L pack 8','bimestriel','2026-04-05',null),
  ('Panés de dinde x8 (1 kg)','bimestriel','2026-08-16',null),
  ('Sacs poubelle 5 L x40','bimestriel','2026-06-10',null),
  ('Sacs poubelle à poignées x20','bimestriel','2026-01-07',null),
  ('Lait de coco premium','bimestriel','2026-08-29',null),
  ('Cornichons aigres-doux','bimestriel','2026-07-15',null),
  ('Saucisson sec 100 g','bimestriel','2026-08-04',null),
  ('Céleri branche','bimestriel','2025-12-16','1 pied'),
  ('Poireau','bimestriel','2025-10-30','2 poireaux'),
  ('Beurre moulé doux Bara','bimestriel','2026-06-10',null),
  ('Pilons de poulet 1 kg','bimestriel','2026-03-25',null),
  ('Oignons émincés','bimestriel','2026-04-05',null),
  ('Oignons pays (botte)','bimestriel','2026-10-09',null),
  ('Thé vert 125 g','bimestriel','2026-09-18',null),
  ('Salade batavia','bimestriel','2026-09-16',null),
  ('Mayonnaise bocal 718 g','bimestriel','2026-05-29',null),
  ('Sirop de menthe','bimestriel','2026-09-25',null),
  ('Emmental râpé 200 g','bimestriel','2026-06-12',null),
  ('Gobelets carton + couvercle 250 ml x25','bimestriel','2026-06-25',null),
  ('Sacs poubelle 30 L x20','bimestriel','2026-08-04',null),
  ('Carottes en rondelles','bimestriel','2026-08-04',null),
  ('Jambon en tranches (Jambon-Fromage, Omelette-Jambon, croques)','bimestriel','2026-06-20',null),
  ('Huile mélange 4 graines','bimestriel','2026-07-08',null),
  ('Blanc de dinde halal 4 tranches','bimestriel','2026-05-29',null),
  ('Maxi burgers x6 (495 g)','bimestriel','2026-10-02',null),
  ('Cornetto (vanille, chocolat, fraise, cacahuète, coco)','bimestriel','2026-08-18',null),
  ('Pêche-nectarine / pomme (premium timbale fruits)','bimestriel','2026-08-29','≈ 4 fruits')
) as v(libelle, cadence, dernier_achat, quantite_texte)
where lower(c.libelle) = lower(v.libelle);

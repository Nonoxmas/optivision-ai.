# OptiVision AI

Première base de l'application d'essayage virtuel de lunettes.

## Contenu de cette version
- Interface responsive pour téléphone et ordinateur.
- Sections Accueil, Essayage, Catalogue et Comment ça marche.
- Importation d'une photo.
- Capture simple depuis la caméra (sur HTTPS ou localhost).
- Sélection de quatre styles de montures.
- Superposition graphique de monture sur l'image.
- Téléchargement de l'aperçu.
- Base PWA (manifest + service worker).

## Important
Cette version est une fondation fonctionnelle, pas encore un essayage AR réaliste. La position des lunettes sur une photo est actuellement estimée au centre du visage. La prochaine étape consiste à intégrer la détection des points du visage avec MediaPipe, puis à améliorer l'échelle, la rotation et le rendu.

## Tester
Ouvrir `index.html` dans un navigateur pour tester l'importation photo et la sélection des montures. Pour utiliser la caméra et la PWA, publier le dossier sur un hébergement HTTPS comme GitHub Pages.

## Publication GitHub Pages
1. Créer un dépôt GitHub nommé `optivision-ai`.
2. Téléverser tous les fichiers de ce dossier à la racine du dépôt.
3. Dans Settings > Pages, choisir Deploy from a branch, puis `main` et `/ (root)`.
4. Enregistrer. GitHub fournira l'adresse publique du site.

## Personnalisation prévue
Remplacer les modèles fictifs et les noms d'exemple par les véritables montures, photos, références et prix de Bfamily Lunetterie. Ne pas publier de photos de clients sans leur consentement.

/**
 * Sauvegarde la carte mentale dans le stockage local de Thunderbird.
 *
 * @param {Object} mindMapData - Les données de la carte mentale à sauvegarder.
 */
export function saveMindMap(mindMapData) {
    // Extraction des noms des nœuds et des tags (utile pour un éventuel usage futur)
    const nodeNames = extractNodeAndTagNames(mindMapData);

    // Sauvegarde des données dans le stockage local de Thunderbird
    browser.storage.local.set({ "mindmap": JSON.stringify(mindMapData) })
        .then(() => {
            console.log("Carte mentale sauvegardée.");
        })
        .catch((error) => {
            console.error("Erreur lors de la sauvegarde de la carte mentale : ", error);
        });
}

/**
 * Extrait la structure hiérarchique des noms des nœuds depuis la carte mentale.
 *
 * @param {Object} mindMapData - Les données de la carte mentale.
 * @returns {Object} Une structure hiérarchique représentant les noms des nœuds.
 */
export function extractNodeNames(mindMapData) {
    if (!mindMapData || !mindMapData.nodeData) {
        console.error("Données invalides reçues :", mindMapData);
        return {};
    }

    /**
     * Fonction récursive pour parcourir les nœuds.
     * @param {Object} node - Un nœud de la carte mentale.
     * @returns {Object} Structure hiérarchique de ses enfants.
     */
    function traverse(node) {
        if (!node || !node.topic) {
            return {}; // Retourne un objet vide pour les nœuds non valides
        }

        let result = {};

        if (node.children && Array.isArray(node.children)) {
            node.children.forEach(child => {
                result[child.topic] = traverse(child); // Traitement récursif des enfants
            });
        }

        return result;
    }

    return traverse(mindMapData.nodeData); // Démarre depuis la racine
}

/**
 * Extrait les noms des nœuds et leurs tags associés de manière hiérarchique.
 *
 * @param {Object} mindMapData - Les données de la carte mentale.
 * @returns {Object} Une structure avec les tags et les enfants de chaque nœud.
 */
export function extractNodeAndTagNames(mindMapData) {
    if (!mindMapData || !mindMapData.nodeData) {
        console.error("Données invalides reçues :", mindMapData);
        return {};
    }

    /**
     * Fonction récursive pour extraire les tags et les enfants.
     * @param {Object} node - Un nœud de la carte mentale.
     * @returns {Object} Objet avec `tags` et `children`.
     */
    function traverse(node) {
        if (!node || !node.topic) {
            return {};
        }

        let result = {
            tags: node.tags || [], // Initialise avec un tableau vide si aucun tag
            children: {}
        };

        if (node.children && Array.isArray(node.children)) {
            node.children.forEach(child => {
                result.children[child.topic] = traverse(child); // Parcours récursif
            });
        }

        return result;
    }

    return traverse(mindMapData.nodeData);
}

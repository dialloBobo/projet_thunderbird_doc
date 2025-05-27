import { getSavedMindMap } from "../mind_map/loadMindMap.js";
import { extractNodeNames } from "../mind_map/saveMindMap.js";

/**
 * Récupère tous les nœuds feuilles (feuilles terminales) de la carte mentale sauvegardée.
 *
 * @async
 * @function getLeafNodes
 * @returns {Promise<string[]>} Liste des noms de nœuds feuilles (chemins)
 */
export async function getLeafNodes() {
    // Charger la carte mentale sauvegardée
    let mindMapData = await getSavedMindMap();
    let tree = extractNodeNames(mindMapData);

    console.log("Arbre des noms de noeuds récupéré :", tree);

    let leaves = [];

    /**
     * Parcourt récursivement l'arbre pour trouver les nœuds sans enfants.
     * 
     * @param {Object} node - Nœud courant
     * @param {string} path - Chemin du nœud dans l’arbre
     */
    function traverse(node, path = "") {
        if (!node || typeof node !== "object") return;

        let keys = Object.keys(node);
        
        if (keys.length === 0) {
            leaves.push(path); // Ajoute si feuille
        } else {
            for (let key of keys) {
                traverse(node[key], key);
            }
        }
    }

    if (tree && typeof tree === "object") {
        traverse(tree);
    } else {
        console.warn("Arbre invalide ou vide !");
    }

    return leaves;
}

/**
 * Récupère tous les tags associés à un nœud feuille donné,
 * en héritant aussi des tags de ses ancêtres.
 *
 * @async
 * @function getTags
 * @param {string} name_leaf - Nom du nœud feuille
 * @returns {Promise<string[]>} Liste des tags associés (sans doublons)
 */
export async function getTags(name_leaf) {
    const mindMapData = await getSavedMindMap();

    if (!mindMapData || !mindMapData.nodeData) {
        console.error("Données invalides reçues :", mindMapData);
        return [];
    }

    /**
     * Recherche récursive du chemin menant au nœud cible,
     * pour ensuite collecter les tags de tous les nœuds du chemin.
     * 
     * @param {Object} node - Nœud courant
     * @param {string} target - Nom du nœud cible
     * @param {Object[]} path - Chemin parcouru jusqu’ici
     * @returns {Object[]|null} Liste de nœuds menant au nœud cible, ou null si non trouvé
     */
    function searchPathAndTags(node, target, path = []) {
        if (!node || !node.topic) return null;

        const newPath = [...path, node];

        if (node.topic === target) {
            return newPath;
        }

        if (node.children && Array.isArray(node.children)) {
            for (let child of node.children) {
                const result = searchPathAndTags(child, target, newPath);
                if (result !== null) return result;
            }
        }

        return null;
    }

    const pathToNode = searchPathAndTags(mindMapData.nodeData, name_leaf);
    if (!pathToNode) {
        console.warn(`Aucun chemin trouvé pour le nœud "${name_leaf}"`);
        return [];
    }

    // Fusionne les tags sans doublons
    const mergedTags = [...new Set(
        pathToNode.flatMap(n => n.tags || [])
    )];

    console.log(`Tags hérités pour le nœud "${name_leaf}" :`, mergedTags);

    return mergedTags;
}

/**
 * Récupère tous les tags de tous les nœuds de la carte mentale,
 * sans fusion ni filtrage, associant chaque nœud à ses propres tags.
 *
 * @async
 * @function getAllTags
 * @returns {Promise<Object[]>} Liste d’objets contenant `node` (nom) et `tags` (array)
 */
export async function getAllTags() {
    const mindMapData = await getSavedMindMap();
    const allTags = [];

    /**
     * Parcours récursif de la carte pour extraire les tags de chaque nœud.
     *
     * @param {Object} node - Nœud courant
     */
    function traverseNode(node) {
        if (node.children) {
            node.children.forEach(child => traverseNode(child));
        }

        if (node.tags) {
            allTags.push({
                node: node.topic,
                tags: node.tags
            });
        }
    }

    traverseNode(mindMapData.nodeData);

    return allTags;
}

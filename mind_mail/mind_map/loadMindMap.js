/**
 * Récupère la carte mentale enregistrée depuis le stockage local de l'extension.
 *
 * @async
 * @function getSavedMindMap
 * @returns {Promise<Object|null>} Un objet représentant la carte mentale si elle existe, sinon null.
 * @throws {Error} En cas d'erreur lors de l'accès au stockage local ou de la conversion JSON.
 */
export async function getSavedMindMap() {
    try {
        let result = await browser.storage.local.get("mindmap");
        if (result.mindmap) {
            return JSON.parse(result.mindmap);
        } else {
            return null;
        }
    } catch (error) {
        console.error("Erreur lors de la récupération de la carte mentale :", error);
        return null;
    }
}

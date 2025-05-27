import { getMindMailFolder } from './mailSort.js';

/**
 * Récupère tous les messages classés dans les sous-dossiers de la boîte MindMail,
 * à l'exception du dossier "Non Classé", et les trie par date décroissante.
 *
 * @async
 * @function getAllSortedMessages
 * @returns {Promise<Object[]>} Liste d’objets messages triés par date (du plus récent au plus ancien)
 * Chaque message contient : subject, author, id, date, et folderId (avec accountId et path).
 */
export async function getAllSortedMessages() {
    const results = [];
    const accounts = await browser.accounts.list();
    const account = accounts[accounts.length - 1];
    const mindMailFolder = await getMindMailFolder(account);

    const fullSubFolders = await browser.folders.getSubFolders({
        accountId: mindMailFolder.accountId,
        path: mindMailFolder.path
    });

    for (const folder of fullSubFolders) {
        await collectMessages(folder, results);
    }

    // Tri des messages par date décroissante
    results.sort((a, b) => new Date(b.date) - new Date(a.date));
    return results;
}

/**
 * Parcourt un dossier donné pour y collecter tous les messages,
 * en ignorant ceux du dossier "Non Classé".
 *
 * @async
 * @function collectMessages
 * @param {Object} folder - Objet dossier Thunderbird (avec `name`, `accountId`, `path`)
 * @param {Object[]} results - Tableau de messages où stocker les résultats collectés
 */
async function collectMessages(folder, results) {
    // Ignore le dossier "Non Classé"
    if (folder.name === "Non Classé") {
        return;
    }

    try {
        let page = await messenger.messages.list({ accountId: folder.accountId, path: folder.path });

        while (page) {
            const messages = page.messages || [];

            for (let msg of messages) {
                results.push({
                    subject: msg.subject,
                    author: msg.author,
                    id: msg.id,
                    date: msg.date,
                    folderId: {
                        accountId: folder.accountId,
                        path: folder.path
                    }
                });
            }

            // S'il y a d'autres pages de messages à charger
            if (page.id) {
                page = await messenger.messages.continueList(page.id);
            } else {
                break;
            }
        }

    } catch (e) {
        console.warn(`Impossible de lire le dossier ${folder.name} :`, e);
    }
}

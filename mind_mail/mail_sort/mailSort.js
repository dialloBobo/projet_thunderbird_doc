import { extractNodeNames } from '../mind_map/saveMindMap.js';
import { getSavedMindMap } from "../mind_map/loadMindMap.js";
import { getAllTags } from "./extractTerminalNodesName.js";
import { emptyTrashFolder } from "./trash/trash.js";

let accounts;
let folderNodeMap = {};
let allCopiedIds = new Set();



/**
 * Initialise et exécute le tri des mails en fonction de la carte mentale et des tags.
 * Cette fonction vérifie la cohérence entre la structure des dossiers, la carte mentale
 * et les tags, puis trie les mails en les classant dans les dossiers appropriés.
 * 
 * @async
 * @returns {Promise<void>}
 */

// Fonction principale qui initialise le système et lance la récupération des mails
export async function executeMailSort() {

    await initAccount(); // Récupération des comptes mail disponibles
    const mindMailFolder = await initMainFolder();

    // Vérification de la correspondance de structure
    const mindMapTree = extractNodeNames(await getSavedMindMap());
    mindMapTree["Non Classé"] = {};

    const currentFolderTree = await getCurrentMindMailTree(mindMailFolder);

    const isSameStructure = compareFolderTrees(mindMapTree, currentFolderTree);

    // Récupère les tags actuels
    const currentTags = await getAllTags();

    // Compare les tags stockés avec les nouveaux tags
    const savedTags = await getSavedTags();
    const isSameTags = compareTags(savedTags || [], currentTags);

    if (!isSameStructure || !isSameTags) {
        console.warn("Différence détectée entre la carte mentale, les dossiers et/ou les tags. Nettoyage en cours...");
        await clearStoredFoldersData();
        await emptyTrashFolder();
        allCopiedIds = new Set();
        await initAccount();
        await initMainFolder(); // Création du dossier principal "MindMail"
        await saveTags(currentTags); // Sauvegarde des nouveaux tags
        await createSubFolder(); // Création de la structure de dossiers en fonction de la carte mentale
    } else {
        console.log("[STATUT] Structure MindMail valide");
        console.log(`[DEBUG] Tags stockés : ${JSON.stringify(savedTags)}`);
        console.log(`[DEBUG] Tags actuels : ${JSON.stringify(currentTags)}`);
        await loadAllPreviouslyCopiedIds();
        console.log(`[DEBUG] IDs en mémoire après chargement : ${allCopiedIds.size}`);
    }

    // Chargement de la carte mentale sauvegardée
    const mindMapData = await getSavedMindMap();
    if (!mindMapData || !mindMapData.nodeData) return;

    // Récupère tous les mails une seule fois pour éviter les appels redondants
    const allMails = await getAllMails();
    console.log(`Nombre total de mails récupérés : ${allMails.length}`);

    // Lance le parcours de la carte mentale pour trier les mails
    await mailSort(mindMapData, allMails);
}


// Récupère la liste des comptes de messagerie configurés
export async function initAccount() {
    accounts = await browser.accounts.list();
    console.log(`Nombre de comptes trouvés : ${accounts.length}`);
    for (let account of accounts) {
        console.log(account.name); 
    }       
}


/**
 * Récupère tous les mails envoyés et reçus dans tous les comptes configurés.
 * Parcourt récursivement les dossiers pour récupérer les messages.
 * 
 * @async
 * @returns {Promise<Array<Object>>} Une liste contenant tous les messages récupérés.
 */


async function getAllMails() {
    const allMails = [];

    console.log("📥📤 Début de la récupération des mails envoyés et reçus...");

    // Fonction récursive pour traiter les dossiers
    async function processFolders(folders) {
        for (let folder of folders) {
            const name = folder.name.toLowerCase();
            const path = folder.path.toLowerCase();

            console.log(` → Dossier trouvé : ${folder.name} (chemin: ${folder.path})`);

            const isSent =
                name.includes("envoyé") || name.includes("sent") || path.includes("sent") || path.includes("envoy");

            const isInbox =
                name.includes("courrier entrant") || path === "/inbox";

            if (isSent || isInbox) {
                console.log(`   ✅ Dossier identifié comme ${isSent ? "d'envoi" : "de réception"} : ${folder.name}`);

                try {
                    let page = await messenger.messages.list(folder.id);
                    let messageList = page.messages || [];

                    console.log(`   📩 ${messageList.length} message(s) dans la première page de ${folder.name}`);
                    allMails.push(...messageList);

                    while (page.id) {
                        page = await messenger.messages.continueList(page.id);
                        messageList = page.messages || [];

                        console.log(`   ➕ ${messageList.length} message(s) supplémentaire(s) via pagination`);
                        allMails.push(...messageList);
                    }
                } catch (error) {
                    console.warn(`   ⚠️ Erreur lors de la récupération des mails dans ${folder.name}:`, error);
                }
            } else {
                console.log("   ⛔ Dossier ignoré");
            }

            // Récursion sur les sous-dossiers
            if (folder.subFolders && folder.subFolders.length > 0) {
                await processFolders(folder.subFolders);
            }
        }
    }

    // Parcours des comptes
    for (let account of accounts) {
        console.log(`\n🧾 Compte : ${account.name} (${account.id})`);
        const fullAccount = await browser.accounts.get(account.id);
        await processFolders(fullAccount.folders);
    }

    console.log(`\n📬 Total de messages récupérés (envoyés + reçus) : ${allMails.length}`);
    return allMails;
}


/**
 * Trie les mails en fonction de la carte mentale sauvegardée et des tags.
 * Les mails sont copiés dans les dossiers correspondant aux tags détectés,
 * ou dans le dossier "Non Classé" s'ils ne correspondent à aucun tag.
 * 
 * @async
 * @param {Object} mindMapData Données de la carte mentale sauvegardée.
 * @param {Array<Object>} allMails Liste complète des mails à trier.
 * @returns {Promise<void>}
 */

async function mailSort(mindMapData, allMails) {
    console.log("Lancement du tri des mails...");
    const accounts = await browser.accounts.list();
    const lastAccount = accounts[accounts.length - 1]; // "Dossiers locaux"
    const accountName = lastAccount.name;

    const folderNodeMap = {};
    async function buildFolderMap(folder, prefix = folder.name) {
        const path = `${accountName}/${prefix}`;
        folderNodeMap[path] = folder;

        if (folder.subFolders) {
            for (const sub of folder.subFolders) {
                await buildFolderMap(sub, `${prefix}/${sub.name}`);
            }
        }
    }

    for (const folder of lastAccount.folders) {
        await buildFolderMap(folder);
    }

    console.log("Arborescence des dossiers indexée:");
    for (const key in folderNodeMap) {
        console.log(`   - ${key}`);
    }

    const tagNodeMap = indexNodesByTags(mindMapData.nodeData);
    const allTagSet = new Set(tagNodeMap.keys());

    console.log("Index des tags construit:");
    for (const [tag, paths] of tagNodeMap.entries()) {
        console.log(`   - ${tag}: ${Array.from(paths).join(", ")}`);
    }

    const normalize = str => str?.toLowerCase().trim() || "";
    const copiedCache = {};
    const fullPathNonClasse = `${accountName}/MindMail/Non Classé`;
    const folderNonClasse = folderNodeMap[fullPathNonClasse];

    if (!folderNonClasse) {
        console.warn(`Dossier 'Non Classé' introuvable à "${fullPathNonClasse}"`);
    }

    for (const mail of allMails) {
        const subject = normalize(mail.subject);
        const author = normalize(mail.author);

        console.log(`[TRAITEMENT] Vérification du mail ${mail.id}...`);
        if (allCopiedIds.has(mail.id)) {
            console.log(`[SKIP] Mail ${mail.id} déjà traité`);
            continue;
        }

        let bodyText = "";
        try {
            const fullMessage = await browser.messages.getFull(mail.id);
            for (const part of fullMessage.parts || []) {
                if (part.contentType === "text/plain" && part.body) {
                    bodyText = normalize(part.body);
                    break;
                }
            }
        } catch (err) {
        }

        const matchedPaths = new Set();

        for (const [nodePath, tagInfo] of tagNodeMap.entries()) {
            const { inheritedTags, ownTags, isDirectChildOfRoot } = tagInfo;

            const hasOwnTagMatch = [...ownTags].some(tag =>
                subject.includes(tag) || author.includes(tag) || bodyText.includes(tag)
            );

            let match = false;

            if (isDirectChildOfRoot) {
                match = hasOwnTagMatch;
            } else {
                const hasInheritedMatch = [...inheritedTags].some(tag =>
                    subject.includes(tag) || author.includes(tag) || bodyText.includes(tag)
                );
                match = hasOwnTagMatch && hasInheritedMatch;
            }

            if (match) {
                matchedPaths.add(nodePath);
            }
        }


        // Aucune correspondance avec un tag : copier dans "Non Classé"
        if (matchedPaths.size === 0) {
            if (!folderNonClasse) {
                continue;
            }

            const nodePath = "MindMail/Non Classé";
            if (!copiedCache[nodePath]) {
                const loadedIds = await loadCopiedMailIds(nodePath);
                console.log(`Mails déjà copiés pour ${nodePath} : ${loadedIds.length}`);

                copiedCache[nodePath] = new Set(loadedIds);
            }

            if (copiedCache[nodePath].has(mail.id)) {
                continue;
            }

            try {
                console.log(`Non Classé -> ${mail.subject} - <${mail.author}>`)
                await browser.messages.copy([mail.id], folderNonClasse.id);
                await saveCopiedMailId(nodePath, mail.id);
                copiedCache[nodePath].add(mail.id);
                allCopiedIds.add(mail.id);
                await storeNotification({
                    subject: mail.subject,
                    author: mail.author,
                    messageId: mail.id,
                    date: mail.date
                });
            } catch (err) {
                console.error(`Erreur de copie de "${mail.subject}" - <${mail.author}> dans "Non Classé": ${err}`);
            }
            continue;
        }

        // Sinon, on copie dans tous les dossiers liés aux tags
        for (const nodePath of matchedPaths) {
            const fullPath = `${accountName}/${nodePath}`;
            const folder = folderNodeMap[fullPath];

            if (!folder) {
                continue;
            }

            if (!copiedCache[nodePath]) {
                const loadedIds = await loadCopiedMailIds(nodePath);
                copiedCache[nodePath] = new Set(loadedIds);
            }

            if (copiedCache[nodePath].has(mail.id)) {
                continue;
            }

            console.log("Chargement des mails déjà copiés pour tous les dossiers :");
            for (const path in copiedCache) {
                console.log(`${path} -> ${copiedCache[path].size} mails`);
            }


            try {
                console.log(`${nodePath} -> ${mail.subject} - <${mail.author}>`)
                await browser.messages.copy([mail.id], folder.id);
                await saveCopiedMailId(nodePath, mail.id);
                copiedCache[nodePath].add(mail.id);
                allCopiedIds.add(mail.id);
            } catch (e) {
                console.error(`Erreur de copie de "${mail.subject}" - <${mail.author}> dans "${nodePath}":`, e);
            }
        }
    }
    console.log("Tous les mails ont été triés.");
}


/**
 * Indexe les nœuds d'une carte mentale par leurs tags.
 * 
 * @param {Object} node - Le nœud courant de la carte mentale.
 * @param {string} path - Chemin courant dans l'arborescence (ex: "MindMail/Noeud1").
 * @param {Map} tagMap - Map qui associe un chemin à ses tags hérités et propres.
 * @param {boolean} isRoot - Indique si on est au nœud racine (MindMail).
 * @param {Set} inheritedTags - Tags hérités des nœuds parents.
 * @param {boolean} isDirectChild - Indique si le nœud est un enfant direct de la racine.
 * @returns {Map} tagMap mise à jour avec les tags de chaque nœud.
 */
function indexNodesByTags(node, path = "MindMail", tagMap = new Map(), isRoot = true, inheritedTags = new Set(), isDirectChild = false) {
    // Fonction pour normaliser un tag (trim + minuscules)
    const normalize = tag => tag.trim().toLowerCase();

    // Détermine le chemin complet du nœud courant
    const nodePath = isRoot ? path : `${path}/${node.topic}`.replace(/\/+/, '/');

    // Récupère les tags propres au nœud, si on n'est pas à la racine
    const ownTags = new Set();
    if (!isRoot && Array.isArray(node.tags)) {
        for (const rawTag of node.tags) {
            ownTags.add(normalize(rawTag));
        }
    }

    // Stocke dans la map les tags hérités et propres de ce nœud, sauf pour la racine
    if (!isRoot) {
        tagMap.set(nodePath, {
            inheritedTags: new Set(inheritedTags), // copie des tags hérités
            ownTags, // tags propres au nœud
            isDirectChildOfRoot: isDirectChild // si enfant direct de la racine
        });
    }

    // Prépare l'ensemble des tags hérités pour les enfants en ajoutant les propres
    const nextInherited = new Set(inheritedTags);
    ownTags.forEach(tag => nextInherited.add(tag));

    // Parcourt récursivement les enfants du nœud courant
    if (node.children && node.children.length > 0) {
        for (const child of node.children) {
            // Si on est à la racine, les enfants sont des enfants directs
            indexNodesByTags(child, nodePath, tagMap, false, nextInherited, isRoot);
        }
    }

    return tagMap;
}


/**
 * Crée le dossier racine "MindMail" dans un compte mail donné, s'il n'existe pas déjà.
 * 
 * @param {string} mailAdress - Adresse mail du compte (optionnel, par défaut le dernier compte).
 * @returns {Object|null} Le dossier MindMail créé ou existant, ou null en cas d'erreur.
 */
async function initMainFolder(mailAdress = "none") {
    let account; 

    // Sélection du compte : par défaut dernier compte sinon par adresse
    if (mailAdress == "none") account = accounts[accounts.length - 1];
    else {
        for (let acc of accounts) {
            if (acc.name == mailAdress) account = acc;
        }
    }

    if (!account) {
        console.error("Aucun compte valide trouvé.");
        return;
    }

    // Récupération des dossiers du compte complet
    let fullAccount = await browser.accounts.get(account.id);

    // Vérifie si le dossier "MindMail" existe déjà
    const existingFolder = fullAccount.folders.find(folder => folder.name === "MindMail");

    if (existingFolder) {
        console.log("Le dossier 'MindMail' existe déjà :", existingFolder.path);
        return existingFolder;
    }

    // Sinon, création du dossier "MindMail" à la racine du compte
    try {
        const folder = await browser.folders.create(account.rootFolder.id, "MindMail");
        console.log("Dossier 'MindMail' créé :", folder.path, "dans le compte ", account.name);
        return folder;
    } catch (error) {
        console.error("Erreur lors de la création du dossier 'MindMail' :", error);
        return null;
    }
}


/**
 * Crée récursivement les dossiers correspondant à la structure de la carte mentale,
 * dans le compte mail donné, en ajoutant un dossier "Non Classé" à la fin.
 * 
 * @param {string} mailAdress - Adresse mail du compte (optionnel, par défaut dernier compte).
 */
async function createSubFolder(mailAdress = "none") {
    let account;

    // Sélection du compte
    if (mailAdress === "none") {
        account = accounts[accounts.length - 1];
    } else {
        account = accounts.find(acc => acc.name === mailAdress);
        if (!account) {
            console.error("Aucun compte ne correspond à l'adresse entrée !");
            return;
        }
    }

    // Récupère le dossier MindMail dans ce compte
    const mindMailFolder = await getMindMailFolder(account);
    if (!mindMailFolder) {
        console.error("Dossier 'MindMail' introuvable !");
        return;
    }

    // Construit la structure arborescente de la carte mentale (sous forme d'objet)
    const tree = extractNodeNames(await getSavedMindMap());

    // Ajoute un dossier "Non Classé" pour les mails non triés
    tree["Non Classé"] = {};
    console.log("Arborescence à créer :", tree);

    // Création récursive des dossiers dans Thunderbird, et stockage des IDs
    folderNodeMap = await createMindMapFolders(tree, mindMailFolder.id);
}


/**
 * Crée récursivement les dossiers à partir d'un objet arborescent.
 * 
 * @param {Object} tree - Objet représentant l'arborescence à créer.
 * @param {string} parentFolderId - ID du dossier parent dans Thunderbird.
 * @param {string} parentPath - Chemin relatif pour constituer les clés de mapping.
 * @returns {Object} Map entre chemin complet et ID de dossier Thunderbird.
 */
async function createMindMapFolders(tree, parentFolderId, parentPath = "") {
    const folderMap = {};

    // Récupère les sous-dossiers existants pour éviter doublons
    const parentInfo = await browser.folders.getSubFolders(parentFolderId);
    const existingNames = parentInfo.map(f => f.name);

    for (let nodeName in tree) {
        // Nettoyage du nom de dossier pour éviter caractères invalides
        const safeName = nodeName.replace(/[\\/:"*?<>|]+/g, "_");
        let folderId;
        let newFolder;

        try {
            if (existingNames.includes(safeName)) {
                // Si dossier existe déjà, récupère son ID
                const existingFolder = parentInfo.find(f => f.name === safeName);
                folderId = existingFolder.id;
                console.log(`Le dossier '${safeName}' existe déjà.`);
            } else {
                // Sinon, création du dossier
                newFolder = await browser.folders.create(parentFolderId, safeName);
                folderId = newFolder.id;
                console.log("Dossier créé :", newFolder.path);
            }

            // Construit le chemin complet dans la map
            const fullPath = `MindMail/${parentPath}${nodeName}`;
            folderMap[fullPath] = folderId;
            if (newFolder) folderMap[newFolder.path] = folderId;

            // Appel récursif pour les enfants
            const children = tree[nodeName];
            if (children && Object.keys(children).length > 0) {
                const subMap = await createMindMapFolders(children, folderId, `${parentPath}${nodeName}/`);
                Object.assign(folderMap, subMap);
            }

        } catch (err) {
            console.error(`Erreur création dossier '${nodeName}':`, err);
        }
    }

    return folderMap;
}


/**
 * Recherche dans un compte mail le dossier "MindMail".
 * 
 * @param {Object} account - Compte mail Thunderbird.
 * @returns {Object|null} Le dossier "MindMail" ou null s'il n'existe pas.
 */
async function getMindMailFolder(account) {
    let fullAccount = await browser.accounts.get(account.id);
    let rootFolders = fullAccount.folders;

    for (let folder of rootFolders) {
        if (folder.name === "MindMail") {
            return folder;
        }
    }

    console.warn("Le dossier 'MindMail' n'a pas été trouvé.");
    return null;
}


/**
 * Stocke une notification dans le stockage local.
 * 
 * @param {Object} notification - Objet notification à stocker.
 */
async function storeNotification(notification) {
    let notifications = await browser.storage.local.get('notifications');
    notifications = notifications.notifications || [];
    notifications.push(notification);
    await browser.storage.local.set({notifications});
}


/**
 * Supprime toutes les notifications du stockage local et vide l'affichage.
 */
async function clearNotifications() {
    await browser.storage.local.remove('notifications');
    document.getElementById('notifications').innerHTML = '';
    console.log("All notifications removed from local storage.");
}


/**
 * Charge depuis le stockage local tous les IDs de mails déjà copiés dans tous les dossiers.
 */
async function loadAllPreviouslyCopiedIds() {
    console.log("[DEBUG] Chargement des IDs précédemment copiés...");
    const allData = await browser.storage.local.get(null);
    let totalLoaded = 0;
    for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith("copied_") && Array.isArray(value)) {
            console.log(`[DEBUG] Dossier trouvé : ${key} (${value.length} IDs)`);
            totalLoaded += value.length;
            for (const id of value) {
                allCopiedIds.add(id);
            }
        }
    }
    console.log(`[DEBUG] Total IDs chargés depuis le stockage : ${totalLoaded}`);
}


/**
 * Sauvegarde l'ID d'un mail déplacé dans le stockage local, sous la clé du chemin de dossier.
 * 
 * @param {string} nodePath - Chemin complet du dossier.
 * @param {string} mailId - ID du mail à sauvegarder.
 */
export async function saveCopiedMailId(nodePath, mailId) {
    const key = `copied_${encodeURIComponent(nodePath)}`;
    const result = await browser.storage.local.get(key);
    const existing = result[key] || [];
    if (!existing.includes(mailId)) {
        existing.push(mailId);
        await browser.storage.local.set({ [key]: existing });
    }
    console.log(`[SAUVEGARDE] Stockage ID ${mailId} pour ${nodePath}`);
}


/**
 * Charge les IDs de mails déjà copiés pour un dossier donné.
 * 
 * @param {string} nodePath - Chemin complet du dossier.
 * @returns {Array} Liste des IDs de mails.
 */
export async function loadCopiedMailIds(nodePath) {
    const key = `copied_${encodeURIComponent(nodePath)}`;
    const result = await browser.storage.local.get(key);
    return result[key] || [];
}


/**
 * Supprime le dossier "MindMail" et toutes les données associées dans le stockage local.
 */
export async function clearStoredFoldersData() {
    try {
        console.log("Suppression du dossier 'MindMail'...");

        const accounts = await browser.accounts.list();
        const account = accounts[accounts.length - 1];
        const mindMailFolder = account.folders.find(f => f.name === "MindMail");

        if (!mindMailFolder) {
            console.log("Le dossier 'MindMail' n'existe pas.");
            return;
        }

        // Supprime le dossier "MindMail"
        await browser.folders.delete(mindMailFolder.id);
        console.log("Dossier 'MindMail' supprimé.");

        // Supprime toutes les clés "copied_" dans le stockage local
        const allData = await browser.storage.local.get(null);
        const keysToDelete = Object.keys(allData).filter(key => key.startsWith("copied_"));
        for (let key of keysToDelete) {
            await browser.storage.local.remove(key);
            console.log(`Données supprimées pour le dossier : ${key}`);
        }

        await clearNotifications();
        console.log("Stockage local supprimé.");

    } catch (error) {
        console.error("Erreur lors de la suppression :", error);
    }
}


/**
 * Déplace un mail d'un dossier source vers un dossier cible dans Thunderbird.
 * 
 * @param {string} mailId - ID du mail à déplacer.
 * @param {string} sourcePath - Chemin complet du dossier source.
 * @param {string} targetPath - Chemin complet du dossier cible.
 */
export async function moveMailToFolder(mailId, sourcePath, targetPath) {
    // Récupère les IDs des dossiers dans la map globale
    const sourceFolderId = folderNodeMap[sourcePath];
    const targetFolderId = folderNodeMap[targetPath];
    console.log("Source folderId:", sourceFolderId);
    console.log("Target folderId:", targetFolderId);

    if (!sourceFolderId || !targetFolderId) {
        console.error("Le dossier source ou cible est introuvable !");
        console.log("sourceFolderId:", sourceFolderId);
        console.log("targetFolderId:", targetFolderId);
        return;
    }

    try {
        // Récupère tous les messages dans le dossier source
        const sourceMessages = await getAllMessagesInFolder(sourceFolderId);

        // Cherche le mail dans le dossier source
        const mail = sourceMessages.find(msg => msg.id === mailId);

        if (!mail) {
            console.warn(`Le mail d'ID ${mailId} n'est pas dans le dossier source.`);
            return;
        }

        // Vérifie la correspondance d'ID
        if (mailId !== mail.id) {
            
            console.warn(`L'ID du mail trouvé (${mail.id}) ne correspond pas à l'ID recherché (${mailId}).`);
            return;
        }

        // Déplacement du mail
        const result = await browser.messages.move([mailId], targetFolderId);
        const movedMail = result?.messages?.[0];

        if (!movedMail) {
            console.warn("Le mail a été déplacé mais aucune info n’a été retournée par l’API.");
        } else {
            // Met à jour la mémoire locale avec le nouvel ID
            await saveCopiedMailId(targetPath, movedMail.id);
            allCopiedIds.delete(mailId);
            allCopiedIds.add(movedMail.id);

            console.log(`Mail déplacé vers '${targetPath}'`);

            // Supprime l'ancien ID de la liste du dossier source
            await removeCopiedMailId(sourcePath, mailId);
        }

    } catch (err) {
        console.error("Erreur déplacement mail :", err);
    }
}


// Supprime un ID de mail depuis le fichier de suivi associé à un dossier donné
async function removeCopiedMailId(path, idMail) {
    try {
        const storageKey = `copied-${path}`;
        const result = await browser.storage.local.get(storageKey);
        const existingIds = result[storageKey] || [];

        const updatedIds = existingIds.filter(id => id !== idMail);

        await browser.storage.local.set({ [storageKey]: updatedIds });
        console.log(`ID supprimé du stockage local pour '${path}'`);
    } catch (err) {
        console.error(`Erreur suppression ID pour '${path}' :`, err);
    }
}


async function getAllMessagesInFolder(folderId) {
    let allMessages = [];
    let result = await browser.messages.query({ folderId });
    allMessages.push(...result.messages);

    while (result.id) {
        result = await browser.messages.continueList(result.id);
        allMessages.push(...result.messages);
    }

    // Format date without timezone
    return allMessages.map(msg => {
        const dateObj = new Date(msg.date);
        const formattedDate = dateObj.toString().replace(/\s*\([^)]*\)/, '');
        return {
            ...msg,
            date: formattedDate
        };
    });
}


async function getCurrentMindMailTree(mindMailFolder) {
    const buildTree = async (folder) => {
        const children = await browser.folders.getSubFolders(folder.id);
        const tree = {};
        for (const child of children) {
            tree[child.name] = await buildTree(child); // récursif
        }
        return tree;
    };

    return await buildTree(mindMailFolder);
}

// Comparer les arbres entre deux nœuds
function compareFolderTrees(tree1, tree2) {
    const keys1 = Object.keys(tree1);
    const keys2 = Object.keys(tree2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
        if (!keys2.includes(key)) return false;
        if (!compareFolderTrees(tree1[key], tree2[key])) return false;
    }
    return true;
}


// Fonction pour récupérer les tags précédemment stockés
async function getSavedTags() {
    const result = await browser.storage.local.get("tagsHierarchy");
    return result.tagsHierarchy ? JSON.parse(result.tagsHierarchy) : null;
}


// Fonction pour sauvegarder la nouvelle hiérarchie des tags
async function saveTags(tagsHierarchy) {
    await browser.storage.local.set({ tagsHierarchy: JSON.stringify(tagsHierarchy) });
}


// Fonction de comparaison des hiérarchies de tags
function compareTags(oldTags, newTags) {
    // Si les tailles sont différentes, les tags ont changé
    if (oldTags.length !== newTags.length) return false;

    // Comparer chaque tag
    for (let i = 0; i < oldTags.length; i++) {
        const oldTag = oldTags[i];
        const newTag = newTags[i];
        if (oldTag.node !== newTag.node || !arraysEqual(oldTag.tags, newTag.tags)) {
            return false;
        }
    }

    return true;
}


// Fonction utilitaire pour comparer des tableaux (tags)
function arraysEqual(arr1, arr2) {
    if (arr1.length !== arr2.length) return false;
    for (let i = 0; i < arr1.length; i++) {
        if (arr1[i] !== arr2[i]) return false;
    }
    return true;
}

// Fonction interface menu ////////////////////////////////////////////////////////////////

/**
 * Récupère tous les mails d'un dossier spécifique nommé `folderName` sous le dossier racine "MindMail"
 * dans tous les comptes configurés dans Thunderbird.
 *
 * @param {string} folderName - Le nom du dossier dans "MindMail" dont on veut récupérer les mails.
 * @returns {Promise<Array>} - Une promesse qui résout avec une liste d'objets mails contenant 
 *                             sujet, auteur, id, date, indicateur si le mail est envoyé, 
 *                             et info du dossier (accountId, chemin).
 */

export async function getMailsFromFolder(folderName) {
    const results = [];
    // Récupère la liste des comptes mail configurés dans Thunderbird
    const accounts = await browser.accounts.list();

    // Parcours chaque compte
    for (const account of accounts) {
        // Récupère les dossiers racines du compte (ex: inbox, drafts, etc.)
        const rootFolders = account.folders || [];

        // Cherche dans ces dossiers racines celui qui s'appelle "MindMail"
        for (const folder of rootFolders) {
            if (folder.name === "MindMail") {
                // Recherche récursive du dossier cible par nom dans les sous-dossiers de "MindMail"
                const match = await findFolderIdByName(folder.subFolders, folderName);

                if (match) {
                    try {
                        // Récupère la première page de messages dans le dossier trouvé
                        let page = await messenger.messages.list(match);

                        // Parcourt toutes les pages de messages tant qu'il y en a
                        while (page) {
                            const messages = page.messages || [];

                            // Pour chaque message, extrait les infos utiles
                            for (let msg of messages) {
                                // Détermine si le message est un mail envoyé (dossier envoyés ou auteur = compte)
                                const isSent = msg.folder?.path?.toLowerCase().includes("envoy") ||
                                               msg.author?.includes(account.name);

                                results.push({
                                    subject: msg.subject,
                                    author: msg.author,
                                    id: msg.id,
                                    date: msg.date,
                                    isSent: !!isSent,
                                    folderId: {
                                        accountId: account.id,
                                        path: folder.path
                                    }
                                });
                            }

                            // Si la page contient un id de page suivante, on la récupère, sinon on sort
                            if (page.id) {
                                page = await messenger.messages.continueList(page.id);
                            } else {
                                break;
                            }
                        }

                    } catch (e) {
                        // En cas d'erreur lors de la lecture des messages, on log la cause
                        console.warn(`❌ Impossible de lire le dossier ${folder.name} :`, e);
                    }
                }
            }
        }
    }

    // Trie les messages par date décroissante (du plus récent au plus ancien)
    results.sort((a, b) => new Date(b.date) - new Date(a.date));
    return results;
}


/**
 * Recherche récursive d'un dossier par son nom dans une liste de dossiers,
 * retourne un objet contenant l'accountId et le chemin complet du dossier trouvé.
 * 
 * @param {Array} folders - Liste des dossiers à parcourir
 * @param {string} name - Nom du dossier à trouver (insensible à la casse)
 * @returns {Promise<{accountId: string, path: string} | null>} - L'objet du dossier trouvé ou null si non trouvé
 */
async function findFolderIdByName(folders, name) {
    for (let folder of folders) {
        // Vérifie si le nom du dossier correspond
        if (folder.name.toLowerCase() === name.toLowerCase()) {
            return { accountId: folder.accountId, path: folder.path };
        }
    
        // Recherche récursive dans les sous-dossiers
        if (folder.subFolders && folder.subFolders.length > 0) {
            const found = await findFolderIdByName(folder.subFolders, name);
            if (found) return found;
        }
    }
    // Retourne null si aucun dossier correspondant n'a été trouvé
    return null;
}


export { folderNodeMap, createMindMapFolders, getMindMailFolder, getAllMessagesInFolder};
import { extractNodeNames } from '../mind_map/saveMindMap.js';
import { getSavedMindMap } from "../mind_map/loadMindMap.js";
import { moveMailToFolder, getMindMailFolder, createMindMapFolders, getAllMessagesInFolder } from './mailSort.js';
import { folderNodeMap } from './mailSort.js';

let accounts;

/**
 * Initialise les comptes de messagerie
 * @returns {Promise<Array>} Liste des comptes
 */
async function initAccounts() {
    accounts = await browser.accounts.list();
    return accounts;
}

/**
 * Fonction pour obtenir tous les dossiers disponibles à partir de la carte mentale
 * @returns {Promise<Array<string>>} Liste des noms de dossiers
 */
async function getAllFolders() {
    const mindMapData = await getSavedMindMap();
    if (!mindMapData || !mindMapData.nodeData) return [];
    
    const folders = [];
    
    function traverseNode(node, currentPath) {
        const nodePath = currentPath ? `${currentPath}/${node.topic}` : node.topic;
        if (node.children && node.children.length > 0) {
            folders.push(`MindMail/${nodePath}`);
            node.children.forEach(child => traverseNode(child, nodePath));
        } else {
            folders.push(`MindMail/${nodePath}`);
        }
    }
    
    traverseNode(mindMapData.nodeData, "");

    folders.push("MindMail/Non Classé");
    return folders;
}

/**
 * Fonction pour trouver le dossier "Non Classé"
 * @returns {Promise<Object|null>} Le dossier "Non Classé" ou null
 */
async function getUnsortedFolder() {
    const accounts = await initAccounts();
    for (let account of accounts) {
        const folders = await browser.folders.getSubFolders(account);
        const mindMailFolder = folders.find(f => f.name === "MindMail");
        if (mindMailFolder) {
            const subFolders = await browser.folders.getSubFolders(mindMailFolder);
            const unsortedFolder = subFolders.find(f => f.name === "Non Classé");
            if (unsortedFolder) {
                return unsortedFolder;
            }
        }
    }
    return null;
}

/**
 * Fonction pour récupérer les mails non classés
 * @returns {Promise<Array<Object>>} Liste des mails non classés
 */
async function getUnsortedMails() {
    const unsortedFolder = await getUnsortedFolder();
    if (!unsortedFolder) {
        console.error("Dossier 'Non Classé' non trouvé");
        return [];
    }

    try {
        const result = await browser.messages.list(unsortedFolder.id);
        const seenIds = new Set();
        const uniqueMessages = [];

        const allData = await browser.storage.local.get(null);
        const copiedIds = new Set();

        for (const [key, value] of Object.entries(allData)) {
            if (key.startsWith("MindMail/") && Array.isArray(value)) {
                for (const id of value) {
                    copiedIds.add(id);
                }
            }
        }

        for (const message of result.messages || []) {
            if (!seenIds.has(message.id)) {
                seenIds.add(message.id);
                uniqueMessages.push({
                    id: message.id,
                    subject: message.subject,
                    author: message.author,
                    date: new Date(message.date).toLocaleString()
                });
            }
        }

        return uniqueMessages;
    } catch (error) {
        console.error("Erreur lors de la récupération des mails non classés:", error);
        return [];
    }
}

/**
 * Fonction pour créer l'élément de sélection des dossiers
 * @param {Array<string>} folders - Liste des noms de dossiers
 * @returns {HTMLSelectElement} Élément select HTML
 */
function createFolderSelect(folders) {
    const select = document.createElement('select');
    select.className = 'folder-select';

    folders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder;
        option.textContent = folder;

        if (folder === "MindMail/Non Classé") {
            option.selected = true;
        }

        select.appendChild(option);
    });

    return select;
}

/**
 * Fonction pour créer un élément de mail non classé
 * @param {Object} mail - Objet mail
 * @param {Array<string>} folders - Liste des noms de dossiers
 * @param {boolean} [isNew=false] - Indique si le mail est nouveau
 * @returns {HTMLDivElement} Élément HTML représentant le mail
 */
function createMailItem(mail, folders, isNew = false) {
    const mailDiv = document.createElement('div');
    mailDiv.className = 'mail-item';
    
    const mailInfo = document.createElement('div');
    mailInfo.innerHTML = `
        <strong>De:</strong> ${mail.author}<br>
        <strong>Sujet:</strong> ${mail.subject}<br>
        <strong>Date:</strong> ${mail.date}
    `;
    
    const controls = document.createElement('div');
    const select = createFolderSelect(folders);
    
    const moveButton = document.createElement('button');
    moveButton.className = 'move-btn';
    moveButton.textContent = 'Déplacer';
    moveButton.onclick = async () => {
        try {
            if (select.value === "MindMail/Non Classé") {
                console.log("Le mail est déjà dans 'Non Classé', déplacement ignoré.");
                return;
            }
            
            await moveMailToFolder(mail.id, "MindMail/Non Classé", select.value);
            mailDiv.remove();

            const notification = {
                type: 'success',
                message: `Mail déplacé avec succès vers ${select.value}`,
                timestamp: new Date().toISOString()
            };
            await browser.storage.local.get('notifications').then(data => {
                const notifications = data.notifications || [];
                notifications.push(notification);
                return browser.storage.local.set({ notifications });
            });
        } catch (error) {
            console.error('Erreur lors du déplacement du mail:', error);
            const notification = {
                type: 'error',
                message: `Erreur lors du déplacement du mail: ${error.message}`,
                timestamp: new Date().toISOString()
            };
            await browser.storage.local.get('notifications').then(data => {
                const notifications = data.notifications || [];
                notifications.push(notification);
                return browser.storage.local.set({ notifications });
            });
        }
    };
    
    controls.appendChild(select);
    controls.appendChild(moveButton);
    
    if (isNew) {
        const newBadge = document.createElement('span');
        newBadge.textContent = '🔴 Nouveau';
        newBadge.style.color = 'red';
        newBadge.style.fontWeight = 'bold';
        newBadge.style.marginRight = '10px';
        mailInfo.prepend(newBadge);
    }
    
    mailDiv.appendChild(mailInfo);
    mailDiv.appendChild(controls);
    
    return mailDiv;
}

/**
 * Récupère les mails d'un dossier donné par son nom
 * @param {string} folderName - Nom du dossier
 * @returns {Promise<Array<Object>>} Liste des mails
 */
async function getMailsFromFolder(folderName) {
    const results = [];
    const accounts = await browser.accounts.list();

    for (const account of accounts) {
        const rootFolders = account.folders || [];
        for (const folder of rootFolders) {
            if (folder.name === "MindMail") {
                const match = await findFolderIdByName(folder.subFolders, folderName);
                if (match) {
                    const page = await messenger.messages.list(match);
                    const messages = page.messages || [];

                    for (let msg of messages) {
                        results.push({
                            subject: msg.subject,
                            author: msg.author,
                            id: msg.id,
                            date: msg.date,
                            folderId: {
                                accountId: match.accountId,
                                path: match.path,
                            }
                        });
                    }
                }
            }
        }
    }

    results.sort((a, b) => new Date(b.date) - new Date(a.date));
    return results;
}

/**
 * Fonction pour initialiser l'interface des mails non classés
 * @returns {Promise<void>}
 */
async function initUnsortedMailsUI() {
    const unsortedMailsContainer = document.getElementById('unsortedMails');
    unsortedMailsContainer.innerHTML = '';
    if (!unsortedMailsContainer) return;

    try {
        let folders = Object.keys(folderNodeMap);
        if (folders.length === 0) {
            console.log("Folder map empty, reloading MindMap...");

            const mindMapData = await getSavedMindMap();
            const accounts = await browser.accounts.list();
            const mindMailFolder = await getMindMailFolder(accounts[accounts.length - 1]);
            if (mindMapData && mindMailFolder) {
                const tree = extractNodeNames(mindMapData);
                tree["Non Classé"] = {};
                Object.assign(folderNodeMap, await createMindMapFolders(tree, mindMailFolder.id));
                folders = Object.keys(folderNodeMap);
            }
        }

        const unsortedFolder = await getUnsortedFolder();
        const allData = await browser.storage.local.get(null);
        const copiedIds = new Set();

        for (const [key, value] of Object.entries(allData)) {
            if (key.startsWith("MindMail/") && Array.isArray(value)) {
                for (const id of value) {
                    copiedIds.add(id);
                }
            }
        }

        let unsortedMails = await getAllMessagesInFolder(unsortedFolder.id);
        unsortedMails = unsortedMails.filter(mail => !copiedIds.has(mail.id));

        const countSpan = document.getElementById('unsortedCount');
        if (countSpan) {
            countSpan.textContent = `(${unsortedMails.length})`;
        }

        unsortedMails.sort((a, b) => new Date(b.date) - new Date(a.date));

        if (unsortedMails.length === 0) {
            unsortedMailsContainer.innerHTML = '<p>Aucun mail non classé.</p>';
            return;
        }

        const seenKey = 'seenUnsortedMailIds';
        const seenData = await browser.storage.local.get(seenKey);
        const seenIds = new Set(seenData[seenKey] || []);

        unsortedMails.forEach(mail => {
            const isNew = !seenIds.has(mail.id);
            const mailElement = createMailItem(mail, folders, isNew);
            unsortedMailsContainer.appendChild(mailElement);
        });

        const currentIds = unsortedMails.map(m => m.id);
        await browser.storage.local.set({ [seenKey]: currentIds });

        const moveAllBtn = document.getElementById('moveAllBtn');
        if (moveAllBtn) {
            moveAllBtn.addEventListener('click', async () => {
                const allMoveButtons = document.querySelectorAll('.move-btn');
                for (let btn of allMoveButtons) {
                    btn.click();
                    await new Promise(res => setTimeout(res, 300));
                }
            });
        }

    } catch (error) {
        console.error('Erreur lors de l\'initialisation de l\'interface des mails non classés:', error);
        unsortedMailsContainer.innerHTML = '<p>Erreur lors du chargement des mails non classés.</p>';
    }
}

document.addEventListener('DOMContentLoaded', initUnsortedMailsUI);

export { initUnsortedMailsUI };

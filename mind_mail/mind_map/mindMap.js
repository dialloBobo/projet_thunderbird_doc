import MindElixir from '../api/node_modules/mind-elixir/dist/MindElixir.js';
import nodeMenu from '../api/node_modules/@mind-elixir/node-menu-neo/dist/node-menu-neo.js';
import { saveMindMap } from './saveMindMap.js';
import { clearStoredFoldersData } from "../mail_sort/mailSort.js";
import { showMailPopup } from '../web_interface/popup/popup.js';

let mind;

document.addEventListener("DOMContentLoaded", function () {
    // Initialise la carte mentale avec les options par défaut
    mind = new MindElixir({
        el: "#map", // Élément HTML dans lequel rendre la carte
        direction: MindElixir.SIDE,
        draggable: true,
        contextMenu: true,
        toolBar: true,
        nodeMenu: true,
        keypress: true,
        locale: "fr",
        mainLinkStyle: 1,
        mouseSelectionButton: 0,
        contextMenuOption: {
            focus: true,
            link: true,
        },
    });

    // Tente de récupérer une carte mentale sauvegardée dans le stockage
    browser.storage.local.get("mindmap").then(result => {
        if (result.mindmap) {
            const data = JSON.parse(result.mindmap); // Convertit les données JSON
            mind.init(data); // Initialise la carte avec les données existantes
        } else {
            const data = MindElixir.new("Nouvelle idée"); // Crée une carte par défaut
            mind.init(data);
        }
    });

    // Ajoute le menu contextuel avancé
    mind.install(nodeMenu);

    // Rend l'objet `mind` globalement accessible
    window.mind = mind;

    // Sauvegarde automatique de la carte mentale après chaque modification
    mind.bus.addListener('operation', operation => {
        saveMindMap(window.mind.getData());
    });

    // Lorsqu'un nœud est sélectionné, afficher les mails correspondants
    mind.bus.addListener('selectNode', async node => {
        let keyword = node.topic;
        const isRoot = node.parent == null;

        let response;
        if (isRoot) {
            // Si le nœud racine est sélectionné, afficher tous les mails triés
            response = await browser.runtime.sendMessage({
                action: "getAllSortedMails"
            });
            keyword = null;
        } else {
            // Sinon, filtrer les mails selon le mot-clé du nœud
            response = await browser.runtime.sendMessage({
                action: "getMailsByKeyword",
                keyword: keyword
            });
        }

        showMailPopup(response.messages || [], keyword);
    });
});

/**
 * Réinitialise la carte mentale à un état vierge.
 *
 * @async
 * @function resetMindMap
 * @returns {Promise<void>}
 */
export async function resetMindMap() {
    const newData = MindElixir.new("Nouvelle carte"); // Crée une nouvelle carte mentale
    window.mind.init(newData); // Initialise la carte avec les données par défaut
    clearStoredFoldersData(); // Réinitialise les données liées au tri des mails
    saveMindMap(window.mind.getData()); // Sauvegarde la carte mentale réinitialisée
    console.log('Carte mentale réinitialisée.');
}

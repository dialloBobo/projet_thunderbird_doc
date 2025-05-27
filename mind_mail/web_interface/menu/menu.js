import { resetMindMap } from '../../mind_map/mindMap.js';
import { executeMailSort } from '../../mail_sort/mailSort.js';
import { initUnsortedMailsUI } from "../../mail_sort/unsortedMailsUI.js";

// Références aux éléments de l'interface
const settingsBtn = document.getElementById('settingsBtn');
const settingsMenu = document.getElementById('settingsMenu');
const openNoticeButton = document.getElementById('openNotice');
const resetMindMapButton = document.getElementById('resetMindMap');
const customConfirm = document.getElementById('customConfirm');
const confirmYesButton = document.getElementById('confirmYes');
const confirmNoButton = document.getElementById('confirmNo');
const reloadButton = document.getElementById('reloadBtn');

/**
 * Gère l'affichage du menu des paramètres (ouverture/fermeture)
 */
settingsBtn.addEventListener('click', (event) => {
    event.stopPropagation(); // Empêche la fermeture automatique
    if (settingsMenu.style.display === 'none' || settingsMenu.style.display === '') {
        settingsMenu.style.display = 'flex'; // Affiche le menu
    } else {
        settingsMenu.style.display = 'none'; // Cache le menu
    }
});

/**
 * Réexécute le tri des mails et met à jour l'affichage des mails non triés
 */
reloadButton.addEventListener('click', async (event) => {
    event.stopPropagation();
    try {
        await executeMailSort();       // Relance le tri des mails
        await initUnsortedMailsUI();   // Recharge l'interface des mails non triés
    } catch (error) {
        console.error("Erreur pendant le rechargement:", error);
    }
});

/**
 * Ferme le menu des paramètres si l'utilisateur clique ailleurs
 */
window.addEventListener('click', (event) => {
    if (!settingsBtn.contains(event.target) && !settingsMenu.contains(event.target)) {
        settingsMenu.style.display = 'none';
    }
});

/**
 * Ouvre le lien vers la notice utilisateur (Google Docs)
 */
openNoticeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    window.open(
        'https://docs.google.com/document/d/1jr-BOHhd-yW8ez_JFGWlTmW-lulayzJJkrLUzTZTsyU/edit?usp=sharing',
        '_blank'
    );
});

/**
 * Affiche une confirmation avant de réinitialiser la carte mentale
 */
resetMindMapButton.addEventListener('click', (event) => {
    event.stopPropagation();
    settingsMenu.style.display = 'none';
    customConfirm.style.display = 'flex'; // Affiche le dialogue de confirmation
});

/**
 * Réinitialise la carte mentale si l'utilisateur confirme
 */
confirmYesButton.addEventListener('click', () => {
    customConfirm.style.display = 'none';
    resetMindMap(); // Appelle la fonction de réinitialisation
});

/**
 * Ferme le dialogue de confirmation si l'utilisateur annule
 */
confirmNoButton.addEventListener('click', () => {
    customConfirm.style.display = 'none';
});

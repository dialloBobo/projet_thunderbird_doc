/**
 * Vide la corbeille du dernier compte configuré dans Thunderbird.
 * Cela correspond généralement au compte "Dossiers locaux".
 * Utilise l'API `browser.Xpunge.emptyTrash`.
 * 
 * @async
 * @function emptyTrashFolder
 * @returns {Promise<void>} Ne retourne rien. Vide la corbeille ou affiche un avertissement.
 */
export async function emptyTrashFolder() {
  // Récupère la corbeille du dernier compte
  let lastAccountTrashFolder = await getTrashFolderOfLastAccount();

  if (!lastAccountTrashFolder) {
    console.warn("Impossible de trouver la corbeille du dernier compte.");
    return;
  }

  // Vide le contenu de la corbeille
  await browser.Xpunge.emptyTrash(lastAccountTrashFolder);
}

/**
 * Recherche récursivement le dossier de type "trash" (corbeille)
 * dans le dernier compte configuré dans Thunderbird.
 *
 * @async
 * @function getTrashFolderOfLastAccount
 * @returns {Promise<Object|null>} Le dossier de corbeille si trouvé, sinon `null`.
 */
async function getTrashFolderOfLastAccount() {
  // Récupère la liste de tous les comptes configurés
  const accounts = await browser.accounts.list();

  if (accounts.length === 0) {
    console.error("Aucun compte trouvé.");
    return null;
  }

  // On cible le dernier compte dans la liste
  const lastAccount = accounts[accounts.length - 1];

  /**
   * Recherche récursive dans les dossiers pour trouver le dossier de type "trash"
   *
   * @param {Array<Object>} folderList - Liste de dossiers à parcourir
   * @returns {Object|null} Dossier trouvé ou null
   */
  function findTrashFolder(folderList) {
    for (const folder of folderList) {
      if (folder.type === "trash") {
        return folder;
      }
      if (folder.subFolders && folder.subFolders.length > 0) {
        const subResult = findTrashFolder(folder.subFolders);
        if (subResult) return subResult;
      }
    }
    return null;
  }

  // Recherche du dossier de corbeille
  const trashFolder = findTrashFolder(lastAccount.folders);

  if (!trashFolder) {
    console.warn("Dossier Corbeille non trouvé pour ce compte.");
    return null;
  }

  console.log("Dossier Corbeille trouvé :", trashFolder);
  return trashFolder;
}

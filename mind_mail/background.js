

/**
 * Gestionnaire d'événements pour l'extension Thunderbird / navigateur.
 * 
 * - Lors du clic sur l'icône de l'extension (`browserAction`), une nouvelle
 *   tab s'ouvre avec l'interface web, puis le module `mailSort.js` est chargé
 *   dynamiquement et la fonction `executeMailSort` est exécutée pour récupérer
 *   les emails.
 * 
 * - Écouteur de messages (`runtime.onMessage`) pour gérer deux actions :
 *    1. "getMailsByKeyword" : récupère les emails filtrés par mot-clé,
 *       en important dynamiquement `mailSort.js` et appelant
 *       `getMailsFromFolder(keyword)`.
 * 
 *    2. "getAllSortedMails" : récupère tous les emails triés,
 *       en important dynamiquement `getMail.js` et appelant
 *       `getAllSortedMessages()`.
 * 
 * Chaque requête renvoie une promesse résolue avec un objet `{ messages: [...] }`.
 * En cas d'erreur, un tableau vide est renvoyé et l'erreur est loggée en console.
 * 
 * @module backgroundScript
 */

browser.browserAction.onClicked.addListener(async () => {
  browser.tabs.create({ url: "./web_interface/index.html" });

  // Charger dynamiquement le fichier
  const moduleMail = await import("./mail_sort/mailSort.js");

  // Exécuter la récupération des emails
  moduleMail.executeMailSort();
});

browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === "getMailsByKeyword") {
    const keyword = message.keyword;
    try {
      const moduleMail = await import("./mail_sort/mailSort.js");
      const mails = await moduleMail.getMailsFromFolder(keyword);
      return Promise.resolve({ messages: mails });
    } catch (error) {
      console.error("Erreur lors de la récupération ciblée :", error);
      return Promise.resolve({ messages: [] });
    }
  }

  if (message.action === "getAllSortedMails") {
    try {
      const moduleMail = await import("./mail_sort/getMail.js");
      const mails = await moduleMail.getAllSortedMessages();
      return Promise.resolve({ messages: mails });
    } catch (error) {
      console.error("Erreur lors de la récupération globale :", error);
      return Promise.resolve({ messages: [] });
    }
  }
});
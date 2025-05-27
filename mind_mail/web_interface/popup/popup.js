import { moveMailToFolder } from "../../mail_sort/mailSort.js";

// Styles
const style = document.createElement("link");
style.rel = "stylesheet";
style.href = "./popup/popup.css";
document.head.appendChild(style);

/**
 * Récupère tous les chemins complets dans une mindmap à partir d'un noeud donné.
 * @param {Object} node - Le noeud racine de la mindmap.
 * @param {string} [currentPath=""] - Le chemin accumulé jusqu'à présent.
 * @returns {string[]} Liste des chemins complets de la mindmap.
 */

// Helper functions
function getMindmapPaths(node, currentPath = "") {
  const newPath = currentPath ? `${currentPath}/${node.topic}` : node.topic;
  let paths = [newPath];
  if (node.children && node.children.length > 0) {
    node.children.forEach(child => {
      paths = paths.concat(getMindmapPaths(child, newPath));
    });
  }
  return paths;
}

 /**
 * Extrait le nom de la racine à partir d'un chemin.
 * @param {string} path - Chemin complet (ex: "Racine/SousDossier/Feuille").
 * @returns {string} Nom de la racine (partie avant le premier "/").
 */
function getRootName(path) {
  return path.split("/")[0];
}

function formatDate(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}


/**
 * Trouve la première partie du mail avec du contenu texte (html ou plain).
 * Cherche prioritairement du HTML.
 * @param {Array} parts - Parties du mail (structure MIME).
 * @returns {Object|null} Partie texte trouvée ou null si aucune.
 */
// Email content processing
function findTextPart(parts) {
  let plainPart = null;

  for (const part of parts) {
    const ct = part.contentType?.toLowerCase() || "";

    if (ct.includes("text/html")) {
      return part;
    }
    if (!plainPart && ct.includes("text/plain")) {
      plainPart = part;
    }
    if (part.parts) {
      const nested = findTextPart(part.parts);
      if (nested) {
        if (nested.contentType.toLowerCase().includes("text/html")) {
          return nested;
        }
        if (!plainPart && nested.contentType.toLowerCase().includes("text/plain")) {
          plainPart = nested;
        }
      }
    }
  }

  return plainPart;
}



/**
 * Vérifie si une liste de parties MIME contient une pièce jointe.
 * @param {Array} parts - Parties du mail.
 * @returns {boolean} true si une pièce jointe est détectée, false sinon.
 */
function hasAttachment(parts) {
  for (const part of parts) {
    const type = part.contentType?.toLowerCase();
    const dispo = part.contentDisposition?.toLowerCase();

    const isAttachmentByType = type && (
      type.startsWith("application/")
    );
    const isAttachmentByDisposition = dispo === "attachment";

    if (isAttachmentByType || isAttachmentByDisposition) {
      return true;
    }

    if (part.parts && hasAttachment(part.parts)) {
      return true;
    }
  }
  return false;
}

// UI Components
function createPopupHeader(keyword, count) {
  const header = document.createElement("div");
  header.id = "popupHeader";
  header.innerHTML = keyword
    ? `<strong>Mails de ${keyword} (${count})</strong>`
    : `<strong>Tous les mails (${count})</strong>`;
  return header;
}

function createSearchInput(mailList) {
  const searchContainer = document.createElement("div");
  searchContainer.id = "popupSearchContainer";
  
  const searchInput = document.createElement("input");
  searchInput.id = "popupSearchInput";
  searchInput.type = "text";
  searchInput.placeholder = "Rechercher un mail...";
  
  searchContainer.appendChild(searchInput);
  
  searchInput.addEventListener("input", debounce(() => {
    const searchQuery = searchInput.value.toLowerCase();
    const mailCards = mailList.querySelectorAll(".mailCard");

    mailCards.forEach(mailCard => {
      const subject = mailCard.querySelector(".mailSubject").textContent.toLowerCase();
      const author = mailCard.querySelector(".mailAuthor").textContent.toLowerCase();
      const bodyElement = mailCard.querySelector(".mailBody");
      const content = bodyElement ? bodyElement.textContent.toLowerCase() : "";

      mailCard.style.display = (
        subject.includes(searchQuery) || 
        author.includes(searchQuery) || 
        content.includes(searchQuery)
      ) ? "" : "none";
    });
  }, 300));
  
  return searchContainer;
}

function createMailCard(mail) {
  if (!mail.id) return null;

  const mailCard = document.createElement("div");
  mailCard.className = "mailCard";

  // Create elements
  const subject = document.createElement("div");
  subject.className = "mailSubject";
  subject.textContent = mail.subject || "(Pas de sujet)";

  const date = document.createElement("div");
  date.className = "mailDate";
  date.textContent = formatDate(mail.date);

  const author = document.createElement("div");
  author.className = "mailAuthor";
  author.textContent = mail.author || "";

  const mailIcon = document.createElement("img");
  const isSent = String(mail.isSent) === "true" || mail.isSent === true;
  mailIcon.className = "mailIcon";
  mailIcon.src = mail.isSent ? "../../../ressources/send.png" : "../../../ressources/receive-mail.png";
  mailIcon.alt = mail.isSent ? "Envoyé" : "Reçu";

  // Create rows and containers
  const row1 = document.createElement("div");
  row1.className = "mailRow";

  const iconContainer = document.createElement("div");
  iconContainer.className = "iconContainer";
  iconContainer.appendChild(mailIcon);

  const subjectContainer = document.createElement("div");
  subjectContainer.className = "subjectContainer";
  subjectContainer.appendChild(subject);

  const dateContainer = document.createElement("div");
  dateContainer.className = "dateContainer";
  dateContainer.appendChild(date);

  // Row 2
  const row2 = document.createElement("div");
  row2.className = "mailRow";

  const emptyCol = document.createElement("div");
  emptyCol.className = "iconContainer";

  browser.messages.getFull(mail.id).then(full => {
    if (hasAttachment(full.parts || [])) {
      const attachmentIcon = document.createElement("img");
      attachmentIcon.src = "../../../ressources/trombone.png";
      attachmentIcon.alt = "Pièce jointe";
      attachmentIcon.className = "attachmentIcon";
      emptyCol.appendChild(attachmentIcon);
    }
  });

  const authorContainer = document.createElement("div");
  authorContainer.className = "subjectContainer";
  authorContainer.appendChild(author);

  const buttonsContainer = document.createElement("div");
  buttonsContainer.className = "buttonContainer";

  // Buttons
  const openBtn = createOpenButton(mail);
  const viewBtn = createViewButton(mail, mailCard);

  buttonsContainer.appendChild(openBtn);
  buttonsContainer.appendChild(viewBtn);

  // Assemble rows
  row1.appendChild(iconContainer);
  row1.appendChild(subjectContainer);
  row1.appendChild(dateContainer);

  row2.appendChild(emptyCol);
  row2.appendChild(authorContainer);
  row2.appendChild(buttonsContainer);

  // Assemble card
  mailCard.appendChild(row1);
  mailCard.appendChild(row2);

  return mailCard;
}

function createOpenButton(mail) {
  const openBtn = document.createElement("button");
  openBtn.textContent = 'Afficher';
  openBtn.onclick = async () => {
    try {
      const existingViewer = document.getElementById("mailViewerPopup");
      if (existingViewer) existingViewer.remove();

      const fullMessage = await browser.messages.getFull(mail.id);
      const textPart = findTextPart(fullMessage.parts || []);
      
      const { overlay, viewer } = createMailViewer(mail, textPart);
      document.body.appendChild(overlay);
      document.body.appendChild(viewer);

    } catch (error) {
      console.error("Erreur lors de l'ouverture du mail :", error);
      alert("Erreur lors de l'ouverture du mail.");
    }
  };
  return openBtn;
}

function createViewButton(mail, mailCard) {
  const viewBtn = document.createElement("button");
  viewBtn.className = "viewMailButton";
  viewBtn.textContent = 'Voir Contenu';
  
  viewBtn.onclick = async () => {
    const existingBody = mailCard.querySelector(".mailBody");

    if (existingBody) {
      existingBody.remove();
      viewBtn.textContent = "Voir Contenu";
      return;
    }

    try {
      const fullMessage = await browser.messages.getFull(mail.id);
      const textPart = findTextPart(fullMessage.parts || []);

      const bodyDiv = document.createElement("div");
      bodyDiv.className = "mailBody";

      if (textPart && textPart.body && textPart.contentType.includes("text/html")) {
        const iframe = document.createElement("iframe");
        iframe.style.width = "100%";
        iframe.style.minHeight = "300px";
        iframe.style.border = "1px solid #ccc";

        const parser = new DOMParser();
        const doc = parser.parseFromString(textPart.body, "text/html");
        const head = doc.querySelector("head")?.innerHTML || "";
        const body = doc.querySelector("body")?.innerHTML || "";

        bodyDiv.appendChild(iframe);

        const replyBtnInline = document.createElement("button");
        replyBtnInline.textContent = "Répondre";
        replyBtnInline.style.marginTop = "10px";

        if (isSent) {
          replyBtnInline.disabled = true;
          replyBtnInline.title = "Message envoyé – pas de réponse possible";
        } else {
          replyBtnInline.disabled = false;
          replyBtnInline.title = "Répondre à ce message";
          replyBtnInline.onclick = () => browser.compose.beginReply(mail.id);
        }

        bodyDiv.appendChild(replyBtnInline);
        mailCard.appendChild(bodyDiv);

        iframe.onload = () => {
          iframe.contentDocument.open();
          iframe.contentDocument.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="UTF-8">
                ${head}
              </head>
              <body>${body}</body>
            </html>
          `);
          iframe.contentDocument.close();
        };
      } else if (textPart && textPart.body) {
        bodyDiv.innerHTML = `<pre>${textPart.body}</pre>`;
        mailCard.appendChild(bodyDiv);
      }
      viewBtn.textContent = "Cacher Contenu";

    } catch (error) {
      console.error("Erreur:", error);
      alert("Impossible de charger le contenu. Voir la console pour les détails.");
    }
  };
  
  return viewBtn;
}

function createMailViewer(mail, textPart) {
  // Create overlay
  const overlay = document.createElement("div");
  overlay.id = "mailOverlay";
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100vw";
  overlay.style.height = "100vh";
  overlay.style.background = "rgba(0, 0, 0, 0.5)";
  overlay.style.zIndex = 9998;
  overlay.style.backdropFilter = "blur(2px)";
  
  // Create viewer
  const viewer = document.createElement("div");
  viewer.id = "mailViewerPopup";
  viewer.style.position = "fixed";
  viewer.style.top = "0";
  viewer.style.left = "0";
  viewer.style.width = "50%";
  viewer.style.height = "95%";
  viewer.style.background = "white";
  viewer.style.border = "2px solid #ccc";
  viewer.style.boxShadow = "0 0 10px rgba(0,0,0,0.3)";
  viewer.style.zIndex = 9999;
  viewer.style.overflow = "auto";
  viewer.style.padding = "1rem";
  viewer.style.display = "flex";
  viewer.style.flexDirection = "column";

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.innerText = "Fermer";
  closeBtn.style.alignSelf = "flex-end";
  closeBtn.style.margin = "0.5rem";
  closeBtn.onclick = () => {
    document.body.style.overflow = "auto";
    overlay.remove();
    viewer.remove();
  };

  // Title
  const title = document.createElement("h2");
  title.textContent = mail.subject || "(Pas de sujet)";

  // Meta
  const meta = document.createElement("div");
  meta.innerHTML = `<strong>De :</strong> ${mail.author || "Inconnu"}<br><strong>Date :</strong> ${new Date(mail.date).toLocaleString()}`;

  // Content
  const content = document.createElement("div");
  content.style.flex = "1";
  content.style.marginTop = "1rem";
  content.style.overflowY = "auto";
  content.style.border = "1px solid #ddd";
  content.style.padding = "0.5rem";

  if (textPart && textPart.body && textPart.contentType.includes("text/html")) {
    content.innerHTML = textPart.body;
  } else {
    content.innerHTML = `<pre>${textPart?.body || "Contenu vide."}</pre>`;
  }

  // Actions
  const actions = document.createElement("div");
  actions.style.marginTop = "1rem";
  actions.style.display = "flex";
  actions.style.justifyContent = "space-between";

  // Repondre button
  const replyBtn = document.createElement("button");
  replyBtn.textContent="Répondre";
 if (mail.isSent) {
  replyBtn.disabled = true;
  replyBtn.title = "Message envoyé – pas de réponse possible";
} else {
  replyBtn.onclick = () => browser.compose.beginReply(mail.id);
}
  // Transferer button
  const forwardBtn = document.createElement("button");
  forwardBtn.textContent = "Transférer";
  forwardBtn.onclick = () => browser.compose.beginForward(mail.id);

  // Deplacer button
  const moveBtn = document.createElement("button");
  moveBtn.textContent = "Déplacer";
  moveBtn.onclick = () => createMoveDialog(mail, viewer, overlay);


  // Supprimer button
  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "Supprimer";
  deleteBtn.onclick = async () => {
    const confirmation = confirm("Voulez-vous vraiment supprimer ce message ?");
    if (!confirmation) return;

    try {
      await browser.messages.delete([mail.id], true); // true = vers la corbeille
      closeBtn.click();
      viewer.remove(); // ferme la popup
      browser.runtime.sendMessage({ action: "refreshMailList" }); // actualise la liste
    } catch (error) {
      console.error("Erreur lors de la suppression :", error);
      alert("Erreur lors de la suppression du message.");
    }
  };

  actions.appendChild(replyBtn);
  actions.appendChild(forwardBtn);
  actions.appendChild(moveBtn);
  actions.appendChild(deleteBtn);

  // Assemble viewer
  viewer.appendChild(closeBtn);
  viewer.appendChild(title);
  viewer.appendChild(meta);
  viewer.appendChild(content);
  viewer.appendChild(actions);

  return { overlay, viewer };
}

/**
 * Crée et affiche la fenêtre de dialogue permettant de choisir un dossier de destination
 * dans la mindmap pour déplacer un mail.
 * @param {Object} mail - Objet mail à déplacer.
 * @param {HTMLElement} viewer - Élément popup parent.
 * @param {HTMLElement} overlay - Élément overlay parent.
 */

function createMoveDialog(mail, viewer, overlay) {
  const mindmapData = window.mind?.getData()?.nodeData;
  if (!mindmapData) {
    alert("Mindmap data non trouvée");
    return;
  }

  const folderPaths = getMindmapPaths(mindmapData);
  
  const dialog = document.createElement("div");
  dialog.style.position = "fixed";
  dialog.style.top = "50%";
  dialog.style.left = "50%";
  dialog.style.transform = "translate(-50%, -50%)";
  dialog.style.backgroundColor = "white";
  dialog.style.padding = "20px";
  dialog.style.border = "1px solid #ccc";
  dialog.style.zIndex = "10000";
  dialog.style.boxShadow = "0 4px 8px rgba(0,0,0,0.1)";
  
  const label = document.createElement("label");
  label.textContent = "Sélectionnez le dossier de destination :";
  label.style.display = "block";
  label.style.marginBottom = "10px";
  
  const select = document.createElement("select");
  select.style.width = "100%";
  select.style.padding = "8px";
  select.style.marginBottom = "15px";

  
  folderPaths.forEach(path => {
    const option = document.createElement("option");
    option.value = path;
    option.textContent = path;

    const rootName = getRootName(path);
    const isRoot = path === rootName;

     if (isRoot) {
        option.disabled = true;
        option.style.color = "#888";
        option.style.fontStyle = "italic";
        
      }

    select.appendChild(option);
  });
  
  const buttonContainer = document.createElement("div");
  buttonContainer.style.display = "flex";
  buttonContainer.style.justifyContent = "flex-end";
  buttonContainer.style.gap = "10px";
  
  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = "Confirmer Déplacement";
  confirmBtn.onclick = async () => {
    try {
      const targetPathRaw = select.value;
      const fullMail = await browser.messages.get(mail.id);
      let currentPath = fullMail.folder.path.replace(/^\//, "");
      let currentMailFolderPath = fullMail.folder.path;
      if (currentMailFolderPath.startsWith("/")) {
        currentMailFolderPath = currentMailFolderPath.slice(1);
      }
      
      const rootName = getRootName(currentMailFolderPath);

    
      const targetPath = rootName + "/" + targetPathRaw.split("/").slice(1).join("/");

      if (targetPath === currentPath) {
        alert("Ce message est déjà dans ce dossier.Veuillez choisir un dossier valide ");
        return;
      }

      await moveMailToFolder(mail.id, currentMailFolderPath, targetPath);
      alert(`Message déplacé vers ${targetPath}`);
      viewer.remove();
      if (overlay) overlay.remove();
      document.body.removeChild(dialog);
    } catch (err) {
      console.error("Erreur de déplacement :", err);
      alert("Erreur lors du déplacement.");
    }
  };

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Annuler";
  cancelBtn.onclick = () => {
    document.body.removeChild(dialog);
  };
  
  buttonContainer.appendChild(cancelBtn);
  buttonContainer.appendChild(confirmBtn);
  
  dialog.appendChild(label);
  dialog.appendChild(select);
  dialog.appendChild(buttonContainer);
  
  document.body.appendChild(dialog);
}

// Utility functions
function debounce(func, wait) {
  let timeout;
  return function() {
    const context = this, args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// Main export
export function showMailPopup(mails, keyword) {
  const existingPopup = document.getElementById("mailPopup");
  if (existingPopup) existingPopup.remove();

  const popup = document.createElement("div");
  popup.id = "mailPopup";

  popup.appendChild(createPopupHeader(keyword, mails.length));

  const mailList = document.createElement("div");
  mailList.id = "popupMailList";

  if (mails.length === 0) {
    mailList.innerHTML = "<p>Aucun mail trouvé.</p>";
  } else {
    mails.forEach(mail => {
      const mailCard = createMailCard(mail);
      if (mailCard) mailList.appendChild(mailCard);
    });
  }

  popup.appendChild(createSearchInput(mailList));
  popup.appendChild(mailList);

  document.body.appendChild(popup);
}
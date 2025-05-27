/**
 * Charge les notifications stockées localement et les affiche dans l'interface.
 * Chaque notification inclut un bouton pour ouvrir l'email et un bouton pour la masquer.
 */
export function loadAndDisplayNotifications() {
    browser.storage.local.get('notifications').then(data => {
        const notifications = data.notifications || [];

        // Trie les notifications par date décroissante (du plus récent au plus ancien)
        notifications.sort((a, b) => new Date(b.date) - new Date(a.date));

        const container = document.getElementById('notifications');
        if (!container) {
            console.error('Conteneur de notifications introuvable.');
            return;
        }

        container.innerHTML = ''; // Nettoie l'affichage précédent

        notifications.forEach(notification => {
            // Création du conteneur principal de la notification
            const div = document.createElement('div');
            div.className = 'notification';

            // Contenu texte principal (sujet et auteur)
            div.textContent = `Subject: ${notification.subject} - From: ${notification.author}`;

            // Bouton pour ouvrir l'email
            const openButton = document.createElement('button');
            openButton.textContent = 'Open Email';
            openButton.onclick = async () => {
                try {
                    let tabs = await browser.mailTabs.query({});
                    if (tabs.length > 0) {
                        await browser.messageDisplay.open({
                            messageId: notification.messageId,
                            location: 'tab',
                            active: true
                        });
                    } else {
                        console.error('Aucun onglet disponible pour ouvrir le message.');
                    }
                } catch (error) {
                    console.error('Erreur lors de l’ouverture du message :', error);
                }
            };

            // Bouton pour masquer la notification de l'interface
            const dismissButton = document.createElement('button');
            dismissButton.textContent = 'Dismiss';
            dismissButton.onclick = () => {
                div.remove(); // Supprime uniquement de l'affichage (non du stockage)
            };

            // Ajoute les boutons à la notification
            div.appendChild(openButton);
            div.appendChild(dismissButton);

            // Ajoute la notification à l'interface
            container.appendChild(div);
        });
    }).catch(error => {
        console.error('Erreur lors du chargement des notifications :', error);
    });
}

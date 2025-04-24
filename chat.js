import { database, auth } from './firebase-config.js';

class Chat {
    constructor() {
        this.currentUser = null;
        this.isAdmin = false;
        this.currentChatUser = null;
        this.messagesRef = database.ref('messages');
        this.activeUsersRef = database.ref('activeUsers');
        this.typingRef = database.ref('typing');
        this.unreadCounts = {};
        this.initializeElements();
        
        // Wait for auth state before setting up typing indicator
        auth.onAuthStateChanged((user) => {
            if (user) {
                this.setupTypingIndicator();
            }
        });
    }

    initializeElements() {
        this.chatMessages = document.getElementById('chat-messages');
        this.chatInput = document.getElementById('chat-input');
        this.sendButton = document.getElementById('send-message');
        this.sessionButtons = document.querySelector('.session-buttons');
    }

    initialize(userEmail, isAdmin) {
        this.currentUser = userEmail;
        this.isAdmin = isAdmin;

        // Setup message input handlers
        this.setupMessageHandlers();

        if (this.isAdmin) {
            this.setupAdminChat();
        } else {
            this.setupUserChat();
        }

        // Setup notifications
        if (!this.isAdmin) {
            this.setupNotifications();
            Notification.requestPermission();
        }

        // Hide session buttons for non-admins
        const sessionButtonsContainer = document.querySelector('.session-buttons');
        if (sessionButtonsContainer) {
            sessionButtonsContainer.style.display = this.isAdmin ? 'flex' : 'none';
        }

        // Initialize Firebase chat
        const chatRef = firebase.database().ref('chats');
        const messagesRef = chatRef.child(userEmail.replace(/[.#$[\]]/g, '_'));

        // Remove any existing listeners before adding new ones
        messagesRef.off();
        
        // Listen for new messages
        messagesRef.on('value', (snapshot) => {
            this.displayMessages(snapshot.val() || {});
        });

        // Set up message input
        this.setupMessageInput(messagesRef, userEmail);
    }

    setupMessageHandlers() {
        this.sendButton?.addEventListener('click', () => this.sendMessage());
        this.chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    setupAdminChat() {
        if (this.chatInput) {
            this.chatInput.disabled = true;
            this.chatInput.placeholder = 'Select a user to start chatting...';
        }
        if (this.sendButton) this.sendButton.disabled = true;

        // Show admin sessions
        const adminSessions = document.getElementById('admin-sessions');
        if (adminSessions) {
            adminSessions.style.display = 'block';
        }

        // Listen for active users
        this.activeUsersRef.on('value', (snapshot) => {
            console.log('Active users update:', snapshot.val()); // Debug log
            const users = snapshot.val() || {};
            this.updateSessionButtons(users);
        });
    }

    setupUserChat() {
        if (this.chatInput) {
            this.chatInput.disabled = false;
            this.chatInput.placeholder = 'Type your message...';
        }
        if (this.sendButton) this.sendButton.disabled = false;

        // Sanitize email for Firebase path
        const safeEmail = this.sanitizeEmailForPath(this.currentUser);

        // Mark user as active with sanitized email
        this.activeUsersRef.child(safeEmail).set({
            email: this.currentUser, // Keep original email for display
            lastActive: firebase.database.ServerValue.TIMESTAMP
        });

        // Remove user when they disconnect
        this.activeUsersRef.child(safeEmail).onDisconnect().remove();

        // Start listening for messages
        this.listenForMessages();
    }

    updateSessionButtons(users) {
        if (!this.sessionButtons) {
            console.error('Session buttons container not found');
            return;
        }
        
        console.log('Updating session buttons with users:', users); // Debug log
        
        this.sessionButtons.innerHTML = Object.values(users)
            .filter(user => user && user.email) // Filter out any invalid entries
            .map(user => `
                <button class="session-button" data-user="${user.email}">
                    ${user.email}
                </button>
            `).join('');

        // Add click handlers
        this.sessionButtons.querySelectorAll('.session-button').forEach(button => {
            button.addEventListener('click', () => {
                this.selectSession(button.dataset.user);
                // Update active state
                this.sessionButtons.querySelectorAll('.session-button').forEach(b => 
                    b.classList.toggle('active', b === button));
            });
        });
    }

    selectSession(userEmail) {
        // Sanitize email for path
        this.currentChatUser = userEmail;
        const safeEmail = this.sanitizeEmailForPath(userEmail);
        
        if (this.chatInput) {
            this.chatInput.disabled = false;
            this.chatInput.focus();
        }
        if (this.sendButton) this.sendButton.disabled = false;
        
        // Clear and reload messages
        if (this.chatMessages) this.chatMessages.innerHTML = '';
        this.listenForMessages();
    }

    async sendMessage() {
        if (!this.chatInput?.value.trim()) return;

        const messageData = {
            sender: this.currentUser,
            message: this.chatInput.value.trim(),
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            isAdmin: this.isAdmin,
            recipient: this.isAdmin ? this.currentChatUser : 'admin',
            read: false,
            isPublic: false  // Default to false, can be toggled by admin
        };

        // Add button for admins to publish to RSS
        if (this.isAdmin) {
            const publishButton = document.createElement('button');
            publishButton.className = 'publish-to-rss';
            publishButton.textContent = 'Publish to Display';
            publishButton.onclick = () => this.publishToRSS(messageData);
        }

        try {
            // Use sanitized email for paths
            const chatPath = this.isAdmin 
                ? `messages/${this.sanitizeEmailForPath(this.currentChatUser)}`
                : `messages/${this.sanitizeEmailForPath(this.currentUser)}`;
                
            await this.messagesRef.child(chatPath).push(messageData);
            this.chatInput.value = '';
            this.chatInput.focus();
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Failed to send message. Please try again.');
        }
    }

    async publishToRSS(message) {
        const params = new URLSearchParams({
            action: 'publishToRSS',
            message: message.message,
            sender: message.sender,
            timestamp: message.timestamp
        });

        try {
            const response = await fetch(`${scriptURL}?${params.toString()}`);
            const result = await response.json();
            if (result.success) {
                console.log('Message published to RSS feed');
            }
        } catch (error) {
            console.error('Error publishing to RSS:', error);
        }
    }

    listenForMessages() {
        this.messagesRef.off(); // Remove existing listeners

        // Use sanitized email for paths
        const chatPath = this.isAdmin && this.currentChatUser
            ? `messages/${this.sanitizeEmailForPath(this.currentChatUser)}`
            : `messages/${this.sanitizeEmailForPath(this.currentUser)}`;

        this.messagesRef.child(chatPath).on('child_added', (snapshot) => {
            const message = snapshot.val();
            const messageId = snapshot.key;
            
            // Update unread count when new message arrives
            if (!message.read) {
                this.updateUnreadCount(message.sender);
            }
            
            // Display message if relevant
            if (this.shouldDisplayMessage(message)) {
                this.displayMessage(message, messageId);
            }
        });
    }

    displayMessage(message, messageId) {
        if (!this.chatMessages) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${message.isAdmin ? 'admin-message' : 'user-message'}`;
        
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-sender ${message.isAdmin ? 'admin-label' : 'user-label'}">
                    ${message.sender}
                </span>
                <span class="chat-timestamp">
                    ${new Date(message.timestamp).toLocaleString()}
                </span>
            </div>
            <div class="chat-text">${message.message}</div>
        `;

        // Add read status
        const statusSpan = document.createElement('span');
        statusSpan.className = `message-status ${message.read ? 'message-read' : 'message-unread'}`;
        statusSpan.textContent = message.read ? '✓✓' : '✓';
        messageDiv.querySelector('.message-header').appendChild(statusSpan);

        // Mark message as read if recipient is viewing it
        if (!message.read && message.recipient === this.currentUser) {
            this.markMessageAsRead(messageId);
        }

        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    sanitizeEmailForPath(email) {
        return email.replace(/[.#$[\]]/g, '_');
    }

    setupNotifications() {
        if (!this.isAdmin) {
            this.messagesRef.on('child_added', (snapshot) => {
                const message = snapshot.val();
                if (message.recipient === this.currentUser && message.isAdmin) {
                    this.showNotification('New Message', 'You have a new message from admin');
                }
            });
        }
    }

    showNotification(title, body) {
        if (Notification.permission === 'granted') {
            new Notification(title, { body });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    new Notification(title, { body });
                }
            });
        }
    }

    markMessageAsRead(messageId) {
        const chatPath = `messages/${this.sanitizeEmailForPath(this.currentUser)}/${messageId}`;
        this.messagesRef.child(chatPath).update({ read: true });
    }

    setupTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        const typingUser = typingIndicator?.querySelector('.typing-user');
        
        this.chatInput?.addEventListener('input', () => {
            // Check if user is authenticated
            const user = auth.currentUser;
            if (!user || !this.currentUser) return;
            
            const userPath = this.sanitizeEmailForPath(this.currentUser);
            this.typingRef.child(userPath).set({
                isTyping: this.chatInput.value.length > 0,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                email: this.currentUser
            }).catch(error => {
                console.error('Error updating typing status:', error);
            });
        });

        // Clear typing status when user stops typing
        this.chatInput?.addEventListener('blur', () => {
            const user = auth.currentUser;
            if (!user || !this.currentUser) return;
            
            this.typingRef.child(this.sanitizeEmailForPath(this.currentUser)).remove()
                .catch(error => {
                    console.error('Error clearing typing status:', error);
                });
        });

        // Listen for typing status changes
        this.typingRef.on('value', (snapshot) => {
            const typing = snapshot.val();
            if (!typing || !typingIndicator || !typingUser) return;

            const typingUsers = Object.values(typing).filter(t => 
                t.isTyping && 
                t.email !== this.currentUser && 
                (this.isAdmin ? t.email === this.currentChatUser : t.email === 'admin')
            );

            if (typingUsers.length > 0) {
                typingUser.textContent = typingUsers[0].email;
                typingIndicator.style.display = 'block';
            } else {
                typingIndicator.style.display = 'none';
            }
        });
    }

    updateUnreadCount(userEmail) {
        if (!this.isAdmin) return;
        
        const safeEmail = this.sanitizeEmailForPath(userEmail);
        this.messagesRef.child(safeEmail).orderByChild('read')
            .equalTo(false)
            .once('value', (snapshot) => {
                const unreadCount = snapshot.numChildren();
                this.unreadCounts[userEmail] = unreadCount;
                
                // Update UI
                const sessionButton = this.sessionButtons
                    ?.querySelector(`[data-user="${userEmail}"]`);
                
                if (sessionButton) {
                    let countBadge = sessionButton.querySelector('.unread-count');
                    if (unreadCount > 0) {
                        if (!countBadge) {
                            countBadge = document.createElement('span');
                            countBadge.className = 'unread-count';
                            sessionButton.appendChild(countBadge);
                        }
                        countBadge.textContent = unreadCount;
                    } else if (countBadge) {
                        countBadge.remove();
                    }
                }
            });
    }

    shouldDisplayMessage(message) {
        if (this.isAdmin) {
            return message.recipient === this.currentChatUser || 
                (message.sender === this.currentChatUser && message.recipient === 'admin');
        } else {
            return message.sender === this.currentUser || 
                (message.recipient === this.currentUser && message.isAdmin);
        }
    }

    setupMessageInput(messagesRef, userEmail) {
        const chatInput = document.getElementById('chat-input');
        const chatForm = document.getElementById('chat-form');

        // Remove any existing listeners
        if (chatForm) {
            const newChatForm = chatForm.cloneNode(true);
            chatForm.parentNode.replaceChild(newChatForm, chatForm);
            
            newChatForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const message = chatInput.value.trim();
                if (message) {
                    this.sendMessage(messagesRef, message, userEmail);
                    chatInput.value = '';
                }
            });
        }
    }

    displayMessages(messages) {
        // Implementation of displayMessages method
    }
}

export const chat = new Chat(); 
import { auth, database, ref, set, onValue, push, get, child } from './firebase-config.js';

class Chat {
    constructor() {
        this.currentUser = null;
        this.isAdmin = false;
        this.currentChatUser = null;
        this.unreadCounts = {};
        
        // Wait for DOM elements
        this.initializeElements();
    }

    initializeElements() {
        this.chatMessages = document.getElementById('chat-messages');
        this.chatInput = document.getElementById('chat-input');
        this.sendButton = document.getElementById('send-message');
        this.sessionButtons = document.querySelector('.session-buttons');

        // Clear any existing messages and show welcome message
        if (this.chatMessages) {
            this.chatMessages.innerHTML = `
                <div class="chat-message system-message">
                    Welcome to the chat system. Please wait while we connect you...
                </div>
            `;
        }
    }

    initialize(userEmail, isAdmin) {
        if (!userEmail) {
            console.error('No user email provided for chat initialization');
            return;
        }

        this.currentUser = userEmail;
        this.isAdmin = isAdmin;

        // Initialize Firebase refs
        this.messagesRef = ref(database, 'messages');
        this.activeUsersRef = ref(database, 'activeUsers');
        this.typingRef = ref(database, 'typing');

        // Update chat window with user info
        if (this.chatMessages) {
            this.chatMessages.innerHTML = `
                <div class="chat-message system-message">
                    Connected as ${this.currentUser}
                    ${this.isAdmin ? '(Admin)' : ''}
                </div>
            `;
        }

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
        const chatRef = ref(database, 'chats');
        const messagesRef = child(chatRef, this.sanitizeEmailForPath(userEmail));

        // Remove any existing listeners before adding new ones
        onValue(messagesRef, (snapshot) => {
            this.displayMessages(snapshot.val() || {});
        });

        // Set up message input
        this.setupMessageInput(messagesRef, userEmail);

        // Setup typing indicator after Firebase is initialized
        auth.onAuthStateChanged((user) => {
            if (user) {
                this.setupTypingIndicator();
            }
        });
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
        if (!this.isAdmin) return;

        // Enable chat input for admins
        if (this.chatInput) {
            this.chatInput.disabled = false;
            this.chatInput.placeholder = 'Select a user to start chatting...';
        }
        if (this.sendButton) this.sendButton.disabled = false;

        // Show admin sessions
        const adminSessions = document.getElementById('admin-sessions');
        if (adminSessions) {
            adminSessions.style.display = 'block';
        }

        // Listen for active users
        onValue(this.activeUsersRef, (snapshot) => {
            const users = snapshot.val() || {};
            this.updateSessionButtons(users);
        });
    }

    setupUserChat() {
        // Enable chat input for users
        if (this.chatInput) {
            this.chatInput.disabled = false;
            this.chatInput.placeholder = 'Type your message...';
        }
        if (this.sendButton) this.sendButton.disabled = false;

        // Mark user as active
        const safeEmail = this.sanitizeEmailForPath(this.currentUser);
        set(child(this.activeUsersRef, safeEmail), {
            email: this.currentUser,
            lastActive: Date.now()
        });

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
        if (!this.chatInput || !this.chatInput.value.trim()) return;

        const message = this.chatInput.value.trim();
        const timestamp = Date.now();

        try {
            // Create a new message reference
            const newMessageRef = push(this.messagesRef);
            
            // Set the message data
            set(newMessageRef, {
                sender: this.currentUser,
                message: message,
                timestamp: timestamp,
                isAdmin: this.isAdmin,
                recipient: this.currentChatUser || 'admin' // If not admin, send to admin
            });

            // Clear input after sending
            this.chatInput.value = '';
            
            // Add message to display
            this.displayMessage({
                sender: this.currentUser,
                message: message,
                timestamp: timestamp,
                isAdmin: this.isAdmin
            });

        } catch (error) {
            console.error('Error sending message:', error);
            // Show error to user
            this.displayMessage({
                message: 'Error sending message. Please try again.',
                isError: true
            });
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
        onValue(this.messagesRef, (snapshot) => {
            const messages = snapshot.val();
            if (messages) {
                this.displayMessages(messages);
            }
        });
    }

    displayMessage(msg) {
        if (!this.chatMessages) return;

        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';
        
        if (msg.isError) {
            messageElement.className += ' error-message';
            messageElement.textContent = msg.message;
        } else {
            messageElement.textContent = `${msg.sender}: ${msg.message}`;
        }

        this.chatMessages.appendChild(messageElement);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    sanitizeEmailForPath(email) {
        return email.replace(/[.#$[\]]/g, '_');
    }

    setupNotifications() {
        if (!this.isAdmin) {
            onValue(this.messagesRef, (snapshot) => {
                const messages = snapshot.val();
                if (messages) {
                    Object.values(messages).forEach(message => {
                        if (message.recipient === this.currentUser && message.isAdmin) {
                            this.showNotification('New Message', 'You have a new message from admin');
                        }
                    });
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
        set(ref(this.messagesRef, chatPath), { read: true });
    }

    setupTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        const typingUser = typingIndicator?.querySelector('.typing-user');
        
        this.chatInput?.addEventListener('input', () => {
            // Check if user is authenticated
            const user = auth.currentUser;
            if (!user || !this.currentUser) return;
            
            const userPath = this.sanitizeEmailForPath(this.currentUser);
            set(ref(this.typingRef, userPath), {
                isTyping: this.chatInput.value.length > 0,
                timestamp: Date.now(),
                email: this.currentUser
            }).catch(error => {
                console.error('Error updating typing status:', error);
            });
        });

        // Clear typing status when user stops typing
        this.chatInput?.addEventListener('blur', () => {
            const user = auth.currentUser;
            if (!user || !this.currentUser) return;
            
            set(ref(this.typingRef, this.sanitizeEmailForPath(this.currentUser)), null)
                .catch(error => {
                    console.error('Error clearing typing status:', error);
                });
        });

        // Listen for typing status changes
        onValue(this.typingRef, (snapshot) => {
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
        onValue(child(this.messagesRef, safeEmail, 'read'), (snapshot) => {
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
        this.chatMessages.innerHTML = '';
        Object.values(messages).forEach(msg => {
            const messageElement = document.createElement('div');
            messageElement.className = 'chat-message';
            messageElement.textContent = `${msg.sender}: ${msg.message}`;
            this.chatMessages.appendChild(messageElement);
        });
        
        // Scroll to bottom
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
}

// Create chat instance after the module is loaded
export const chat = new Chat(); 
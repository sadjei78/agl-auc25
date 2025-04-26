import { auth, database, ref, set, onValue, push, get, child } from './firebase-config.js';

class Chat {
    constructor() {
        this.currentUser = null;
        this.isAdmin = false;
        this.currentChatUser = null;
        this.unreadCounts = {};
        this.messageListener = null;
    }

    initialize(userEmail, isAdmin) {
        this.currentUser = userEmail;
        this.isAdmin = isAdmin;
        
        // Initialize elements after we know user type
        this.initializeElements();
        
        // Initialize Firebase refs
        this.messagesRef = ref(database, 'messages');
        this.activeUsersRef = ref(database, 'activeUsers');

        // Setup appropriate chat interface
        if (isAdmin) {
            this.setupAdminChat();
        } else {
            this.setupUserChat();
        }

        // Start polling for active users if admin
        if (isAdmin) {
            this.loadActiveUsers();  // Initial load
            this.startPolling();
        }
    }

    initializeElements() {
        this.chatMessages = document.getElementById('chat-messages');
        this.chatInput = document.getElementById('chat-input');
        this.sendButton = document.getElementById('send-message');
        this.sessionButtons = document.querySelector('.session-buttons');

        // Set initial state based on user type
        if (this.chatInput) {
            if (this.isAdmin) {
                this.chatInput.disabled = true;
                this.chatInput.placeholder = 'Select a user to start chatting...';
            } else {
                this.chatInput.disabled = false;
                this.chatInput.placeholder = 'Type your message...';
            }
        }
        if (this.sendButton) {
            this.sendButton.disabled = this.isAdmin;
        }
    }

    setupAdminChat() {
        if (!this.isAdmin) return;

        // Disable chat input until session is selected
        if (this.chatInput) {
            this.chatInput.disabled = true;
            this.chatInput.placeholder = 'Select a user to start chatting...';
        }
        if (this.sendButton) this.sendButton.disabled = true;

        // Show admin sessions
        if (this.sessionButtons) {
            this.sessionButtons.style.display = 'flex';
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
        if (!this.sessionButtons) return;
        
        this.sessionButtons.innerHTML = '';
        Object.values(users).forEach(user => {
            const button = document.createElement('button');
            button.className = 'session-button';
            button.textContent = user.email;
            
            // Add unread count if any
            const unreadCount = this.unreadCounts[user.email] || 0;
            if (unreadCount > 0) {
                button.innerHTML += `<span class="unread-count">${unreadCount}</span>`;
            }
            
            button.onclick = () => this.selectChatSession(user.email);
            this.sessionButtons.appendChild(button);
        });
    }

    selectChatSession(userEmail) {
        this.currentChatUser = userEmail;
        
        // Enable chat input
        if (this.chatInput) {
            this.chatInput.disabled = false;
            this.chatInput.placeholder = `Chatting with ${userEmail}...`;
        }
        if (this.sendButton) this.sendButton.disabled = false;

        // Start listening for messages for this session
        this.listenForMessages();
        
        // Highlight selected session
        const buttons = this.sessionButtons.getElementsByClassName('session-button');
        Array.from(buttons).forEach(button => {
            button.classList.toggle('active', button.textContent === userEmail);
        });
    }

    async loadChatHistory(userEmail) {
        const safeEmail = this.sanitizeEmailForPath(userEmail);
        const chatRef = child(this.messagesRef, safeEmail);
        
        onValue(chatRef, (snapshot) => {
            const messages = snapshot.val() || {};
            this.displayMessages(messages);
        });
    }

    async sendMessage() {
        if (!this.chatInput || !this.chatInput.value.trim()) return;

        const message = this.chatInput.value.trim();
        const timestamp = Date.now();

        try {
            // Create message path based on recipient
            const chatPath = this.isAdmin 
                ? `messages/${this.sanitizeEmailForPath(this.currentChatUser)}`
                : `messages/${this.sanitizeEmailForPath(this.currentUser)}`;

            // Create a new message reference
            const newMessageRef = push(ref(database, chatPath));
            
            // Set the message data
            await set(newMessageRef, {
                sender: this.currentUser,
                message: message,
                timestamp: timestamp,
                isAdmin: this.isAdmin,
                recipient: this.isAdmin ? this.currentChatUser : 'admin',
                read: false
            });

            // Clear input after sending
            this.chatInput.value = '';
            
        } catch (error) {
            console.error('Error sending message:', error);
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
        // For users, only listen to their own messages
        const chatPath = this.isAdmin && this.currentChatUser 
            ? `messages/${this.sanitizeEmailForPath(this.currentChatUser)}`
            : `messages/${this.sanitizeEmailForPath(this.currentUser)}`;
            
        // Remove any existing listeners before adding new ones
        const chatRef = ref(database, chatPath);
        onValue(chatRef, (snapshot) => {
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
        if (!this.chatMessages) return;
        this.chatMessages.innerHTML = '';
        
        // Sort messages by timestamp
        const sortedMessages = Object.values(messages)
            .filter(msg => {
                if (this.isAdmin) {
                    // Admin should only see messages from/to current chat user
                    return msg.sender === this.currentChatUser || 
                           (msg.sender === this.currentUser && msg.recipient === this.currentChatUser);
                } else {
                    // Users see their conversation with admin
                    return msg.sender === this.currentUser || 
                           (msg.isAdmin && msg.recipient === this.currentUser);
                }
            })
            .sort((a, b) => a.timestamp - b.timestamp);

        sortedMessages.forEach(msg => {
            const messageElement = document.createElement('div');
            messageElement.className = `chat-message ${msg.sender === this.currentUser ? 'sent' : 'received'}`;
            messageElement.textContent = `${msg.sender}: ${msg.message}`;
            this.chatMessages.appendChild(messageElement);
        });
        
        // Scroll to bottom
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    async loadActiveUsers() {
        const email = localStorage.getItem('userEmail');
        const token = localStorage.getItem('sessionToken');
        
        if (!email || !token) return;

        try {
            const response = await fetch(`${scriptURL}?action=getActiveUsers&email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`);
            const data = await response.json();
            
            if (data.success && Array.isArray(data.users)) {
                this.displayActiveUsers(data.users);
            }
        } catch (error) {
            console.error('Error loading active users:', error);
        }
    }

    startPolling() {
        // Start polling for active users
        setInterval(() => this.loadActiveUsers(), 30000);  // Poll every 30 seconds
    }

    displayActiveUsers(users) {
        if (!this.sessionButtons) return;
        
        this.sessionButtons.innerHTML = '';
        users.forEach(user => {
            const button = document.createElement('button');
            button.className = 'session-button';
            button.textContent = user.email;
            
            // Add unread count if any
            const unreadCount = this.unreadCounts[user.email] || 0;
            if (unreadCount > 0) {
                button.innerHTML += `<span class="unread-count">${unreadCount}</span>`;
            }
            
            button.onclick = () => this.selectChatSession(user.email);
            this.sessionButtons.appendChild(button);
        });
    }
}

// Create chat instance
export const chat = new Chat(); 
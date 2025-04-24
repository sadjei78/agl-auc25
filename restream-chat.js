import config from './config.js';

class RestreamChat {
    constructor() {
        this.clientId = config.restream.clientId;
        this.clientSecret = config.restream.clientSecret;
        this.websocket = null;
        this.connected = false;
        this.accessToken = null;
        this.retryCount = 0;
        this.maxRetries = 3;
    }

    async authenticate() {
        try {
            console.log('Authenticating with Restream...');
            
            // Create the token request body
            const tokenRequest = new URLSearchParams({
                'client_id': this.clientId,
                'client_secret': this.clientSecret,
                'grant_type': 'client_credentials'
            });

            console.log('Attempting auth with credentials...'); // Debug log
            
            const response = await fetch('https://api.restream.io/oauth/token', {  // Remove v2 from URL
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: tokenRequest
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Auth response not OK:', response.status, errorText); // Debug log
                throw new Error(`Auth failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            if (!data.access_token) {
                console.error('No access token in response:', data); // Debug log
                throw new Error('No access token received');
            }

            this.accessToken = data.access_token;
            console.log('Successfully authenticated with Restream');
            return true;
        } catch (error) {
            console.error('Restream authentication error:', error);
            return false;
        }
    }

    async connect() {
        try {
            if (!await this.authenticate()) {
                throw new Error('Authentication failed');
            }

            this.websocket = new WebSocket('wss://chat.restream.io/ws');  // Updated WebSocket URL
            
            this.websocket.onopen = () => {
                console.log('WebSocket connected, sending auth...');
                this.websocket.send(JSON.stringify({
                    type: 'auth',
                    payload: {
                        token: this.accessToken  // Changed from accessToken to token
                    }
                }));
            };

            this.websocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                console.log('Received message:', data);
                
                if (data.type === 'auth') {
                    if (data.status === 'ok') {
                        this.connected = true;
                        this.retryCount = 0;
                        console.log('Successfully connected to Restream chat');
                    } else {
                        console.error('Auth failed:', data);
                        this.reconnect();
                    }
                } else if (data.type === 'chat.message') {
                    this.handleMessage(data.payload);
                }
            };

            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.reconnect();
            };

            this.websocket.onclose = () => {
                console.log('WebSocket closed');
                this.connected = false;
                this.reconnect();
            };
        } catch (error) {
            console.error('Connection error:', error);
            this.reconnect();
        }
    }

    reconnect() {
        if (this.retryCount >= this.maxRetries) {
            console.error('Max retry attempts reached');
            return;
        }

        this.retryCount++;
        const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
        console.log(`Attempting reconnect in ${delay}ms (attempt ${this.retryCount})`);
        
        setTimeout(() => this.connect(), delay);
    }

    handleMessage(message) {
        const formattedMessage = {
            sender: message.author.name,
            platform: message.platform,
            message: message.text,
            timestamp: new Date().getTime()
        };

        fetch(`${config.scriptURL}?action=handleRestreamMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formattedMessage)
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                console.error('Failed to publish message to RSS:', data.message);
            }
        })
        .catch(error => console.error('Error publishing to RSS:', error));
    }

    disconnect() {
        if (this.websocket) {
            this.websocket.close();
        }
        this.connected = false;
        this.accessToken = null;
    }
}

const restreamChat = new RestreamChat();

export function initializeRestreamChat() {
    console.log('Initializing Restream chat...');
    if (localStorage.getItem('adminType') !== 'user') {
        restreamChat.connect();
    }
}

export function disconnectRestreamChat() {
    restreamChat.disconnect();
}
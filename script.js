import { config } from './config.js';
import { chat } from './chat.js';
import { auth, database, ref, get, set } from './firebase-config.js';
// import { initializeRestreamChat, disconnectRestreamChat } from './restream-chat.js';

// Move scriptURL to global scope
const scriptURL = config.scriptURL;

// Add these variables at the top of your script
let currentImageIndex = 0;
let currentImages = [];
let isAdmin = false; // Make isAdmin global
let messagePollingInterval = null;
const POLLING_INTERVAL = 10000; // Increase from 5s to 10s to reduce server load
const SESSION_POLLING_INTERVAL = 30000; // 30s for active sessions
let lastMessageTimestamp = null; // Track last message time

// Add message cache
const messageCache = new Map(); // Cache messages by user
let currentChatUser = null; // Track current chat user

// Add this near the top of script.js with other global variables
let searchTimeout = null;

// Define column structure
const COLUMNS = {
    ID: 0,              // A - Item ID
    NAME: 1,            // B - Item Name
    IMAGE1: 2,          // C - Item Image
    IMAGE2: 3,          // D - Item Image 2
    IMAGE3: 4,          // E - Item Image 3
    DESCRIPTION: 5,     // F - Item Description
    STARTING_BID: 6,    // G - Starting Bid
    DISPLAY: 7,         // H - Display
    BIDDING_ACTIVE: 8,  // I - Bidding Active
    BID_INCREMENT: 9,   // J - Bid Increment
    CATEGORY: 10        // K - Category
};

// Add these at the top of script.js, after the imports and global variables
function showSpinner() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) {
        spinner.style.display = 'flex';
    }
}

function hideSpinner() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) {
        spinner.style.display = 'none';
    }
}

// Move these functions outside of DOMContentLoaded and attach to window
window.showLargeImage = function(imageSrc, itemName, description, totalBids, currentBid, startingBid, biddingActive, image2, image3, itemId) {
    const modal = document.getElementById("image-modal");
    const modalImage = document.getElementById("modal-image");
    const modalItemName = document.getElementById("modal-item-name");
    const modalDescription = document.getElementById("modal-description");
    const modalBidInfo = document.getElementById("modal-bid-info");

    // Get current admin status and verify token
    const adminType = localStorage.getItem('adminType');
    const token = localStorage.getItem('sessionToken');
    const email = localStorage.getItem('userEmail');
    
    // Verify admin status with server before showing admin controls
    if (adminType !== 'user' && token && email) {
        fetch(`${scriptURL}?action=checkAdmin&email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`)
            .then(response => response.text())
            .then(data => {
                const currentAdminStatus = data !== 'user';
                updateModalWithAdminControls(currentAdminStatus);
            })
            .catch(() => updateModalWithAdminControls(false));
    } else {
        updateModalWithAdminControls(false);
    }

    function updateModalWithAdminControls(isAdmin) {
        // Format bid information
        const bidAmount = totalBids > 0 ? currentBid : startingBid;
        const bidLabel = totalBids > 0 ? 'Current Bid' : 'Starting Bid';
        const bidStatus = biddingActive ? 'Bidding Open' : 'Bidding Closed';
        
        // Add toggle button for admins
        const adminControls = isAdmin ? `
            <button onclick="toggleBiddingStatus('${itemId}', ${!biddingActive})" class="bidding-toggle ${biddingActive ? 'active' : 'inactive'}">
                ${biddingActive ? 'Close Bidding' : 'Open Bidding'}
            </button>
        ` : '';
        
        modalBidInfo.innerHTML = `
            <p><strong>${bidLabel}:</strong> $${bidAmount}</p>
            <p><strong>Total Bids:</strong> ${totalBids}</p>
            <p class="bidding-status ${biddingActive ? 'active' : 'inactive'}">${bidStatus}</p>
            ${adminControls}
        `;
    }

    // Reset and populate images array with only valid URLs
    currentImages = [imageSrc].filter(Boolean);
    if (image2 && image2 !== 'undefined') currentImages.push(image2);
    if (image3 && image3 !== 'undefined') currentImages.push(image3);
    currentImageIndex = 0;

    // Show/hide carousel buttons based on number of images
    const prevButton = modal.querySelector('.prev');
    const nextButton = modal.querySelector('.next');
    prevButton.style.display = currentImages.length > 1 ? 'block' : 'none';
    nextButton.style.display = currentImages.length > 1 ? 'block' : 'none';

    // Set the first image and add error handling
    modalImage.onerror = function() {
        this.src = './images/AuctionDefault.png'; // Update fallback image path
    };
    modalImage.src = currentImages[0];
    modalItemName.textContent = itemName;
    modalDescription.textContent = description;

    modal.style.display = "flex";

    // Add click event to close when clicking outside
    modal.onclick = function(event) {
        if (event.target === modal) {
            closeModal();
        }
    };
};

window.closeModal = function() {
    const modal = document.getElementById("image-modal");
    modal.style.display = "none";
};

// Update the image preview function
window.updateImagePreview = function(imageNum) {
    const imageUrl = document.getElementById(`itemImage${imageNum}`)?.value.trim();
    const previewContainer = document.getElementById(`imagePreview${imageNum}`).parentElement;
    const imagePreview = document.getElementById(`imagePreview${imageNum}`);
    
    if (!imageUrl) {
        previewContainer.style.display = 'none';
        return;
    }

    if (imagePreview && previewContainer) {
        imagePreview.src = imageUrl;
        
        imagePreview.onload = () => {
            previewContainer.style.display = 'block';
        };
        
        imagePreview.onerror = () => {
            previewContainer.style.display = 'none';
        };
    }
};

// Add these modal functions here
window.openAddItemModal = function() {
    const adminType = localStorage.getItem('adminType');
    if (adminType === 'user') return;
    
    const modal = document.getElementById('add-item-modal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    
    const form = document.getElementById('itemForm');
    if (form) {
        form.reset();
        for (let i = 1; i <= 3; i++) {
            const previewContainer = document.getElementById(`imagePreview${i}`).parentElement;
            if (previewContainer) {
                previewContainer.style.display = 'none';
            }
        }
    }
};

window.closeAddItemModal = function() {
    const modal = document.getElementById('add-item-modal');
    if (modal) {
        modal.style.display = 'none';
    }
};

// Add this near the top with other window functions
window.insertItemDetails = function(itemName, currentBid, totalBids, isActive) {
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        const status = isActive ? 'bidding is open' : 'bidding is closed';
        const bidInfo = totalBids > 0 ? `current bid is $${currentBid}` : `starting bid is $${currentBid}`;
        chatInput.value = `Regarding "${itemName}": ${bidInfo}, ${status}. `;
        chatInput.focus();
    }
};

// Move these functions outside DOMContentLoaded
function initializeAdminTools() {
    const addItemButton = document.getElementById('add-item-button');
    if (addItemButton) {
        addItemButton.style.display = 'block';
        addItemButton.onclick = openAddItemModal;
    }
}

// Update chat initialization in handleLoginSuccess
async function handleLoginSuccess(result, loginEmail) {
    try {
        // Store user data in localStorage
        localStorage.setItem('sessionToken', result.token);
        localStorage.setItem('userEmail', loginEmail.value);
        localStorage.setItem('firstName', result.firstName);
        localStorage.setItem('lastName', result.lastName);
        localStorage.setItem('adminType', result.adminType || 'user');

        // Update UI visibility
        document.getElementById('login').style.display = 'none';
        document.getElementById('registration').style.display = 'none';
        document.getElementById('auction-items').style.display = 'block';
        document.getElementById('chat').style.display = 'block';

        // Initialize chat first, before any other operations
        await chat.initialize(loginEmail.value, result.adminType === 'admin');

        // Setup admin features if admin
        if (result.adminType === 'admin') {
            initializeAdminTools();
        }

        // Display admin badge
        displayAdminBadge(result.adminType);

        // Show welcome page
        displayWelcomePage();

    } catch (error) {
        console.error('Error in handleLoginSuccess:', error);
    }
}

// Add new function to handle initial load
async function loadInitialCategories() {
    try {
        showSpinner();
        const response = await fetch(`${scriptURL}?action=getAuctionItems`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const items = await response.json();
        
        if (Array.isArray(items)) {
            displayCategories(items);
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    } finally {
        hideSpinner();
    }
}

// Add this function to check session and load appropriate view
function checkSessionAndLoadView() {
    const token = localStorage.getItem('sessionToken');
    const userEmail = localStorage.getItem('userEmail');
    const adminType = localStorage.getItem('adminType');

    if (token && userEmail) {
        // User is logged in
        document.getElementById('login').style.display = 'none';
        document.getElementById('registration').style.display = 'none';
        document.getElementById('auction-items').style.display = 'block';
        document.getElementById('chat').style.display = 'block';

        // Initialize chat first
        chat.initialize(userEmail, adminType === 'admin');

        // Setup admin features if admin
        if (adminType === 'admin') {
            initializeAdminTools();
        }

        // Display admin badge
        displayAdminBadge(adminType);

        // Show welcome page instead of loading items directly
        displayWelcomePage();
    } else {
        // No valid session, show login
        document.getElementById('login').style.display = 'block';
        document.getElementById('registration').style.display = 'none';
        document.getElementById('auction-items').style.display = 'none';
        document.getElementById('chat').style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Get all necessary DOM elements first
    const loginSection = document.getElementById('login');
    const loginForm = document.getElementById('login-form');
    const loginEmail = document.getElementById('login-email');
    const loginPassword = document.getElementById('login-password');
    const loginError = document.getElementById('login-error');
    const registrationSection = document.getElementById('registration');
    const registrationForm = document.getElementById('registration-form');
    const biddingSection = document.getElementById('bidding');
    const auctionItemsSection = document.getElementById('auction-items');
    const chatSection = document.getElementById('chat');
    const adminBadge = document.getElementById('admin-badge');
    const welcomeMessage = document.getElementById('welcome-message');
    const addItemModal = document.getElementById('add-item-modal');
    const imageModal = document.getElementById('image-modal');
    const bidModal = document.getElementById('bid-modal');

    // Check if we have the required elements
    if (!loginForm) {
        console.error('Login form not found');
        return;
    }

    // Hide modals initially
    if (addItemModal) addItemModal.style.display = 'none';
    if (imageModal) imageModal.style.display = 'none';
    if (bidModal) bidModal.style.display = 'none';

    // Hide all sections except login initially
    if (registrationSection) registrationSection.style.display = 'none';
    if (biddingSection) biddingSection.style.display = 'none';
    if (auctionItemsSection) auctionItemsSection.style.display = 'none';
    if (chatSection) chatSection.style.display = 'none';
    if (adminBadge) adminBadge.style.display = 'none';

    // Check session and load appropriate view
    checkSessionAndLoadView();

    // Handle login form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showSpinner();

        if (!loginEmail || !loginPassword) {
            console.error('Login form elements not found');
            hideSpinner();
            return;
        }

        try {
            const hashedPassword = btoa(loginPassword.value);
            const params = new URLSearchParams({
                action: 'loginUser',
                email: loginEmail.value,
                password: hashedPassword
            });

            const response = await fetch(`${scriptURL}?${params.toString()}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const result = await response.json();

            if (result.success) {
                handleLoginSuccess(result, loginEmail);
                if (loginError) loginError.style.display = 'none';
            } else {
                if (loginError) {
                    loginError.textContent = result.message || 'Invalid email or password';
                    loginError.style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Login error:', error);
            if (loginError) {
                loginError.textContent = 'An error occurred during login';
                loginError.style.display = 'block';
            }
        } finally {
            hideSpinner();
        }
    });

    // Handle registration form submission
    if (registrationForm) {
        registrationForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            showSpinner();
            
            const regEmail = document.getElementById('reg-email');
            const regPassword = document.getElementById('reg-password');
            const regFirstName = document.getElementById('reg-firstName');
            const regLastName = document.getElementById('reg-lastName');
            
            if (!regEmail || !regPassword || !regFirstName || !regLastName) {
                console.error('Required registration elements not found');
                hideSpinner();
                return;
            }

            try {
                const hashedPassword = btoa(regPassword.value);
                const params = new URLSearchParams({
                    action: 'registerUser',
                    email: regEmail.value,
                    password: hashedPassword,
                    firstName: regFirstName.value,
                    lastName: regLastName.value
                });

                const response = await fetch(`${scriptURL}?${params.toString()}`);
                const data = await response.json();
                
                if (data.success) {
                    // Store user info
                    localStorage.setItem('userEmail', regEmail.value);
                    localStorage.setItem('sessionToken', data.token);
                    localStorage.setItem('adminType', data.adminType || 'user');
                    localStorage.setItem('firstName', regFirstName.value);
                    localStorage.setItem('lastName', regLastName.value);
                    
                    // Update UI
                    document.getElementById('login').style.display = 'none';
                    document.getElementById('registration').style.display = 'none';
                    document.getElementById('auction-items').style.display = 'block';
                    document.getElementById('chat').style.display = 'block';
                    
                    // Initialize chat
                    chat.initialize(regEmail.value, data.adminType === 'admin');

                    // Load all auction items
                    await loadAuctionItems();
                } else {
                    alert(data.message || 'Registration failed');
                }
            } catch (error) {
                console.error('Registration error:', error);
                alert('Registration failed. Please try again.');
            } finally {
                hideSpinner();
            }
        });
    }

    const itemForm = document.getElementById('itemForm');   
    const chatInput = document.getElementById('chat-input');
    const chatWindow = document.getElementById('chat-window');

    // Variable to store the logged-in user's email
    let userEmail = '';

    // Global variable to store admin status
    let adminType = ''; // Variable to store the type of admin

    // Hide all sections except login
    registrationSection.style.display = 'none';
    biddingSection.style.display = 'none';
    auctionItemsSection.style.display = 'none';
    chatSection.style.display = 'none';
    adminBadge.style.display = 'none'; // Hide admin badge initially

    // Handle item form submission
    itemForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const itemName = document.getElementById('itemName').value;
        const itemDescription = document.getElementById('itemDescription').value;
        const itemImage1 = document.getElementById('itemImage1').value;
        const itemImage2 = document.getElementById('itemImage2').value;
        const itemImage3 = document.getElementById('itemImage3').value;

        // Send item data to Google Sheets
        fetch(scriptURL + '?action=addItem&itemName=' + encodeURIComponent(itemName) + '&itemImage1=' + encodeURIComponent(itemImage1) + '&itemImage2=' + encodeURIComponent(itemImage2) + '&itemImage3=' + encodeURIComponent(itemImage3) + '&itemDescription=' + encodeURIComponent(itemDescription))
            .then(response => response.text())
            .then(data => {
                console.log(data); // Log success message
                itemForm.reset(); // Clear the form
            })
            .catch(error => console.error('Error!', error.message));
    });

    // Handle chat message sending
    document.getElementById('send-message').addEventListener('click', () => {
        const message = chatInput.value;
        const user = userEmail; // Replace with actual user identification logic

        if (message) {
            // Send chat message to Google Sheets
            fetch(scriptURL + '?action=addChatMessage&user=' + encodeURIComponent(user) + '&message=' + encodeURIComponent(message))
                .then(response => response.text())
                .then(data => {
                    console.log(data); // Log success message
                    const messageElement = document.createElement('div');
                    messageElement.textContent = message;
                    chatWindow.appendChild(messageElement);
                    chatInput.value = ''; // Clear input
                })
                .catch(error => console.error('Error!', error.message));
        }
    });

    // Show registration form when link is clicked
    document.getElementById('show-registration').addEventListener('click', (event) => {
        event.preventDefault();
        loginSection.style.display = 'none'; // Hide login section
        registrationSection.style.display = 'block'; // Show registration section
    });

    // Update the addAuctionItem function
    function addAuctionItem(event) {
        event.preventDefault();
        const token = localStorage.getItem('sessionToken');
        const email = localStorage.getItem('userEmail');
        
        if (!token || !email) {
            console.error('No session token or email found');
            alert('Please log in again to perform this action');
            logout();
            return;
        }

        const formData = {
            itemName: document.getElementById('itemName').value,
            itemDescription: document.getElementById('itemDescription').value,
            itemImage1: document.getElementById('itemImage1').value,
            itemImage2: document.getElementById('itemImage2').value,
            itemImage3: document.getElementById('itemImage3').value,
            category: document.getElementById('itemCategory').value,
            startingBid: document.getElementById('startingBid').value,
            email: email,
            token: token,
            action: 'addItem'
        };

        // Debug logging
        console.log('Sending request with data:', formData);

        // Convert formData to URL parameters
        const params = new URLSearchParams();
        Object.entries(formData).forEach(([key, value]) => {
            params.append(key, value);
        });

        showSpinner();
        fetch(`${scriptURL}?${params.toString()}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.text();
            })
            .then(data => {
                console.log('Server response:', data);
                if (data === 'unauthorized') {
                    alert('You are not authorized to perform this action');
                    logout();
                    return;
                }
                alert('Item added successfully!');
                closeAddItemModal();
                loadAuctionItems(); // Refresh the items display
            })
            .catch(error => {
                console.error('Error!', error);
                alert('Failed to add item. Please try again.');
            })
            .finally(() => hideSpinner());
    }

    // Attach the function to the window object
    window.addAuctionItem = addAuctionItem;

    // Add carousel navigation function
    window.changeImage = function(direction) {
        if (currentImages.length <= 1) return;
        
        currentImageIndex = (currentImageIndex + direction + currentImages.length) % currentImages.length;
        const modalImage = document.getElementById("modal-image");
        modalImage.src = currentImages[currentImageIndex];
    };

    // Add the toggle function
    window.toggleBiddingStatus = function(itemId, newStatus) {
        showSpinner();
        const token = localStorage.getItem('sessionToken');
        const email = localStorage.getItem('userEmail');
        
        if (!token || !email) {
            console.error('No session token or email found');
            hideSpinner();
            return;
        }

        fetch(`${scriptURL}?action=toggleBidding&itemId=${encodeURIComponent(itemId)}&status=${newStatus}&email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`)
            .then(response => response.text())
            .then(result => {
                if (result === 'success') {
                    loadAuctionItems();
                    closeModal();
                } else if (result === 'unauthorized') {
                    alert('You are not authorized to perform this action');
                    logout();
                } else {
                    alert('Failed to update bidding status');
                }
            })
            .catch(error => {
                console.error('Error toggling bidding status:', error);
                alert('Error updating bidding status');
            })
            .finally(() => hideSpinner());
    };

    // Add these functions to handle the bid modal
    window.openBidModal = function(itemId, itemName, currentBid, minBid) {
        const modal = document.getElementById('bid-modal');
        const itemNameElem = document.getElementById('bid-item-name');
        const currentBidInfo = document.getElementById('current-bid-info');
        const minBidInfo = document.getElementById('minimum-bid-info');
        const bidInput = document.getElementById('bid-amount');
        
        // Store the item ID for the submit function
        modal.dataset.itemId = itemId;
        
        itemNameElem.textContent = `Item: ${itemName}`;
        currentBidInfo.textContent = `Current Bid: $${currentBid}`;
        minBidInfo.textContent = `Minimum Bid: $${minBid}`;
        
        // Set the minimum bid amount
        bidInput.min = minBid;
        bidInput.value = minBid;
        
        modal.style.display = 'flex';
    };

    window.closeBidModal = function() {
        document.getElementById('bid-modal').style.display = 'none';
    };

    window.submitBid = function() {
        showSpinner();
        const modal = document.getElementById('bid-modal');
        const itemId = modal.dataset.itemId;
        const bidAmount = document.getElementById('bid-amount').value;
        const email = localStorage.getItem('userEmail');
        
        if (!email) {
            hideSpinner();
            alert('Please log in to place a bid');
            return;
        }
        
        fetch(`${scriptURL}?action=handleBid&itemId=${encodeURIComponent(itemId)}&bidAmount=${encodeURIComponent(bidAmount)}&email=${encodeURIComponent(email)}`)
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    closeBidModal();
                    loadAuctionItems(); // Refresh the items display
                }
                alert(result.message);
            })
            .catch(error => {
                console.error('Error placing bid:', error);
                alert('There was an error placing your bid. Please try again.');
            })
            .finally(() => hideSpinner());
    };

    // Update the bid button creation in loadAuctionItems
    function createBidButton(item) {
        const bidButton = document.createElement('button');
        bidButton.textContent = 'Place Bid';
        bidButton.disabled = !item.biddingActive;
        
        const currentBid = item.highestBid || item.startingBid;
        const minBid = currentBid + (item.bidIncrement || 1);
        
        bidButton.onclick = () => openBidModal(item.id, item.name, currentBid, minBid);
        
        return bidButton;
    }

    // Initialize chat when user is logged in
    if (localStorage.getItem('userEmail')) {
        initializeChat();
    }

    // Add this near the top of your script, outside any other functions
    window.addEventListener('beforeunload', () => {
        stopMessagePolling();
    });
});

function initializeChat() {
    const userEmail = localStorage.getItem('userEmail');
    const adminType = localStorage.getItem('adminType');
    console.log('Initializing chat with:', { userEmail, adminType }); // Debug log
    
    // Check if user is admin (anything other than 'user' is considered admin)
    const isAdmin = adminType && adminType !== 'user';
    
    chat.initialize(userEmail, isAdmin);
}

function resetChatView() {
    const chatTitle = document.getElementById('chat-title');
    const adminType = localStorage.getItem('adminType');
    
    // Reset chat title to default
    chatTitle.textContent = adminType !== 'user' ? "Chat with Bidders" : "Chat with an Admin";
    
    // Clear active user selection
    document.querySelectorAll('.user-chat-item').forEach(i => i.classList.remove('active'));
}

// Update setupAdminTabs to use resetChatView
function setupAdminTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const activeUsersList = document.getElementById('active-users-list');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            
            if (button.dataset.tab === 'active') {
                loadActiveUsers();
            } else {
                activeUsersList.innerHTML = '';
                resetChatView();
                loadChatMessages();
            }
        });
    });
}

function displaySessionButtons(users) {
    const sessionContainer = document.querySelector('.session-buttons');
    if (!sessionContainer) return;
    
    sessionContainer.innerHTML = '';
    
    users.forEach(user => {
        const button = document.createElement('button');
        button.className = 'session-button';
        button.dataset.user = user.email;
        
        const displayName = user.firstName && user.lastName ? 
            `${user.firstName} ${user.lastName.charAt(0)}` : 
            user.email;
            
        button.innerHTML = `
            <span class="user-email">${escapeHtml(displayName)}</span>
        `;
        
        button.addEventListener('click', () => selectSession(button, user.email, displayName));
        sessionContainer.appendChild(button);
    });
}

function selectSession(button, userEmail, displayName) {
    stopActiveSessionPolling();
    currentChatUser = userEmail; // Set current chat user
    
    // Update button states
    document.querySelectorAll('.session-button').forEach(btn => {
        btn.classList.remove('active');
    });
    button.classList.add('active');
    
    // Enable chat input immediately
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-message');
    if (chatInput && sendButton) {
        chatInput.disabled = false;
        sendButton.disabled = false;
        chatInput.placeholder = `Send message to ${displayName}...`;
        chatInput.focus(); // Focus the input
    }
    
    // Show cached messages immediately if available
    if (messageCache.has(userEmail)) {
        displayChatMessages(messageCache.get(userEmail));
    }
    
    // Load fresh messages
    loadChatMessages(userEmail);
    startMessagePolling(userEmail);
}

function displayChatMessages(messages, append = false) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) {
        console.error('Chat messages container not found');
        return;
    }
    
    // Create fragment for better performance
    const fragment = document.createDocumentFragment();
    
    messages.forEach(msg => {
        if (!msg) return; // Skip if message is null/undefined
        
        const displayName = msg.firstName && msg.lastName ? 
            `${msg.firstName} ${msg.lastName.charAt(0)}` : 
            msg.email;
            
        try {
            const messageDiv = document.createElement('div');
            messageDiv.className = `chat-message ${msg.isAdmin ? 'admin-message' : 'user-message'}`;
            messageDiv.innerHTML = `
                <div class="message-header">
                    <span class="message-sender ${msg.isAdmin ? 'admin-label' : 'user-label'}">${escapeHtml(displayName || 'Unknown')}</span>
                    <span class="chat-timestamp">${new Date(msg.timestamp).toLocaleString()}</span>
                </div>
                <div class="chat-text">${escapeHtml(msg.message || '')}</div>
            `;
            fragment.appendChild(messageDiv);
        } catch (error) {
            console.error('Error creating message element:', error, msg);
        }
    });
    
    try {
        if (!append) {
            while (chatMessages.firstChild) {
                chatMessages.removeChild(chatMessages.firstChild);
            }
        }
        chatMessages.appendChild(fragment);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
        console.error('Error appending messages:', error);
    }
}

// Add this helper function to check admin status
function checkAdminStatus(email) {
    // Check if the email matches any admin in the active users list
    const adminElements = document.querySelectorAll('.user-chat-item[data-admin="true"]');
    for (const element of adminElements) {
        if (element.dataset.user === email) {
            return true;
        }
    }
    return false;
}

function sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    if (!chatInput) return;

    const message = chatInput.value.trim();
    if (!message) return;

    const email = localStorage.getItem('userEmail');
    const token = localStorage.getItem('sessionToken');
    const isAdmin = localStorage.getItem('adminType') !== 'user';
    
    let targetUser = null;
    if (isAdmin) {
        const activeSession = document.querySelector('.session-button.active');
        if (!activeSession) {
            alert('Please select a user to send the message to');
            return;
        }
        targetUser = activeSession.dataset.user;
    }
    
    if (!email || !token) {
        alert('Please log in again to send messages');
        return;
    }

    // Clear input immediately
    chatInput.value = '';
    chatInput.focus();

    const params = new URLSearchParams({
        action: 'addChatMessage',
        email: email,
        message: message,
        token: token,
        targetUser: targetUser || ''
    });

    fetch(`${scriptURL}?${params.toString()}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Refresh messages to show the new message
                loadChatMessages(targetUser);
            } else {
                console.error('Failed to send message:', data.message);
                alert(data.message || 'Failed to send message');
            }
        })
        .catch(error => {
            console.error('Error sending message:', error);
            alert('Error sending message. Please try again.');
        });
}

function loadChatMessages(targetUser = null) {
    if (!areChatElementsReady()) {
        console.error('Chat elements not ready');
        return;
    }

    const email = localStorage.getItem('userEmail');
    const token = localStorage.getItem('sessionToken');
    
    if (!email || !token) {
        console.error('No email or token found');
        return;
    }

    const params = new URLSearchParams({
        action: 'getChatMessages',
        email: email,
        token: token,
        targetUser: targetUser || '',
        lastTimestamp: messageCache.get(targetUser)?.slice(-1)[0]?.timestamp || ''
    });

    fetch(`${scriptURL}?${params.toString()}`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.messages && Array.isArray(data.messages)) {
                // Update cache
                const existingMessages = messageCache.get(targetUser) || [];
                const newMessages = data.messages.filter(msg => {
                    return !existingMessages.some(existing => 
                        existing.timestamp === msg.timestamp && 
                        existing.message === msg.message
                    );
                });
                
                if (newMessages.length > 0) {
                    messageCache.set(targetUser, [...existingMessages, ...newMessages]);
                    // Only append new messages if this is the current chat
                    if (targetUser === currentChatUser) {
                        displayChatMessages(newMessages, true);
                    }
                }
            }
        })
        .catch(error => console.error('Error loading chat messages:', error));
}

function loadAllChatHistory() {
    const email = localStorage.getItem('userEmail');
    const token = localStorage.getItem('sessionToken');
    
    if (!email || !token) return;

    showSpinner();
    const params = new URLSearchParams({
        action: 'getChatMessages',
        email: email,
        token: token,
        allHistory: 'true',    // Add this flag
        targetUser: ''
    });

    fetch(`${scriptURL}?${params.toString()}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                displayChatMessages(data.messages);
            } else {
                console.error('Failed to load chat history:', data.message);
            }
        })
        .catch(error => console.error('Error loading chat history:', error))
        .finally(() => hideSpinner());
}

// Helper function to escape HTML
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function areChatElementsReady() {
    const elements = {
        chatMessages: document.getElementById('chat-messages'),
        chatInput: document.getElementById('chat-input'),
        sendButton: document.getElementById('send-message'),
        loadHistoryButton: document.getElementById('load-all-history')
    };

    const missingElements = Object.entries(elements)
        .filter(([name, element]) => !element)
        .map(([name]) => name);

    if (missingElements.length > 0) {
        console.error('Missing chat elements:', missingElements.join(', '));
        return false;
    }

    return true;
}

function waitForChatSection() {
    return new Promise((resolve) => {
        const checkVisibility = () => {
            const chatSection = document.getElementById('chat');
            if (chatSection && window.getComputedStyle(chatSection).display !== 'none') {
                resolve();
            } else {
                setTimeout(checkVisibility, 100);
            }
        };
        checkVisibility();
    });
}

function displayAdminBadge(adminType) {
    const adminBadge = document.getElementById('admin-badge');
    const addItemButton = document.getElementById('add-item-button');
    
    if (adminType && adminType !== 'user') {
        if (adminBadge) {
            adminBadge.style.display = 'block';
        }
        if (addItemButton) {
            addItemButton.onclick = openAddItemModal;
        }
    } else {
        if (adminBadge) adminBadge.style.display = 'none';
    }
}

// Add this function to start message polling
function startMessagePolling(targetUser = null) {
    // Clear any existing polling
    stopMessagePolling();
    
    // Start new polling
    messagePollingInterval = setInterval(() => {
        const email = localStorage.getItem('userEmail');
        const token = localStorage.getItem('sessionToken');
        
        if (!email || !token) {
            stopMessagePolling();
            return;
        }

        fetch(`${scriptURL}?action=getChatMessages&email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}&targetUser=${encodeURIComponent(targetUser || '')}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    displayChatMessages(data.messages);
                }
            })
            .catch(error => console.error('Error polling messages:', error));
    }, POLLING_INTERVAL);
}

// Add function to stop polling
function stopMessagePolling() {
    if (messagePollingInterval) {
        clearInterval(messagePollingInterval);
        messagePollingInterval = null;
    }
}

// Add new polling control functions
let activeSessionPollingInterval = null;

function startActiveSessionPolling() {
    // Clear any existing polling
    stopActiveSessionPolling();
    
    // Start new polling with a slight delay to ensure chat is fully initialized
    setTimeout(() => {
        loadActiveUsers(); // Initial load
        activeSessionPollingInterval = setInterval(() => {
            if (localStorage.getItem('sessionToken')) {  // Only poll if logged in
                loadActiveUsers();
            } else {
                stopActiveSessionPolling();  // Stop polling if not logged in
            }
        }, SESSION_POLLING_INTERVAL);
    }, 1000);
}

function stopActiveSessionPolling() {
    if (activeSessionPollingInterval) {
        clearInterval(activeSessionPollingInterval);
        activeSessionPollingInterval = null;
    }
}

async function generateNewRSSToken() {
    const email = localStorage.getItem('userEmail');
    const token = localStorage.getItem('sessionToken');
    
    const url = `${scriptURL}?action=generateRSSToken&email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
            const tokenDisplay = document.getElementById('rss-token-display');
            const rssUrl = `${scriptURL}?action=getRSSFeed&token=${data.token}`;
            
            tokenDisplay.innerHTML = `
                <div class="token-info">
                    <p>RSS Feed URL (valid for 7 days):</p>
                    <code>${rssUrl}</code>
                    <button onclick="navigator.clipboard.writeText('${rssUrl}')">
                        Copy URL
                    </button>
                </div>
            `;
        } else {
            console.error('Token generation failed:', data.error);
            alert('Failed to generate RSS token: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error generating RSS token:', error);
        alert('Error generating RSS token: ' + error.message);
    }
}

// Update the addCannedResponse function
window.addCannedResponse = async function(itemId, itemName) {
    const responseInput = document.getElementById(`response-input-${itemId}`);
    if (!responseInput || !responseInput.value.trim()) return;

    const response = responseInput.value.trim();
    const email = localStorage.getItem('userEmail');
    const token = localStorage.getItem('sessionToken');

    try {
        const params = new URLSearchParams({
            action: 'addCannedResponse',
            itemId: itemId,
            itemName: itemName,
            response: response,
            email: email,
            token: token
        });

        const result = await fetch(`${scriptURL}?${params.toString()}`);
        const data = await result.json();

        if (data.success) {
            responseInput.value = '';
            // Refresh the search results
            handleItemSearch();  // This will refresh the search results
        } else {
            alert('Failed to add response: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error in addCannedResponse:', error);
        alert('Error adding response. Please try again.');
    }
};

function displayWelcomePage() {
    const container = document.getElementById('auction-items-container');
    if (!container) return;

    container.innerHTML = `
        <div class="welcome-section">
            <h1>Welcome to the Online Auction</h1>
            
            <div class="welcome-content">
                <h2>How It Works</h2>
                <p>Our online auction platform makes it easy to participate and bid on items you're interested in. 
                   Browse through different categories, view detailed item information, and place your bids.</p>
                
                <h2>Chat Support</h2>
                <p>Need help? Use our chat feature to:</p>
                <ul>
                    <li>Ask questions about specific items</li>
                    <li>Get assistance with bidding</li>
                    <li>Receive real-time support from our team</li>
                </ul>

                <h2>Ready to Start?</h2>
                <p>Click below to view available items and start bidding!</p>
                
                <button class="primary-button" onclick="loadAuctionItems()">
                    View Auction Items
                </button>
            </div>
        </div>
    `;
}

function displayCategories(items) {
    const container = document.getElementById('auction-items-container');
    if (!container) {
        console.error('Auction items container not found');
        return;
    }
    container.innerHTML = '';

    // Create unique category list
    const categories = [...new Set(items.map(item => 
        (item.category && item.category.trim()) || 'Uncategorized'
    ))];

    // Display categories
    categories.forEach(category => {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'category-section';
        categoryDiv.innerHTML = `
            <h2 onclick="loadItemsForCategory('${escapeHtml(category)}')">${escapeHtml(category)}</h2>
            <div class="category-items" id="category-${escapeHtml(category)}"></div>
        `;
        container.appendChild(categoryDiv);
    });
}

// Consolidate into one clear category handling function
window.loadAuctionItems = async function() {
    try {
        showSpinner();
        const response = await fetch(`${scriptURL}?action=getAuctionItems`);
        const items = await response.json();
        
        if (!Array.isArray(items)) {
            throw new Error('Invalid items data received');
        }

        const container = document.getElementById('auction-items-container');
        if (!container) {
            throw new Error('Auction container not found');
        }

        container.innerHTML = '<h1>Bidding Section</h1><h2>Available Auction Items</h2>';

        // Group and sort items
        const categoryGroups = groupItemsByCategory(items);
        const sortedCategories = Object.entries(categoryGroups)
            .sort(([a], [b]) => a.localeCompare(b));

        // Create category sections
        sortedCategories.forEach(([category, categoryItems]) => {
            createCategorySection(container, category, categoryItems);
        });

    } catch (error) {
        console.error('Error loading auction items:', error);
        showErrorMessage('Failed to load auction items. Please try again.');
    } finally {
        hideSpinner();
    }
};

// Helper functions for better organization
function groupItemsByCategory(items) {
    const groups = {};
    items.forEach(item => {
        const category = (item.category && item.category.trim()) || 'Uncategorized';
        if (!groups[category]) {
            groups[category] = [];
        }
        groups[category].push(item);
    });
    return groups;
}

function createCategorySection(container, category, items) {
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'accordion';

    const header = document.createElement('h3');
    const headerText = document.createTextNode(`${category} (${items.length})`);
    header.appendChild(headerText);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'category-items';
    contentDiv.id = `category-${escapeHtml(category)}`;
    contentDiv.style.display = 'none';

    // Add loading indicator
    const loadingSpinner = document.createElement('div');
    loadingSpinner.className = 'category-loading';
    loadingSpinner.style.display = 'none';
    contentDiv.appendChild(loadingSpinner);

    // Improved click handler
    header.addEventListener('click', async () => {
        const isExpanded = contentDiv.style.display === 'block';
        
        // Collapse all other sections
        document.querySelectorAll('.category-items').forEach(c => {
            if (c !== contentDiv) c.style.display = 'none';
        });
        
        // Toggle this section
        contentDiv.style.display = isExpanded ? 'none' : 'block';
        
        // Load items if expanding
        if (!isExpanded) {
            loadingSpinner.style.display = 'block';
            try {
                await loadItemsForCategory(category);
            } finally {
                loadingSpinner.style.display = 'none';
            }
        }
    });

    categoryDiv.appendChild(header);
    categoryDiv.appendChild(contentDiv);
    container.appendChild(categoryDiv);
}

// Update loadItemsForCategory with better error handling
window.loadItemsForCategory = async function(category) {
    if (!category) {
        console.error('Category parameter is required');
        return;
    }

    const categoryContainer = document.getElementById(`category-${escapeHtml(category)}`);
    if (!categoryContainer) {
        console.error(`Category container for ${category} not found`);
        return;
    }

    try {
        const response = await fetch(`${scriptURL}?action=getAuctionItems`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const items = await response.json();
        if (!Array.isArray(items)) {
            throw new Error('Invalid items data received');
        }

        const categoryItems = items.filter(item => 
            ((item.category && item.category.trim()) || 'Uncategorized') === category
        );

        if (categoryItems.length === 0) {
            categoryContainer.innerHTML = '<p class="no-items">No items available in this category</p>';
            return;
        }

        displayItemsInCategory(category, categoryItems);

    } catch (error) {
        console.error('Error loading category items:', error);
        categoryContainer.innerHTML = '<p class="error-message">Failed to load items. Please try again.</p>';
    }
};

// Add this function to display items in a specific category
function displayItemsInCategory(category, items) {
    const categoryContainer = document.getElementById(`category-${escapeHtml(category)}`);
    if (!categoryContainer) {
        console.error(`Category container for ${category} not found`);
        return;
    }

    categoryContainer.innerHTML = '';
    items.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = `auction-item ${item.biddingActive ? '' : 'closed'}`;
        
        const images = [item.image1, item.image2, item.image3].filter(img => img);
        const primaryImage = images[0] || './images/AuctionDefault.png';

        itemElement.innerHTML = `
            <div class="bidding-status ${item.biddingActive ? 'active' : 'inactive'}">
                ${item.biddingActive ? 'Bidding Open' : 'Bidding Closed'}
            </div>
            <img src="${primaryImage}" 
                 alt="${escapeHtml(item.name)}" 
                 class="thumbnail" 
                 onerror="this.src='./images/AuctionDefault.png'"
                 onclick="openImageModal('${escapeHtml(item.name)}', ${JSON.stringify(images)}, '${escapeHtml(item.description)}', ${item.highestBid || item.startingBid}, ${item.totBids || 0}, ${item.biddingActive})">
            <h3>${escapeHtml(item.name)}</h3>
            <p>Current Bid: $${item.highestBid || item.startingBid}</p>
            <p>Total Bids: ${item.totBids || 0}</p>
            ${item.biddingActive ? `
                <button onclick="openBidModal('${escapeHtml(item.name)}', ${item.highestBid || item.startingBid}, ${item.id})">
                    Place Bid
                </button>
            ` : ''}
        `;
        
        categoryContainer.appendChild(itemElement);
    });
}


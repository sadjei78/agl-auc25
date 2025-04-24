# AGLOW Silent Auction

A web-based silent auction system with real-time chat support.

## Setup

1. Clone the repository
2. Copy `config.template.js` to `config.js` and update with your settings
3. Copy `firebase-config.template.js` to `firebase-config.js` and add your Firebase credentials
4. Copy `restream-chat.template.js` to `restream-chat.js` and add your Restream credentials
5. Set up Google Apps Script:
   - Create a new Apps Script project
   - Deploy as web app
   - Copy the deployment URL
6. Configure your spreadsheet:
   - Create sheets: Items, Users, Admins, Sessions
   - Set up the required columns as per the COLUMNS object

## Development

- Main auction functionality is in `script.js`
- Chat system is in `chat.js`
- Styles are in `styles.css`
- Backend logic is in `Code.gs`

## Production Deployment

1. Update configuration files with production values
2. Deploy Google Apps Script
3. Set up Firebase production project
4. Deploy to your web hosting

## Security

- User authentication is handled through Google Apps Script
- Chat messages are secured through Firebase Realtime Database rules
- Admin privileges are managed through the Admins sheet

## License

[Your License Here]

# Overview
A simple page to host a silent auction for AGLOW. The items will range from physical products to services. Each item will have a starting bid and a current bid. The user will be able to bid on an item by clicking the bid button. The user will be able to see their bid, the total bids for the item, and the highest bid for each item. The user will also be able to indicate if they are attending the event in person or virtually. For virtual attendees, they will have to indicate their email address and phone number. When bidding ends, the user with the highest bid will be able to claim their item and fill out the shipping information if they are attending virtually. 

There will be a chat box to allow bidders to communicate with an auction administrator. The administrator will be able to see all the bids and messages. The administrator will also be able to see the total bids for each item. The administrator will have the ability to end the auction early if needed. The administrator will also have a bank of canned responses to choose from when responding to bidders.

When bidding ends, the administrator will be able to send the highest bidder an email with the item details and a link to claim their item and make payment. The payment will be handled externally and does not need to be handled by this page.

Items will be added to the auction by the administrator using a simple form. The items will be saved in a google sheet. The google sheet will have the following columns:
- Item Name
- Item Image
- Item Description
- Starting Bid
- Current Bid
- Total Bids
- Highest Bidder
- Highest Bid Amount    
- Canned Responses (pipe separated)
- Bidding Active

# Tech Stack
- HTML
- CSS
- JavaScript
- Google Sheets API
- Google Forms API
- Google Apps Script

# Design and Functionality
- The auction items will be displayed in a grid view, with 4 to 5 items per row.
- A visual indicator will show when bidding is active.
- The item form will require minimal information: Item name, description, and an optional image. Bidding will be set to inactive initially and can be activated by the admin in the spreadsheet.
- Users will create accounts to keep their bids private until bidding ends.
- The chat functionality will allow users to see only their messages and responses from the admin, with context tags for item discussions. Admin can select canned responses from a dropdown populated with pipe-separated values from the spreadsheet.
- The email to the highest bidder will include a congratulatory message and information about payment collection through the AGLOW website.
- A minimalistic style will be used for the design.
- CSS and JS should be referenced in the head section of the HTML file, and JSON will be used as appropriate for easier management.

## GitHub Pages Deployment

1. Fork this repository
2. Create a new branch called `gh-pages`
3. Update `config.js` with your Firebase and Google Apps Script settings
4. Enable GitHub Pages in your repository settings:
   - Go to Settings > Pages
   - Select the `gh-pages` branch
   - Save the changes
5. Update the Google Apps Script CORS settings to allow your GitHub Pages domain
6. Update Firebase security rules
7. Your site will be available at `https://YOUR_GITHUB_USERNAME.github.io/REPO_NAME`

### Security Notes for GitHub Pages

- All API keys used must be restricted by domain/origin
- Firebase security rules must be properly configured
- Google Apps Script must have CORS settings for your GitHub Pages domain
- Sensitive operations should be handled server-side in Google Apps Script
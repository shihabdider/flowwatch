// This script will be responsible for handling the OAuth2 flow
// It will communicate with the background script to initiate the authorization process

// No changes needed if the above code matches the existing code

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'authorize') {
        chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
            console.log('Token acquired:', token);
            console.log('Token details:', chrome.identity.getAuthToken);
            // Here you would typically pass the token to your background script
            // and start interacting with the Google Calendar API.
        });
    } else if (request.action === 'signout') {
        chrome.identity.removeCachedAuthToken({ 'token': token }, function() {
            console.log('Token removed.');
            // Update UI or notify the user that they have signed out
        });
    }
});

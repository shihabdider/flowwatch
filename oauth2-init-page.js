document.getElementById('authorize_button').onclick = function() {
    chrome.runtime.sendMessage({ action: 'authorize' });
};
document.getElementById('signout_button').onclick = function() {
    chrome.runtime.sendMessage({ action: 'signout' });
};

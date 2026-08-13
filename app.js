const videoPlayer = document.getElementById('video-player');
const iframePlayer = document.getElementById('iframe-player');
const playerContainer = document.getElementById('player-container');
const interactionOverlay = document.getElementById('interaction-overlay');
const sidebar = document.getElementById('sidebar');
const loader = document.getElementById('loader');

let channels = [];
let currentChannelIndex = -1;
let hlsInstance = null;
let uiTimeout = null;

// Global trigger accessed by user.html
window.startTvApp = async function(playlistUrl) {
    if (!playlistUrl) return;
    try {
        loader.style.display = 'block';
        const response = await fetch(playlistUrl);
        if (!response.ok) throw new Error('Not found or CORS blocked');
        const data = await response.text();
        parseM3U(data);
    } catch (error) {
        console.error('Could not load playlist:', error);
        alert('Error loading playlist. Ensure the link uses dl.dropboxusercontent.com.');
        loader.style.display = 'none';
    }
};

function parseM3U(data) {
    const lines = data.split('\n');
    let currentChannel = {};
    
    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('#EXTINF:')) {
            const logoMatch = line.match(/tvg-logo="([^"]+)"/);
            currentChannel.logo = logoMatch ? logoMatch[1] : '';
            const commaIndex = line.lastIndexOf(',');
            currentChannel.name = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : 'Unknown Channel';
        } else if (line !== '' && !line.startsWith('#')) {
            currentChannel.url = line;
            channels.push(currentChannel);
            currentChannel = {}; 
        }
    }
    
    renderSidebar();
    if (channels.length > 0) playChannel(0);
    else loader.style.display = 'none';
}

function renderSidebar() {
    sidebar.innerHTML = '';
    channels.forEach((channel, index) => {
        const div = document.createElement('div');
        div.className = 'channel-item';
        div.tabIndex = 0; // ADDED: Makes the item focusable for TV Remotes
        
        div.onclick = (e) => {
            e.stopPropagation(); 
            playChannel(index);
            resetUITimer();
        };
        
        const img = document.createElement('img');
        img.className = 'channel-logo';
        img.src = channel.logo || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="%23333"/><text x="50%" y="50%" fill="%23fff" text-anchor="middle" dy=".3em">TV</text></svg>';
        img.onerror = function() { this.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="%23333"/><text x="50%" y="50%" fill="%23fff" text-anchor="middle" dy=".3em">TV</text></svg>'; };

        const name = document.createElement('div');
        name.className = 'channel-name';
        name.textContent = channel.name;

        div.appendChild(img);
        div.appendChild(name);
        sidebar.appendChild(div);
    });
}

function playChannel(index) {
    if (index < 0) index = channels.length - 1;
    if (index >= channels.length) index = 0;
    
    currentChannelIndex = index;
    const channel = channels[index];
    loader.style.display = 'block';

    if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
    }
    videoPlayer.pause();
    videoPlayer.removeAttribute('src');
    videoPlayer.load();
    videoPlayer.style.display = 'none';

    iframePlayer.src = 'about:blank'; 
    iframePlayer.style.display = 'none';

    const isVideo = channel.url.includes('.m3u8') || channel.url.match(/\.(mp4|mkv|avi|webm)$/i);

    if (isVideo) {
        videoPlayer.style.display = 'block';
        if (Hls.isSupported() && channel.url.includes('.m3u8')) {
            hlsInstance = new Hls();
            hlsInstance.loadSource(channel.url);
            hlsInstance.attachMedia(videoPlayer);
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                videoPlayer.play().catch(e => console.log("Autoplay blocked:", e));
                loader.style.display = 'none';
            });
        } else {
            videoPlayer.src = channel.url;
            videoPlayer.addEventListener('loadedmetadata', () => {
                videoPlayer.play().catch(e => console.log("Autoplay blocked:", e));
                loader.style.display = 'none';
            }, {once: true});
        }
    } else {
        iframePlayer.style.display = 'block';
        iframePlayer.src = channel.url;
        iframePlayer.onload = () => { loader.style.display = 'none'; };
    }

    updateSidebarHighlight();
    showUI();
}

function updateSidebarHighlight() {
    const items = document.querySelectorAll('.channel-item');
    items.forEach((item, i) => {
        if (i === currentChannelIndex) {
            item.classList.add('playing');
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            item.classList.remove('playing');
        }
    });
}

function showUI() { sidebar.classList.add('active'); resetUITimer(); }
function hideUI() { sidebar.classList.remove('active'); }
function resetUITimer() { clearTimeout(uiTimeout); uiTimeout = setTimeout(hideUI, 10000); }

interactionOverlay.addEventListener('click', showUI);
interactionOverlay.addEventListener('mousemove', resetUITimer);

function nextChannel() { playChannel(currentChannelIndex + 1); }
function prevChannel() { playChannel(currentChannelIndex - 1); }

let touchStartY = 0;
interactionOverlay.addEventListener('touchstart', e => {
    touchStartY = e.changedTouches[0].screenY;
    showUI();
}, {passive: true});

interactionOverlay.addEventListener('touchend', e => {
    const touchEndY = e.changedTouches[0].screenY;
    const diff = touchStartY - touchEndY;
    if (diff > 50) nextChannel(); 
    else if (diff < -50) prevChannel(); 
}, {passive: true});

// UPDATED: Comprehensive Smart TV Remote Keymapping
document.addEventListener('keydown', e => {
    const isSidebarActive = sidebar.classList.contains('active');

    switch(e.key) {
        // 1. BACK / EXIT BUTTONS (Hide Sidebar instead of exiting app)
        case 'Escape':
        case 'Backspace':
        case 'BrowserBack':
            e.preventDefault();
            hideUI();
            break;

        // 2. OK / ENTER BUTTON (Toggle Sidebar)
        case 'Enter':
            // If they press OK while highlighting a channel, let the click happen naturally
            if (document.activeElement && document.activeElement.classList.contains('channel-item')) {
                return; 
            }
            e.preventDefault();
            if (isSidebarActive) {
                hideUI(); // Close sidebar if it's already open
            } else {
                showUI(); // Open sidebar if it's hidden
            }
            break;

        // 3. UP / CHANNEL UP BUTTONS (Previous Channel)
        case 'ArrowUp':
        case 'PageUp':
        case 'ChannelUp':
            e.preventDefault();
            prevChannel();
            showUI();
            break;

        // 4. DOWN / CHANNEL DOWN BUTTONS (Next Channel)
        case 'ArrowDown':
        case 'PageDown':
        case 'ChannelDown':
            e.preventDefault();
            nextChannel();
            showUI();
            break;
    }
});

function toggleFullscreen() {
    if (!document.fullscreenElement) playerContainer.requestFullscreen().catch(err => console.warn(err.message));
    else if (document.exitFullscreen) document.exitFullscreen();
}

interactionOverlay.addEventListener('dblclick', (e) => { e.preventDefault(); toggleFullscreen(); });

var countDownDate = new Date("Aug 31, 2026 23:00:25").getTime();
var x = setInterval(function() {
  var now = new Date().getTime();
  var distance = countDownDate - now;
  if (distance <= 0) {
    clearInterval(x);
    location.replace('https://www.google.com/');
  }
}, 1000);

const videoPlayer = document.getElementById('video-player');
const iframePlayer = document.getElementById('iframe-player');
const playerContainer = document.getElementById('player-container');
const interactionOverlay = document.getElementById('interaction-overlay');
const sidebar = document.getElementById('sidebar');
const channelList = document.getElementById('channel-list');
const searchInput = document.getElementById('searchInput');
const loader = document.getElementById('loader');

let channels = [];
let currentChannelIndex = -1;
let hlsInstance = null;
let uiTimeout = null;


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

            const logoMatch = line.match(/tvg-logo=["']?([^"']*)["']?/i);
            const groupMatch = line.match(/group-title=["']?([^"']*)["']?/i); 
            
            currentChannel.logo = logoMatch ? logoMatch[1].trim() : '';
            currentChannel.group = groupMatch ? groupMatch[1].trim() : ''; 
            
            const commaIndex = line.lastIndexOf(',');
            currentChannel.name = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : 'Unknown Channel';
        } else if (line !== '' && !line.startsWith('#')) {
            currentChannel.url = line;

            channels.push({...currentChannel}); 
            currentChannel = {}; 
        }
    }
    
    renderSidebar();
    if (channels.length > 0) playChannel(0);
    else loader.style.display = 'none';
}

function renderSidebar() {
    channelList.innerHTML = '';
    channels.forEach((channel, index) => {
        const div = document.createElement('div');
        div.className = 'channel-item';
        div.tabIndex = 0; 
        
        div.onclick = (e) => {
            e.stopPropagation(); 
            playChannel(index);
            resetUITimer();
        };


        const num = document.createElement('div');
        num.className = 'channel-num';
        num.textContent = (index + 1) + '.';
        
        const img = document.createElement('img');
        img.className = 'channel-logo';
        img.src = channel.logo || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="%23333"/><text x="50%" y="50%" fill="%23fff" text-anchor="middle" dy=".3em">TV</text></svg>';
        img.onerror = function() { this.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="%23333"/><text x="50%" y="50%" fill="%23fff" text-anchor="middle" dy=".3em">TV</text></svg>'; };

        const name = document.createElement('div');
        name.className = 'channel-name';
        name.textContent = channel.name;

        div.appendChild(num); // Append Number
        div.appendChild(img);
        div.appendChild(name);
        channelList.appendChild(div);
    });
}


searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    const items = document.querySelectorAll('.channel-item');
    
    channels.forEach((channel, index) => {
        const cName = (channel.name || '').toLowerCase();
        const cGroup = (channel.group || '').toLowerCase();
        

        if (searchTerm === '' || cName.includes(searchTerm) || cGroup.includes(searchTerm)) {
            items[index].style.display = 'flex';
        } else {
            items[index].style.display = 'none';
        }
    });
    resetUITimer();
});


searchInput.addEventListener('focus', showUI);

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


document.addEventListener('keydown', e => {
    const authSection = document.getElementById('authSection');


    if (authSection && authSection.style.display !== 'none') {
        const codeInput = document.getElementById('activationCode');
        const activateBtn = document.getElementById('activateBtn');


        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (document.activeElement === codeInput) {
                activateBtn.focus();
            } else {
                codeInput.focus();
            }
        } 

        else if (e.key === 'Enter') {
            if (document.activeElement === codeInput) {
                e.preventDefault();
                activateBtn.click();
            }
        }
        

        if (document.activeElement.tagName === 'INPUT') return; 
        

        return; 
    }


    if (document.activeElement.tagName === 'INPUT') {
        if (e.key === 'Escape') {
            document.activeElement.blur();
            hideUI();
        } else if (e.key === 'Enter') {
            document.activeElement.blur();
        }
        return; 
    }
    
    const isSidebarActive = sidebar.classList.contains('active');

    switch(e.key) {
        case 'Escape':
        case 'Backspace':
        case 'BrowserBack':
            e.preventDefault();
            hideUI();
            break;
        case 'Enter':
            if (document.activeElement && document.activeElement.classList.contains('channel-item')) {
                return; 
            }
            e.preventDefault();
            if (isSidebarActive) hideUI(); 
            else showUI(); 
            break;
        case 'ArrowUp':
        case 'PageUp':
        case 'ChannelUp':
            e.preventDefault();
            prevChannel();
            showUI();
            break;
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

var countDownDate = new Date("Sep 30, 2026 23:00:25").getTime();
var x = setInterval(function() {
  var now = new Date().getTime();
  var distance = countDownDate - now;
  if (distance <= 0) {
    clearInterval(x);
    location.replace('https://www.google.com/');
  }
}, 1000);

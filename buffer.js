const { jellyfinServerUrl, apiToken, musicLibraryId, userId } = CONFIG;

let tracks = [];
let currentTrackIndex = 0;
let currentAlbumCover = '';
let currentAlbumId = null;

console.log("functions.js loaded");

// Fetch all albums from Jellyfin
async function fetchAllAlbums() {
    console.log('Fetching albums...');
    const url = `${jellyfinServerUrl}/Items?parentId=${musicLibraryId}&IncludeItemTypes=MusicAlbum&api_key=${apiToken}`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `MediaBrowser Token=${apiToken}`,
            },
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        displayAlbums(data.Items);
    } catch (error) {
        console.error('Failed to fetch albums:', error);
    }
}

function displayAlbums(albums) {
    const grid = document.getElementById('albumsGrid');
    grid.innerHTML = '';
    albums.forEach(album => {
        const card = document.createElement('div');
        card.className = 'card';
        card.onclick = () => showAlbumModal(album.Id);

        const imgContainer = document.createElement('div');
        imgContainer.className = 'image-container';

        const img = document.createElement('img');
        img.src = album.ImageTags && album.ImageTags.Primary ? `${jellyfinServerUrl}/Items/${album.Id}/Images/Primary` : 'https://via.placeholder.com/150';
        img.alt = 'Album Cover';
        img.className = 'album-cover'

        const hoverImg = document.createElement('img');
        hoverImg.src = img.src;  // css styling magic
        hoverImg.alt = 'Album Cover Hover';
        hoverImg.className = 'album-cover-hover';

        imgContainer.appendChild(img);
        imgContainer.appendChild(hoverImg);

        const title = document.createElement('p');
        title.textContent = album.Name;

        const artistName = document.createElement('p');
        artistName.textContent = album.AlbumArtist || 'Unknown Artist';

        const playButton = document.createElement('button');
        playButton.className = 'play-button';
        playButton.onclick = (event) => {
            event.stopPropagation();
            debouncedPlayAlbum(album.Id);
        };

        card.appendChild(imgContainer);
        card.appendChild(title);
        card.appendChild(artistName);
        card.appendChild(playButton);

        grid.appendChild(card);
    });
}

async function showAlbumModal(albumId) {
    // Fetch album details
    const albumDetails = await fetchAlbumDetails(albumId);
    if (!albumDetails) {
        console.error(`Failed to fetch album details for: ${albumId}`);
        return;
    }

    const coverUrl = albumDetails.ImageTags && albumDetails.ImageTags.Primary 
        ? `${jellyfinServerUrl}/Items/${albumDetails.Id}/Images/Backdrop?api_key=${apiToken}` 
        : 'https://via.placeholder.com/150';
    
    const modalContent = document.querySelector('.modal-content');
    modalContent.style.backgroundImage = `url('${coverUrl}')`;
    const img = new Image();

    img.onload = function() {
        const aspectRatio = this.width / this.height;
        const maxHeight = window.innerHeight * 0.96;
        const maxWidth = window.innerWidth * 0.96;

        let imgHeight = Math.min(this.height, maxHeight);
        let imgWidth = imgHeight * aspectRatio;

        if (imgWidth > maxWidth) {
            imgWidth = maxWidth;
            imgHeight = imgWidth / aspectRatio;
        }

        modalContent.style.width = `${imgWidth}px`;
        modalContent.style.height = `${imgHeight}px`;
        modalContent.style.backgroundImage = `url('${coverUrl}')`;
    };

    img.src = coverUrl;

    const tracksData = await fetchAlbumTracks(albumId, coverUrl);
    if (tracksData.length === 0) {
        console.error(`No tracks found for album: ${albumId}`);
        return;
    }

    document.getElementById('modalAlbumCover').src = coverUrl;
    document.getElementById('modalAlbumTitle').textContent = albumDetails.Name || 'Unknown Album';
    document.getElementById('modalAlbumOverview').textContent = albumDetails.Overview || 'No description available.';
    document.getElementById('modalAlbumYear').textContent = `Composed c. ${albumDetails.ProductionYear || 'N/A'} by ${albumDetails.AlbumArtists.map(artist => artist.Name).join(', ')}`;
    document.getElementById('modalAlbumLength').textContent = `Total Length: ${formatTimeMin(albumDetails.RunTimeTicks / 10000000)}`;

    const trackListDiv = document.getElementById('trackList');
    trackListDiv.innerHTML = '';
    tracksData.forEach((track, index) => {
        const trackElement = document.createElement('div');
        trackElement.textContent = `${index + 1}. ${track.name} - ${track.artist}`;
        trackElement.className = 'track';
        trackElement.onclick = () => {
            playTrack(index);
        };
        trackListDiv.appendChild(trackElement);
    }); 

    // might remove as functionality is somewhat unneccessary
    document.getElementById('playAllButton').onclick = () => playAllTracks(tracksData);

    document.getElementById('albumModal').style.display = 'block';
}

function playAllTracks(tracksData, index = 0) {
    if (index < tracksData.length) {
        playTrack(index);  // Play the track at the current index
        const audioPlayer = document.getElementById('audioPlayer');
        audioPlayer.onended = () => playAllTracks(tracksData, index + 1);
    }
}

function playTrack(trackId) {
    console.log("Tracks available:", tracks.map(t => t.id));  // debug 
    const track = tracks.find(t => t.id === trackId);

    if (!track) {
        console.error('Track data is undefined for ID:', trackId);
        return;
    }

    currentAlbumId = track.albumId;

    const audioPlayer = document.getElementById('audioPlayer');
    if (!audioPlayer) {
        console.error("Audio player element not found");
        return;
    }

    audioPlayer.src = `${jellyfinServerUrl}/Audio/${trackId}/stream?api_key=${apiToken}`;
    audioPlayer.play().catch(e => console.error("Error playing the track:", e));
}

// Handle closing the modal
window.onclick = function(event) {
    const modal = document.getElementById('albumModal');
    if (event.target == modal) {
        modal.style.display = "none";
    }
}

function openModal(albumId) {
    showAlbumModal(albumId);
}



async function viewAlbumDetails(albumId) {
    console.log('Fetching details for album:', albumId);
    const url = `${jellyfinServerUrl}/Users/${userId}/Items/${albumId}`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `MediaBrowser Token=${apiToken}`,
            },
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const albumDetails = await response.json();
        console.log('Album details:', albumDetails);
    } catch (error) {
        console.error('Failed to fetch album details:', error);
    }
}

// Debounce function to prevent rapid play commands
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

async function playAlbum(albumId) {
    console.log('Attempting to play album:', albumId);
    const albumDetails = await fetchAlbumDetails(albumId); 
    if (!albumDetails) {
        console.error('Failed to fetch album details for:', albumId);
        return;
    }

    const tracksData = await fetchAlbumTracks(albumId);
    if (!tracksData || tracksData.length === 0) {
        console.error('No tracks found for this album:', albumId);
        return;
    }

    loadTracks(tracksData);
}

function updateNowPlaying(trackName) {
    const nowPlayingElement = document.getElementById('now-playing');
    nowPlayingElement.textContent = `Now Playing: ${trackName}`;
}


function updateAudioControls(albumDetails) {
    const nowPlayingCover = document.getElementById('nowPlayingCover');
    const nowPlayingTitle = document.getElementById('nowPlayingTitle');
    const nowPlayingArtist = document.getElementById('nowPlayingArtist');

    nowPlayingCover.src = currentAlbumCover;
    nowPlayingTitle.textContent = albumDetails.Name || 'Unknown Album';
    nowPlayingArtist.textContent = albumDetails.AlbumArtists && albumDetails.AlbumArtists.length > 0 
        ? albumDetails.AlbumArtists.map(artist => artist.Name).join(', ') 
        : 'Unknown Artist';
}

async function fetchAlbumDetails(albumId) {
    const url = `${jellyfinServerUrl}/Users/${userId}/Items/${albumId}`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {'Authorization': `MediaBrowser Token=${apiToken}`},
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const albumDetails = await response.json();

        currentAlbumCover = albumDetails.ImageTags && albumDetails.ImageTags.Thumb
        ? `${jellyfinServerUrl}/Items/${albumDetails.Id}/Images/Thumb?api_key=${apiToken}` 
        : (albumDetails.ImageTags && albumDetails.ImageTags.Primary 
            ? `${jellyfinServerUrl}/Items/${albumDetails.Id}/Images/Primary?api_key=${apiToken}` 
            : 'https://via.placeholder.com/150');
            
        return albumDetails;
    } catch (error) {
        console.error('Failed to fetch album details:', error);
        return null;
    }
}

async function fetchAlbumTracks(albumId) {
    const url = `${jellyfinServerUrl}/Users/${userId}/Items?parentId=${albumId}&IncludeItemTypes=Audio&api_key=${apiToken}`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {'Authorization': `MediaBrowser Token=${apiToken}`},
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (!data.Items || data.Items.length === 0) {
            console.log("No tracks or invalid track data received", data);
            return [];
        }

        return data.Items.map(track => ({
            id: track.Id,
            name: track.Name,
            artist: (track.ArtistItems && track.ArtistItems.length > 0) ? track.ArtistItems[0].Name : "Unknown Artist",
            src: `${jellyfinServerUrl}/Audio/${track.Id}/stream?api_key=${apiToken}`,
            cover: currentAlbumCover
        }));
    } catch (error) {
        console.error('Failed to fetch tracks:', error);
        return [];
    }
}



function updatePlayPauseIcon(isPlaying) {
    const playPauseIcon = document.getElementById('playPauseIcon');
    if (!playPauseIcon) {
        console.error('Play/Pause icon element not found!');
        return;
    }
    playPauseIcon.src = isPlaying ? 'pause.svg' : 'play.svg';
}

function togglePlay() {
    const audioPlayer = document.getElementById('audioPlayer');
    if (!audioPlayer) {
        console.error('Audio player element not found!');
        return;
    }
    if (audioPlayer.paused) {
        audioPlayer.play();
    } else {
        audioPlayer.pause();
    }
    updatePlayPauseIcon(!audioPlayer.paused);
}


function playNext() {
    if (tracks.length === 0) {
        console.error("No tracks loaded");
        return;
    }
    currentTrackIndex = (currentTrackIndex + 1) % tracks.length;
    playTrack(currentTrackIndex);
}

function playPrevious() {
    if (tracks.length === 0) {
        console.error("No tracks loaded");
        return;
    }
    currentTrackIndex = (currentTrackIndex - 1 + tracks.length) % tracks.length;
    playTrack(currentTrackIndex);
}

function playTrack(index) {
    if (index < 0 || index >= tracks.length || !tracks[index]) {
        console.error('Track data is undefined at index:', index, 'Tracks:', tracks);
        return;
    }

    const track = tracks[index];
    const audioPlayer = document.getElementById('audioPlayer');
    const nowPlayingCover = document.getElementById('nowPlayingCover');
    const nowPlayingTitle = document.getElementById('nowPlayingTitle');
    const nowPlayingArtist = document.getElementById('nowPlayingArtist');

    nowPlayingCover.src = track.cover || 'https://via.placeholder.com/150';
    nowPlayingTitle.textContent = track.name || 'Unknown Title';
    nowPlayingArtist.textContent = track.artist || 'Unknown Artist';

    if (!audioPlayer) {
        console.error('Audio player element not found!');
        return;
    }

    // Set the source and play the track
    audioPlayer.src = track.src;
    audioPlayer.play()
    .then(() => {
        console.log('Playback started successfully for track:', track.id);
        updateProgressBar();
        updatePlayPauseIcon(true);
    })
    .catch(e => {
        console.error('Error playing the track:', track.id, e);
        updatePlayPauseIcon(false);
    });
}



function loadTracks(albumTracks) {
    if (!albumTracks || albumTracks.length === 0) {
        console.error("No tracks available to play or incorrect data structure:", albumTracks);
        tracks = [];
        return;
    }

    tracks = albumTracks;
    console.log("Loaded tracks:", tracks);
    playTrack(0);
}

function updateProgressBar() {
    const audioPlayer = document.getElementById('audioPlayer');
    const progressBar = document.getElementById('progress-bar');
    const currentTime = document.getElementById('current-time');
    const totalTime = document.getElementById('total-time');

    audioPlayer.addEventListener('timeupdate', () => {
        const progressValue = Math.floor((audioPlayer.currentTime / audioPlayer.duration) * 100);
        progressBar.value = progressValue;
        currentTime.textContent = formatTime(audioPlayer.currentTime);
        totalTime.textContent = formatTime(audioPlayer.duration);
    });

    progressBar.addEventListener('input', () => {
        const duration = audioPlayer.duration;
        audioPlayer.currentTime = (progressBar.value * duration) / 100;
    });
}

function formatTime(timeInSeconds) {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}
function formatTimeMin(timeInSeconds) {
    const minutes = Math.floor(timeInSeconds / 60);
    return `${minutes} minutes`;
}

const debouncedPlayAlbum = debounce(playAlbum, 300);
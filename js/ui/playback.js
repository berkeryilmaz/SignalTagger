// UI: Playback Controls
// Medya oynatma (play/pause/FPS) mantığını yönetir.

function togglePlay() {
    state.isPlaying = !state.isPlaying;
    const playIcon = document.getElementById("playIcon");
    const pauseIcon = document.getElementById("pauseIcon");
    const scopePlay = document.getElementById("scopePlayIcon");
    const scopePause = document.getElementById("scopePauseIcon");

    if (state.isPlaying) {
        if (playIcon) playIcon.style.display = "none";
        if (pauseIcon) pauseIcon.style.display = "inline";
        if (scopePlay) scopePlay.style.display = "none";
        if (scopePause) scopePause.style.display = "inline";

        if (state.playInterval) clearInterval(state.playInterval);

        const updateInterval = () => {
            if (state.playInterval) clearInterval(state.playInterval);
            let fps = parseInt(document.getElementById("speedInput").value) || 20;
            if (fps <= 0) fps = 1;
            let intervalMs = 1000 / fps;

            state.playInterval = setInterval(() => {
                if (!state.signal) { togglePlay(); return; }
                let step = state.stride || state.windowSize;
                let next = state.windowStart + step;
                if (next > state.signal.length - state.windowSize) {
                    togglePlay();
                    next = 0;
                }
                state.windowStart = next;
                updateSliderMax();
                draw(true);
            }, intervalMs);
        };

        updateInterval();

        // FPS değişikliklerini dinle
        document.getElementById("speedInput").onchange = () => {
            if (state.isPlaying) updateInterval();
        };

    } else {
        if (playIcon) playIcon.style.display = "inline";
        if (pauseIcon) pauseIcon.style.display = "none";
        if (scopePlay) scopePlay.style.display = "inline";
        if (scopePause) scopePause.style.display = "none";
        clearInterval(state.playInterval);
        document.getElementById("speedInput").onchange = null;
    }
}

// Global exposure
window.togglePlay = togglePlay;

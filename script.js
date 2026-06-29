const recordBtn = document.getElementById('record-btn');
const hebrewTextEl = document.getElementById('hebrew-text');
const translateBtn = document.getElementById('translate-btn');
const croatianTextEl = document.getElementById('croatian-text');
const playBtn = document.getElementById('play-btn');
const playHint = document.getElementById('play-hint');
const statusText = document.getElementById('status-text');
const ttsAudio = document.getElementById('tts-audio');

// Store the last translated Croatian text
let lastCroatianText = '';

// ========== TTS: Multiple fallback strategies ==========

// Strategy 1: Browser SpeechSynthesis
let croatianVoice = null;
let voicesReady = false;

function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return;
    voicesReady = true;
    // Find Croatian voice
    croatianVoice = voices.find(v => v.lang && v.lang.startsWith('hr'));
    console.log('Voices loaded:', voices.length, '| Croatian voice:', croatianVoice ? croatianVoice.name : 'NOT FOUND');
}

if ('speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    // Force load on some browsers
    setTimeout(loadVoices, 500);
    setTimeout(loadVoices, 2000);
}

// Try to speak using browser synthesis - returns true if Croatian voice exists
function trySpeechSynthesis(text) {
    if (!('speechSynthesis' in window)) return false;
    
    // Reload voices in case they weren't ready
    if (!voicesReady) loadVoices();
    if (!croatianVoice) return false;
    
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'hr-HR';
    utterance.voice = croatianVoice;
    utterance.rate = 0.9;
    utterance.volume = 1;

    utterance.onstart = () => {
        statusText.innerText = '🔊 משמיע בקרואטית...';
    };
    utterance.onend = () => {
        statusText.innerText = '✅ מוכן';
    };
    utterance.onerror = (e) => {
        console.error('SpeechSynthesis error:', e);
        // Fall back to audio player
        tryGoogleTTS(text);
    };

    window.speechSynthesis.speak(utterance);
    return true;
}

// Strategy 2: Google TTS via audio element
function tryGoogleTTS(text) {
    const shortText = text.substring(0, 200);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(shortText)}&tl=hr&total=1&idx=0&textlen=${shortText.length}&client=tw-ob`;
    
    ttsAudio.src = url;
    statusText.innerText = '🔊 משמיע בקרואטית...';

    ttsAudio.onended = () => {
        statusText.innerText = '✅ מוכן';
    };

    const playPromise = ttsAudio.play();
    if (playPromise) {
        playPromise.catch(e => {
            console.error('Google TTS autoplay blocked:', e);
            statusText.innerText = '👇 לחץ על הכפתור הירוק כדי לשמוע';
        });
    }
}

// Main speak function - tries all strategies
function speakCroatian(text) {
    lastCroatianText = text;
    
    // Show the play button regardless
    playBtn.style.display = 'flex';
    playHint.style.display = 'block';
    
    // Try Strategy 1: SpeechSynthesis
    const synthOK = trySpeechSynthesis(text);
    
    if (synthOK) {
        // SpeechSynthesis started (has Croatian voice). 
        // But set a timeout to detect silent failure
        setTimeout(() => {
            if (window.speechSynthesis.speaking === false && statusText.innerText.includes('משמיע')) {
                // It silently failed - try Google TTS
                console.log('SpeechSynthesis silent fail, trying Google TTS');
                tryGoogleTTS(text);
            }
        }, 2000);
    } else {
        // No Croatian voice - go straight to Google TTS
        console.log('No Croatian voice found, trying Google TTS');
        tryGoogleTTS(text);
    }
}

// ========== Speech Recognition ==========
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'he-IL';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        recordBtn.classList.add('recording');
        statusText.innerText = '🎙️ מקשיב...';
        hebrewTextEl.value = '';
        croatianTextEl.innerText = '...';
        playBtn.style.display = 'none';
        playHint.style.display = 'none';
    };

    recognition.onresult = async (event) => {
        const hebrewText = event.results[0][0].transcript;
        hebrewTextEl.value = hebrewText;
        statusText.innerText = '⏳ מתרגם...';
        await translateAndSpeak(hebrewText);
    };

    recognition.onspeechend = () => {
        recognition.stop();
        recordBtn.classList.remove('recording');
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        statusText.innerText = '❌ שגיאה בהקלטה. נסה שוב.';
        recordBtn.classList.remove('recording');
    };
} else {
    statusText.innerText = 'הדפדפן לא תומך בזיהוי קולי. השתמש בהקלדה.';
    recordBtn.disabled = true;
}

// ========== Button Handlers ==========

recordBtn.addEventListener('click', () => {
    if (recognition) {
        recognition.start();
    }
});

translateBtn.addEventListener('click', async () => {
    const text = hebrewTextEl.value.trim();
    if (text) {
        statusText.innerText = '⏳ מתרגם...';
        croatianTextEl.innerText = '...';
        playBtn.style.display = 'none';
        playHint.style.display = 'none';
        await translateAndSpeak(text);
    } else {
        statusText.innerText = 'אנא הזן טקסט לתרגום.';
    }
});

// Play button - direct user tap guarantees audio will play
playBtn.addEventListener('click', () => {
    if (!lastCroatianText) return;
    
    // On direct tap, try SpeechSynthesis first
    const synthOK = trySpeechSynthesis(lastCroatianText);
    
    if (!synthOK) {
        // No Croatian voice - use Google TTS via audio (direct tap = allowed to play)
        tryGoogleTTS(lastCroatianText);
    }
});

// ========== Translation ==========

async function translateAndSpeak(text) {
    try {
        const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=he&tl=hr&dt=t&q=${encodeURIComponent(text)}`);
        const data = await response.json();
        
        if (data && data[0]) {
            const croatianText = data[0].map(segment => segment[0]).join('');
            croatianTextEl.innerText = croatianText;
            
            // Auto-speak the translation
            speakCroatian(croatianText);
        } else {
            throw new Error('Translation failed');
        }
    } catch (error) {
        console.error('Translation error:', error);
        croatianTextEl.innerText = '❌ שגיאה בתרגום. בדוק חיבור לאינטרנט.';
        statusText.innerText = 'מוכן';
    }
}
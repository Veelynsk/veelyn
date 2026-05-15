// FAQ drawer toggle
(function () {
    const fab = document.getElementById('faq-fab');
    const close = document.getElementById('faq-close');
    const backdrop = document.getElementById('faq-backdrop');
    const open = () => document.body.classList.add('faq-open');
    const shut = () => document.body.classList.remove('faq-open');
    fab && fab.addEventListener('click', open);
    close && close.addEventListener('click', shut);
    backdrop && backdrop.addEventListener('click', shut);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') shut();
    });
})();

const bubble = document.getElementById('bubble');
const inner = document.getElementById('bubble-inner');
const loader = document.getElementById('loader');
const usernameInput = document.getElementById('username');
const button = document.getElementById('get-meo');
const progressBar = document.getElementById('progress-bar');
const percentLabel = document.getElementById('loader-percent');
const loaderText = document.getElementById('loader-text');

const TOTAL_MS = 30000;

const stages = [
    { at: 0,    text: 'Initializing your case…' },
    { at: 0.22, text: 'Reaching out to our support contact…' },
    { at: 0.48, text: 'Reserving your priority slot…' },
    { at: 0.74, text: 'Preparing handoff to Telegram & Discord…' },
];

button.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (!username) {
        usernameInput.focus();
        usernameInput.style.animation = 'none';
        // small shake
        usernameInput.animate(
            [
                { transform: 'translateX(0)' },
                { transform: 'translateX(-6px)' },
                { transform: 'translateX(6px)' },
                { transform: 'translateX(-4px)' },
                { transform: 'translateX(0)' },
            ],
            { duration: 280, easing: 'ease-in-out' }
        );
        return;
    }

    startCheck();
});

usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') button.click();
});

function startCheck() {
    inner.classList.add('hidden');
    loader.classList.remove('hidden');
    bubble.classList.add('loading');
    button.disabled = true;

    const start = performance.now();

    function tick(now) {
        const elapsed = now - start;
        const t = Math.min(elapsed / TOTAL_MS, 1);
        const pct = Math.floor(t * 100);

        progressBar.style.width = pct + '%';
        percentLabel.textContent = pct + '%';

        // update stage text
        let currentStage = stages[0];
        for (const s of stages) {
            if (t >= s.at) currentStage = s;
        }
        if (loaderText.textContent !== currentStage.text) {
            loaderText.textContent = currentStage.text;
        }

        if (t < 1) {
            requestAnimationFrame(tick);
        } else {
            finishCheck();
        }
    }
    requestAnimationFrame(tick);
}

function finishCheck() {
    loaderText.textContent = 'Slot reserved — message us on Telegram or Discord ↓';
    percentLabel.textContent = '100%';
    bubble.classList.remove('loading');
    document.getElementById('spinner').classList.add('hidden');
    document.getElementById('checkmark').classList.remove('hidden');
}
